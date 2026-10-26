"use client"

// /table — THE STAGING TABLE. Nobody enters the game without sitting here first.
//
// Sam, 2026-10-25: "When entering the game there should be a queue staging box. You can not enter the
// game until the DM has entered and started the game." The room is a round table with five seats and
// the Lich behind his DM screen at its head, his dice beside it. A player who comes through the door
// sits down; their light says what they still lack (red), that they are set but not Ready (yellow), or
// Ready (green). The DM's light is yellow while he is in but has not started, green once he presses
// Start. When the DM and every seat are green the session begins: the Act card, then the map.
//
// The rules are lib/table.ts; the state is /api/table. This page only shows it and sends the buttons.
//
// ART STILL TO COME (lane 3, each piece to Sam for approval first): the painted table, and the seven
// cartoon figures (three women, four men) who sit down with dice and a character sheet. Until those are
// approved a seat shows the hero's own portrait (or idle loop). The Lich is already the real thing: his
// canon idle loop from storage.

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { DoorOpen, LogOut, Play, Square, UserMinus, Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"
import { dmHeaders } from "@/lib/dm-key"
import { MAX_SEATS, type Light, type TableState } from "@/lib/table"
import type { SeatView } from "@/lib/table-store"
import { ENTERED_KEY, mapHref } from "@/lib/map-entry"
import { fadeOutThemeAudio } from "@/components/theme-audio"
import { introMusicOn } from "@/lib/settings"

const CHARACTER_LS_KEY = "aop_character_id"
const TOKEN_LS_KEY = "aop_claim_token"
const ROLE_LS_KEY = "aop_access_role"

const LICH_IDLE = "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/character-loops/lich_king_idle.webm"
const ROOM_MUSIC = "/audio/camp-embers.mp3"
const ACT_TITLE = { act: "Act I", name: "Awakening into the Nightmare" }
const ACT_CARD_MS = 4200

type View = { state: TableState; dmLight: Light | null; seats: SeatView[]; mine: SeatView | null; isDm?: boolean; refused?: string; note?: string; error?: string }

// Five chairs around the lower rim of the table; the Lich holds the head. Angles in degrees, 0 = right, 90 = down.
const CHAIR_ANGLES = [168, 128, 90, 52, 12]

// The waiting figures breathe; the Act title fades in. Local to this page.
const TABLE_KEYFRAMES = `
@keyframes aop-seat-breathe { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-2px) scale(1.015); } }
@keyframes aop-act-in { from { opacity: 0; letter-spacing: 0.3em; } to { opacity: 1; } }
`

const LIGHT_CLASS: Record<Light, string> = {
  red: "bg-red-500 shadow-[0_0_14px_4px_rgba(239,68,68,0.65)]",
  yellow: "bg-amber-300 shadow-[0_0_14px_4px_rgba(252,211,77,0.6)]",
  green: "bg-emerald-400 shadow-[0_0_16px_5px_rgba(52,211,153,0.7)]",
}

export default function TablePage() {
  const router = useRouter()
  const [view, setView] = useState<View | null>(null)
  const [me, setMe] = useState<{ id: string; token: string } | null>(null)
  const [role, setRole] = useState<"dm" | "player" | "none" | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [act, setAct] = useState(false)
  const sat = useRef(false)
  const leaving = useRef(false)

  // Who is this browser?
  useEffect(() => {
    let id = "", token = "", stored = ""
    try { id = localStorage.getItem(CHARACTER_LS_KEY) ?? ""; token = localStorage.getItem(TOKEN_LS_KEY) ?? ""; stored = localStorage.getItem(ROLE_LS_KEY) ?? "" } catch { /* storage blocked */ }
    if (id && token && stored !== "dm") setMe({ id, token })
    fetch("/api/table", { cache: "no-store", headers: dmHeaders() }).then((r) => r.json()).then((j: View) => {
      setRole(j.isDm ? "dm" : id && token ? "player" : "none")
    }).catch(() => setRole(id && token ? "player" : "none"))
  }, [])

  const load = useCallback(async () => {
    const q = me ? `?characterId=${encodeURIComponent(me.id)}` : ""
    try { setView(await fetch(`/api/table${q}`, { cache: "no-store", headers: dmHeaders() }).then((r) => r.json())) } catch { /* next tick */ }
  }, [me])
  useEffect(() => { if (!role) return; load(); const t = window.setInterval(load, 2000); return () => window.clearInterval(t) }, [load, role])

  const send = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true); setMsg(null)
    try {
      const body = role === "player" && me ? { action, characterId: me.id, claimToken: me.token, ...extra } : { action, ...extra }
      const r = await fetch("/api/table", { method: "POST", headers: { "Content-Type": "application/json", ...dmHeaders() }, body: JSON.stringify(body) })
      const j: View = await r.json()
      if (!r.ok) { setMsg(j.error ?? "That did not work."); return null }
      if (j.refused) setMsg(j.refused)
      setView(j)
      return j
    } catch { setMsg("Could not reach the table."); return null } finally { setBusy(false) }
  }, [me, role])

  // A player takes their seat as soon as the DM has the table open.
  useEffect(() => {
    if (role !== "player" || !view || sat.current || leaving.current) return
    if (view.state.status === "lobby" && !view.mine) { sat.current = true; send("sit") }
  }, [role, view, send])

  // The session began: the Act card, then into the game.
  useEffect(() => {
    if (!view || view.state.status !== "live" || act) return
    if (role === "dm") {
      setAct(true)
      window.setTimeout(() => {
        try { sessionStorage.setItem(ENTERED_KEY, "1"); sessionStorage.setItem("aop_intro_seen", "1") } catch { /* storage blocked */ }
        router.push(mapHref(false))
      }, ACT_CARD_MS)
    } else if (role === "player" && view.mine) {
      // /awaken plays the Act card itself (and, for a hero who has not rolled their fortune, the whole
      // opening), then drops them into the pen — so it is not played twice here.
      setAct(true)
      router.replace("/awaken")
    }
  }, [view, role, act, router])

  // Room music: calm, looped, only on the real site and only if intro music is on (Sam's test-copy rule).
  const music = useRef<HTMLAudioElement | null>(null)
  const [musicOn, setMusicOn] = useState(false)
  useEffect(() => {
    fadeOutThemeAudio()
    const real = typeof window !== "undefined" && window.location.hostname.endsWith("playacartagena.com")
    if (!real || !introMusicOn()) return
    const a = new Audio(ROOM_MUSIC); a.loop = true; a.volume = 0.35; music.current = a
    const go = () => a.play().then(() => setMusicOn(true)).catch(() => {})
    go()
    window.addEventListener("pointerdown", go, { once: true })
    return () => { a.pause(); window.removeEventListener("pointerdown", go) }
  }, [])
  const toggleMusic = () => { const a = music.current; if (!a) return; if (a.paused) { a.play().then(() => setMusicOn(true)).catch(() => {}) } else { a.pause(); setMusicOn(false) } }

  const leave = async () => {
    leaving.current = true
    if (view?.mine) await send("leave")
    router.push("/intro")
  }

  if (act) return <ActCard />

  const status = view?.state.status ?? "closed"
  const seats = view?.seats ?? []
  const bySeat = new Map(seats.map((s, i) => [s.seat ?? i + 1, s]))

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#070605] text-stone-200">
      <style>{TABLE_KEYFRAMES}</style>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,rgba(201,140,60,0.18)_0%,rgba(0,0,0,0.85)_55%,#050403_100%)]" />

      {/* header */}
      <header className="relative z-10 flex items-center justify-between px-5 pt-5">
        <div>
          <div className="text-[10px] uppercase tracking-[0.5em] text-[#8a6a3a]">Ashes of Prometheus</div>
          <h1 className="mt-1 font-serif text-2xl tracking-[0.14em] text-[#e8c56a]">The Table</h1>
        </div>
        <div className="flex items-center gap-2">
          {music.current && (
            <button type="button" onClick={toggleMusic} className="rounded-sm border border-[#3d3428] p-2 text-stone-400 hover:text-[#e8c56a]" aria-label={musicOn ? "Music off" : "Music on"}>
              {musicOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          )}
          {role === "player" && (
            <button type="button" onClick={leave} disabled={busy || status === "live"} className="flex items-center gap-1.5 rounded-sm border border-[#5a2a2a]/70 px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-red-300/80 hover:border-red-500/70 hover:text-red-200 disabled:opacity-40">
              <LogOut className="h-3.5 w-3.5" /> Leave the table
            </button>
          )}
        </div>
      </header>

      {/* the room */}
      <section className="relative z-10 mx-auto mt-2 aspect-[16/10.5] w-full max-w-5xl px-4">
        {/* the table */}
        <div className="absolute left-1/2 top-[50%] h-[50%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-[10px] border-[#3b2513] bg-[radial-gradient(ellipse_at_50%_40%,#6b4524_0%,#4a2e17_55%,#2c1a0c_100%)] shadow-[0_30px_80px_rgba(0,0,0,0.85),inset_0_0_60px_rgba(0,0,0,0.6)]">
          <div className="absolute inset-[7%] rounded-[50%] border border-[#8a6a3a]/25" />
          <Dice />
        </div>

        {/* the Lich behind his screen, at the head of the table */}
        <div className="absolute left-1/2 top-[0%] w-[42%] -translate-x-1/2">
          <video src={LICH_IDLE} autoPlay loop muted playsInline className="mx-auto w-full [filter:drop-shadow(0_0_24px_rgba(120,200,255,0.25))]" />
          <DmScreen light={view?.dmLight ?? null} />
        </div>

        {/* five chairs */}
        {Array.from({ length: MAX_SEATS }, (_, i) => {
          const a = (CHAIR_ANGLES[i] * Math.PI) / 180
          const left = 50 + Math.cos(a) * 44
          const top = 50 + Math.sin(a) * 34
          const s = bySeat.get(i + 1)
          return (
            <div key={i} className="absolute w-[15%] -translate-x-1/2 -translate-y-1/2" style={{ left: `${left}%`, top: `${top}%` }}>
              <Chair seat={s ?? null} isMe={!!s && s.id === view?.mine?.id} isDm={role === "dm"} busy={busy}
                onRemove={() => s && send("remove", { characterId: s.id })} />
            </div>
          )
        })}
      </section>

      {/* the box under the table: what this browser can do now */}
      <section className="relative z-10 mx-auto mt-10 max-w-xl px-4 pb-16 text-center">
        {msg && <p role="alert" className="mb-3 text-sm text-[#d9bd7e]">{msg}</p>}
        {!view && <p className="text-[11px] uppercase tracking-[0.4em] text-stone-600">Lighting the candles…</p>}
        {view && role === "dm" && <DmControls view={view} busy={busy} send={send} onRehearse={() => router.push(mapHref(true))} />}
        {view && role === "player" && <PlayerBox view={view} busy={busy} send={send} />}
        {view && role === "none" && (
          <div className="rounded-sm border border-[#3d3428] bg-black/60 p-4 text-sm text-stone-400">
            Come in through the door first. <a href="/join" className="text-[#e8c56a] underline-offset-4 hover:underline">Your words, please →</a>
          </div>
        )}
      </section>
    </main>
  )
}

