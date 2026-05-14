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

// Parse AI SDK data stream format
// Format: TYPE:JSON_VALUE\n (e.g., 0:"text" for text, 9:{...} for tool results)
function parseDataStreamLine(line: string): { type: string; value: unknown } | null {
  const colonIndex = line.indexOf(":")
  if (colonIndex === -1) return null
  
  const typeCode = line.substring(0, colonIndex)
  const jsonValue = line.substring(colonIndex + 1)
  
  try {
    const value = JSON.parse(jsonValue)
    // Type codes: 0 = text, 9 = tool_result, a = tool_call, etc.
    const typeMap: Record<string, string> = {
      "0": "text",
      "9": "tool_result", 
      "a": "tool_call",
      "e": "error",
      "d": "finish",
    }
    return { type: typeMap[typeCode] || typeCode, value }
  } catch {
    return null
  }
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
        let buffer = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value, { stream: true })
          buffer += chunk
          
          // Parse the data stream format - each line is a separate message
          const lines = buffer.split("\n")
          buffer = lines.pop() || "" // Keep incomplete line in buffer
          
          for (const line of lines) {
            if (!line.trim()) continue
            
            const part = parseDataStreamLine(line)
            if (part) {
              if (part.type === "text") {
                fullText += part.value
                setStreamingText(fullText)
              } else if (part.type === "tool_result") {
                // Handle tool results (music cues, etc)
                const result = part.value as { result?: unknown }
                if (result?.result && typeof result.result === 'object') {
                  const toolResult = result.result as Record<string, unknown>
                  if (toolResult.trackId) {
                    musicCue = { 
                      action: "play" as const,
                      trackId: toolResult.trackId as string,
                      trackName: toolResult.trackName as string,
                      reason: toolResult.reason as string
                    }
                  }
                }
              }
            }
          }
          
          // Trigger music cue callback if we found one during streaming
          if (musicCue) {
            setLastMusicCue(musicCue)
            onMusicCue?.(musicCue)
          }
        }
      }

      const cleanText = fullText.trim()
      
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
