"use client"

import { cn } from "@/lib/utils"
import { RefObject } from "react"
import { Skull, User, Bot, AlertCircle } from "lucide-react"

interface DialogueEntry {
  id: string
  speaker: string
  speaker_type: string
  message: string
  emotion: string | null
  created_at: string
}

interface DialogueDisplayProps {
  dialogueHistory: DialogueEntry[]
  dialogueEndRef: RefObject<HTMLDivElement | null>
}

export function DialogueDisplay({ dialogueHistory, dialogueEndRef }: DialogueDisplayProps) {
  const getEmotionStyles = (emotion: string | null) => {
    switch (emotion) {
      case 'threatening':
        return 'text-red-300 border-red-900/50'
      case 'mysterious':
        return 'text-purple-300 border-purple-900/50'
      case 'helpful':
        return 'text-green-300 border-green-900/50'
      default:
        return 'text-stone-300 border-stone-700/50'
    }
  }

  const getSpeakerIcon = (speakerType: string) => {
    switch (speakerType) {
      case 'dm':
        return <Skull className="w-4 h-4 text-purple-400" />
      case 'player':
        return <User className="w-4 h-4 text-blue-400" />
      case 'system':
        return <AlertCircle className="w-4 h-4 text-amber-400" />
      default:
        return <Bot className="w-4 h-4 text-green-400" />
    }
  }

  if (dialogueHistory.length === 0) {
    return (
      <div className="absolute bottom-4 left-4 right-4 max-w-2xl mx-auto">
        <div className="bg-black/60 backdrop-blur border border-purple-900/30 rounded-lg p-4 text-center">
          <p className="text-stone-500 text-sm italic font-serif">
            The ancient chamber is silent... awaiting the first words of destiny.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute bottom-4 left-4 right-4 max-w-2xl mx-auto">
      <div className="bg-black/70 backdrop-blur border border-purple-900/30 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2 border-b border-purple-900/30 flex items-center justify-between">
          <h3 className="text-xs text-purple-400 font-serif tracking-widest uppercase">Chronicle of Shadows</h3>
          <span className="text-[10px] text-stone-600">{dialogueHistory.length} entries</span>
        </div>

        {/* Dialogue Scroll */}
        <div className="max-h-48 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-purple-900/50 scrollbar-track-transparent">
          {dialogueHistory.slice(-10).map((entry) => (
            <div 
              key={entry.id}
              className={cn(
                "flex gap-3 p-2 rounded border-l-2 transition-all",
                entry.speaker_type === 'dm' && "bg-purple-950/20",
                entry.speaker_type === 'player' && "bg-blue-950/20",
                entry.speaker_type === 'system' && "bg-amber-950/20",
                getEmotionStyles(entry.emotion)
              )}
            >
              <div className="flex-shrink-0 mt-0.5">
                {getSpeakerIcon(entry.speaker_type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className={cn(
                    "text-xs font-semibold",
                    entry.speaker_type === 'dm' && "text-purple-300",
                    entry.speaker_type === 'player' && "text-blue-300",
                    entry.speaker_type === 'system' && "text-amber-300",
                    entry.speaker_type === 'npc' && "text-green-300"
                  )}>
                    {entry.speaker}
                  </span>
                  <span className="text-[10px] text-stone-600">
                    {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className={cn(
                  "text-sm leading-relaxed",
                  entry.speaker_type === 'dm' && "font-serif italic",
                  entry.speaker_type === 'system' && "font-mono text-xs"
                )}>
                  {entry.message}
                </p>
              </div>
            </div>
          ))}
          <div ref={dialogueEndRef} />
        </div>
      </div>
    </div>
  )
}