// ---------------------------------------------------------------------------------------------

function Chair({ seat, isMe, isDm, busy, onRemove }: { seat: SeatView | null; isMe: boolean; isDm: boolean; busy: boolean; onRemove: () => void }) {
  if (!seat) {
    return (
      <div className="flex flex-col items-center opacity-60">
        <div className="aspect-square w-full rounded-full border-2 border-dashed border-[#3d3428] bg-black/40" />
        <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-stone-600">empty chair</div>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center">
      <div className={cn("relative aspect-square w-full overflow-hidden rounded-full border-2 bg-black/70 animate-[aop-seat-breathe_4s_ease-in-out_infinite]", isMe ? "border-[#e8c56a]" : "border-[#7a5f33]")}>
        {seat.loop ? (
          <video src={seat.loop} autoPlay loop muted playsInline className="h-full w-full object-cover [object-position:center_15%]" />
        ) : seat.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={seat.thumbnail} alt="" className="h-full w-full object-cover [object-position:center_15%]" />
        ) : (
          <div className="grid h-full w-full place-items-center font-serif text-3xl text-[#8a6a3a]">{seat.name.charAt(0)}</div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className={cn("h-3 w-3 rounded-full", LIGHT_CLASS[seat.light])} aria-label={`${seat.light} light`} />
        <span className="max-w-[9rem] truncate font-serif text-[14px] text-[#e8d9ae]">{seat.name}</span>
      </div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-stone-500">{seat.dm ? "DM's companion" : seat.cls ?? ""}</div>
      {seat.light === "red" && <div className="mt-1 text-center text-[10px] leading-tight text-red-300/80">needs: {seat.missing.join(", ")}</div>}
      {isDm && (
        <button type="button" disabled={busy} onClick={onRemove} className="mt-1 flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-stone-600 hover:text-red-300 disabled:opacity-40">
          <UserMinus className="h-3 w-3" /> remove
        </button>
      )}
    </div>
  )
}

function DmScreen({ light }: { light: Light | null }) {
  return (
    <div className="relative -mt-[16%] mx-auto flex w-[82%] items-end justify-center gap-1">
      {[0, 1, 2].map((p) => (
        <div key={p} className={cn("h-16 flex-1 border-2 border-[#8a6a3a] bg-gradient-to-b from-[#3a1d14] to-[#1b0c08] shadow-[0_8px_24px_rgba(0,0,0,0.8)] sm:h-24", p === 1 ? "z-10" : p === 0 ? "origin-right [transform:perspective(400px)_rotateY(18deg)]" : "origin-left [transform:perspective(400px)_rotateY(-18deg)]")}>
          {p === 1 && (
            <div className="flex h-full flex-col items-center justify-center gap-1">
              <span className="font-serif text-lg text-[#c9a868] sm:text-2xl">☠</span>
              <span className={cn("h-3 w-3 rounded-full", light ? LIGHT_CLASS[light] : "bg-stone-800")} aria-label={light ? `DM ${light}` : "DM not here"} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function Dice() {
  // A few dice lying beside the screen. Drawn, not photographed — the painted table replaces this (lane 3).
  const d = [
    { l: "71%", t: "16%", r: 12, c: "#8b1e1e" },
    { l: "76%", t: "27%", r: -20, c: "#1e3f8b" },
    { l: "23%", t: "20%", r: 30, c: "#1f6b3a" },
  ]
  return (
    <>
      {d.map((x, i) => (
        <svg key={i} viewBox="0 0 40 40" className="absolute h-[9%] w-[6%]" style={{ left: x.l, top: x.t, transform: `rotate(${x.r}deg)` }} aria-hidden>
          <polygon points="20,2 37,12 37,28 20,38 3,28 3,12" fill={x.c} stroke="#e8c56a" strokeWidth="1.5" />
          <polygon points="20,2 30,22 10,22" fill="none" stroke="#e8c56a" strokeWidth="1" opacity="0.7" />
          <text x="20" y="20" textAnchor="middle" fontSize="9" fill="#f4e0a8" fontFamily="serif">20</text>
        </svg>
      ))}
    </>
  )
}

function DmControls({ view, busy, send, onRehearse }: { view: View; busy: boolean; send: (a: string, e?: Record<string, unknown>) => Promise<View | null>; onRehearse: () => void }) {
  const s = view.state
  const waiting = view.seats.filter((x) => x.light !== "green")
  if (s.status === "closed") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-stone-400">The table is dark. Open it and the players can take their seats.</p>
        <button type="button" disabled={busy} onClick={() => send("open")} className="flex w-full items-center justify-center gap-3 rounded-sm border-2 border-[#8a6a3a] bg-gradient-to-b from-[#2a2015] to-[#120e0a] py-4 font-serif text-lg uppercase tracking-[0.3em] text-[#e8c56a] shadow-[0_0_40px_rgba(201,168,104,0.3)] hover:border-[#f4e0a8] disabled:opacity-40">
          <DoorOpen className="h-5 w-5" /> Open the table
        </button>
        <button type="button" onClick={onRehearse} className="text-[11px] uppercase tracking-[0.3em] text-stone-600 hover:text-stone-400">Rehearsal — sandbox, nothing saves</button>
      </div>
    )
  }
  if (s.status === "live") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-emerald-300/80">Session {s.session} is live. The roster is locked.</p>
        <EndButton busy={busy} send={send} />
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-400">
        Session {s.session}. {view.seats.length === 0 ? "Nobody has sat down yet." : waiting.length ? `Waiting on ${waiting.map((w) => w.name).join(", ")}.` : "Every seat is green."}
        {" "}{s.dmReady ? "You are green — the game starts the moment every seat is." : "Press Start when you are ready; the game begins when every seat is green too."}
      </p>
      {s.dmReady ? (
        <button type="button" disabled={busy} onClick={() => send("unstart")} className="flex w-full items-center justify-center gap-2 rounded-sm border border-[#3d3428] py-3 text-[12px] uppercase tracking-[0.3em] text-stone-400 hover:text-stone-200 disabled:opacity-40">
          <Square className="h-4 w-4" /> Not yet
        </button>
      ) : (
        <button type="button" disabled={busy} onClick={() => send("start")} className="flex w-full items-center justify-center gap-3 rounded-sm border-2 border-emerald-500/70 bg-gradient-to-b from-[#1d3527] to-[#122018] py-4 font-serif text-lg uppercase tracking-[0.3em] text-emerald-100 shadow-[0_0_40px_rgba(52,211,153,0.25)] hover:border-emerald-300 disabled:opacity-40">
          <Play className="h-5 w-5" /> Start
        </button>
      )}
      <EndButton busy={busy} send={send} label="Close the table" />
    </div>
  )
}

function EndButton({ busy, send, label = "End the session" }: { busy: boolean; send: (a: string) => Promise<View | null>; label?: string }) {
  return (
    <button type="button" disabled={busy} onClick={() => { if (window.confirm(`${label}? Everyone is sent back to the door; the world stays exactly as it is for next time.`)) send("end") }} className="text-[11px] uppercase tracking-[0.3em] text-stone-600 hover:text-red-300 disabled:opacity-40">
      {label}
    </button>
  )
}

function PlayerBox({ view, busy, send }: { view: View; busy: boolean; send: (a: string) => Promise<View | null> }) {
  const s = view.state
  const mine = view.mine
  if (s.status === "closed") {
    return (
      <div className="rounded-sm border border-[#3d3428] bg-black/60 p-5">
        <div className="font-serif text-lg text-[#e8d9ae]">The table is not set yet.</div>
        <p className="mt-1 text-sm text-stone-500">Wait here for the Dungeon Master. Your chair is saved the moment he opens it.</p>
        <div className="mx-auto mt-4 h-1 w-24 animate-pulse rounded-full bg-[#8a6a3a]/60" />
      </div>
    )
  }
  if (s.status === "live" && !mine) {
    return (
      <div className="rounded-sm border border-[#3d3428] bg-black/60 p-5">
        <div className="font-serif text-lg text-[#e8d9ae]">This session has already begun.</div>
        <p className="mt-1 text-sm text-stone-500">The roster is locked until the Dungeon Master opens the next one.</p>
      </div>
    )
  }
  if (!mine) return <p className="text-sm text-stone-500">{view.refused ?? "Finding your chair…"}</p>
  if (mine.light === "red") {
    return (
      <div className="rounded-sm border border-red-900/60 bg-black/60 p-5 text-left">
        <div className="font-serif text-lg text-red-200">Not ready yet</div>
        <p className="mt-1 text-sm text-stone-400">{mine.name} still needs: <span className="text-red-300">{mine.missing.join(", ")}</span>.</p>
        <p className="mt-2 text-[12px] text-stone-500">Ask the Dungeon Master to finish what is missing. If it cannot be sorted tonight, the DM can excuse you or you can leave the table.</p>
      </div>
    )
  }
  return mine.ready ? (
    <button type="button" disabled={busy} onClick={() => send("unready")} className="w-full rounded-sm border border-emerald-600/60 bg-black/60 py-3 text-[12px] uppercase tracking-[0.3em] text-emerald-300 hover:text-emerald-100 disabled:opacity-40">
      Ready — waiting for the table (tap to undo)
    </button>
  ) : (
    <button type="button" disabled={busy} onClick={() => send("ready")} className="w-full rounded-sm border-2 border-amber-400/70 bg-gradient-to-b from-[#2a2015] to-[#120e0a] py-4 font-serif text-lg uppercase tracking-[0.3em] text-amber-200 shadow-[0_0_40px_rgba(252,211,77,0.2)] hover:border-amber-200 disabled:opacity-40">
      I&apos;m ready
    </button>
  )
}

function ActCard() {
  return (
    <main className="grid min-h-dvh place-items-center bg-black">
      <style>{TABLE_KEYFRAMES}</style>
      <div className="text-center animate-[aop-act-in_1.2s_ease-out]">
        <div className="text-[12px] uppercase tracking-[0.6em] text-[#8a6a3a]">{ACT_TITLE.act}</div>
        <div className="mt-4 font-serif text-3xl tracking-[0.12em] text-[#e8c56a] sm:text-5xl">{ACT_TITLE.name}</div>
      </div>
    </main>
  )
}
