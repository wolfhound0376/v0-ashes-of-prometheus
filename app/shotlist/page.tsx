"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"

interface SessionRow {
  id: string
  title: string | null
  status: string | null
  started_at: string | null
}

interface Beat {
  id: string
  session_id: string
  beat_type: string | null
  priority: number | null
  character_id: string | null
  subject: string | null
  summary: string | null
  dice_value: number | null
  image_ref: string | null
  narration: string | null
  shot_recipe: string | null
  created_at: string | null
}

// Badge colors keyed by beat_type
const BEAT_BADGE: Record<string, string> = {
  kill: "bg-red-950/60 text-red-300 border-red-800/60",
  near_death: "bg-red-950/60 text-red-300 border-red-800/60",
  crit_success: "bg-amber-950/60 text-amber-300 border-amber-700/60",
  crit_fail: "bg-amber-950/60 text-amber-300 border-amber-700/60",
  npc_reveal: "bg-purple-950/60 text-purple-300 border-purple-800/60",
  location_change: "bg-blue-950/60 text-blue-300 border-blue-800/60",
  item_award: "bg-green-950/60 text-green-300 border-green-800/60",
  big_hit: "bg-orange-950/60 text-orange-300 border-orange-800/60",
  soliloquy_open: "bg-slate-800/60 text-slate-300 border-slate-600/60",
  soliloquy_close: "bg-slate-800/60 text-slate-300 border-slate-600/60",
}

// Fallback glyph by beat_type when no image_ref is present
const BEAT_GLYPH: Record<string, string> = {
  kill: "💀",
  near_death: "🩸",
  crit_success: "🎯",
  crit_fail: "💥",
  npc_reveal: "🎭",
  location_change: "🗺️",
  item_award: "🎁",
  big_hit: "⚔️",
  soliloquy_open: "📜",
  soliloquy_close: "📜",
}

function badgeClass(type: string | null): string {
  return BEAT_BADGE[type ?? ""] ?? "bg-stone-800/60 text-stone-300 border-stone-600/60"
}

function glyph(type: string | null): string {
  return BEAT_GLYPH[type ?? ""] ?? "✦"
}

function formatBeatType(type: string | null): string {
  if (!type) return "beat"
  return type.replace(/_/g, " ")
}

