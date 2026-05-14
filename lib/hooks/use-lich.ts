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
      // Retry logic for transient failures
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
          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
          }
        }
      }

      if (!response?.ok) {
        throw lastError || new Error("Failed to send message")
      }

      // toTextStreamResponse() sends plain text chunks - read them directly
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let fullText = ""
      let musicCue: MusicCue | undefined

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value, { stream: true })
          fullText += chunk
          setStreamingText(fullText)

          // Check for music cue JSON in the stream
          if (chunk.includes('"trackId"') || chunk.includes('"action":"stop"')) {
            try {
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
            } catch {
              // Ignore parsing errors
            }
          }
        }
      }

      // Clean up any JSON tool results that leaked into the text
      const cleanText = fullText
        .replace(/\{"success":true[^}]*\}/g, "")
        .replace(/\{"success":false[^}]*\}/g, "")
        .trim()
      
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
