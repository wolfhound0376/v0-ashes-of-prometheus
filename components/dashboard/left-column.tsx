"use client"

import { useEffect, useRef } from "react"

// Module-level set survives HMR remounts - tracks which texts have already been sent to TTS
const ttsPlayedTexts = new Set<string>()

/** Strip markdown / special chars that ElevenLabs reads aloud */
function sanitizeForTTS(text: string): string {
  return text
    .replace(/\*+/g, "")           // asterisks (bold/italic markdown)
    .replace(/_{2,}/g, "")         // underscores (markdown emphasis)
    .replace(/#{1,6}\s*/g, "")     // markdown headers
    .replace(/`{1,3}/g, "")        // backticks
    .replace(/~{2}/g, "")          // strikethrough
    .replace(/[""\u201C\u201D]/g, "") // smart & straight double quotes
    .replace(/['\u2018\u2019]/g, "") // smart single quotes
    .replace(/\[ITEM_ADD:[^\]]*\]/g, "") // inventory tags
    .replace(/\[ITEM_REMOVE:[^\]]*\]/g, "")
    .replace(/--+/g, ", ")         // em-dashes to pause
    .replace(/\.\.\./g, "...")     // keep ellipsis (TTS handles it)
    .replace(/\s{2,}/g, " ")      // collapse whitespace
    .trim()
}
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
  const readyRef = useRef(false)
  const isTTSMutedRef = useRef(isTTSMuted)
  isTTSMutedRef.current = isTTSMuted

  // After mount + initial data load, mark as ready so only NEW lines auto-play.
  // The 2-second delay ensures all historical dialogue has loaded from Supabase.
  useEffect(() => {
    const timer = setTimeout(() => {
      // Mark everything currently in dialogue as "already played"
      for (const entry of dialogue) {
        if (entry.speaker === "Malachar") {
          ttsPlayedTexts.add(entry.text)
        }
      }
      readyRef.current = true
      console.log("[v0] TTS ready, marked", dialogue.length, "historical entries as played")
    }, 2000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Intentionally only run once on mount

  // Unlock audio on first user interaction (browser autoplay policy)
  useEffect(() => {
    const unlock = () => {
      const audio = new Audio()
      audio.play().catch(() => {})
      document.removeEventListener("click", unlock)
      document.removeEventListener("keydown", unlock)
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

  // Auto-play TTS for newly-arrived Malachar lines
  useEffect(() => {
    if (!readyRef.current) return
    if (isTTSMuted) return

    // Find new Malachar lines that haven't been played yet
    const newTexts: string[] = []
    for (const entry of dialogue) {
      if (entry.speaker === "Malachar" && !ttsPlayedTexts.has(entry.text)) {
        ttsPlayedTexts.add(entry.text)
        newTexts.push(entry.text)
      }
    }

    if (newTexts.length === 0) return

    console.log("[v0] TTS queuing", newTexts.length, "new Malachar line(s)")

    // Play each new line
    const play = async () => {
      for (const rawText of newTexts) {
        if (isTTSMutedRef.current) break
        const text = sanitizeForTTS(rawText)
        if (!text) continue
        try {
          console.log("[v0] TTS fetching:", text.substring(0, 60))
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, voice: "onyx" }),
          })
          if (!res.ok) {
            console.log("[v0] TTS fetch failed:", res.status)
            continue
          }
          const blob = await res.blob()
          console.log("[v0] TTS blob received, size:", blob.size)
          const url = URL.createObjectURL(blob)
          await new Promise<void>((resolve) => {
            const audio = new Audio(url)
            audioRef.current = audio
            audio.onended = () => { audioRef.current = null; URL.revokeObjectURL(url); resolve() }
            audio.onerror = () => { audioRef.current = null; URL.revokeObjectURL(url); resolve() }
            audio.play().then(() => {
              console.log("[v0] TTS playing audio")
            }).catch((err) => {
              console.log("[v0] TTS play() failed:", err.message)
              audioRef.current = null
              URL.revokeObjectURL(url)
              resolve()
            })
          })
        } catch (err) {
          console.log("[v0] TTS error:", err)
        }
      }
    }
    play()
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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    dialogueEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [dialogue, isWorldAIThinking])

  // Mark all existing dialogue as "already seen" on first render
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      processedUpToRef.current = dialogue.length - 1
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

    // Collect new Malachar lines we haven't processed yet (dedup via module-level set)
    const newMalacharTexts: string[] = []
    for (let i = lastProcessed + 1; i <= lastIndex; i++) {
      if (dialogue[i].speaker === "Malachar" && !ttsPlayedTexts.has(dialogue[i].text)) {
        ttsPlayedTexts.add(dialogue[i].text)
        newMalacharTexts.push(dialogue[i].text)
      }
    }
    processedUpToRef.current = lastIndex

    if (newMalacharTexts.length === 0) return

    // Play sequentially - don't re-enter if already playing
    if (isAutoPlayingRef.current) return
    
    const playQueue = async () => {
      isAutoPlayingRef.current = true

      for (const rawText of newMalacharTexts) {
        if (isTTSMutedRef.current) break
        const text = sanitizeForTTS(rawText)
        if (!text) continue
        try {
          const response = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, voice: "onyx" }),
          })
          if (!response.ok) continue
          const blob = await response.blob()
          const url = URL.createObjectURL(blob)
          
          await new Promise<void>((resolve) => {
            const audio = new Audio(url)
            audioRef.current = audio
            
            audio.onended = () => {
              audioRef.current = null
              URL.revokeObjectURL(url)
              resolve()
            }
            audio.onerror = () => {
              audioRef.current = null
              URL.revokeObjectURL(url)
              resolve()
            }
            audio.play().catch(() => {
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