export default function ShotListPage() {
  const supabase = useMemo(() => createClient(), [])

  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [beats, setBeats] = useState<Beat[]>([])
  const [highlightOnly, setHighlightOnly] = useState(false)
  const [loading, setLoading] = useState(true)

  // Fetch sessions once and default-select the most relevant one.
  useEffect(() => {
    async function fetchSessions() {
      const { data, error } = await supabase
        .from("sessions")
        .select("id, title, status, started_at")
        .order("started_at", { ascending: false })

      if (error) {
        console.error("[v0] Error fetching sessions:", error)
        setLoading(false)
        return
      }

      const rows = (data ?? []) as SessionRow[]
      setSessions(rows)

      // Prefer an active session, otherwise the newest (already sorted desc).
      const active = rows.find((s) => s.status === "active")
      const defaultSession = active ?? rows[0]
      setSelectedSessionId(defaultSession?.id ?? null)
      setLoading(false)
    }
    fetchSessions()
  }, [supabase])

  // Fetch beats whenever the selected session changes.
  useEffect(() => {
    if (!selectedSessionId) {
      setBeats([])
      return
    }

    async function fetchBeats() {
      const { data, error } = await supabase
        .from("session_beats")
        .select("*")
        .eq("session_id", selectedSessionId)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true })

      if (error) {
        console.error("[v0] Error fetching beats:", error)
        return
      }
      setBeats((data ?? []) as Beat[])
    }
    fetchBeats()
  }, [supabase, selectedSessionId])

  // Realtime: append new beats for the selected session (de-duplicated by id).
  useEffect(() => {
    if (!selectedSessionId) return

    const channel = supabase
      .channel(`shotlist-beats-${selectedSessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "session_beats" },
        (payload) => {
          const newBeat = payload.new as Beat
          if (newBeat.session_id !== selectedSessionId) return
          setBeats((prev) =>
            prev.some((b) => b.id === newBeat.id) ? prev : [...prev, newBeat],
          )
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, selectedSessionId])

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null

  // Apply highlight filter, then sort by priority desc (created_at asc tiebreak).
  const visibleBeats = useMemo(() => {
    const filtered = highlightOnly
      ? beats.filter((b) => (b.priority ?? 0) >= 7)
      : beats
    return [...filtered].sort((a, b) => {
      const pd = (b.priority ?? 0) - (a.priority ?? 0)
      if (pd !== 0) return pd
      return (a.created_at ?? "").localeCompare(b.created_at ?? "")
    })
  }, [beats, highlightOnly])

  return (
    <main className="min-h-screen bg-background text-foreground parchment-bg">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <header className="mb-8 border-b border-amber-900/40 pb-6">
          <p className="mb-1 font-serif text-xs uppercase tracking-[0.3em] text-amber-600/80">
            Director&apos;s Cut
          </p>
          <h1 className="font-serif text-3xl font-bold text-amber-200 text-balance md:text-4xl">
            {selectedSession?.title || "Shot List"}
          </h1>

          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="session-select" className="sr-only">
                Select session
              </label>
              <select
                id="session-select"
                value={selectedSessionId ?? ""}
                onChange={(e) => setSelectedSessionId(e.target.value || null)}
                className="rounded-sm border border-amber-900/50 bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-amber-600/70"
              >
                {sessions.length === 0 && <option value="">No sessions</option>}
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {(s.title || "Untitled session") +
                      (s.status === "active" ? " (active)" : "")}
                  </option>
                ))}
              </select>

              <span className="rounded-sm border border-amber-900/40 bg-amber-950/30 px-3 py-1 text-sm font-medium text-amber-300">
                {visibleBeats.length} {visibleBeats.length === 1 ? "beat" : "beats"}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setHighlightOnly((v) => !v)}
              aria-pressed={highlightOnly}
              className={`flex items-center gap-2 rounded-sm border px-3 py-2 text-sm font-medium transition-colors ${
                highlightOnly
                  ? "border-amber-600/70 bg-amber-900/40 text-amber-200"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <span
                className={`inline-block h-3 w-3 rounded-full border ${
                  highlightOnly
                    ? "border-amber-400 bg-amber-400"
                    : "border-muted-foreground bg-transparent"
                }`}
                aria-hidden="true"
              />
              Highlight reel only
            </button>
          </div>
        </header>

        {/* Beat list */}
        {loading ? (
          <p className="py-16 text-center text-muted-foreground">Loading shot list…</p>
        ) : visibleBeats.length === 0 ? (
          <p className="rounded-sm border border-dashed border-amber-900/40 bg-card/50 px-6 py-16 text-center text-muted-foreground text-pretty">
            No beats captured yet — play a session and they&apos;ll appear here live.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {visibleBeats.map((beat) => (
              <li
                key={beat.id}
                className="flex items-start gap-4 rounded-sm border border-amber-900/30 bg-card/80 p-4 transition-colors hover:border-amber-800/50"
              >
                {/* Thumbnail / glyph */}
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-sm border border-amber-900/40 bg-stone-900/80">
                  {beat.image_ref ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={beat.image_ref || "/placeholder.svg"}
                      alt={beat.summary || formatBeatType(beat.beat_type)}
                      className="h-full w-full object-cover"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <span className="text-2xl" aria-hidden="true">
                      {glyph(beat.beat_type)}
                    </span>
                  )}
                </div>

                {/* Details */}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-sm border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${badgeClass(
                        beat.beat_type,
                      )}`}
                    >
                      {formatBeatType(beat.beat_type)}
                    </span>
                    <span className="font-mono text-xs font-bold text-amber-500">
                      P{beat.priority ?? 0}
                    </span>
                    {beat.shot_recipe && (
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        {beat.shot_recipe}
                      </span>
                    )}
                    {typeof beat.dice_value === "number" && (
                      <span className="font-mono text-xs text-amber-400/80">
                        d20: {beat.dice_value}
                      </span>
                    )}
                  </div>

                  <p className="font-semibold text-foreground text-pretty">
                    {beat.summary || beat.subject || formatBeatType(beat.beat_type)}
                  </p>

                  {beat.narration && (
                    <p className="mt-1 text-sm italic text-muted-foreground text-pretty">
                      {beat.narration}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
