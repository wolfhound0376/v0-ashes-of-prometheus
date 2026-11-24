"use client"

// LOAD GAME — the picture book (Sam, 2026-11-23: "PR4"; research doc claude/Tables_Invites_Saves_Research_2026-11-23.md
// §3D). Before this it was a shelf of names (Sam, 2026-11-10: "several saved games, one played at a time … Host should
// be able to select from a variety of saved games"). Rules: lib/saves.ts, lib/save-book.ts. API: /api/saves.
//
// One card per CAMPAIGN, newest first, ◀ ▶ to turn the page. The card is the painted plate the party last stood on,
// with where they are, the session, the hours played, when it was last played, the host and the party's faces.
// Load plays the campaign as it was last saved (Sam: "Continue takes the latest save"). Under the card, its
// CHECKPOINTS — the autosave at every End and the host's Save now — each with Rewind, which plays that moment
// instead (the campaign as it stands is kept first as "Before the rewind"). A MORTAL campaign (chosen at New Game)
// has no checkpoints and no Rewind: "yes on mortal mode".
//
// Loading and rewinding need the table dark; renaming does not. Deleting needs the DM code, and never the game in play.

import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, History, Pencil, Skull, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { dmHeaders } from "@/lib/dm-key"
import type { CampaignCard } from "@/lib/save-book"

type Me = { id: string; token: string } | null
type BookCheckpoint = CampaignCard["checkpoints"][number] & { where?: string | null }
type BookCard = Omit<CampaignCard, "checkpoints"> & {
  art: string | null
  where: string | null
  played: string
  faces: { name: string; url: string | null }[]
  checkpoints: BookCheckpoint[]
}

function when(iso: string): string {
  try { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) } catch { return "" }
}

