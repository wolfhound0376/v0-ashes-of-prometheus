"use client"

// /dm — BEHIND THE SCREEN. The Dungeon Master's door, and the table.
//
// Sam, 2026-10-24: "The DM entrance should only be an administrative way with the code. This
// should unlock the sandbox and ask who is seated in the game from the list and push forward."
//
//   D1  the code. Checked server-side once (POST /api/dm/login), answered with a signed httpOnly
//       cookie (lib/dm-session.ts). The older localStorage copy (lib/dm-key.ts) is written too, so
//       every existing DM tool on the dashboard keeps working — one door, both keys.
//   D2  the table:
//         WAITING FOR YOU   heroes handed in at the Forge, with their sheet, look, voice and photos,
//                           and Open the cell / Turn away
//         THE ROSTER        every player character; Seat as DM-run companion / Send away
//         OPEN THE TABLE    live, the default — the staging table (/table); the game starts when the DM
//                           and every seat are green (Sam, 2026-10-25)
//         REHEARSAL         the sandbox (/?sandbox=1): Malachar answers, nothing is written
//
// One place I push back on the spec: the gate does not drop the DM INTO the sandbox. If it did, a
// real family night could run with every write quietly dry-run and nobody would know until the
// next session found nothing saved. So the gate makes the sandbox AVAILABLE, and live is the big
// button. Sam's call to flip it.

