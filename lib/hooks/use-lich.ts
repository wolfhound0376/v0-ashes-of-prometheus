"use client"

import { useState, useCallback } from "react"

interface LichResponse {
  text: string
  npcImageUrl?: string | null
}

export function useLich(campaignId: string = "abyss") {
  const [isLoading, setIsLoading] = useState(false)

  const sendMessage = useCallback(async (
    message: string,
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

      const data = await response.json()
      return { text: data.text || "", npcImageUrl: data.npcImageUrl || null }
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
