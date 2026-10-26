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
// THE ART (approved by Sam, 2026-10-25): a painted candlelit room in public/table/ — the table with the DM
// screen (room.webp), seven cartoon players in their chairs, three women and four men (player-1..7.webp),
// an empty chair, and a cartoon Lich behind the screen. A hero who sits down is drawn as one of the seven,
// chosen from their character id so they keep the same figure every session; no two at one table share one.
// THE START (Sam): when the last light goes green the whole room darkens, a beat of black, then the Act.

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { DoorOpen, LogOut, Play, Square, UserMinus, Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"
import { dmHeaders } from "@/lib/dm-key"
import { assignFigures, type Light, type TableState } from "@/lib/table"
import type { SeatView } from "@/lib/table-store"
import { ENTERED_KEY, mapHref } from "@/lib/map-entry"
import { fadeOutThemeAudio } from "@/components/theme-audio"
import { introMusicOn } from "@/lib/settings"

const CHARACTER_LS_KEY = "aop_character_id"
const TOKEN_LS_KEY = "aop_claim_token"
const ROLE_LS_KEY = "aop_access_role"

const ROOM = "/table/room.webp"
const CHAIR = "/table/chair.webp"
const LICH = "/table/lich.webp"
const PLAYER_ART = [1, 2, 3, 4, 5, 6, 7].map((n) => `/table/player-${n}.webp`)
// The screen in room.webp, as a polygon in percent of the painting: drawn again on top of the Lich so he
// stands BEHIND it.
const SCREEN_CLIP = "polygon(57.2% 32.3%, 59.9% 34.8%, 74.3% 37.4%, 83.5% 35.9%, 83.5% 55.7%, 74.3% 57.5%, 59.9% 54.4%, 57.2% 51.2%)"
const DARK_MS = 2600   // the room goes dark, a beat of black, then the Act
const ROOM_MUSIC = "/audio/camp-embers.mp3"
const ACT_TITLE = { act: "Act I", name: "Awakening into the Nightmare" }
const ACT_CARD_MS = 4200

type View = { state: TableState; dmLight: Light | null; seats: SeatView[]; mine: SeatView | null; isDm?: boolean; refused?: string; note?: string; error?: string }

// The five chairs, by seat number: where the chair's feet stand (percent of the painting) and how tall the
// figure is. The players were drawn facing up and to the right; the right-hand chairs are mirrored so every
// one of them faces the screen. The two side chairs sit further back and fade into the floor.
const SLOTS = [
  { x: 13, y: 86, h: 44, flip: false, side: true },
  { x: 31, y: 101, h: 53, flip: false, side: false },
  { x: 52, y: 103, h: 56, flip: false, side: false },
  { x: 74, y: 101, h: 53, flip: true, side: false },
  { x: 92, y: 86, h: 44, flip: true, side: true },
]


// The waiting figures breathe; the Act title fades in. Local to this page.
const TABLE_KEYFRAMES = `
@keyframes aop-seat-breathe { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-2px) scale(1.015); } }
@keyframes aop-act-in { from { opacity: 0; letter-spacing: 0.3em; } to { opacity: 1; } }
@keyframes aop-figure-sit { 0% { opacity: 0; translate: 0 -6%; } 60% { opacity: 1; translate: 0 1%; } 100% { opacity: 1; translate: 0 0; } }
@keyframes aop-figure-idle { 0%,100% { translate: 0 0; } 50% { translate: 0 -0.8%; } }
@keyframes aop-lich-loom { 0%,100% { translate: 0 0; scale: 1; } 50% { translate: 0 -1.2%; scale: 1.01; } }
@keyframes aop-candles { 0% { opacity: .85 } 17% { opacity: 1 } 33% { opacity: .78 } 48% { opacity: .95 } 66% { opacity: .82 } 81% { opacity: 1 } }
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
      // The DM only where this browser signed in as the DM (the map reads the same flag). A browser left
      // holding an old DM cookie after a player signed in on it is that player, not the DM.
      setRole(j.isDm && (stored === "dm" || !(id && token)) ? "dm" : id && token ? "player" : "none")
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

  // The session began (Sam, 2026-10-25): "The whole table should darken after they start. Then after a
  // second or so the cinematic for the act starts up." Everyone in the room sees the dark first.
  const [dark, setDark] = useState(false)
  useEffect(() => {
    if (!view || view.state.status !== "live" || dark) return
    if (role !== "dm" && !(role === "player" && view.mine)) return
    setDark(true)
    try { music.current?.pause() } catch { /* nothing playing */ }
    window.setTimeout(() => {
      if (role === "dm") {
        setAct(true)
        window.setTimeout(() => {
          try { sessionStorage.setItem(ENTERED_KEY, "1"); sessionStorage.setItem("aop_intro_seen", "1") } catch { /* storage blocked */ }
          router.push(mapHref(false))
        }, ACT_CARD_MS)
      } else {
        // /awaken plays the Act card itself (and, for a hero who has not rolled their fortune, the whole
        // opening), then drops them into the pen — so it is not played twice here.
        router.replace("/awaken")
      }
    }, DARK_MS)
  }, [view, role, dark, router])

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
      <Room view={view} isDm={role === "dm"} busy={busy} dark={dark} onRemove={(id) => send("remove", { characterId: id })} />

      {/* the box under the table: what this browser can do now */}
      <section className="relative z-10 mx-auto mt-6 max-w-xl px-4 pb-16 text-center">
        {msg && <p role="alert" className="mb-3 text-sm text-[#d9bd7e]">{msg}</p>}
        {!view && <p className="text-[11px] uppercase tracking-[0.4em] text-stone-600">Lighting the candles…</p>}
        {view && role === "dm" && <DmControls view={view} busy={busy} send={send} onRehearse={() => router.push(mapHref(true))} />}
        {view && role === "player" && <PlayerBox view={view} busy={busy} send={send} />}
        {view && role === "player" && view.state.status === "lobby" && view.mine && <FigurePicker view={view} busy={busy} send={send} />}
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

function Room({ view, isDm, busy, dark, onRemove }: { view: View | null; isDm: boolean; busy: boolean; dark: boolean; onRemove: (id: string) => void }) {
  const seats = view?.seats ?? []
  const bySeat = new Map(seats.map((s, i) => [s.seat ?? i + 1, s]))
  const figures = assignFigures(seats)
  const closed = (view?.state.status ?? "closed") === "closed"
  const light = view?.dmLight ?? null
  return (
    <section className="relative z-10 mx-auto mt-3 w-full max-w-6xl px-4">
      <div className="relative w-full overflow-hidden rounded-[4px] border border-[#3d3020] shadow-[0_30px_80px_rgba(0,0,0,0.7)]" style={{ aspectRatio: "1920 / 1072" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ROOM} alt="A candlelit round table with the Dungeon Master's screen" className="absolute inset-0 h-full w-full object-cover" />
        {/* the Lich, behind his screen */}
        <div className="absolute left-[56%] top-[3%] w-[25.6%] origin-bottom animate-[aop-lich-loom_5s_ease-in-out_infinite]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LICH} alt="Malachar the Lich" className="w-full [filter:drop-shadow(0_0_20px_rgba(140,60,200,0.35))]" />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ROOM} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ clipPath: SCREEN_CLIP }} />
        {/* candle flicker and the DM's light on the screen */}
        <div aria-hidden className="pointer-events-none absolute inset-0 mix-blend-screen animate-[aop-candles_2.3s_steps(1)_infinite]"
          style={{ background: "radial-gradient(4% 7% at 48.4% 35%,rgba(255,190,90,.35),transparent 70%),radial-gradient(4% 7% at 51.6% 31%,rgba(255,190,90,.35),transparent 70%),radial-gradient(4% 7% at 88.4% 40%,rgba(255,190,90,.3),transparent 70%),radial-gradient(4% 7% at 93% 39%,rgba(255,190,90,.3),transparent 70%),radial-gradient(22% 10% at 55% 7%,rgba(255,180,80,.22),transparent 70%)" }} />
        <span className={cn("absolute left-[67.1%] top-[46%] aspect-square w-[1.5%] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-500", light ? LIGHT_CLASS[light] : "bg-stone-800")}
          aria-label={light ? `Dungeon Master: ${light}` : "The Dungeon Master is not here"} />
        {/* five chairs */}
        {SLOTS.map((slot, i) => {
          const s = bySeat.get(i + 1) ?? null
          const art = s ? PLAYER_ART[figures.get(s.id) ?? 0] : CHAIR
          const fade = slot.side ? { WebkitMaskImage: "linear-gradient(to bottom,#000 80%,transparent 100%)", maskImage: "linear-gradient(to bottom,#000 80%,transparent 100%)" } : undefined
          return (
            <div key={i} className="absolute flex -translate-x-1/2 -translate-y-full justify-center" style={{ left: `${slot.x}%`, top: `${slot.y}%`, height: `${slot.h}%`, width: `${slot.h * 0.9}%`, zIndex: Math.round(slot.y) }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={s?.id ?? "empty"} src={art} alt={s ? `${s.name}'s player` : "An empty chair"}
                className={cn("absolute bottom-0 h-full w-auto max-w-none", s ? "animate-[aop-figure-sit_.7s_cubic-bezier(.3,1.5,.6,1)_both,aop-figure-idle_3.6s_ease-in-out_.8s_infinite]" : "")}
                style={{ transform: slot.flip ? "scaleX(-1)" : undefined, ...fade }} />
            </div>
          )
        })}
        {/* name tags with the lights, above everyone */}
        {SLOTS.map((slot, i) => {
          const s = bySeat.get(i + 1)
          if (!s) return null
          return (
            <div key={`t${i}`} className="absolute z-[120] flex -translate-x-1/2 flex-col items-center gap-0.5" style={{ left: `${slot.x}%`, top: `${Math.min(slot.y - slot.h - 6, 90)}%` }}>
              <div className="flex items-center gap-1.5 rounded-sm border border-[#5a4528] bg-black/80 px-2 py-0.5">
                <span className={cn("h-2.5 w-2.5 rounded-full", LIGHT_CLASS[s.light])} aria-label={`${s.light} light`} />
                <span className="whitespace-nowrap font-serif text-[clamp(10px,1.15vw,14px)] tracking-[0.06em] text-[#e8d9ae]">{s.name}</span>
                {s.id === view?.mine?.id && <span className="text-[9px] uppercase tracking-[0.2em] text-[#e8c56a]">you</span>}
              </div>
              {s.light === "red" && <span className="whitespace-nowrap rounded-sm bg-black/80 px-1.5 text-[clamp(9px,.95vw,12px)] text-red-300">needs: {s.missing.join(", ")}</span>}
              {s.dm && <span className="rounded-sm bg-black/80 px-1.5 text-[10px] uppercase tracking-[0.18em] text-stone-400">DM&apos;s companion</span>}
              {isDm && (
                <button type="button" disabled={busy} onClick={() => onRemove(s.id)} className="flex items-center gap-1 rounded-sm bg-black/70 px-1.5 text-[10px] uppercase tracking-[0.2em] text-stone-400 hover:text-red-300 disabled:opacity-40">
                  <UserMinus className="h-3 w-3" /> remove
                </button>
              )}
            </div>
          )
        })}
        {/* the room before the DM opens it, and the dark when the session begins */}
        <div aria-hidden className={cn("pointer-events-none absolute inset-0 z-[110] transition-colors duration-1000", closed ? "bg-black/60" : "bg-[radial-gradient(ellipse_at_55%_50%,transparent_40%,rgba(5,3,2,.5)_100%)]")} />
        <div aria-hidden className={cn("pointer-events-none absolute inset-0 z-[200] bg-black transition-opacity duration-[1600ms] ease-in", dark ? "opacity-100" : "opacity-0")} />
      </div>
    </section>
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