export function SaveShelf({ me, onLoaded }: { me: Me; onLoaded?: () => void }) {
  const [book, setBook] = useState<BookCard[] | null>(null)
  const [installed, setInstalled] = useState(true)
  const [canDelete, setCanDelete] = useState(false)
  const [tableStatus, setTableStatus] = useState("closed")
  const [i, setI] = useState(0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  // Deleting (Sam, 2026-11-13: "I should be able to delete saved games"): a campaign or one checkpoint. A host
  // without the DM door's cookie types the code here, once, and it is not left behind on this browser.
  const [askDelete, setAskDelete] = useState<{ id: string; name: string; campaign: boolean } | null>(null)
  const [code, setCode] = useState("")

  const headers = useCallback((): Record<string, string> => ({ "Content-Type": "application/json", ...dmHeaders(), ...(me ? { "x-claim-token": me.token } : {}) }), [me])

  const load = useCallback(async () => {
    const q = me ? `?characterId=${encodeURIComponent(me.id)}` : ""
    try {
      const r = await fetch(`/api/saves${q}`, { cache: "no-store", headers: headers() })
      const j = await r.json()
      if (!r.ok) { setBook([]); setMsg(j.error ?? null); return }
      const list: BookCard[] = j.book ?? []
      setBook(list); setInstalled(j.installed !== false); setCanDelete(Boolean(j.canDelete)); setTableStatus(j.tableStatus ?? "closed")
      setI((cur) => (cur === 0 ? Math.max(0, list.findIndex((s) => s.is_loaded)) : Math.min(cur, Math.max(0, list.length - 1))))
    } catch { setMsg("Could not read the saved games.") }
  }, [me, headers])
  useEffect(() => { load() }, [load])

  const send = async (action: "load" | "rename" | "delete" | "rewind", id: string, extra: Record<string, unknown> = {}) => {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch("/api/saves", { method: "POST", headers: headers(), body: JSON.stringify({ action, id, hostId: me?.id, hostToken: me?.token, ...extra }) })
      const j = await r.json()
      if (!r.ok) { setMsg(j.error ?? "That did not work."); return false }
      if (action === "load") { setMsg(`Loaded: ${j.loaded}.`); onLoaded?.() }
      if (action === "rewind") { setMsg(`Rewound to "${j.rewound}". The way it stood is kept as "Before the rewind".`); onLoaded?.() }
      if (action === "delete") setMsg("Deleted.")
      await load()
      return true
    } catch { setMsg("Could not reach the shelf."); return false } finally { setBusy(false) }
  }

  if (!installed) return null            // the migration has not been applied: no shelf, nothing changes
  if (book === null) return null
  if (book.length === 0) {
    return (
      <div className="mt-6 rounded-sm border border-[#3d3428] bg-black/50 px-4 py-3 text-left text-sm text-stone-500">
        <div className="text-[10px] uppercase tracking-[0.35em] text-[#8a6a3a]">Load Game</div>
        <p className="mt-1">Nothing saved yet. The game is saved the first time a session ends.</p>
      </div>
    )
  }

  const c = book[Math.min(i, book.length - 1)]
  const dark = tableStatus === "closed"
  const step = (d: number) => { setAskDelete(null); setI((cur) => (cur + d + book.length) % book.length) }
  const meta = [c.where, c.session_no ? `Session ${c.session_no}` : null, c.played ? `${c.played} played` : null].filter(Boolean).join(" · ")

  return (
    <div className="mt-6 overflow-hidden rounded-sm border border-[#5a4a30] bg-black/60 text-left">
      <div className="flex items-center justify-between border-b border-[#2a241e] px-4 py-2">
        <div className="text-[10px] uppercase tracking-[0.35em] text-[#8a6a3a]">Load Game · {book.length} {book.length === 1 ? "campaign" : "campaigns"}</div>
        <div className="flex items-center gap-1.5">
          {book.map((b, n) => (
            <button key={b.id} type="button" onClick={() => { setAskDelete(null); setI(n) }} aria-label={b.name}
              className={cn("h-1.5 rounded-full transition-all", n === i ? "w-5 bg-[#e8c56a]" : "w-1.5 bg-stone-600 hover:bg-stone-400")} />
          ))}
        </div>
      </div>

      {/* THE CARD — the painted plate the party last stood on. */}
      <div className="relative min-h-[220px]">
        {c.art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.art} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,#2a2015_0%,#0b0907_75%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/10" />
        <button type="button" onClick={() => step(-1)} disabled={book.length < 2} aria-label="Previous campaign"
          className="absolute left-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-[#8a6a3a] bg-black/60 text-[#e8d9ae] hover:border-[#f4e0a8] disabled:opacity-0"><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" onClick={() => step(1)} disabled={book.length < 2} aria-label="Next campaign"
          className="absolute right-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-[#8a6a3a] bg-black/60 text-[#e8d9ae] hover:border-[#f4e0a8] disabled:opacity-0"><ChevronRight className="h-4 w-4" /></button>
        <div className="relative flex min-h-[220px] flex-col justify-end px-16 pb-4 pt-10 text-center">
          <div className="flex justify-center gap-2">
            {c.is_loaded && <span className="rounded-full border border-emerald-600/80 bg-black/60 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-emerald-300">{dark ? "Set up for next time" : "In play"}</span>}
            {c.mortal && <span className="flex items-center gap-1 rounded-full border border-red-700/80 bg-black/60 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-red-300"><Skull className="h-3 w-3" /> Mortal</span>}
          </div>
          <div className="mt-2 font-serif text-xl text-[#f6e6bd] drop-shadow">{c.name}</div>
          {meta && <div className="mt-1 text-[13px] text-stone-300">{meta}</div>}
          <div className="mt-0.5 text-[12px] text-stone-400">
            {[c.host?.name ? `Host: ${c.host.name}` : null, `last played ${when(c.lastPlayed)}`].filter(Boolean).join(" · ")}
          </div>
          {c.faces.length > 0 && (
            <div className="mt-3 flex justify-center -space-x-2">
              {c.faces.map((f) => (
                <div key={f.name} title={f.name} className="h-10 w-10 overflow-hidden rounded-full border-2 border-[#8a6a3a] bg-black">
                  {f.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.url} alt={f.name} className="h-full w-full object-cover object-[center_15%]" />
                  ) : (
                    <div className="grid h-full w-full place-items-center font-serif text-sm text-[#c9a868]">{f.name.charAt(0)}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {!c.is_loaded && (
            <button type="button" disabled={busy || !dark}
              onClick={() => { if (window.confirm(`Load "${c.name}"? The game in play is saved first, then this one takes its place.`)) send("load", c.id) }}
              className="rounded-sm border-2 border-[#c9a868] bg-[#1c160c] px-5 py-2.5 font-serif text-[13px] uppercase tracking-[0.25em] text-[#fff3cf] hover:border-[#f4e0a8] disabled:opacity-40">
              {busy ? "Loading…" : "Load this game"}
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => { const n = window.prompt("Name this saved game", c.name); if (n && n.trim() && n !== c.name) send("rename", c.id, { name: n }) }}
            className="flex items-center gap-1.5 rounded-sm border border-[#3d3428] px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-stone-400 hover:text-stone-200 disabled:opacity-40">
            <Pencil className="h-3.5 w-3.5" /> Rename
          </button>
          <button type="button" disabled={busy || c.is_loaded}
            title={c.is_loaded ? "This is the world set up on the table. Load another save first, then delete this one." : undefined}
            onClick={() => { setMsg(null); setCode(""); setAskDelete(askDelete?.id === c.id ? null : { id: c.id, name: c.name, campaign: true }) }}
            className="flex items-center gap-1.5 rounded-sm border border-red-900/70 px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-red-300/80 hover:text-red-200 disabled:opacity-40">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
        {!dark && !c.is_loaded && <p className="text-center text-[12px] text-stone-500">End the session to change games.</p>}

        {/* THE CHECKPOINTS — or, for a Mortal campaign, why there are none. */}
        {c.mortal ? (
          <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-red-300/80"><Skull className="h-3.5 w-3.5" /> Mortal Mode: one save, no going back.</p>
        ) : c.checkpoints.length > 0 ? (
          <div className="rounded-sm border border-[#2a241e]">
            <div className="border-b border-[#2a241e] px-3 py-1.5 text-[10px] uppercase tracking-[0.3em] text-[#8a6a3a]">Checkpoints</div>
            <ul className="max-h-60 divide-y divide-[#2a241e] overflow-y-auto">
              {c.checkpoints.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-serif text-[14px] text-[#e8d9ae]">{k.name}</div>
                    <div className="truncate text-[11px] text-stone-500">
                      {[k.kind === "named" ? "Saved" : "Autosave", when(k.saved_at), k.where, k.session_no ? `Session ${k.session_no}` : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button type="button" disabled={busy || !dark}
                      title={dark ? undefined : "End the session and close the table first."}
                      onClick={() => { if (window.confirm(`Go back to "${k.name}"? The campaign as it stands now is kept as "Before the rewind", so you can come back.`)) send("rewind", k.id) }}
                      className="flex items-center gap-1 rounded-sm border border-[#7a5f33] px-2.5 py-1.5 text-[10px] uppercase tracking-[0.2em] text-[#e8d9ae] hover:border-[#c9a868] disabled:opacity-40">
                      <History className="h-3.5 w-3.5" /> Rewind
                    </button>
                    <button type="button" disabled={busy} aria-label={`Delete ${k.name}`}
                      onClick={() => { setMsg(null); setCode(""); setAskDelete(askDelete?.id === k.id ? null : { id: k.id, name: k.name, campaign: false }) }}
                      className="grid h-8 w-8 place-items-center rounded-sm border border-red-900/50 text-red-300/60 hover:text-red-200 disabled:opacity-40">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-center text-[12px] text-stone-600">No checkpoints yet — one is kept every time a session ends.</p>
        )}

        {askDelete && (
          <form className="rounded-sm border border-red-900/60 bg-red-950/20 p-3 text-center"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!canDelete) {
                setBusy(true); setMsg(null)
                try {
                  const l = await fetch("/api/dm/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) })
                  const lj = await l.json().catch(() => ({}))
                  if (!l.ok || !lj.ok) { setMsg(l.status === 429 ? "Too many tries. Wait a few minutes." : "That is not the DM code. Nothing was deleted."); return }
                } catch { setMsg("Could not reach the shelf."); return } finally { setBusy(false) }
              }
              const ok = await send("delete", askDelete.id)
              if (!canDelete && me) await fetch("/api/dm/logout", { method: "POST" }).catch(() => {})
              if (ok && askDelete.campaign) setI(0)
              setAskDelete(null); setCode("")
            }}>
            <p className="text-[13px] text-red-200/90">
              Delete &ldquo;{askDelete.name}&rdquo;{askDelete.campaign ? " and all its checkpoints" : ""} for good? This cannot be undone.
            </p>
            {!canDelete && (
              <input type="password" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="DM code"
                className="mt-2 w-48 rounded-sm border border-[#3d3428] bg-black/70 px-3 py-2 text-center text-sm text-stone-200 outline-none focus:border-[#8a6a3a]" />
            )}
            <div className="mt-2 flex justify-center gap-2">
              <button type="submit" disabled={busy || (!canDelete && !code.trim())}
                className="rounded-sm border-2 border-red-800 bg-red-950/60 px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-red-100 hover:border-red-600 disabled:opacity-40">
                {busy ? "Deleting…" : "Delete for good"}
              </button>
              <button type="button" onClick={() => { setAskDelete(null); setCode("") }}
                className="rounded-sm border border-[#3d3428] px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-stone-400 hover:text-stone-200">Keep it</button>
            </div>
          </form>
        )}
        {msg && <p role="status" className="text-center text-[12px] text-[#d9bd7e]">{msg}</p>}
      </div>
    </div>
  )
}

/**
 * SAVE NOW (Sam, 2026-11-23: "PR4"). The host's named checkpoint of the world in play, any time the table is open or
 * live. Not offered in Mortal Mode — the campaign keeps one save.
 */
export function SaveNow({ me }: { me: Me }) {
  const [mortal, setMortal] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const headers = useCallback((): Record<string, string> => ({ "Content-Type": "application/json", ...dmHeaders(), ...(me ? { "x-claim-token": me.token } : {}) }), [me])
  useEffect(() => {
    const q = me ? `?characterId=${encodeURIComponent(me.id)}` : ""
    fetch(`/api/saves${q}`, { cache: "no-store", headers: headers() }).then((r) => r.json())
      .then((j) => { const inPlay = (j.book ?? []).find((b: BookCard) => b.is_loaded); setMortal(inPlay ? Boolean(inPlay.mortal) : j.installed === false ? true : false) })
      .catch(() => setMortal(null))
  }, [me, headers])
  if (mortal === null) return null
  if (mortal) return <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-[0.25em] text-red-300/70"><Skull className="h-3.5 w-3.5" /> Mortal Mode — one save</p>
  const save = async () => {
    const name = window.prompt("Name this moment", "")
    if (name === null) return
    setBusy(true); setMsg(null)
    try {
      const r = await fetch("/api/saves", { method: "POST", headers: headers(), body: JSON.stringify({ action: "checkpoint", name, hostId: me?.id, hostToken: me?.token }) })
      const j = await r.json().catch(() => ({}))
      setMsg(r.ok ? `Saved: ${j.saved}.` : j.error ?? "That did not save.")
    } catch { setMsg("Could not reach the shelf.") } finally { setBusy(false) }
  }
  return (
    <div className="mt-3 text-center">
      <button type="button" disabled={busy} onClick={save}
        className="inline-flex items-center gap-2 rounded-sm border border-[#7a5f33] px-4 py-2 text-[11px] uppercase tracking-[0.3em] text-[#e8d9ae] hover:border-[#c9a868] disabled:opacity-40">
        <History className="h-3.5 w-3.5" /> {busy ? "Saving…" : "Save now"}
      </button>
      {msg && <p role="status" className="mt-2 text-[12px] text-[#d9bd7e]">{msg}</p>}
    </div>
  )
}
