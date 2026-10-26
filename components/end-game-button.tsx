"use client"

// The DM's "End the game" (Sam, 2026-10-25: "we need a button that gets me to end the game and kicks
// everyone out"). One press, one confirm: /api/table "end" closes the table and empties every seat — the
// world is already saved as it was played (lib/table.ts: End IS the save) — and every player's page sends
// them back to the table within a few seconds (components/session-guard.tsx, app/velkynvelve/page.tsx).

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Power } from "lucide-react"
import { dmHeaders } from "@/lib/dm-key"

export function EndGameButton({ className = "", onEnded }: { className?: string; onEnded?: () => void }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const end = async () => {
    if (!window.confirm("End the game for everyone?\n\nEvery player is sent back to the table. The world stays exactly as it is for next time.")) return
    setBusy(true); setError(null)
    try {
      const r = await fetch("/api/table", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...dmHeaders() },
        credentials: "same-origin",
        body: JSON.stringify({ action: "end" }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j.error) { setError(j.error || `Could not end the game (${r.status}).`); return }
      if (onEnded) onEnded()
      else router.push("/table")
    } catch {
      setError("Could not reach the table. Try again.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      {error ? <span className="text-[10px] text-red-300">{error}</span> : null}
      <button
        type="button"
        onClick={end}
        disabled={busy}
        title="End the game and send every player back to the table"
        className={`inline-flex items-center gap-1.5 rounded-sm border border-red-700/80 bg-red-950/60 px-3 py-1.5 font-serif text-xs uppercase tracking-[0.18em] text-red-200 shadow-[0_0_18px_rgba(185,28,28,0.25)] hover:border-red-400 hover:text-white disabled:opacity-40 ${className}`}
      >
        <Power className="h-3.5 w-3.5" aria-hidden />
        {busy ? "Ending…" : "End the game"}
      </button>
    </span>
  )
}
