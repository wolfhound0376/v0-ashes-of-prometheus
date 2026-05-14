"use client"

import { useState, useCallback } from "react"

export function useLich(campaignId: string = "abyss") {
  const [isLoading, setIsLoading] = useState(false)
  const [streamingText, setStreamingText] = useState("")

  const sendMessage = useCallback(async (message: string) => {
    setIsLoading(true)
    setStreamingText("")

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, campaignId }),
      })

      if (!response.ok) {
        throw new Error("Failed to send message")
      }

      // Stream the response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let fullText = ""

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value, { stream: true })
          fullText += chunk
          setStreamingText(fullText)
        }
      }

      return fullText
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
  }
}
