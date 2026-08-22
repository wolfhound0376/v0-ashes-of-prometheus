"use client"

import { useEffect, useRef, useState } from "react"
import { isVideoUrl } from "@/lib/media-url"
import { canSpeak, sanitizeForTTS } from "@/lib/tts"
import { type SpeechPlayback } from "@/lib/speech-playback"
import { speakBlob } from "@/lib/speech-queue"

import { FantasyPanel } from "@/components/ui/fantasy-panel"
import {
  Sun,
  Moon,
  Volume2,
  Loader2,
  SendHorizontal,
  Plus,
  Mic,
  Dices,
  Footprints,
  EarOff,
  MessageCircle,
  Swords,
  Sparkles,
  Drama,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useDice, describeRoll } from "@/components/dice/dice-provider"

// Deterministic per-speaker color for the Interactive Log. Malachar (DM) and the
// active player keep their dedicated colors elsewhere; every OTHER named speaker
// is hashed into this fixed palette so the same NPC keeps one consistent color
// for the whole session. Hues deliberately avoid the reserved blue (player),
// purple (Malachar) and gold (combat) so speakers stay visually distinct.
const SPEAKER_PALETTE = [
  "#e0956a", // warm orange
  "#5fbaa6", // teal
  "#d98aa8", // rose
  "#a3c46a", // lime
  "#e07a6a", // coral
  "#58b8c4", // muted cyan
  "#c79a5f", // bronze
] as const

function speakerColorFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return SPEAKER_PALETTE[hash % SPEAKER_PALETTE.length]
}

interface DialogueEntry {
  id?: string
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
  /** Optional sub-heading under the location name, e.g. "Forgotten Catacombs". */
  region?: string | null
  /** Atmosphere chips shown under the scene, e.g. ["Dim Light","Stone Floor","Quiet"]. */
  chips?: string[] | null
}

// Log filter tabs from the v3.0 design.
type LogFilter = "all" | "narration" | "dialogue" | "combat" | "system"

const LOG_FILTERS: { id: LogFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "narration", label: "Narration" },
  { id: "dialogue", label: "Dialogue" },
  { id: "combat", label: "Combat" },
  { id: "system", label: "System" },
]

const NARRATORS = new Set(["dm", "narrator", "malachar", "the lich"])

function categorize(entry: DialogueEntry): Exclude<LogFilter, "all"> {
  const speaker = entry.speaker.trim().toLowerCase()
  if (speaker === "system") return "system"
  // Roll announcements are prefixed with a die in the dice-announce flow.
  if (entry.text.startsWith("🎲") || /\[dice roll\]/i.test(entry.text)) return "combat"
  if (NARRATORS.has(speaker)) return "narration"
  return "dialogue"
}

// REMOVED, 22 Aug 2026 (Sam): the four generic openers that used to live here.
//
//   "Who are you?" / "We seek knowledge, not conflict." /
//   "Your reign ends here." / "(Intimidate) You are already lost."
//
// They were demo copy from before the game had a scene. By the time there were
// real prisoners in a real slave pen they were worse than nothing: a chained
// cleric does not declare "Your reign ends here" to a dwarf he is chained
// beside, and every one of them fit the fiction so badly that clicking one
// forced Malachar to talk the player back out of it.
//
// The live per-character chips (SuggestionChips, generated against the actual
// scene) are what this row is for now. Nothing static replaces these: a
// suggestion that does not know where the party is standing has no business
// being offered.
const DEFAULT_QUICK_REPLIES: { icon: typeof MessageCircle; text: string }[] = []

