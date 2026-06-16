"use client"

import { useEffect, useRef, useState } from "react"

/** Strip markdown / special chars that ElevenLabs reads aloud */
function sanitizeForTTS(text: string): string {
  return text
    .replace(/\*+/g, "")           // asterisks (bold/italic markdown)
    .replace(/_{2,}/g, "")         // underscores (markdown emphasis)
    .replace(/#{1,6}\s*/g, "")     // markdown headers
    .replace(/`{1,3}/g, "")        // backticks
    .replace(/~{2}/g, "")          // strikethrough
    .replace(/[""“”]/g, "") // smart & straight double quotes
    .replace(/['‘’]/g, "") // smart single quotes
    .replace(/\[ITEM_ADD:[^\]]*\]/g, "") // inventory tags
    .replace(/\[ITEM_REMOVE:[^\]]*\]/g, "")
    .replace(/--+/g, ", ")         // em-dashes to pause
    .replace(/\.\.\./g, "...")     // keep ellipsis (TTS handles it)
    .replace(/\s{2,}/g, " ")      // collapse whitespace
    .trim()
}
import { FantasyPanel } from "@/components/ui/fantasy-panel"
import { Sun, MessageSquare, Volume2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

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
  // Which Malachar line is currently loading / playing (keyed by its text).
  const [loadingText, setLoadingText] = useState<string | null>(null)
  const [playingText, setPlayingText] = useState<string | null>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    dialogueEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [dialogue, isWorldAIThinking])

  // Click-to-play: speak a single Malachar line in his lich voice on demand.
  // Because this is triggered by a click (a user gesture), browser autoplay
  // policy never blocks it — no unlock dance required.
  const playLine = async (rawText: string) => {
    // Stop anything currently playing first.
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    // Clicking the line that's already playing just stops it.
    if (playingText === rawText) {
      setPlayingText(null)
      return
    }

    const text = sanitizeForTTS(rawText)
    if (!text) return

    setLoadingText(rawText)
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "onyx" }),
      })
      if (!res.ok) {
        console.log("[v0] TTS fetch failed:", res.status)
        setLoadingText(null)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      setLoadingText(null)
      setPlayingText(rawText)
      const cleanup = () => {
        setPlayingText(null)
        audioRef.current = null
        URL.revokeObjectURL(url)
      }
      audio.onended = cleanup
      audio.onerror = cleanup
      await audio.play().catch((err) => {
        console.log("[v0] TTS play() failed:", err?.message)
        cleanup()
      })
    } catch (err) {
      console.log("[v0] TTS error:", err)
      setLoadingText(null)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [])

  return (
    <div className="flex flex-col gap-2 h-full overflow-hidden">
      <FantasyPanel title="Environment" className="flex-shrink-0">
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

            {/* Bottom vignette */}
            <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
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
          {dialogue.map((entry, index) => {
            const isMalachar = entry.speaker === "Malachar"
            return (
              <div key={index} className="text-sm">
                <span
                  className={`font-serif font-semibold ${
                    entry.speaker === "You" ? "text-[#7aa8c8]" :
                    isMalachar ? "text-[#8b5cf6]" : "text-[#c9a868]"
                  }`}
                >
                  {entry.speaker}:
                </span>
                <span className="text-stone-300 ml-2">{entry.text}</span>
                {isMalachar && (
                  <button
                    onClick={() => playLine(entry.text)}
                    title={playingText === entry.text ? "Stop" : "Hear Malachar speak this"}
                    className="ml-1.5 inline-flex items-center align-middle text-[#8b5cf6]/60 hover:text-[#8b5cf6] transition-colors"
                  >
                    {loadingText === entry.text ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Volume2 className={cn("w-3.5 h-3.5", playingText === entry.text && "text-[#8b5cf6] animate-pulse")} />
                    )}
                  </button>
                )}
              </div>
            )
          })}
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
