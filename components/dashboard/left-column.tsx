"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { FantasyPanel } from "@/components/ui/fantasy-panel"
import { Sun, MessageSquare, Volume2, Square, Loader2 } from "lucide-react"

interface DialogueEntry {
  speaker: string
  text: string
}

interface EnvironmentData {
  location: string
  timeOfDay: string
  backgroundImageUrl?: string | null
  fogOverlayUrl?: string | null
  ambientAnimation?: string | null
  description?: string | null
}

interface LeftColumnProps {
  environment: EnvironmentData
  dialogue: DialogueEntry[]
  dialogueInput: string
  setDialogueInput: (value: string) => void
  onDialogueSubmit: () => void
  characterAvatar?: string | null
  characterName?: string
  isWorldAIThinking?: boolean
}

export function LeftColumn({
  environment,
  dialogue,
  dialogueInput,
  setDialogueInput,
  onDialogueSubmit,
  characterAvatar,
  characterName,
  isWorldAIThinking = false,
}: LeftColumnProps) {
  const dialogueEndRef = useRef<HTMLDivElement>(null)
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null)
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    dialogueEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [dialogue, isWorldAIThinking])

  // Text-to-speech function using OpenAI TTS
  const speakDialogue = useCallback(async (text: string, speaker: string, index: number) => {
    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    
    if (speakingIndex === index) {
      setSpeakingIndex(null)
      return
    }

    setLoadingIndex(index)
    
    try {
      // Choose voice based on speaker - Onyx for Malachar, Alloy for players
      const voice = speaker === "Malachar" ? "onyx" : "alloy"
      
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice }),
      })

      if (!response.ok) {
        throw new Error("TTS request failed")
      }

      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      
      const audio = new Audio(audioUrl)
      audioRef.current = audio
      
      audio.onplay = () => {
        setLoadingIndex(null)
        setSpeakingIndex(index)
      }
      audio.onended = () => {
        setSpeakingIndex(null)
        URL.revokeObjectURL(audioUrl)
      }
      audio.onerror = () => {
        setLoadingIndex(null)
        setSpeakingIndex(null)
      }
      
      await audio.play()
    } catch (error) {
      console.error("[TTS] Error:", error)
      setLoadingIndex(null)
      setSpeakingIndex(null)
    }
  }, [speakingIndex])

  // Stop audio when component unmounts
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [])
  
  return (
    <div className="flex flex-col gap-2 h-full overflow-hidden">
      <FantasyPanel title="Avatar / Environment" className="flex-shrink-0">
        {/* Environment/Avatar Scene */}
        <div className="relative h-[280px] overflow-hidden">
          {/* Background - uses actual environment image or fallback gradient */}
          <div className="absolute inset-0">
            {environment.backgroundImageUrl ? (
              <>
                {/* Actual environment background image */}
                <img 
                  src={environment.backgroundImageUrl} 
                  alt={environment.location}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {/* Time of day overlay tints */}
                <div className={`absolute inset-0 pointer-events-none transition-colors duration-1000 ${
                  environment.timeOfDay === 'Night' 
                    ? 'bg-indigo-950/50' 
                    : environment.timeOfDay === 'Evening' 
                    ? 'bg-orange-900/30' 
                    : environment.timeOfDay === 'Morning'
                    ? 'bg-amber-200/10'
                    : 'bg-transparent'
                }`} />
              </>
            ) : (
              /* Fallback gradient scene */
              <div className="absolute inset-0 bg-gradient-to-b from-[#2a4a5a] via-[#1a3040] to-[#0f1a20]">
                <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-[#4a6a7a]/60 to-transparent" />
                <div className="absolute bottom-1/3 left-0 right-0 h-20">
                  <svg viewBox="0 0 400 80" className="w-full h-full opacity-40">
                    <path d="M0,80 L50,30 L100,60 L150,20 L200,50 L250,25 L300,55 L350,15 L400,45 L400,80 Z" fill="#1a2a30" />
                  </svg>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-[#0a1015] via-[#152025] to-transparent" />
              </div>
            )}
            
            {/* Fog/atmosphere overlay layer */}
            {environment.fogOverlayUrl && (
              <img 
                src={environment.fogOverlayUrl} 
                alt=""
                className={`absolute inset-0 w-full h-full object-cover opacity-60 pointer-events-none mix-blend-overlay ${environment.ambientAnimation || ''}`}
              />
            )}
            
            {/* Bottom vignette for avatar grounding */}
            <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
            
            {/* Character avatar */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-64 h-64 flex items-end justify-center">
              {characterAvatar ? (
                <>
                  <img 
                    src={characterAvatar} 
                    alt={characterName || "Character"} 
                    className="max-w-full max-h-full object-contain drop-shadow-[0_0_25px_rgba(100,150,200,0.5)]"
                  />
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-28 h-16 bg-[#6aa0c0]/25 rounded-full blur-xl" />
                </>
              ) : (
                <>
                  <div className="w-32 h-56 bg-gradient-to-b from-[#3a5060] to-[#1a2a35] rounded-t-full opacity-80 shadow-[0_0_30px_rgba(100,150,200,0.3)]" />
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
            <div key={index} className="text-sm group flex items-start gap-2">
              <button
                onClick={() => speakDialogue(entry.text, entry.speaker, index)}
                disabled={loadingIndex === index}
                className={`flex-shrink-0 mt-0.5 p-1 rounded transition-colors ${
                  loadingIndex === index
                    ? "bg-[#3d3428]/60 text-[#c9a868]"
                    : speakingIndex === index 
                    ? "bg-[#8b5cf6]/30 text-[#8b5cf6]" 
                    : "opacity-0 group-hover:opacity-100 hover:bg-[#3d3428]/60 text-stone-500 hover:text-stone-300"
                }`}
                title={loadingIndex === index ? "Loading..." : speakingIndex === index ? "Stop speaking" : "Read aloud"}
              >
                {loadingIndex === index ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : speakingIndex === index ? (
                  <Square className="w-3 h-3" />
                ) : (
                  <Volume2 className="w-3 h-3" />
                )}
              </button>
              <div className="flex-1">
                <span
                  className={`font-serif font-semibold ${
                    entry.speaker === "You" ? "text-[#7aa8c8]" : 
                    entry.speaker === "Malachar" ? "text-[#8b5cf6]" : "text-[#c9a868]"
                  }`}
                >
                  {entry.speaker}:
                </span>
                <span className="text-stone-300 ml-2">{entry.text}</span>
              </div>
            </div>
          ))}
          {isWorldAIThinking && (
            <div className="text-sm animate-pulse">
              <span className="font-serif font-semibold text-[#8b5cf6]">Malachar:</span>
              <span className="text-stone-400 ml-2 italic">weaving dark knowledge...</span>
            </div>
          )}
          <div ref={dialogueEndRef} />
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
