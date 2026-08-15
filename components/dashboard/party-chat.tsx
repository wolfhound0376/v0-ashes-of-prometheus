"use client"

import { useEffect, useRef, useState } from "react"
import { SendHorizontal } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

// A party-channel line. These rows live in the same `dialogue` table as the DM
// feed but carry `channel = 'party'`, so they never touch the DM transcript,
// the model's history, or the talking-head window.
interface PartyLine {
  id: string
  speaker: string
  text: string
}

// Stable per-speaker color, mirroring the Interactive Log's NPC palette so a
// given character keeps ONE consistent color across the whole dashboard. The
// reserved gold (#c4a777) is the fallback for anyone without a hashed color.
const PARTY_PALETTE = [
  "#e0956a", // warm orange
  "#5fbaa6", // teal
  "#d98aa8", // rose
  "#a3c46a", // lime
  "#e07a6a", // coral
  "#58b8c4", // muted cyan
  "#c79a5f", // bronze
] as const

const GOLD = "#c4a777"

function speakerColorFor(name: string): string {
  if (!name) return GOLD
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return PARTY_PALETTE[hash % PARTY_PALETTE.length]
}

const tempId = () =>
  `party-optimistic-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random()}`

interface PartyChatProps {
  /**
   * The browser's claimed character name, resolved exactly the same way the DM
   * chat input resolves it (passed down from the selected character). When
   * absent (DM / shared-TV screen), the composer is read-only.
   */
  characterName?: string
  className?: string
  /**
   * When true, omit the self-rendered "Party" title and top border so the
   * component can nest inside a host panel that already provides a title bar
   * (e.g. the V4 dashboard's <Frame title="Party">).
   */
  bare?: boolean
}

export function PartyChat({ characterName, className, bare = false }: PartyChatProps) {
  const [lines, setLines] = useState<PartyLine[]>([])
  const [input, setInput] = useState("")
  const supabaseRef = useRef(createClient())
  const endRef = useRef<HTMLDivElement>(null)

  // Initial load (oldest-first) + realtime subscription, both filtered to the
  // party channel so DM narration never appears here.
  useEffect(() => {
    const supabase = supabaseRef.current
    let cancelled = false

    async function load() {
      const { data } = await supabase
        .from("dialogue")
        .select("id, speaker, text")
        .eq("channel", "party")
        .order("created_at", { ascending: true })
        .limit(50)
      if (!cancelled && data) setLines(data as PartyLine[])
    }
    load()

    const channel = supabase
      .channel("party-chat-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dialogue", filter: "channel=eq.party" },
        (payload: { new: Record<string, any> }) => {
          const row = payload.new as PartyLine
          setLines((prev) => {
            // Dedupe by real id, and upgrade a matching optimistic line in place.
            if (prev.some((l) => l.id === row.id)) return prev
            const pendingIdx = prev.findIndex(
              (l) => l.id.startsWith("party-optimistic-") && l.speaker === row.speaker && l.text === row.text,
            )
            if (pendingIdx !== -1) {
              const next = prev.slice()
              next[pendingIdx] = row
              return next
            }
            return [...prev, row]
          })
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [])

  // Auto-scroll to the newest line.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [lines])

  const send = async () => {
    const text = input.trim()
    if (!text || !characterName) return
    setInput("")
    // Optimistic append, reconciled by the realtime echo of the inserted row.
    const optimistic: PartyLine = { id: tempId(), speaker: characterName, text }
    setLines((prev) => [...prev, optimistic])
    // Plain insert. Party chat NEVER calls /api/chat — no model turn, no cost.
    const { error } = await supabaseRef.current.from("dialogue").insert({
      speaker: characterName,
      speaker_type: "player",
      channel: "party",
      text,
    })
    if (error) console.error("[PartyChat] failed to post party line:", error)
  }

  return (
    <div className={cn("flex min-h-0 flex-col", !bare && "border-t border-[#3d3428]", className)}>
      {!bare && (
        <div className="px-3 pb-1 pt-2">
          <span className="font-serif text-[11px] uppercase tracking-[0.18em] text-[#c4a777]">Party</span>
        </div>
      )}

      <div className="scrollbar-thin scrollbar-thumb-[#3d3428] scrollbar-track-transparent flex-1 space-y-1.5 overflow-y-auto px-3 pb-2">
        {lines.length === 0 ? (
          <p className="text-[11px] italic text-stone-600">No whispers yet. Speak freely — or so you believe.</p>
        ) : (
          lines.map((line) => (
            <div key={line.id} className="text-[13px] leading-relaxed">
              <span className="font-serif font-semibold" style={{ color: speakerColorFor(line.speaker) }}>
                {line.speaker}:
              </span>
              <span className="ml-2 text-stone-300">{line.text}</span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <div className="p-2">
        <div
          className={cn(
            "flex items-center gap-2 rounded-[3px] border border-[#7a5f33]/50 bg-[#0a0908] p-1",
            !characterName && "opacity-50",
          )}
        >
          <input
            type="text"
            value={input}
            disabled={!characterName}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return
              if (e.nativeEvent.isComposing || (e as any).keyCode === 229) return
              send()
            }}
            placeholder={characterName ? "Whisper to the party..." : "Claim a character to whisper"}
            className="flex-1 bg-transparent px-2 py-1 text-[13px] text-stone-200 placeholder:text-stone-600 focus:outline-none disabled:cursor-not-allowed"
          />
          <button
            onClick={send}
            disabled={!characterName}
            aria-label="Send party message"
            className="group rounded-[3px] p-1.5 transition-colors hover:bg-[#241a10] disabled:cursor-not-allowed"
          >
            <SendHorizontal className="h-4 w-4 text-[#c9a868] transition-colors group-hover:text-[#e8dcc0]" />
          </button>
        </div>
      </div>
    </div>
  )
}
