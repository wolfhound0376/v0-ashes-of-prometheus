"use client"

import { useState, useCallback } from "react"
import type { RollRequestSpec } from "@/lib/roll-requests"

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
  cinematicCue?: string
  /** Sounds this turn earned, as full bucket paths. Played by lib/sfx-cues. */
  sfxCues?: { type: "raw"; key: string }[]
  rollRequest?: RollRequestSpec
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
      
      // RETRY ONLY WHAT IS WORTH RETRYING.
      //
      // This loop used to retry ANY non-OK response. But /api/chat persists the
      // player's line before it calls the model, so every retry of a failing
      // turn wrote the same line to the log again: one message, three rows,
      // seconds apart, with no reply between them. That is what "something
      // broke" looked like when the Anthropic credit balance ran dry.
      //
      // A response that arrived is the server's considered answer — retrying it
      // just duplicates the line. Only a request that never landed (a dropped
      // connection, a timeout) is retried.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, campaignId, characterId, claimToken }),
          })
          // The server answered — success or failure, that is the answer.
          break
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
        // The route names its failures (ai_credits_exhausted, ai_unavailable)
        // with a line fit to show the table. Carry that through rather than
        // throwing an opaque status code.
        if (response) {
          const body = await response.json().catch(() => null as null | Record<string, unknown>)
          if (body && typeof body.message === "string") {
            const named = new Error(body.message) as Error & { code?: string; playerFacing?: boolean }
            named.code = typeof body.error === "string" ? body.error : undefined
            named.playerFacing = true
            throw named
          }
        }
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
        cinematicCue: typeof data.cinematicCue === "string" ? data.cinematicCue : undefined,
        // Shape-checked here rather than trusted: playCues tolerates rubbish,
        // but the hook is where this response stops being untyped JSON.
        sfxCues: Array.isArray(data.sfxCues) ? data.sfxCues : undefined,
        rollRequest:
          data.rollRequest && typeof data.rollRequest.id === "string"
            ? (data.rollRequest as RollRequestSpec)
            : undefined,
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