function ChipIcon({ label }: { label: string }) {
  const l = label.toLowerCase()
  if (l.includes("light") || l.includes("dark") || l.includes("dim")) return <Moon className="h-3 w-3" />
  if (l.includes("floor") || l.includes("ground") || l.includes("stone")) return <Footprints className="h-3 w-3" />
  if (l.includes("quiet") || l.includes("silent") || l.includes("loud")) return <EarOff className="h-3 w-3" />
  return <Sun className="h-3 w-3" />
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
  /** Send a specific line (quick replies). Falls back to the input flow. */
  onQuickReply?: (text: string) => void
  /** Initiative modifier for the Roll for Initiative button. */
  initiativeModifier?: number
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
  onQuickReply,
  initiativeModifier = 0,
}: LeftColumnProps) {
  const [logFilter, setLogFilter] = useState<LogFilter>("all")
  const { roll: sharedRoll, announce: announceRoll, busy: diceBusy } = useDice()
  const dialogueEndRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<SpeechPlayback | null>(null)
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
      audioRef.current.stop()
      audioRef.current = null
    }
    // Clicking the line that's already playing just stops it.
    if (playingText === rawText) {
      setPlayingText(null)
      return
    }

    const text = sanitizeForTTS(rawText)
    if (!text) return

    // This path speaks Malachar's lich voice, so it belongs to the DM Voice
    // toggle. Skip the request outright when DM Voice is off — same shared gate
    // every other TTS entry point uses, so the routing can never drift.
    if (!canSpeak("Malachar")) return

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
      // Played through the shared helper, which decodes the MP3 and plays the
      // samples via WebAudio. Some Chromium builds are silently mute when an
      // ElevenLabs MP3 goes through an <audio> element instead.
      const playback = speakBlob("player", await res.blob())
      audioRef.current = playback
      setLoadingText(null)
      setPlayingText(rawText)
      const reason = await playback.finished
      if (reason !== "stopped") {
        if (reason !== "ended") console.log("[v0] TTS playback:", reason)
        setPlayingText(null)
        if (audioRef.current === playback) audioRef.current = null
      }
    } catch (err) {
      console.log("[v0] TTS error:", err)
      setLoadingText(null)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.stop()
        audioRef.current = null
      }
    }
  }, [])

  return (
    <div className="flex flex-col gap-2 h-full overflow-hidden">
      <FantasyPanel title="Current Environment" className="flex-shrink-0" windowControls>
        {/* Location heading (v3.0 design: name + region above the scene) */}
        <div className="px-3 pt-2 pb-1.5">
          <p className="font-serif text-[15px] leading-tight text-[#e8dcc8]">{environment.location}</p>
          <p className="text-[11px] text-stone-500">{environment.region || environment.timeOfDay}</p>
        </div>

        {/* Environment/Avatar Scene */}
        <div className="relative mx-3 h-[210px] overflow-hidden rounded-[2px] border border-[#3d3428]">
          {/* Background - uses actual environment image or fallback gradient */}
          <div className="absolute inset-0">
            {environment.backgroundImageUrl ? (
              <>
                {/* Actual environment background image */}
                {isVideoUrl(environment.backgroundImageUrl) ? (
                  <video
                    key={environment.backgroundImageUrl}
                    src={environment.backgroundImageUrl}
                    aria-hidden="true"
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="metadata"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <img
                    src={environment.backgroundImageUrl}
                    alt={environment.location}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
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
              isVideoUrl(environment.fogOverlayUrl) ? (
                <video
                  key={environment.fogOverlayUrl}
                  src={environment.fogOverlayUrl}
                  aria-hidden="true"
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  className={`absolute inset-0 h-full w-full object-cover opacity-80 pointer-events-none mix-blend-screen ${environment.ambientAnimation || ""}`}
                />
              ) : (
                <img
                  src={environment.fogOverlayUrl}
                  alt=""
                  className={`absolute inset-0 h-full w-full object-cover opacity-60 pointer-events-none mix-blend-overlay ${environment.ambientAnimation || ""}`}
                />
              )
            )}

            {/* Bottom vignette */}
            <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
          </div>

        </div>

        {/* Atmosphere chips (v3.0 design: Dim Light · Stone Floor · Quiet) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[11px] text-stone-400">
          {(environment.chips && environment.chips.length > 0
            ? environment.chips
            : [environment.timeOfDay, environment.description ? "Described" : "Stone Floor", "Quiet"].filter(
                Boolean,
              ) as string[]
          ).map((chip) => (
            <span key={chip} className="flex items-center gap-1.5">
              <span className="text-[#c9a868]">
                <ChipIcon label={chip} />
              </span>
              {chip}
            </span>
          ))}
        </div>
      </FantasyPanel>

      {/* Interactive Log */}
      <FantasyPanel title="Interactive Log" className="flex min-h-0 flex-1 flex-col">
        {/* Filter tabs */}
        <div className="flex gap-1 border-b border-[#7a5f33]/35 px-2 py-1.5">
          {LOG_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setLogFilter(f.id)}
              className={cn(
                "rounded-[3px] px-2 py-1 text-[11px] transition-colors",
                logFilter === f.id
                  ? "border border-[#c9a868]/70 bg-[#241a10] text-[#e0cfa0]"
                  : "border border-transparent text-stone-500 hover:text-stone-300",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="scrollbar-thin scrollbar-thumb-[#3d3428] scrollbar-track-transparent flex-1 space-y-2.5 overflow-y-auto p-3">
          {dialogue
            .filter((entry) => logFilter === "all" || categorize(entry) === logFilter)
            .map((entry, index) => {
              const isMalachar = entry.speaker === "Malachar"
              const kind = categorize(entry)
              const isSelf = characterName ? entry.speaker === characterName : entry.speaker === "You"
              // Reserved speakers keep their dedicated colors; any other named NPC
              // gets a stable hashed color so it never changes between beats.
              const usesHashedColor = kind !== "system" && kind !== "combat" && !isSelf && !isMalachar
              const hashedColor = usesHashedColor ? speakerColorFor(entry.speaker) : undefined
              return (
                <div key={entry.id ?? index} className="text-sm leading-relaxed">
                  <span
                    className={cn(
                      "font-serif font-semibold",
                      kind === "system"
                        ? "text-stone-500"
                        : kind === "combat"
                          ? "text-[#d4b15a]"
                          : isSelf
                            ? "text-[#6aa8e0]"
                            : isMalachar
                              ? "text-[#a06be8]"
                              : undefined,
                    )}
                    style={hashedColor ? { color: hashedColor } : undefined}
                  >
                    {entry.speaker}:
                  </span>
                  <span className={cn("ml-2", kind === "narration" && !isMalachar ? "text-stone-400" : "text-stone-300")}>
                    {entry.text}
                  </span>
                  {isMalachar && (
                    <button
                      onClick={() => playLine(entry.text)}
                      title={playingText === entry.text ? "Stop" : "Hear Malachar speak this"}
                      className="ml-1.5 inline-flex items-center align-middle text-[#8b5cf6]/60 transition-colors hover:text-[#8b5cf6]"
                    >
                      {loadingText === entry.text ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Volume2
                          className={cn("h-3.5 w-3.5", playingText === entry.text && "animate-pulse text-[#8b5cf6]")}
                        />
                      )}
                    </button>
                  )}
                </div>
              )
            })}
          {isWorldAIThinking && (
            <div className="animate-pulse text-sm">
              <span className="font-serif font-semibold text-[#a06be8]">Malachar:</span>
              <span className="ml-2 italic text-stone-400">weaving dark knowledge...</span>
            </div>
          )}
          <div ref={dialogueEndRef} />
        </div>

        {/* Quick replies (v3.0 design: 2x2 suggested actions) */}
        <div className="grid grid-cols-2 gap-1.5 border-t border-[#7a5f33]/35 px-2 pt-2">
          {DEFAULT_QUICK_REPLIES.map((qr) => {
            const Icon = qr.icon
            return (
              <button
                key={qr.text}
                type="button"
                onClick={() => (onQuickReply ? onQuickReply(qr.text) : setDialogueInput(qr.text))}
                disabled={isWorldAIThinking}
                className="flex items-center gap-1.5 rounded-[3px] border border-[#7a5f33]/50 bg-[#120e0a] px-2 py-1.5 text-left text-[11px] text-stone-300 transition-colors hover:border-[#c9a868]/70 hover:text-[#e0cfa0] disabled:opacity-50"
              >
                <Icon className="h-3 w-3 flex-shrink-0 text-[#c9a868]" />
                <span className="truncate">{qr.text}</span>
              </button>
            )
          })}
        </div>

        {/* Input area */}
        <div className="p-2">
          <div className="flex items-center gap-2 rounded-[3px] border border-[#7a5f33]/50 bg-[#0a0908] p-1">
            <input
              type="text"
              value={dialogueInput}
              onChange={(e) => setDialogueInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onDialogueSubmit()}
              placeholder="Type your response or action..."
              className="flex-1 bg-transparent px-2 py-1 text-sm text-stone-200 placeholder:text-stone-600 focus:outline-none"
            />
            <button
              onClick={onDialogueSubmit}
              aria-label="Send"
              className="group rounded-[3px] p-1.5 transition-colors hover:bg-[#241a10]"
            >
              <SendHorizontal className="h-4 w-4 text-[#c9a868] transition-colors group-hover:text-[#e8dcc0]" />
            </button>
          </div>

          {/* Action row: attach · voice · initiative */}
          <div className="mt-1.5 flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Add attachment"
              className="rounded-[3px] border border-[#7a5f33]/50 bg-[#120e0a] p-1.5 text-stone-500 transition-colors hover:border-[#c9a868]/60 hover:text-[#e0cfa0]"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Voice input"
              className="rounded-[3px] border border-[#7a5f33]/50 bg-[#120e0a] p-1.5 text-stone-500 transition-colors hover:border-[#c9a868]/60 hover:text-[#e0cfa0]"
            >
              <Mic className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={diceBusy}
              onClick={async () => {
                // Rolls through the SHARED dice roller like everything else.
                const result = await sharedRoll({
                  die: "d20",
                  numDice: 1,
                  modifier: initiativeModifier,
                  label: "Initiative",
                })
                announceRoll(describeRoll(result))
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[3px] border border-[#7a5f33]/60 bg-gradient-to-b from-[#1d1710] to-[#120e0a] px-2 py-1.5 text-[11px] text-stone-300 transition-colors hover:border-[#c9a868] hover:text-[#e0cfa0] disabled:opacity-60"
            >
              <Dices className="h-3.5 w-3.5 text-[#c9a868]" />
              Roll for Initiative
            </button>
          </div>
        </div>
      </FantasyPanel>
    </div>
  )
}
