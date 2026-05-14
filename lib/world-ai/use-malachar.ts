"use client"

import { useState, useCallback, useRef, useEffect } from "react"

export interface MalacharMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

interface MalacharEvent {
  type: string
  content?: string
  delta?: string
  metadata?: Record<string, unknown>
}

interface CampaignContext {
  name: string
  systemPrompt: string
  currentEpisode: string
  currentLocation: string
  currentHeat: string
}

export function useMalachar(campaign: CampaignContext) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MalacharMessage[]>([])
  const [isConnecting, setIsConnecting] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const eventSourceRef = useRef<EventSource | null>(null)
  const currentAssistantMessageRef = useRef<string>("")
  const campaignRef = useRef(campaign)

  // Keep campaign ref updated
  useEffect(() => {
    campaignRef.current = campaign
  }, [campaign])

  // Create a new session
  const createSession = useCallback(async () => {
    setIsConnecting(true)
    setError(null)

    try {
      const response = await fetch("/api/world-ai/malachar/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign: campaignRef.current }),
      })

      if (!response.ok) {
        throw new Error("Failed to create session")
      }

      const { sessionId: newSessionId } = await response.json()
      setSessionId(newSessionId)
      return newSessionId
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed")
      return null
    } finally {
      setIsConnecting(false)
    }
  }, [])

  // Connect to event stream
  const connectStream = useCallback((sid: string) => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const eventSource = new EventSource(
      `/api/world-ai/malachar/${sid}/stream`
    )

    eventSource.onmessage = (event) => {
      try {
        const data: MalacharEvent = JSON.parse(event.data)

        switch (data.type) {
          case "content_start":
            // New assistant message starting
            currentAssistantMessageRef.current = ""
            setIsStreaming(true)
            break

          case "content_delta":
            // Streaming content
            if (data.delta) {
              currentAssistantMessageRef.current += data.delta
              // Update the last assistant message or create new one
              setMessages((prev) => {
                const lastMsg = prev[prev.length - 1]
                if (lastMsg?.role === "assistant" && lastMsg.id.startsWith("streaming-")) {
                  return [
                    ...prev.slice(0, -1),
                    { ...lastMsg, content: currentAssistantMessageRef.current },
                  ]
                } else {
                  return [
                    ...prev,
                    {
                      id: `streaming-${Date.now()}`,
                      role: "assistant",
                      content: currentAssistantMessageRef.current,
                      timestamp: new Date(),
                    },
                  ]
                }
              })
            }
            break

          case "content_end":
          case "session.status_idle":
            // Message complete
            setIsStreaming(false)
            // Finalize the message ID
            setMessages((prev) => {
              const lastMsg = prev[prev.length - 1]
              if (lastMsg?.role === "assistant" && lastMsg.id.startsWith("streaming-")) {
                return [
                  ...prev.slice(0, -1),
                  { ...lastMsg, id: `malachar-${Date.now()}` },
                ]
              }
              return prev
            })
            break

          case "error":
            setError(data.content || "An error occurred")
            setIsStreaming(false)
            break
        }
      } catch (err) {
        console.error("[Malachar] Failed to parse event:", err)
      }
    }

    eventSource.onerror = () => {
      setError("Connection lost. Reconnecting...")
      eventSource.close()
      // Attempt reconnection after delay
      setTimeout(() => {
        if (sessionId) {
          connectStream(sessionId)
        }
      }, 2000)
    }

    eventSourceRef.current = eventSource
  }, [sessionId])

  // Send a message
  const sendMessage = useCallback(async (content: string, context?: Record<string, unknown>) => {
    if (!content.trim()) return

    // Ensure we have a session
    let sid = sessionId
    if (!sid) {
      sid = await createSession()
      if (!sid) return
      connectStream(sid)
    }

    // Add user message immediately
    const userMessage: MalacharMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: content.trim(),
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])

    // Send to Malachar
    try {
      const response = await fetch(`/api/world-ai/malachar/${sid}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, context }),
      })

      if (!response.ok) {
        throw new Error("Failed to send message")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send")
    }
  }, [sessionId, createSession, connectStream])

  // Initialize session on mount
  useEffect(() => {
    let mounted = true

    const init = async () => {
      const sid = await createSession()
      if (sid && mounted) {
        connectStream(sid)
      }
    }

    init()

    return () => {
      mounted = false
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear messages (e.g., when switching campaigns)
  const clearMessages = useCallback(() => {
    setMessages([])
    currentAssistantMessageRef.current = ""
  }, [])

  // Reconnect with new session (e.g., after campaign change)
  const reconnect = useCallback(async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    setSessionId(null)
    clearMessages()
    
    const sid = await createSession()
    if (sid) {
      connectStream(sid)
    }
  }, [createSession, connectStream, clearMessages])

  return {
    messages,
    isConnecting,
    isStreaming,
    isLoading: isConnecting || isStreaming,
    error,
    sendMessage,
    clearMessages,
    reconnect,
    sessionId,
  }
}
