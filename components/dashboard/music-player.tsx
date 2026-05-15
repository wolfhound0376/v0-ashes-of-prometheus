"use client"

import { Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"

interface MusicPlayerProps {
  isTTSMuted: boolean
  onToggleTTSMute: () => void
  className?: string
}

export function MusicPlayer({ isTTSMuted, onToggleTTSMute, className }: MusicPlayerProps) {
  return (
    <div className={cn("fixed bottom-4 right-4 z-50", className)}>
      <button
        onClick={onToggleTTSMute}
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
