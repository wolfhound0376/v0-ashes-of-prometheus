"use client"

// THE SHELF — the saved games, one in play (Sam, 2026-11-10: "several saved games, one played at a time … Host
// should be able to select from a variety of saved games"). Rules: lib/saves.ts. API: /api/saves.
//
// ◀ name ▶ cycles the saves; each shows its session, where the party stands, its host and party, and when it was
// last played. Load puts it into play (the game in play is saved first). Shown only while the table is dark.

import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react"
import { dmHeaders } from "@/lib/dm-key"
import type { SaveRow } from "@/lib/saves"

type Me = { id: string; token: string } | null

function when(iso: string): string {
  try { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) } catch { return "" }
}

export function SaveShelf({ me, onLoaded }: { me: Me; onLoaded?: () => void }) {
  const [saves, setSaves] = useState<SaveRow[] | null>(null)
  const [installed, setInstalled] = useState(true)
  const [canDelete, setCanDelete] = useState(false)
  const [tableStatus, setTableStatus] = useState("closed")
  const [i, setI] = useState(0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const headers = useCallback((): Record<string, string> => ({ "Content-Type": "application/json", ...dmHeaders(), ...(me ? { "x-claim-token": me.token } : {}) }), [me])

  const load = useCallback(async () => {
    const q = me ? `?characterId=${encodeURIComponent(me.id)}` : ""
    try {
      const r = await fetch(`/api/saves${q}`, { cache: "no-store", headers: headers() })
      const j = await r.json()
      if (!r.ok) { setSaves([]); setMsg(j.error ?? null); return }
      const list: SaveRow[] = j.saves ?? []
      setSaves(list); setInstalled(j.installed !== false); setCanDelete(Boolean(j.canDelete)); setTableStatus(j.tableStatus ?? "closed")
      setI((cur) => (cur === 0 ? Math.max(0, list.findIndex((s) => s.is_loaded)) : Math.min(cur, Math.max(0, list.length - 1))))
    } catch { setMsg("Could not read the saved games.") }
  }, [me, headers])
  useEffect(() => { load() }, [load])

  const send = async (action: "load" | "rename" | "delete", id: string, extra: Record<string, unknown> = {}) => {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch("/api/saves", { method: "POST", headers: headers(), body: JSON.stringify({ action, id, hostId: me?.id, hostToken: me?.token, ...extra }) })
      const j = await r.json()
      if (!r.ok) { setMsg(j.error ?? "That did not work."); return }
      if (Array.isArray(j.saves)) setSaves(j.saves)
      if (action === "load") { setMsg(`Loaded: ${j.loaded}.`); onLoaded?.() }
      if (action === "delete") setI(0)
    } catch { setMsg("Could not reach the shelf.") } finally { setBusy(false) }
  }

  if (!installed) return null            // the migration has not been applied: no shelf, nothing changes
  if (saves === null) return null
  if (saves.length === 0) {
    return (
      <div className="mt-6 rounded-sm border border-[#3d3428] bg-black/50 px-4 py-3 text-left text-sm text-stone-500">
        <div className="text-[10px] uppercase tracking-[0.35em] text-[#8a6a3a]">Saved games</div>
        <p className="mt-1">None yet. The game is saved the first time a session ends.</p>
      </div>
    )
  }

  const s = saves[Math.min(i, saves.length - 1)]
  const dark = tableStatus === "closed"
  const step = (d: number) => setI((cur) => (cur + d + saves.length) % saves.length)

  return (
    <div className="mt-6 rounded-sm border border-[#5a4a30] bg-black/60 p-4 text-left">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.35em] text-[#8a6a3a]">Saved games · {saves.length}</div>
        {s.is_loaded && <span className="rounded-full border border-emerald-700/70 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-emerald-300">{dark ? "Loaded" : "In play"}</span>}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={() => step(-1)} disabled={saves.length < 2} aria-label="Previous save" className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-[#8a6a3a] text-[#e8d9ae] hover:border-[#f4e0a8] disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate font-serif text-lg text-[#f0dba8]">{s.name}</div>
          <div className="mt-0.5 text-[13px] text-stone-400">
            {[s.session_no ? `Session ${s.session_no}` : null, s.place, `last played ${when(s.saved_at)}`].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-0.5 text-[12px] text-stone-500">
            {[s.host?.name ? `Host: ${s.host.name}` : null, s.party?.length ? s.party.join(", ") : null].filter(Boolean).join(" · ")}
          </div>
        </div>
        <button type="button" onClick={() => step(1)} disabled={saves.length < 2} aria-label="Next save" className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-[#8a6a3a] text-[#e8d9ae] hover:border-[#f4e0a8] disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {!s.is_loaded && (
          <button type="button" disabled={busy || !dark}
            onClick={() => { if (window.confirm(`Load "${s.name}"? The game in play is saved first, then this one takes its place.`)) send("load", s.id) }}
            className="rounded-sm border-2 border-[#c9a868] bg-[#1c160c] px-5 py-2.5 font-serif text-[13px] uppercase tracking-[0.25em] text-[#fff3cf] hover:border-[#f4e0a8] disabled:opacity-40">
            {busy ? "Loading…" : "Load this game"}
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => { const n = window.prompt("Name this saved game", s.name); if (n && n.trim() && n !== s.name) send("rename", s.id, { name: n }) }}
          className="flex items-center gap-1.5 rounded-sm border border-[#3d3428] px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-stone-400 hover:text-stone-200 disabled:opacity-40">
          <Pencil className="h-3.5 w-3.5" /> Rename
        </button>
        {canDelete && !s.is_loaded && (
          <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Delete "${s.name}" for good? This cannot be undone.`)) send("delete", s.id) }}
            className="flex items-center gap-1.5 rounded-sm border border-red-900/70 px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-red-300/80 hover:text-red-200 disabled:opacity-40">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        )}
      </div>
      {/* Sam, 2026-11-10: "Still not able to force close this active game" — with the table dark nothing is being
          played; the green badge only marks which world is set up on the table, so say so. */}
      {dark && s.is_loaded && <p className="mt-2 text-center text-[12px] text-stone-500">The table is closed — nobody is playing. This is the world that is set up for next time.</p>}
      {!dark && !s.is_loaded && <p className="mt-2 text-center text-[12px] text-stone-500">End the session to change games.</p>}
      {msg && <p role="status" className="mt-2 text-center text-[12px] text-[#d9bd7e]">{msg}</p>}
    </div>
  )
}
