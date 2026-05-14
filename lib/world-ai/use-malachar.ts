"use client"

import { useState, useCallback, useRef, useEffect } from "react"

export interface MalacharMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

interface CampaignContext {
  name: string
  systemPrompt: string
  currentEpisode: string
  currentLocation: string
  currentHeat: string
}

type BackendMode = "malachar" | "claude-fallback"

/**
 * useMalachar - World AI chat hook
 * 
 * Tries to connect to Malachar session API first.
 * If env vars aren't configured, automatically falls back to standard Claude API.
 */
export function useMalachar(campaign: CampaignContext) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MalacharMessage[]>([])
  const [isConnecting, setIsConnecting] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [backendMode, setBackendMode] = useState<BackendMode | null>(null)
  
  const eventSourceRef = useRef<EventSource | null>(null)
  const currentAssistantMessageRef = useRef<string>("")
  const campaignRef = useRef(campaign)

  // Keep campaign ref updated
  useEffect(() => {
    campaignRef.current = campaign
  }, [campaign])

  // Try to create Malachar session, fall back to Claude if not configured
  const createSession = useCallback(async () => {
    setIsConnecting(true)
    setError(null)

    try {
      // Try Malachar first
      const response = await fetch("/api/world-ai/malachar/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign: campaignRef.current }),
      })

      const data = await response.json()
      
      if (!response.ok) {
        // If Malachar env vars are missing, fall back to Claude
        if (data.missingVars && data.missingVars.length > 0) {
          console.log("[useMalachar] Malachar not configured, using Claude fallback")
          setBackendMode("claude-fallback")
          setSessionId("claude-fallback")
          return "claude-fallback"
        }
        
        // Other error
        throw new Error(data.error || "Failed to create session")
      }

      // Malachar session created successfully
      setBackendMode("malachar")
      setSessionId(data.sessionId)
      return data.sessionId
    } catch (err) {
      // Network error or other failure - try Claude fallback
      console.log("[useMalachar] Falling back to Claude API")
      setBackendMode("claude-fallback")
      setSessionId("claude-fallback")
      return "claude-fallback"
    } finally {
      setIsConnecting(false)
    }
  }, [])

  // Connect to Malachar event stream (only used in malachar mode)
  const connectStream = useCallback((sid: string) => {
    if (sid === "claude-fallback") return
    
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const eventSource = new EventSource(
      `/api/world-ai/malachar/${sid}/stream`
    )

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        console.log("[v0] Malachar stream event:", data.type, data)

        // Helper to add/update assistant message
        const updateAssistantMessage = (text: string) => {
          if (!text) return
          console.log("[v0] updateAssistantMessage called with:", text.substring(0, 50) + "...")
          currentAssistantMessageRef.current += text
          console.log("[v0] currentAssistantMessageRef now:", currentAssistantMessageRef.current.substring(0, 50) + "...")
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

        switch (data.type) {
          // Session started running
          case "session.status_running":
          case "session.thread_status_running":
            setIsStreaming(true)
            break

          // Agent is thinking
          case "agent.thinking":
            setIsStreaming(true)
            break

          // Agent message with text content
          case "agent.message":
            if (data.content && Array.isArray(data.content)) {
              const textContent = data.content
                .filter((c: { type: string }) => c.type === "text")
                .map((c: { text: string }) => c.text)
                .join("")
              console.log("[v0] Malachar extracted text:", textContent.substring(0, 100) + "...")
              updateAssistantMessage(textContent)
            }
            break

          // Streaming content blocks (Anthropic streaming format)
          case "content_block_start":
            setIsStreaming(true)
            break

          case "content_block_delta":
            if (data.delta?.text) {
              updateAssistantMessage(data.delta.text)
            }
            break

          case "content_block_stop":
            // Block finished
            break

          // Message delta (another streaming format)
          case "message_delta":
            if (data.delta?.text) {
              updateAssistantMessage(data.delta.text)
            }
            break

          // Agent tool use (e.g., bash commands)
          case "agent.tool_use":
            // Could show tool usage in UI if desired
            console.log("[v0] Malachar tool use:", data.name, data.input)
            break

          // Agent tool result
          case "agent.tool_result":
            // Tool finished executing
            console.log("[v0] Malachar tool result:", data.content)
            break

          // Session is idle - agent finished responding
          case "session.status_idle":
            setIsStreaming(false)
            // Finalize the streaming message
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
            // Reset for next message
            currentAssistantMessageRef.current = ""
            break

          case "error":
            setError(data.content || "An error occurred")
            setIsStreaming(false)
            break

          // Ignore these events silently
          case "user.message":
          case "span.model_request_start":
          case "span.model_request_end":
            break

          default:
            // Log unhandled events so we can add support
            console.log("[v0] Unhandled Malachar event type:", data.type, data)
        }
      } catch (err) {
        console.error("[Malachar] Failed to parse event:", err)
      }
    }

    eventSource.onerror = () => {
      eventSource.close()
      setTimeout(() => {
        if (sessionId && backendMode === "malachar") {
          connectStream(sessionId)
        }
      }, 2000)
    }

    eventSourceRef.current = eventSource
  }, [sessionId, backendMode])

  // Send message via Claude fallback (streaming)
  const sendViaClaude = useCallback(async (content: string) => {
    setIsStreaming(true)
    currentAssistantMessageRef.current = ""
    
    // Add streaming placeholder
    const streamingId = `streaming-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      {
        id: streamingId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      },
    ])

    try {
      // Build messages array for Claude
      const chatMessages = messages.concat({
        id: `user-${Date.now()}`,
        role: "user",
        content,
        timestamp: new Date(),
      }).map(m => ({
        role: m.role,
        parts: [{ type: "text" as const, text: m.content }],
      }))

      const response = await fetch("/api/world-ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatMessages,
          campaign: campaignRef.current,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to get response")
      }

      // Parse SSE stream
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      
      if (!reader) throw new Error("No response body")
      
      let buffer = ""
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""
        
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith("data:")) {
            const data = trimmed.slice(5).trim()
            if (data === "[DONE]") continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === "text-delta" && parsed.delta) {
                currentAssistantMessageRef.current += parsed.delta
                setMessages((prev) => {
                  const lastMsg = prev[prev.length - 1]
                  if (lastMsg?.id === streamingId) {
                    return [
                      ...prev.slice(0, -1),
                      { ...lastMsg, content: currentAssistantMessageRef.current },
                    ]
                  }
                  return prev
                })
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
      
      // Finalize message
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1]
        if (lastMsg?.id === streamingId) {
          return [
            ...prev.slice(0, -1),
            { ...lastMsg, id: `claude-${Date.now()}` },
          ]
        }
        return prev
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send")
      // Remove failed streaming message
      setMessages((prev) => prev.filter(m => m.id !== streamingId))
    } finally {
      setIsStreaming(false)
    }
  }, [messages])

  // Send a message (routes to correct backend)
  const sendMessage = useCallback(async (content: string, context?: Record<string, unknown>) => {
    if (!content.trim() || isStreaming) return

    // Ensure we have a session
    let sid = sessionId
    if (!sid) {
      sid = await createSession()
      if (!sid) return
      if (sid !== "claude-fallback") {
        connectStream(sid)
      }
    }

    // Add user message immediately
    const userMessage: MalacharMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: content.trim(),
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])

    // Route to correct backend
    if (backendMode === "claude-fallback" || sid === "claude-fallback") {
      await sendViaClaude(content.trim())
    } else {
      // Send to Malachar session
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
    }
  }, [sessionId, backendMode, isStreaming, createSession, connectStream, sendViaClaude])

  // Initialize on mount
  useEffect(() => {
    let mounted = true

    const init = async () => {
      const sid = await createSession()
      if (sid && mounted && sid !== "claude-fallback") {
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

  const clearMessages = useCallback(() => {
    setMessages([])
    currentAssistantMessageRef.current = ""
  }, [])

  const reconnect = useCallback(async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    setSessionId(null)
    setBackendMode(null)
    clearMessages()
    
    const sid = await createSession()
    if (sid && sid !== "claude-fallback") {
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
    backendMode, // Expose which backend is being used
  }
}
