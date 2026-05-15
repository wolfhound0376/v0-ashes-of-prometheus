"use client"

import { useEffect, useRef, useCallback } from "react"
import { FantasyPanel } from "@/components/ui/fantasy-panel"
import { Sun, MessageSquare } from "lucide-react"

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
  isTTSMuted?: boolean
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
  isTTSMuted = false,
}: LeftColumnProps) {
  const dialogueEndRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  
  // Track which dialogue index we've processed up to (avoids strict-mode double-fires)
  const processedUpToRef = useRef<number>(-1)
  const hasMountedRef = useRef<boolean>(false)
  const isAutoPlayingRef = useRef<boolean>(false)
  const isTTSMutedRef = useRef(isTTSMuted)
  isTTSMutedRef.current = isTTSMuted

  // Unlock audio on any user click (required by browser autoplay policy)
  useEffect(() => {
    const unlock = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
        console.log("[v0] AudioContext created, state:", audioContextRef.current.state)
      }
      if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume()
        console.log("[v0] AudioContext resumed")
      }
    }
    document.addEventListener("click", unlock)
    document.addEventListener("keydown", unlock)
    return () => {
      document.removeEventListener("click", unlock)
      document.removeEventListener("keydown", unlock)
    }
  }, [])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    dialogueEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [dialogue, isWorldAIThinking])

  // Mark all existing dialogue as "already seen" on first render
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      processedUpToRef.current = dialogue.length - 1
      console.log("[v0] TTS mounted, skipping", dialogue.length, "historical entries, muted:", isTTSMuted)
    }
  }, [dialogue, isTTSMuted])

  // Auto-play TTS for newly-arrived Malachar lines
  useEffect(() => {
    if (!hasMountedRef.current) return
    if (isTTSMuted) {
      // Still update processedUpToRef so we don't replay when unmuted
      processedUpToRef.current = dialogue.length - 1
      return
    }

    const lastProcessed = processedUpToRef.current
    const lastIndex = dialogue.length - 1
    if (lastIndex <= lastProcessed) return

    // Collect new Malachar lines we haven't processed yet
    const newMalacharTexts: string[] = []
    for (let i = lastProcessed + 1; i <= lastIndex; i++) {
      if (dialogue[i].speaker === "Malachar") {
        newMalacharTexts.push(dialogue[i].text)
      }
    }
    processedUpToRef.current = lastIndex

    if (newMalacharTexts.length === 0) return

    console.log("[v0] TTS auto-play queuing", newMalacharTexts.length, "Malachar lines")

    // Play sequentially - don't re-enter if already playing
    if (isAutoPlayingRef.current) return
    
    const playQueue = async () => {
      isAutoPlayingRef.current = true

      for (const text of newMalacharTexts) {
        if (isTTSMutedRef.current) {
          console.log("[v0] TTS muted, stopping queue")
          break
        }
        try {
          console.log("[v0] TTS fetching audio for:", text.substring(0, 50) + "...")
          const response = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, voice: "onyx" }),
          })
          if (!response.ok) {
            console.log("[v0] TTS fetch failed:", response.status)
            continue
          }
          const blob = await response.blob()
          console.log("[v0] TTS audio blob received, size:", blob.size)
          const url = URL.createObjectURL(blob)
          
          await new Promise<void>((resolve) => {
            const audio = new Audio(url)
            audioRef.current = audio
            
            audio.onended = () => {
              console.log("[v0] TTS audio playback ended")
              audioRef.current = null
              URL.revokeObjectURL(url)
              resolve()
            }
            audio.onerror = (e) => {
              console.log("[v0] TTS audio error:", e)
              audioRef.current = null
              URL.revokeObjectURL(url)
              resolve()
            }
            audio.play().then(() => {
              console.log("[v0] TTS audio playing successfully")
            }).catch((err) => {
              console.log("[v0] TTS audio.play() rejected:", err.message)
              audioRef.current = null
              URL.revokeObjectURL(url)
              resolve()
            })
          })
        } catch (err) {
          console.log("[v0] TTS error:", err)
        }
      }

      isAutoPlayingRef.current = false
    }

    playQueue()
  }, [dialogue, isTTSMuted])

  // Stop audio immediately when muted
  useEffect(() => {
    if (isTTSMuted && audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
  }, [isTTSMuted])

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
            <div key={index} className="text-sm">
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