import { ENTERED_KEY, mapHref } from "@/lib/map-entry"
import { useCallback, useEffect, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Check, DoorOpen, Eye, FlaskConical, Play, RotateCcw, Swords, UserMinus, UserPlus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { setDmKey, clearDmKey } from "@/lib/dm-key"
import { cameThroughDmDoor, leaveDmDoor } from "@/lib/dm-door"
import { HomeButton } from "@/components/home-button"
import { canonBySlug } from "@/lib/canon-heroes"

const ROLE_LS_KEY = "aop_access_role"
const TOKEN_LS_KEY = "aop_claim_token"
const CHARACTER_LS_KEY = "aop_character_id"

type Pending = {
  id: string; playerName: string; heroName: string; status: string; createdAt: string; note: string | null
  /** Set when the claim is for one of the four canon heroes (lib/canon-heroes.ts): their slug. */
  canon: string | null
  sheet: { species: string | null; clazz: string | null; background: string | null; level: number | null; ac: number | null; hp: number | null }
  assets: { look: string | null; sprite: { status: string; previewUrl: string | null; characterId: string | null } | null; voice: string; voiceSample: string | null; facePhotos: string[] }
}
type Seat = { id: string; name: string; at: string; dm?: boolean }
type RosterRow = { id: string; name: string; cls: string }

export default function DmPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<"checking" | "gate" | "table">("checking")
  const [gateArmed, setGateArmed] = useState(true)

  useEffect(() => {
    // The only way in is the title screen's Dungeon Master link (Sam, 2026-10-25: it is the ONLY way to
    // open a table). A typed URL, a bookmark or a hop from Play Saved Game goes back to the title screen.
    if (!cameThroughDmDoor()) { router.replace("/intro"); return }
    fetch("/api/dm/session", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      setGateArmed(Boolean(j.gate))
      setPhase(j.dm ? "table" : "gate")
    }).catch(() => setPhase("gate"))
  }, [router])

  return (
    <div className="relative min-h-screen bg-[#0a0908] text-stone-200">
      <div className="pointer-events-none fixed inset-0 bg-[url('/images/intro-poster.webp')] bg-cover bg-center opacity-15" />
      <HomeButton className="right-4" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(0,0,0,0.3)_0%,rgba(0,0,0,0.85)_60%,#0a0908_100%)]" />
      <div className="relative mx-auto w-full max-w-5xl px-4 pb-20 pt-10 sm:px-6">
        <div className="mb-8 text-center">
          <div className="text-[10px] uppercase tracking-[0.5em] text-[#8a6a3a]">Ashes of Prometheus</div>
          <h1 className="mt-2 font-serif text-3xl tracking-[0.14em] text-[#e8c56a]">Behind the Screen</h1>
        </div>
        {phase === "checking" && <div className="py-24 text-center text-[11px] uppercase tracking-[0.4em] text-stone-600">Checking the lock…</div>}
        {phase === "gate" && <Gate armed={gateArmed} onOpen={() => setPhase("table")} />}
        {phase === "table" && <Table onLock={async () => { await fetch("/api/dm/logout", { method: "POST" }).catch(() => {}); clearDmKey(); leaveDmDoor(); router.replace("/intro") }} router={router} />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------

function Gate({ armed, onOpen }: { armed: boolean; onOpen: () => void }) {
  const [code, setCode] = useState("")
  const [status, setStatus] = useState<"idle" | "checking" | "no" | "limited" | "nogate">("idle")

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim() || status === "checking") return
    setStatus("checking")
    try {
      const r = await fetch("/api/dm/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) })
      if (r.status === 429) { setStatus("limited"); return }
      if (r.status === 503) { setStatus("nogate"); return }
      const j = await r.json()
      if (!j.ok) { setStatus("no"); return }
      // Both keys: the cookie for the new routes (set by the server), the localStorage copy for the
      // dashboard's existing DM tools. The seat, if this browser held one, is released.
      setDmKey(code)
      try {
        window.localStorage.setItem(ROLE_LS_KEY, "dm")
        window.localStorage.removeItem(TOKEN_LS_KEY)
        window.localStorage.removeItem(CHARACTER_LS_KEY)
      } catch { /* storage blocked */ }
      onOpen()
    } catch { setStatus("no") }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm text-center">
      <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full border border-[#7a5f33]/70 bg-black/60 font-serif text-2xl text-[#c9a868]">☠</div>
      <h2 className="font-serif text-xl tracking-[0.1em] text-[#e8d9ae]">Dungeon Master</h2>
      <p className="mt-2 text-sm text-stone-500">{armed ? "The code, please." : "No DM code is set on the server — the door cannot open. Set DM_ACCESS_CODE in Vercel."}</p>
      <input
        value={code}
        onChange={(e) => { setCode(e.target.value); if (status !== "checking") setStatus("idle") }}
        type="password"
        autoFocus
        autoComplete="off"
        placeholder="the DM code"
        disabled={!armed || status === "checking"}
        className="mt-6 w-full rounded-sm border border-[#7a5f33]/70 bg-black/70 px-3 py-3 text-center font-mono text-[16px] tracking-widest text-stone-100 placeholder:text-stone-700 focus:border-[#c9a868] focus:outline-none disabled:opacity-50"
      />
      {status === "no" && <p role="alert" className="mt-3 text-sm text-red-400/90">No.</p>}
      {status === "limited" && <p role="alert" className="mt-3 text-sm text-red-400/90">Too many tries. Wait a few minutes.</p>}
      {status === "nogate" && <p role="alert" className="mt-3 text-sm text-red-400/90">The server has no DM code configured.</p>}
      <button type="submit" disabled={!armed || !code.trim() || status === "checking"} className="mt-5 w-full rounded-sm border border-[#c9a868]/70 bg-gradient-to-b from-[#1d1710] to-[#120e0a] py-3 font-serif text-[13px] uppercase tracking-[0.3em] text-[#d9bd7e] hover:border-[#c9a868] hover:text-[#f0dba8] disabled:opacity-40">
        {status === "checking" ? "…" : "Unlock"}
      </button>
      <a href="/intro" className="mt-6 inline-block text-[11px] uppercase tracking-[0.25em] text-stone-600 hover:text-stone-400">← The title</a>
    </form>
  )
}

// ---------------------------------------------------------------------------------------------

function Table({ onLock, router }: { onLock: () => void; router: ReturnType<typeof useRouter> }) {
  const [pending, setPending] = useState<Pending[]>([])
  const [recent, setRecent] = useState<Pending[]>([])
  const [tableNote, setTableNote] = useState<string | null>(null)
  const [seated, setSeated] = useState<Seat[]>([])
  const [roster, setRoster] = useState<RosterRow[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [askNew, setAskNew] = useState(false)

  const load = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([
        fetch("/api/forge/activate", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/seat", { cache: "no-store" }).then((r) => r.json()),
      ])
      setPending(a.pending ?? []); setRecent(a.recent ?? []); setTableNote(a.error ?? null)
      setSeated(s.seated ?? []); setRoster(s.roster ?? [])
    } catch { setMsg("Could not read the table.") }
  }, [])
  useEffect(() => { load(); const t = window.setInterval(load, 8000); return () => window.clearInterval(t) }, [load])

  const act = async (id: string, action: "activate" | "reject", confirmDuplicate = false) => {
    const claim = pending.find((p) => p.id === id)
    if (action === "activate" && claim?.canon && !confirmDuplicate && !window.confirm(`Hand ${claim.heroName} to ${claim.playerName}? Whoever held ${claim.heroName} before loses their words and their seat link.`)) return
    setBusy(id); setMsg(null)
    try {
      const r = await fetch("/api/forge/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, confirmDuplicate }) })
      const j = await r.json()
      if (r.status === 409 && j.duplicate) {
        if (window.confirm(`${j.error} Open the cell anyway, as a second copy?`)) return act(id, action, true)
        return
      }
      if (!r.ok) { setMsg(j.error ?? "That did not work."); return }
      setMsg(action === "activate" ? (j.codeKept ? "Cell opened. Their words are good at the door." : `Cell opened, but their words could not be kept — new words: ${j.claimCode ?? "none issued"}.`) : "Turned away.")
      await load()
    } catch { setMsg("Could not reach the table.") } finally { setBusy(null) }
  }

  const seat = async (characterId: string) => {
    setBusy(characterId); setMsg(null)
    try {
      const r = await fetch("/api/seat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ characterId }) })
      const j = await r.json()
      if (!r.ok) { setMsg(j.error ?? "Could not seat them."); return }
      setSeated(j.seated ?? [])
    } finally { setBusy(null) }
  }
  const unseat = async (characterId: string) => {
    setBusy(characterId); setMsg(null)
    try {
      const r = await fetch(`/api/seat?characterId=${encodeURIComponent(characterId)}`, { method: "DELETE" })
      const j = await r.json()
      if (!r.ok) { setMsg(j.error ?? "Could not send them away."); return }
      setSeated(j.seated ?? [])
    } finally { setBusy(null) }
  }

  // Three ways out of Behind the Screen (Sam, 2026-10-25):
  //   Continue the campaign  → open the table; the world is exactly as the last session left it.
  //   New game               → the campaign is RESET, then the table opens ("starting a new game ALWAYS resets
  //                            the campaign"). Server side it is one action (/api/table `new`), so a reset is never
  //                            half-done with the table left shut, or the table opened on the old world.
  //   Rehearsal              → the sandbox; skips the table, saves nothing.
  // The player's Start New Game on the title screen only picks or forges a hero — it never resets anything.
  const begin = async (mode: "continue" | "new" | "sandbox") => {
    try { window.localStorage.setItem(ROLE_LS_KEY, "dm"); window.sessionStorage.setItem("aop_intro_seen", "1") } catch { /* storage blocked */ }
    if (mode === "sandbox") {
      try { window.sessionStorage.setItem(ENTERED_KEY, "1") } catch { /* storage blocked */ }
      router.push(mapHref(true))
      return
    }
    setBusy(mode === "new" ? "new" : "open"); setMsg(null)
    try {
      const r = await fetch("/api/table", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: mode === "new" ? "new" : "open" }) })
      if (!r.ok) { const j = await r.json().catch(() => ({})); setMsg(j.error ?? (mode === "new" ? "Could not start a new game." : "Could not open the table.")); return }
      if (mode === "new") {
        // Bring every screen that follows the shared stage back to the table, as the old restart did.
        fetch("/api/stage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "table", by: "dm", at: new Date().toISOString(), caption: "A new game begins." }) }).catch(() => {})
      }
      router.push("/table")
    } catch { setMsg("Could not reach the table.") } finally { setBusy(null); setAskNew(false) }
  }

  const seatOf = (id: string) => seated.find((s) => s.id === id)

  return (
    <div className="space-y-8">
      {/* WAITING FOR YOU */}
      <Section title="Waiting for you" count={pending.length} icon={<DoorOpen className="h-4 w-4" />}>
        {tableNote && <p className="mb-3 rounded-sm border border-amber-900/50 bg-[#201a10] p-3 text-sm text-amber-400">{tableNote}</p>}
        {pending.length === 0 && !tableNote && <p className="text-sm text-stone-500">Nobody at the Forge door.</p>}
        <ul className="space-y-3">
          {pending.map((p) => (
            <li key={p.id} className="rounded-sm border border-[#3d3428] bg-black/50">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3">
                  {p.canon && canonBySlug(p.canon) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={canonBySlug(p.canon)!.portrait} alt="" className="h-12 w-12 rounded-sm border border-[#8a6a3a] bg-black object-cover object-top" />
                  ) : p.assets.sprite?.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.assets.sprite.previewUrl} alt="" className="h-12 w-12 rounded-sm border border-[#3d3428] bg-black object-contain [image-rendering:pixelated]" />
                  ) : (
                    <div className="grid h-12 w-12 place-items-center rounded-sm border border-[#3d3428] font-serif text-lg text-[#8a6a3a]">{p.heroName.charAt(0)}</div>
                  )}
                  <div>
                    <div className="font-serif text-lg text-[#e8d9ae]">{p.heroName} <span className="text-sm text-stone-500">· {p.playerName}</span>{p.canon && <span className="ml-2 rounded-sm border border-[#8a6a3a]/70 px-1.5 py-0.5 align-middle text-[9px] uppercase tracking-[0.25em] text-[#c9a868]">Canon hero</span>}</div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">{[p.sheet.species, p.sheet.clazz, p.sheet.background, p.sheet.level != null ? `Lv ${p.sheet.level}` : null].filter(Boolean).join(" · ")}{p.sheet.ac != null ? ` · AC ${p.sheet.ac}` : ""}{p.sheet.hp != null ? ` · HP ${p.sheet.hp}` : ""}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)} className="flex items-center gap-1.5 rounded-sm border border-[#3d3428] px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-stone-400 hover:border-[#8a6a3a] hover:text-stone-200"><Eye className="h-3.5 w-3.5" /> Review</button>
                  <button type="button" disabled={busy === p.id} onClick={() => act(p.id, "reject")} className="flex items-center gap-1.5 rounded-sm border border-[#5a2a2a]/70 px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-red-300/80 hover:border-red-500/70 hover:text-red-200 disabled:opacity-40"><X className="h-3.5 w-3.5" /> Turn away</button>
                  <button type="button" disabled={busy === p.id} onClick={() => act(p.id, "activate")} className="flex items-center gap-1.5 rounded-sm border border-emerald-500/70 bg-gradient-to-b from-[#1d3527] to-[#122018] px-4 py-2 font-serif text-[12px] uppercase tracking-[0.2em] text-emerald-100 hover:border-emerald-300 disabled:opacity-40"><Check className="h-3.5 w-3.5" /> {busy === p.id ? "Opening…" : "Open the cell"}</button>
                </div>
              </div>
              {open === p.id && (
                <div className="grid gap-3 border-t border-[#2a241e] px-4 py-3 text-sm sm:grid-cols-2">
                  <div><div className="text-[10px] uppercase tracking-[0.25em] text-stone-600">Look</div><div className="text-stone-400">{p.assets.look ?? "Left to the DM"}{p.assets.sprite ? ` · figure: ${p.assets.sprite.status}` : ""}</div></div>
                  <div><div className="text-[10px] uppercase tracking-[0.25em] text-stone-600">Voice</div><div className="text-stone-400">{p.assets.voice}</div>{p.assets.voiceSample && <audio controls src={p.assets.voiceSample} className="mt-2 h-8 w-full" />}</div>
                  <div className="sm:col-span-2"><div className="text-[10px] uppercase tracking-[0.25em] text-stone-600">Face</div>
                    {p.assets.facePhotos.length ? (
                      <div className="mt-2 flex gap-2">{p.assets.facePhotos.map((u) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={u} src={u} alt="" className="h-24 w-32 rounded-sm border border-[#3d3428] object-cover" />
                      ))}</div>
                    ) : <div className="text-stone-400">Skipped</div>}
                  </div>
                  <div className="text-[11px] text-stone-600 sm:col-span-2">Handed in {new Date(p.createdAt).toLocaleString()}. {p.canon ? `A canon hero: opening the cell hands the existing ${p.heroName} — sheet, sprite, voice and art — to these words. Nothing is imported.` : "Opening the cell runs the same import as /forge/import, with their own words as the door code. Figure animations, voice clone and film stills are NOT started here yet."}</div>
                </div>
              )}
            </li>
          ))}
        </ul>
        {recent.length > 0 && (
          <details className="mt-4 text-sm text-stone-500">
            <summary className="cursor-pointer text-[11px] uppercase tracking-[0.25em] text-stone-600 hover:text-stone-400">Recently decided ({recent.length})</summary>
            <ul className="mt-2 space-y-1">{recent.map((r) => <li key={r.id}>{r.heroName} · {r.playerName} — <span className={r.status === "activated" ? "text-emerald-300/80" : "text-red-300/70"}>{r.status}</span>{r.note ? ` · ${r.note}` : ""}</li>)}</ul>
          </details>
        )}
      </Section>

      {/* THE ROSTER */}
      <Section title="The roster" count={seated.length} icon={<Swords className="h-4 w-4" />} sub="Players take their own seats at the staging table. While the table is open and before you press Start, seat a hero yourself to run them as a companion; once the session begins the roster is locked.">
        <ul className="divide-y divide-[#2a241e] rounded-sm border border-[#3d3428] bg-black/50">
          {roster.length === 0 && <li className="px-4 py-3 text-sm text-stone-500">No player characters yet.</li>}
          {roster.map((c) => {
            const s = seatOf(c.id)
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className={cn("h-2.5 w-2.5 rounded-full", s ? (s.dm ? "bg-[#c9a868]" : "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]") : "bg-stone-700")} />
                  <div>
                    <div className="font-serif text-[15px] text-[#e8d9ae]">{c.name}</div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">{c.cls || "Adventurer"} · {s ? (s.dm ? "DM-run companion" : "Seated by their player") : "Resting"}</div>
                  </div>
                </div>
                <div>
                  {!s && <button type="button" disabled={busy === c.id} onClick={() => seat(c.id)} className="flex items-center gap-1.5 rounded-sm border border-[#3d3428] px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-stone-400 hover:border-[#c9a868] hover:text-[#e8c56a] disabled:opacity-40"><UserPlus className="h-3.5 w-3.5" /> Seat as companion</button>}
                  {s?.dm && <button type="button" disabled={busy === c.id} onClick={() => unseat(c.id)} className="flex items-center gap-1.5 rounded-sm border border-[#3d3428] px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-stone-400 hover:border-red-500/60 hover:text-red-200 disabled:opacity-40"><UserMinus className="h-3.5 w-3.5" /> Send away</button>}
                  {s && !s.dm && <span className="text-[11px] uppercase tracking-[0.2em] text-stone-600">theirs</span>}
                </div>
              </li>
            )
          })}
        </ul>
      </Section>

      {msg && <p className="text-center text-sm text-[#d9bd7e]">{msg}</p>}

      {/* BEGIN */}
      <div className="flex flex-col items-center gap-3 pt-2">
        <button type="button" disabled={busy !== null} onClick={() => begin("continue")} className="flex items-center gap-3 rounded-sm border-2 border-[#8a6a3a] bg-gradient-to-b from-[#2a2015]/90 via-black/80 to-[#2a2015]/90 px-12 py-4 font-serif text-xl uppercase tracking-[0.35em] text-[#e8c56a] shadow-[0_0_40px_rgba(201,168,104,0.35)] transition-all hover:border-[#f4e0a8] hover:text-[#fff3cf] hover:shadow-[0_0_80px_rgba(232,197,106,0.6)] disabled:opacity-40">
          <Play className="h-5 w-5" /> {busy === "open" ? "Opening…" : "Continue the campaign"}
        </button>
        {askNew ? (
          <div className="w-full max-w-md rounded-sm border border-red-800/70 bg-[#1a0b0b]/90 p-4 text-left">
            <div className="font-serif text-base text-red-100">Start a new game?</div>
            <p className="mt-2 text-sm leading-relaxed text-stone-400">
              A new game resets the whole campaign: the story so far, what Malachar and the NPCs remember, every choice the
              world recorded and everything the party carries. The heroes are kept, with their sheets, levels and art. Then
              the table opens and the party wakes in the slave pen of Velkynvelve. This cannot be undone.
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={busy !== null} onClick={() => begin("new")} className="rounded-sm border border-red-600/80 bg-[#3a1414] px-4 py-2 font-serif text-[12px] uppercase tracking-[0.25em] text-red-100 hover:border-red-400 disabled:opacity-40">{busy === "new" ? "Resetting…" : "Reset and open the table"}</button>
              <button type="button" disabled={busy !== null} onClick={() => setAskNew(false)} className="rounded-sm border border-[#3d3428] px-4 py-2 text-[11px] uppercase tracking-[0.25em] text-stone-400 hover:text-stone-200 disabled:opacity-40">Keep the campaign</button>
            </div>
          </div>
        ) : (
          <button type="button" disabled={busy !== null} onClick={() => setAskNew(true)} className="flex items-center gap-2 rounded-sm border border-red-900/70 px-6 py-2.5 font-serif text-[13px] uppercase tracking-[0.3em] text-red-200/80 hover:border-red-500/70 hover:text-red-100 disabled:opacity-40">
            <RotateCcw className="h-4 w-4" /> New game — resets the campaign
          </button>
        )}
        <button type="button" onClick={() => begin("sandbox")} className="flex items-center gap-2 rounded-sm border border-[#3d3428] px-5 py-2 text-[11px] uppercase tracking-[0.3em] text-stone-500 hover:border-[#8a6a3a] hover:text-stone-300">
          <FlaskConical className="h-3.5 w-3.5" /> Rehearsal — sandbox, nothing saves
        </button>
        <button type="button" onClick={onLock} className="mt-4 text-[10px] uppercase tracking-[0.3em] text-stone-700 hover:text-stone-500">Lock the screen</button>
      </div>
    </div>
  )
}

function Section({ title, count, icon, sub, children }: { title: string; count?: number; icon: React.ReactNode; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[3px] border border-[#7a5f33]/60 bg-gradient-to-b from-[#15110c]/95 via-[#100d09]/95 to-[#0b0907]/95 p-5 shadow-[inset_0_1px_0_0_rgba(212,177,90,0.14),0_10px_40px_rgba(0,0,0,0.6)]">
      <div className="mb-3 flex items-center gap-2 border-b border-[#2a241e] pb-2">
        <span className="text-[#c9a868]">{icon}</span>
        <h2 className="font-serif text-[13px] font-semibold uppercase tracking-[0.2em] text-[#d9bd7e]">{title}</h2>
        {typeof count === "number" && <span className="ml-1 rounded-full border border-[#3d3428] px-2 text-[10px] text-stone-500">{count}</span>}
      </div>
      {sub && <p className="mb-3 text-[12px] text-stone-500">{sub}</p>}
      {children}
    </section>
  )
}
