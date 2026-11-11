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
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Check, DoorOpen, Eye, FlaskConical, Play, RotateCcw, Swords, UserMinus, UserPlus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { setDmKey, clearDmKey, dmHeaders } from "@/lib/dm-key"
import { leaveDmDoor } from "@/lib/dm-door"
import { HomeButton } from "@/components/home-button"
import { canonBySlug } from "@/lib/canon-heroes"
import { SaveShelf } from "@/components/save-shelf"

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
type RosterRow = { id: string; name: string; cls: string; img: string | null }

export default function DmPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<"checking" | "gate" | "table">("checking")
  const [gateArmed, setGateArmed] = useState(true)

  useEffect(() => {
    // NO BOUNCE (Sam, 2026-11-10: "why is it when I hit enter the DM door it just cuts to the intro scene").
    // This page used to send anyone without the title link's tab stamp back to /intro — a new tab, a refresh
    // or Back did it, and after a New Game the title replayed the film. The DM code below is the real lock
    // (only it mints the cookie that can open a table or reset the campaign), so the page just asks for it.
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

/**
 * What the table itself is doing, which the roster alone cannot tell you: an empty roster means something
 * different under each of these. Closed, open-and-waiting, and live look nothing alike here on purpose.
 */
function TableStatusBanner({ table, seatError }: { table: { status: string; session: number } | null; seatError: string | null }) {
  const look =
    table?.status === "live" ? { tone: "border-emerald-700/60 bg-emerald-950/30 text-emerald-300", dot: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]", label: `Session ${table.session} is live`, sub: "The roster is locked. Players at the table are in the game." }
    : table?.status === "lobby" ? { tone: "border-[#8a6a3a]/60 bg-[#201a10] text-[#e8c56a]", dot: "bg-[#c9a868] shadow-[0_0_10px_rgba(201,168,104,0.6)]", label: `The table is open for session ${table.session}`, sub: "Waiting for players to sit down. Nobody is in the game yet." }
    : table ? { tone: "border-stone-700/60 bg-black/50 text-stone-400", dot: "bg-stone-700", label: "The table is dark", sub: "No session is running. Continue the campaign below to open it." }
    : { tone: "border-amber-900/60 bg-[#201a10] text-amber-400", dot: "bg-amber-500", label: "The table could not be read", sub: "This is not the same as an empty table — something went wrong reaching it." }
  return (
    <div className={cn("rounded-sm border px-4 py-3", look.tone)}>
      <div className="flex items-center gap-3">
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", look.dot)} />
        <span className="font-serif text-[15px]">{look.label}</span>
      </div>
      <p className="mt-1 pl-[22px] text-[12px] text-stone-500">{look.sub}</p>
      {seatError && <p role="alert" className="mt-2 pl-[22px] text-[12px] text-amber-400">The seats could not be read, so the roster below may be wrong: {seatError}</p>}
    </div>
  )
}

// THE HOST DOOR (Sam, 2026-11-10: "go PR2" — one host, one screen). Behind the code there is one question now:
// who are you playing tonight? Everything else — the saved games, Open, Start, End, New Game, the heroes at the
// door, inviting players, Rehearsal — lives on the table (/table), which is the one host screen.
function Table({ onLock, router }: { onLock: () => void; router: ReturnType<typeof useRouter> }) {
  const [roster, setRoster] = useState<RosterRow[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [table, setTable] = useState<{ status: string; session: number } | null>(null)
  const [seatError, setSeatError] = useState<string | null>(null)
  const [hostId, setHostId] = useState<string>("")
  const [currentHost, setCurrentHost] = useState<{ id: string; name: string } | null>(null)
  const hostTouched = useRef(false)

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        fetch("/api/seat", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/table", { cache: "no-store", headers: dmHeaders() }).then((r) => r.json()).catch(() => ({})),
      ])
      setRoster(s.roster ?? [])
      setSeatError(typeof s.error === "string" ? s.error : null)
      setTable(t?.state ? { status: String(t.state.status ?? "closed"), session: Number(t.state.session ?? 0) } : null)
      const h = t?.host && typeof t.host.id === "string" ? { id: String(t.host.id), name: String(t.host.name ?? "") } : null
      setCurrentHost(h)
      if (!hostTouched.current && h) setHostId(h.id) // the cards start on whoever hosts now
    } catch { setMsg("Could not read the table.") }
  }, [])
  useEffect(() => { load() }, [load])

  const toTable = async () => {
    setBusy("go"); setMsg(null)
    try {
      try { window.sessionStorage.setItem("aop_intro_seen", "1") } catch { /* storage blocked */ }
      if (!hostId) {
        try { window.localStorage.setItem(ROLE_LS_KEY, "dm") } catch { /* storage blocked */ }
        router.push("/table")
        return
      }
      // Name the host (answers with that hero's claim). This browser becomes the host's own player: the claim
      // in, the DM code out. The table knows them by the claim from here (lib/host.ts).
      const h = await fetch("/api/table", { method: "POST", headers: { "Content-Type": "application/json", ...dmHeaders() }, body: JSON.stringify({ action: "host", hostId }) })
      const hj = await h.json().catch(() => ({}))
      if (!h.ok) { setMsg(hj.error ?? "Could not name the host."); return }
      const claim = hj.hostClaim as { characterId?: string; claimToken?: string } | null | undefined
      if (!claim?.characterId || !claim.claimToken) {
        setMsg("That hero has no door words yet, so this browser cannot sit down as them. You go to the table as the Dungeon Master.")
        try { window.localStorage.setItem(ROLE_LS_KEY, "dm") } catch { /* storage blocked */ }
        router.push("/table")
        return
      }
      try {
        window.localStorage.setItem(ROLE_LS_KEY, "player")
        window.localStorage.setItem(CHARACTER_LS_KEY, claim.characterId)
        window.localStorage.setItem(TOKEN_LS_KEY, claim.claimToken)
      } catch { /* storage blocked */ }
      clearDmKey()
      await fetch("/api/dm/logout", { method: "POST" }).catch(() => {})
      leaveDmDoor()
      router.push("/table")
    } catch { setMsg("Could not reach the table.") } finally { setBusy(null) }
  }

  return (
    <div className="space-y-8">
      <TableStatusBanner table={table} seatError={seatError} />
      {/* WHO ARE YOU PLAYING — the first thing the host does (Sam, 2026-11-10: "When I host a game, shouldn't I
          also choose a character?"). The hero picked hosts: this browser becomes that player and runs the table
          from the table with no code (lib/host.ts). "DM only" keeps the old way: no hero, every DM tool. */}
      <div className="mx-auto w-full max-w-2xl">
        <div className="text-center text-[10px] uppercase tracking-[0.35em] text-[#8a6a3a]">Who are you playing tonight?</div>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {roster.map((c) => {
            const on = hostId === c.id
            return (
              <li key={c.id}>
                <button type="button" disabled={busy !== null} aria-pressed={on}
                  onClick={() => { hostTouched.current = true; setHostId(c.id) }}
                  className={`group relative w-full overflow-hidden rounded-sm border bg-black/60 text-left transition-all disabled:opacity-40 ${on ? "border-[#e8c56a] shadow-[0_0_28px_rgba(232,197,106,0.45)]" : "border-[#3d3428] hover:border-[#8a6a3a]"}`}>
                  {c.img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.img} alt="" className={`aspect-[3/4] w-full object-cover object-top transition-opacity ${on ? "opacity-100" : "opacity-70 group-hover:opacity-90"}`} />
                  ) : (
                    <div className="grid aspect-[3/4] w-full place-items-center font-serif text-4xl text-[#8a6a3a]">{c.name.charAt(0)}</div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent px-2 pb-2 pt-6">
                    <div className="truncate font-serif text-[14px] text-[#e8d9ae]">{c.name}</div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">{c.cls}{currentHost?.id === c.id ? " · hosting now" : ""}</div>
                  </div>
                  {on && <div className="absolute right-1.5 top-1.5 rounded-full border border-[#e8c56a] bg-black/70 px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-[#e8c56a]">Host</div>}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="mt-3 text-center">
          <button type="button" disabled={busy !== null} onClick={() => { hostTouched.current = true; setHostId("") }}
            className={`text-[11px] uppercase tracking-[0.25em] ${hostId === "" ? "text-[#e8c56a]" : "text-stone-600 hover:text-stone-400"}`}>
            {hostId === "" ? "✓ " : ""}Nobody — I run it as Dungeon Master only
          </button>
        </div>
        <p className="mt-2 text-center text-[12px] leading-relaxed text-stone-500">
          {hostId
            ? "This browser sits down as that hero and runs the table from there: open it, let players in, Start, End. No code on game night."
            : "This browser stays signed in as the Dungeon Master, with every DM tool and no hero."}
        </p>
      </div>

      {msg && <p className="text-center text-sm text-[#d9bd7e]">{msg}</p>}

      <div className="flex flex-col items-center gap-3 pt-2">
        <button type="button" disabled={busy !== null} onClick={toTable} className="flex items-center gap-3 rounded-sm border-2 border-[#8a6a3a] bg-gradient-to-b from-[#2a2015]/90 via-black/80 to-[#2a2015]/90 px-12 py-4 font-serif text-xl uppercase tracking-[0.35em] text-[#e8c56a] shadow-[0_0_40px_rgba(201,168,104,0.35)] transition-all hover:border-[#f4e0a8] hover:text-[#fff3cf] hover:shadow-[0_0_80px_rgba(232,197,106,0.6)] disabled:opacity-40">
          <Play className="h-5 w-5" /> {busy === "go" ? "…" : "To the table"}
        </button>
        <p className="max-w-md text-center text-[12px] leading-relaxed text-stone-500">The table is the host screen: the saved games, Open, Start, End, New Game, and the heroes waiting at the door.</p>
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
