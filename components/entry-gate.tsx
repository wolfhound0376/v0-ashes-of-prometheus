"use client"

// The gate onto the map — the last dark moment before everyone steps onto the Underwalk at once
// (lib/entry.ts; Sam, 2026-10-29: "we all enter the same time").
//
// A player's /awaken ends here; the DM's Act card ends here. The screen stays dark, names who is awake and who
// is still waking, and counts down from the server's clock when the gate opens. The DM also gets "Bring them in
// now". It can't stall: three failed reads in a row, or the session no longer live, and it lets you through.

import { useEffect, useRef, useState } from "react"
import { msUntil } from "@/lib/entry"

type Reply = { live?: boolean; now?: number; goAt?: number | null; arrived?: string[]; waitingFor?: string[]; error?: string }

const POLL_MS = 1500
const GIVE_UP_AFTER_FAILURES = 3

export function EntryGate({ who, dm = false, headers = {}, onGo }: {
  /** The player at the gate (their claim). Omit for the DM. */
  who?: { id: string; token: string } | null
  dm?: boolean
  /** The DM's headers, for "Bring them in now". */
  headers?: Record<string, string>
  onGo: () => void
}) {
  const [r, setR] = useState<Reply | null>(null)
  const [busy, setBusy] = useState(false)
  const gone = useRef(false)
  const fired = useRef<number | null>(null)
  const go = useRef(onGo)
  go.current = onGo

  useEffect(() => {
    let live = true, failures = 0
    const leave = () => { if (gone.current) return; gone.current = true; go.current() }
    const take = (j: Reply) => {
      if (!live) return
      setR(j)
      if (j.live === false) return leave()
      const wait = msUntil(j.goAt ?? null, j.now ?? Date.now())
      if (wait != null && fired.current == null) fired.current = window.setTimeout(leave, wait)
    }
    const poll = async () => {
      try {
        const j: Reply = await fetch("/api/table/entry", { cache: "no-store" }).then((x) => x.json())
        if (j.error) throw new Error(j.error)
        failures = 0; take(j)
      } catch { if (++failures >= GIVE_UP_AFTER_FAILURES) leave() }
    }
    // Say we're here first (a player), then watch.
    ;(async () => {
      if (who) {
        try {
          const j: Reply = await fetch("/api/table/entry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "arrive", characterId: who.id, claimToken: who.token }) }).then((x) => x.json())
          if (!j.error) take(j)
        } catch { /* the poll carries on */ }
      } else poll()
    })()
    const t = window.setInterval(poll, POLL_MS)
    return () => { live = false; window.clearInterval(t); if (fired.current != null) window.clearTimeout(fired.current); fired.current = null }
  }, [who?.id, who?.token])

  const bringIn = async () => {
    setBusy(true)
    try {
      const j: Reply = await fetch("/api/table/entry", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ action: "go" }) }).then((x) => x.json())
      if (!j.error) setR(j)
    } catch { /* the poll will see it */ } finally { setBusy(false) }
  }

  const opening = r?.goAt != null
  const waiting = r?.waitingFor ?? []
  const awake = r?.arrived ?? []
  return (
    <div className="fixed inset-0 z-[300] grid place-items-center bg-black px-6 text-center text-stone-300">
      <div className="max-w-md">
        <div className="text-[11px] uppercase tracking-[0.5em] text-[#8a6a3a]">{opening ? "Into the pen" : "The party wakes"}</div>
        <p className="mt-4 font-serif text-xl italic text-[#b98cf0] [text-shadow:0_0_18px_rgba(123,47,214,.45)]">
          {opening ? "Together, then." : "Nobody walks in alone."}
        </p>
        {(awake.length > 0 || waiting.length > 0) && (
          <ul className="mx-auto mt-8 flex flex-wrap justify-center gap-2">
            {awake.map((n) => <li key={`a-${n}`} className="flex items-center gap-2 rounded-full border border-emerald-500/40 bg-[#10201a]/70 px-3 py-1 text-[12px] text-emerald-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{n}</li>)}
            {waiting.map((n) => <li key={`w-${n}`} className="flex items-center gap-2 rounded-full border border-[#3d3428] bg-black/60 px-3 py-1 text-[12px] text-stone-500"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500/70" />{n}</li>)}
          </ul>
        )}
        {!opening && waiting.length > 0 && <p className="mt-4 text-[11px] text-stone-600">Waiting for {waiting.join(", ")} to wake.</p>}
        {dm && !opening && waiting.length > 0 && (
          <button type="button" disabled={busy} onClick={bringIn} className="mt-8 rounded-sm border border-[#8a6a3a] bg-gradient-to-b from-[#2a2015] to-black px-6 py-3 font-serif text-[13px] uppercase tracking-[0.3em] text-[#e8c56a] hover:border-[#f4e0a8] hover:text-[#fff3cf] disabled:opacity-50">
            {busy ? "…" : "Bring them in now"}
          </button>
        )}
      </div>
    </div>
  )
}