// Who you sit as (Sam, 2026-10-25). The seven players; the one you are now is ringed in gold, ones taken by
// someone else at this table are dimmed.
function FigurePicker({ view, busy, send }: { view: View; busy: boolean; send: (a: string, e?: Record<string, unknown>) => Promise<View | null> }) {
  const figures = assignFigures(view.seats)
  const mineId = view.mine?.id ?? ""
  const current = figures.get(mineId)
  const taken = new Set([...figures.entries()].filter(([id]) => id !== mineId).map(([, f]) => f))
  return (
    <div className="mt-6 text-left">
      <div className="mb-2 text-center text-[10px] uppercase tracking-[0.35em] text-[#8a6a3a]">Choose who you sit as</div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {PLAYER_ART.map((src, i) => {
          const isMine = current === i, isTaken = taken.has(i)
          return (
            <button key={src} type="button" disabled={busy || isTaken || isMine} onClick={() => send("figure", { figure: i })}
              aria-pressed={isMine} aria-label={isTaken ? `Player ${i + 1}, taken` : `Sit as player ${i + 1}`}
              className={cn("relative flex aspect-[4/5] items-end justify-center overflow-hidden rounded-sm border bg-[radial-gradient(ellipse_at_50%_75%,#2a1c10,#120d08)] p-1 transition",
                isMine ? "border-[#e8c56a] shadow-[0_0_14px_rgba(232,197,106,0.45)]" : "border-[#3d3428] hover:border-[#8a6a3a]", isTaken && "opacity-30")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-auto object-contain object-bottom" />
            </button>
          )
        })}
      </div>
    </div>
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
