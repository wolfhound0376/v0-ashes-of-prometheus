"use client"

import { useState } from "react"
import { Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"

interface MusicPlayerProps {
  isTTSMuted: boolean
  onToggleTTSMute: () => void
  className?: string
}

export function MusicPlayer({ isTTSMuted, onToggleTTSMute, className }: MusicPlayerProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [mutedVoices, setMutedVoices] = useState<string[]>([])

  const toggleVoice = (voice: string) => {
    setMutedVoices((current) => current.includes(voice) ? current.filter((item) => item !== voice) : [...current, voice])
  }

  return (
    // Raised to bottom-16 to clear the status bar's Export Campaign button.
    <div className={cn("fixed bottom-16 right-4 z-50", className)}>
      {menuOpen && (
        <div className="absolute bottom-14 right-0 mb-2 w-44 rounded-md border border-[#7a5f33]/70 bg-[#120e0a] p-2 shadow-xl shadow-black/50" role="dialog" aria-label="Voice controls">
          <p className="px-2 pb-1 text-[10px] uppercase tracking-[0.16em] text-[#c9a868]">Voice controls</p>
          {["DM voice", "NPC voices", "Player voices"].map((voice) => {
            const muted = mutedVoices.includes(voice)
            return (
              <button
                key={voice}
                type="button"
                onClick={() => toggleVoice(voice)}
                aria-pressed={!muted}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs text-[#e0cfa0] hover:bg-[#2a1d10]"
              >
                <span>{voice}</span>
                <span className={muted ? "text-stone-500" : "text-[#86d6a5]"}>{muted ? "Off" : "On"}</span>
              </button>
            )
          })}
        </div>
      )}
      <button
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
        aria-label="Voice controls"
        className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center transition-all",
          "bg-[#1a1614] border-2 shadow-lg shadow-black/50",
          isTTSMuted
            ? "border-[#3d3428] hover:border-stone-500"
            : "border-[#8b5cf6]/70 hover:border-[#8b5cf6]"
        )}
        title={isTTSMuted ? "Unmute Malachar voice" : "Mute Malachar voice"}
      >
        {isTTSMuted ? (
          <VolumeX className="w-5 h-5 text-stone-500" />
        ) : (
          <Volume2 className="w-5 h-5 text-[#8b5cf6]" />
        )}
      </button>
    </div>
  )
}
