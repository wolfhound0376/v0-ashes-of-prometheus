"use client"

import { useState, useCallback } from "react"

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

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value, { stream: true })
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

      // Clean up the text (remove any JSON tool results that leaked through)
      const cleanText = fullText
        .replace(/\{"success":true[^}]+\}/g, "")
        .replace(/\s+/g, " ")
        .trim()

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
