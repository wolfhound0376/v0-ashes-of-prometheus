"use client"

// Stopping time (Sam, 2026-10-12: "In DM mode for the sprite and dashboard UI, I should be able to stop
// time so I can work on things").
//
// One world flag, TIME_STOPPED, set and cleared by the DM. While it is set:
//   - the sprite map freezes (no walking, patrols, idle life, narration or barks),
//   - the world clock does not move (lib/time-tracking.ts skips every advance),
//   - nobody can send an action, and Malachar takes no turns (/api/chat answers 423),
//   - every screen shows that time is stopped.
// The flag is realtime, so every browser stops and starts together.

import { useState } from "react"
import { Hourglass, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { dmHeaders, ensureDmKey } from "@/lib/dm-key"
import { TIME_STOPPED } from "@/lib/world-flags"

export function TimeStopToggle({ stopped }: { stopped: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function toggle() {
    if (busy) return
    if (!ensureDmKey("stop and start time")) return
    setBusy(true)
    setError(null)
    try {
      const res = stopped
        ? await fetch(`/api/world-flags?key=${encodeURIComponent(TIME_STOPPED)}`, { method: "DELETE", headers: dmHeaders() })
        : await fetch("/api/world-flags", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...dmHeaders() },
            body: JSON.stringify({ key: TIME_STOPPED, setBy: "dm", note: "DM stopped time" }),
          })
      if (!res.ok) setError(res.status === 403 ? "DM code needed" : "Could not change time")
    } catch {
      setError("Could not change time")
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      title={stopped ? "Start time again for everyone" : "Stop time for everyone: the map freezes, the clock stops, nobody can act and Malachar waits"}
      className={cn(
        "flex items-center gap-1.5 rounded border px-2.5 py-1.5 font-serif text-[10px] uppercase tracking-wider disabled:opacity-60",
        stopped ? "border-[#62e3c6] bg-[#0f2a26] text-[#9ff0dc]" : "border-[#695326] text-[#cdb276] hover:border-[#c9a868] hover:text-[#f0cd7a]",
      )}
    >
      {stopped ? <Play className="h-3 w-3" aria-hidden /> : <Hourglass className="h-3 w-3" aria-hidden />}
      {busy ? "…" : stopped ? "Start time" : "Stop time"}
      {error ? <span className="ml-1 normal-case text-[#e08a7a]">{error}</span> : null}
    </button>
  )
}

export function TimeStoppedBanner({ stopped, isDm }: { stopped: boolean; isDm: boolean }) {
  if (!stopped) return null
  return (
    <div role="status" className="pointer-events-none fixed left-1/2 top-2 z-[60] -translate-x-1/2 rounded border border-[#62e3c6]/60 bg-[#071614]/90 px-4 py-1.5 text-center font-serif text-[11px] uppercase tracking-[.2em] text-[#9ff0dc] shadow-[0_6px_20px_#000a]">
      <Hourglass className="mr-2 inline h-3 w-3 align-[-1px]" aria-hidden />
      {isDm ? "Time is stopped. Start it again when you are ready." : "Time is stopped. The world waits for the DM."}
    </div>
  )
}
