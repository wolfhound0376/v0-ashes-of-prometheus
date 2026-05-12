"use client"

import { useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import type { QuickAction } from "@/lib/world-ai/campaigns"

interface Message {
  type: "user" | "world" | "error" | "thinking"
  text: string
  timestamp: Date
}

interface ChatViewProps {
  messages: Message[]
  isThinking: boolean
  quickActions: QuickAction[]
  onSendMessage: (text: string) => void
  onQuickAction: (action: QuickAction) => void
}

export function ChatView({ messages, isThinking, quickActions, onSendMessage, onQuickAction }: ChatViewProps) {
  const [input, setInput] = useState("")
  const logRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 110) + "px"
    }
  }, [input])

  const handleSubmit = () => {
    if (input.trim() && !isThinking) {
      onSendMessage(input.trim())
      setInput("")
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <>
      {/* Message log */}
      <div 
        ref={logRef}
        className="flex-1 overflow-y-auto py-3.5 flex flex-col gap-3 scrollbar-thin scrollbar-thumb-[#3a3328]"
      >
        {messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-[#8a8070] text-sm italic">
            Ask the world anything...
          </div>
        )}
        
        {messages.map((msg, i) => (
          <div 
            key={i} 
            className="flex flex-col gap-0.5 animate-in fade-in slide-in-from-bottom-1 duration-250"
          >
            <span className={cn(
              "text-[9px] tracking-[0.1em]",
              msg.type === "user" ? "text-[#8a8070]" : "text-[#d4b15a]"
            )}>
              {msg.type === "user" ? "YOU" : msg.type === "world" ? "WORLD AI" : msg.type === "error" ? "ERROR" : "..."}
            </span>
            <div className={cn(
              "bg-[rgba(31,28,22,0.7)] backdrop-blur-sm rounded px-3.5 py-2.5 leading-relaxed border-l-2 whitespace-pre-wrap break-words",
              msg.type === "user" && "border-l-[#3a3328]",
              msg.type === "world" && "border-l-[#d4b15a]",
              msg.type === "error" && "border-l-[#e0651a] text-[#e0907a]",
              msg.type === "thinking" && "border-l-[#3a3328] text-[#8a8070] italic"
            )}>
              {msg.text}
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex flex-col gap-0.5 animate-in fade-in duration-250">
            <span className="text-[9px] tracking-[0.1em] text-[#d4b15a]">WORLD AI</span>
            <div className="bg-[rgba(31,28,22,0.7)] backdrop-blur-sm rounded px-3.5 py-2.5 border-l-2 border-l-[#3a3328] text-[#8a8070] italic">
              Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Quick action buttons */}
      <div className="flex gap-1.5 py-2 flex-shrink-0 flex-wrap border-t border-[#3a3328]">
        {quickActions.map((action, i) => (
          <button
            key={i}
            onClick={() => onQuickAction(action)}
            disabled={isThinking}
            className="text-[11px] bg-[#1f1c16] border border-[#3a3328] rounded px-2.5 py-1 text-[#8a8070] hover:border-[#d4b15a] hover:text-[#d4b15a] hover:bg-[rgba(212,177,90,0.08)] transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Input bar */}
      <div className="flex gap-2 py-2 pb-3.5 flex-shrink-0">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the world anything..."
          rows={1}
          className="flex-1 bg-[#1f1c16] border border-[#3a3328] rounded px-3 py-2 text-[#e0d8c8] font-mono text-sm outline-none resize-none min-h-[42px] max-h-[110px] leading-relaxed placeholder:text-[#403c30] focus:border-[#d4b15a] focus:shadow-[0_0_0_1px_rgba(212,177,90,0.3)]"
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isThinking}
          className="bg-transparent border border-[#e0651a] rounded px-4 text-[#e0651a] font-serif text-xs tracking-[0.1em] font-semibold hover:bg-[#e0651a] hover:text-[#0a0908] hover:shadow-[0_0_16px_rgba(224,101,26,0.4)] transition-all disabled:opacity-35 disabled:cursor-not-allowed"
        >
          SEND
        </button>
      </div>
    </>
  )
}
