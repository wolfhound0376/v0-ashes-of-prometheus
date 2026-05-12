"use client"

import { FantasyPanel } from "@/components/ui/fantasy-panel"
import { Sun, MessageSquare, Send } from "lucide-react"

interface DialogueEntry {
  speaker: string
  text: string
}

interface LeftColumnProps {
  environment: {
    location: string
    timeOfDay: string
  }
  dialogue: DialogueEntry[]
  dialogueInput: string
  setDialogueInput: (value: string) => void
  onDialogueSubmit: () => void
  characterAvatar?: string | null
  characterName?: string
}

export function LeftColumn({
  environment,
  dialogue,
  dialogueInput,
  setDialogueInput,
  onDialogueSubmit,
  characterAvatar,
  characterName,
}: LeftColumnProps) {
  return (
    <div className="flex flex-col gap-2 h-full overflow-hidden">
      <FantasyPanel title="Avatar / Environment" className="flex-shrink-0">
        {/* Environment/Avatar Scene */}
        <div className="relative h-[280px] overflow-hidden">
          {/* Gradient placeholder for village scene */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#2a4a5a] via-[#1a3040] to-[#0f1a20]">
            {/* Sky gradient */}
            <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-[#4a6a7a]/60 to-transparent" />
            
            {/* Mountains silhouette */}
            <div className="absolute bottom-1/3 left-0 right-0 h-20">
              <svg viewBox="0 0 400 80" className="w-full h-full opacity-40">
                <path d="M0,80 L50,30 L100,60 L150,20 L200,50 L250,25 L300,55 L350,15 L400,45 L400,80 Z" fill="#1a2a30" />
              </svg>
            </div>
            
            {/* Trees/Village silhouette */}
            <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-[#0a1015] via-[#152025] to-transparent" />
            
            {/* Character avatar or silhouette placeholder - larger with transparent bg */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-64 h-64 flex items-end justify-center">
              {characterAvatar ? (
                <>
                  <img 
                    src={characterAvatar} 
                    alt={characterName || "Character"} 
                    className="max-w-full max-h-full object-contain drop-shadow-[0_0_25px_rgba(100,150,200,0.5)] mix-blend-lighten"
                  />
                  {/* Magical glow effect */}
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-28 h-16 bg-[#6aa0c0]/25 rounded-full blur-xl" />
                </>
              ) : (
                <>
                  <div className="w-32 h-56 bg-gradient-to-b from-[#3a5060] to-[#1a2a35] rounded-t-full opacity-80 shadow-[0_0_30px_rgba(100,150,200,0.3)]" />
                  {/* Magical glow effect */}
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-20 h-16 bg-[#6aa0c0]/20 rounded-full blur-xl" />
                </>
              )}
            </div>
          </div>

          {/* Location overlay card */}
          <div className="absolute top-3 left-3 bg-[#0d0b0a]/90 border border-[#3d3428]/80 rounded-sm px-3 py-1.5 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <div>
                <p className="text-sm font-serif text-[#e8dcc8] font-medium">{environment.location}</p>
                <div className="flex items-center gap-1 text-xs text-[#a89878]">
                  <Sun className="w-3 h-3" />
                  <span>{environment.timeOfDay}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </FantasyPanel>

      {/* Dialogue Log */}
      <FantasyPanel title="Dialogue Log" className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-[#3d3428] scrollbar-track-transparent">
          {dialogue.map((entry, index) => (
            <div key={index} className="text-sm">
              <span
                className={`font-serif font-semibold ${
                  entry.speaker === "You" ? "text-[#7aa8c8]" : "text-[#c9a868]"
                }`}
              >
                {entry.speaker}:
              </span>
              <span className="text-stone-300 ml-2">{entry.text}</span>
            </div>
          ))}
        </div>

        {/* Input area */}
        <div className="p-2 border-t border-[#3d3428]/60">
          <div className="flex items-center gap-2 bg-[#0a0908] border border-[#3d3428]/60 rounded-sm p-1">
            <input
              type="text"
              value={dialogueInput}
              onChange={(e) => setDialogueInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onDialogueSubmit()}
              placeholder="Click or type your response..."
              className="flex-1 bg-transparent text-sm text-stone-200 placeholder:text-stone-500 focus:outline-none px-2 py-1"
            />
            <button
              onClick={onDialogueSubmit}
              className="p-1.5 rounded-sm bg-[#3d3428]/40 hover:bg-[#4d4438]/60 transition-colors group"
            >
              <MessageSquare className="w-4 h-4 text-[#8b7355] group-hover:text-[#c9b896] transition-colors" />
            </button>
          </div>
        </div>
      </FantasyPanel>
    </div>
  )
}
