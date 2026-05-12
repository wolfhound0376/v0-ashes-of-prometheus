"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Send, Sparkles, Skull, MessageSquare, Zap } from "lucide-react"

interface DMControlsProps {
  onSendMessage: (message: string, emotion?: string) => void
  lichState: 'idle' | 'speaking' | 'thinking' | 'casting'
  setLichState: (state: 'idle' | 'speaking' | 'thinking' | 'casting') => void
}

export function DMControls({ onSendMessage, lichState, setLichState }: DMControlsProps) {
  const [input, setInput] = useState("")
  const [selectedEmotion, setSelectedEmotion] = useState<string>("threatening")
  const [isExpanded, setIsExpanded] = useState(false)

  const emotions = [
    { id: 'threatening', label: 'Threatening', color: 'text-red-400 border-red-900/50' },
    { id: 'mysterious', label: 'Mysterious', color: 'text-purple-400 border-purple-900/50' },
    { id: 'helpful', label: 'Helpful', color: 'text-green-400 border-green-900/50' },
    { id: 'neutral', label: 'Neutral', color: 'text-stone-400 border-stone-700/50' },
  ]

  const quickPhrases = [
    { text: "Roll for initiative, mortal...", emotion: "threatening" },
    { text: "Your fate hangs by a thread.", emotion: "threatening" },
    { text: "Interesting... most interesting...", emotion: "mysterious" },
    { text: "The ancient texts speak of such things.", emotion: "mysterious" },
    { text: "Perhaps there is wisdom in your words.", emotion: "helpful" },
    { text: "You may proceed... for now.", emotion: "neutral" },
  ]

  const handleSend = () => {
    if (!input.trim()) return
    onSendMessage(input.trim(), selectedEmotion)
    setInput("")
  }

  const handleQuickPhrase = (phrase: { text: string; emotion: string }) => {
    onSendMessage(phrase.text, phrase.emotion)
  }

  return (
    <div className="fixed bottom-52 right-4 z-50">
      {/* Toggle button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "absolute -top-10 right-0 p-2 rounded-lg transition-all",
          "bg-purple-900/50 border border-purple-700/50 text-purple-300",
          "hover:bg-purple-800/50 hover:text-purple-200",
          isExpanded && "bg-purple-800/50"
        )}
      >
        <MessageSquare className="w-5 h-5" />
      </button>

      {/* Control Panel */}
      {isExpanded && (
        <div className="bg-black/80 backdrop-blur border border-purple-900/50 rounded-lg p-4 w-80 animate-fade-in">
          <h4 className="text-xs text-purple-400 uppercase tracking-wider mb-3 font-serif">Lich Controls</h4>
          
          {/* State controls */}
          <div className="flex gap-2 mb-4">
            {(['idle', 'speaking', 'thinking', 'casting'] as const).map(state => (
              <button
                key={state}
                onClick={() => setLichState(state)}
                className={cn(
                  "flex-1 py-1.5 text-[10px] uppercase tracking-wider rounded border transition-all",
                  lichState === state
                    ? "bg-purple-900/50 border-purple-500/50 text-purple-200"
                    : "bg-black/50 border-purple-900/30 text-stone-500 hover:text-purple-300"
                )}
              >
                {state}
              </button>
            ))}
          </div>

          {/* Emotion selector */}
          <div className="mb-3">
            <label className="text-[10px] text-stone-500 uppercase tracking-wider mb-1 block">Emotion</label>
            <div className="flex gap-1">
              {emotions.map(emotion => (
                <button
                  key={emotion.id}
                  onClick={() => setSelectedEmotion(emotion.id)}
                  className={cn(
                    "flex-1 py-1 text-[10px] rounded border transition-all",
                    selectedEmotion === emotion.id
                      ? cn("bg-black/50", emotion.color)
                      : "border-stone-800 text-stone-600 hover:text-stone-400"
                  )}
                >
                  {emotion.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick phrases */}
          <div className="mb-3">
            <label className="text-[10px] text-stone-500 uppercase tracking-wider mb-1 block">Quick Phrases</label>
            <div className="grid grid-cols-2 gap-1">
              {quickPhrases.map((phrase, i) => (
                <button
                  key={i}
                  onClick={() => handleQuickPhrase(phrase)}
                  className="p-1.5 text-[10px] text-left bg-black/50 border border-purple-900/30 rounded text-stone-400 hover:text-purple-300 hover:border-purple-700/50 transition-all truncate"
                >
                  {phrase.text}
                </button>
              ))}
            </div>
          </div>

          {/* Custom message input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Speak as the Lich..."
              className="flex-1 bg-black/50 border border-purple-900/30 rounded px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-purple-700/50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className={cn(
                "p-2 rounded transition-all",
                input.trim()
                  ? "bg-purple-900/50 border border-purple-700/50 text-purple-300 hover:bg-purple-800/50"
                  : "bg-black/50 border border-stone-800 text-stone-600 cursor-not-allowed"
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          {/* AI Generate button (future Gemini integration) */}
          <button className="w-full mt-3 py-2 bg-gradient-to-r from-purple-900/50 to-violet-900/50 border border-purple-700/30 rounded text-purple-300 text-xs uppercase tracking-wider hover:from-purple-800/50 hover:to-violet-800/50 transition-all flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4" />
            Generate AI Response
          </button>
        </div>
      )}
    </div>
  )
}
