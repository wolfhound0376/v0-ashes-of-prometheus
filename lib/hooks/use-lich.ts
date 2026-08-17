"use client"

import { useState, useCallback } from "react"

interface LichResponse {
  text: string
  speechSegments?: Array<{
    speaker: string
    line: string
    npc_id: string | null
    voice_id: string | null
  }> | null
  dialogueEntries?: Array<{
    speaker: string
    text: string
    speech_segments?: Array<{
      speaker: string
      line: string
      npc_id: string | null
      voice_id: string | null
    }> | null
  }>
  npcImageUrl?: string | null
  locationImageUrl?: string | null
  updatedLocation?: string
  /** Player-safe vague time-of-day derived server-side from the world clock. */
  timeOfDay?: string
}

export function useLich(campaignId: string = "abyss") {
  const [isLoading, setIsLoading] = useState(false)

  const sendMessage = useCallback(async (
    message: string,
    characterId?: string | null,
    claimToken?: string | null,
  ): Promise<LichResponse> => {
    setIsLoading(true)

    try {
      let response: Response | null = null
      let lastError: Error | null = null
      
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, campaignId, characterId, claimToken }),
          })
          
          if (response.ok) break
          // A 403 means this browser's character claim is stale/invalid — the
          // server will reject it every time, so retrying is pointless. Break
          // immediately and surface it as a typed error the UI can react to.
          if (response.status === 403) break
          lastError = new Error(`HTTP ${response.status}`)
        } catch (fetchError) {
          lastError = fetchError as Error
          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
          }
        }
      }

      if (response && response.status === 403) {
        const claimError = new Error("Character claim rejected") as Error & { claimRejected?: boolean }
        claimError.claimRejected = true
        throw claimError
      }

      if (!response?.ok) {
        throw lastError || new Error("Failed to send message")
      }

      const data = await response.json()
      return {
        text: data.text || "",
        speechSegments: Array.isArray(data.speechSegments) ? data.speechSegments : null,
        dialogueEntries: Array.isArray(data.dialogueEntries) ? data.dialogueEntries : undefined,
        npcImageUrl: data.npcImageUrl || null,
        locationImageUrl: data.locationImageUrl || null,
        updatedLocation: data.updatedLocation,
        timeOfDay: typeof data.timeOfDay === "string" ? data.timeOfDay : undefined,
      }
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
  }
}
