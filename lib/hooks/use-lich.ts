"use client"

import { useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

interface MusicCue {
  action: "play" | "stop"
  trackId?: string
  trackName?: string
  reason?: string
}

interface LichResponse {
  text: string
  musicCue?: MusicCue
}

export function useLich(campaignId: string = "abyss") {
  const [isLoading, setIsLoading] = useState(false)
  const [streamingText, setStreamingText] = useState("")
  const [lastMusicCue, setLastMusicCue] = useState<MusicCue | null>(null)

  const sendMessage = useCallback(async (
    message: string,
    onMusicCue?: (cue: MusicCue) => void
  ): Promise<LichResponse> => {
    setIsLoading(true)
    setStreamingText("")
    setLastMusicCue(null)

    try {
      // Retry logic for transient failures (e.g., during dev server restarts)
      let response: Response | null = null
      let lastError: Error | null = null
      
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, campaignId }),
          })
          
          if (response.ok) break
          lastError = new Error(`HTTP ${response.status}`)
        } catch (fetchError) {
          lastError = fetchError as Error
          // Wait before retrying (exponential backoff)
          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
          }
        }
      }

      if (!response?.ok) {
        throw lastError || new Error("Failed to send message")
      }

      // Stream the response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let fullText = ""
      let musicCue: MusicCue | undefined

      console.log("[v0] Starting to read stream, reader:", !!reader)

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            console.log("[v0] Stream done, fullText length:", fullText.length)
            break
          }
          
          const chunk = decoder.decode(value, { stream: true })
          console.log("[v0] Got chunk:", chunk.substring(0, 100))
          fullText += chunk
          
          // Check for music cue in the stream (tool results contain JSON)
          // The AI SDK streams tool results with specific markers
          if (chunk.includes('"trackId"') || chunk.includes('"action":"stop"')) {
            try {
              // Try to extract music cue from the stream
              const playMatch = fullText.match(/"trackId"\s*:\s*"([^"]+)"/)
              const stopMatch = fullText.match(/"action"\s*:\s*"stop"/)
              
              if (stopMatch && !musicCue) {
                musicCue = { action: "stop" }
                setLastMusicCue(musicCue)
                onMusicCue?.(musicCue)
              } else if (playMatch && !musicCue) {
                const trackId = playMatch[1]
                if (trackId !== "stop") {
                  musicCue = { action: "play", trackId }
                  setLastMusicCue(musicCue)
                  onMusicCue?.(musicCue)
                }
              }
            } catch (e) {
              // Ignore parsing errors, continue streaming
            }
          }
          
          setStreamingText(fullText)
        }
      }

      // Clean up the text - AI SDK uses format like 0:"text content"\n
      // Extract just the text content from the stream format
      let cleanText = ""
      
      // Parse the AI SDK text stream format: 0:"text"\n0:"more text"\n
      const textMatches = fullText.matchAll(/0:"([^"]*)"/g)
      for (const match of textMatches) {
        cleanText += match[1]
      }
      
      // If no matches, maybe it's plain text (fallback)
      if (!cleanText && fullText) {
        cleanText = fullText
      }
      
      // Remove any JSON tool results that leaked through
      cleanText = cleanText
        .replace(/\{"success":true[^}]+\}/g, "")
        .replace(/\\n/g, "\n") // Unescape newlines
        .trim()
      
      console.log("[v0] Clean text length:", cleanText.length, "preview:", cleanText.substring(0, 100))
      
      // Save Malachar's response to dialogue table
      if (cleanText && cleanText.length > 0) {
        const supabase = createClient()
        await supabase.from("dialogue").insert({
          speaker: "Malachar",
          text: cleanText,
          source: "world_ai"
        })
      }

      return { text: cleanText, musicCue }
    } catch (error) {
      console.error("Error sending message:", error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [campaignId])

  return {
    sendMessage,
    isLoading,
    streamingText,
    lastMusicCue,
  }
}
