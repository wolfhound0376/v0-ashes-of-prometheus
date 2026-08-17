"use client"

// DM-ONLY world-clock readout. Shows the game day, the exact in-world time, and
// the story-advancement exchange counter — none of which players may ever see.
// The values come from /api/game-clock, which re-checks DM_ACCESS_CODE
// server-side and reads the RLS-locked time tables with the service role. This
// component only ever renders inside the DM-mode guard in the dashboard.

import { useCallback, useEffect, useState } from "react"
import { Clock, Hourglass } from "lucide-react"
import { dmHeaders } from "@/lib/dm-key"

interface ClockData {
  day: number
  clockTime: string
  timeOfDay: string
  exchangesSinceAdvance: number
  advanceThreshold: number
}

/** Bump `refreshSignal` after each Lich turn to re-pull the advanced clock. */
export function GameClockPanel({ refreshSignal = 0 }: { refreshSignal?: number }) {
  const [clock, setClock] = useState<ClockData | null>(null)
  const [loaded, setLoaded] = useState(false)

  const fetchClock = useCallback(async () => {
    try {
      const res = await fetch("/api/game-clock", { cache: "no-store", headers: dmHeaders() })
      if (!res.ok) {
        setClock(null)
        return
      }
      const json = (await res.json()) as { clock: ClockData | null }
      setClock(json.clock)
    } catch {
      setClock(null)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void fetchClock()
    // A slow ambient refresh keeps the readout honest even without a turn.
    const t = setInterval(() => void fetchClock(), 30_000)
    return () => clearInterval(t)
  }, [fetchClock])

  // Re-pull immediately after each exchange so the counter/time stay current.
  useEffect(() => {
    if (refreshSignal > 0) void fetchClock()
  }, [refreshSignal, fetchClock])

  // Nothing to show until the clock exists (feature dormant / no session).
  if (!loaded || !clock) return null

  const stalled = clock.exchangesSinceAdvance >= clock.advanceThreshold

  return (
    <div
      className="flex items-center gap-3 rounded-[3px] border border-[#8a5fb0]/60 bg-[#1a1020] px-3 py-1.5 text-[11px] text-[#c9a0e8]"
      title="DM only — the world clock. Players never see these numbers."
    >
      <span className="flex items-center gap-1.5 font-medium">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        Day {clock.day}
        <span className="text-[#e0cfa0]">{clock.clockTime}</span>
        <span className="text-[#8a7fb0]">({clock.timeOfDay})</span>
      </span>
      <span className="h-3 w-px bg-[#8a5fb0]/40" aria-hidden="true" />
      <span
        className={`flex items-center gap-1.5 ${stalled ? "text-[#e0a3a3]" : "text-[#9a8fb0]"}`}
        title={
          stalled
            ? "Pacing threshold reached — Malachar is directed to advance the story this turn."
            : "Exchanges since the story last moved forward."
        }
      >
        <Hourglass className="h-3.5 w-3.5" aria-hidden="true" />
        {clock.exchangesSinceAdvance}/{clock.advanceThreshold}
        {stalled ? " · advancing" : ""}
      </span>
    </div>
  )
}
