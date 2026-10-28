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
// THE SCREEN AND THE CANDLES (Sam, 2026-10-28): the three leaves of the DM screen wear the title poster's art
// (SCREEN_LEAVES), every candle flame flickers on its own clock (FLAMES), and Camp Embers plays under it all.

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { DoorOpen, LogOut, Play, RotateCcw, Square, UserMinus, UserPlus, Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"
import { dmHeaders } from "@/lib/dm-key"
import { assignFigures, type Light, type TableState } from "@/lib/table"
import type { SeatView } from "@/lib/table-store"
import { ENTERED_KEY, mapHref } from "@/lib/map-entry"
import { fadeOutThemeAudio } from "@/components/theme-audio"
import { readSettings } from "@/lib/settings"

const CHARACTER_LS_KEY = "aop_character_id"
const TOKEN_LS_KEY = "aop_claim_token"
const ROLE_LS_KEY = "aop_access_role"

const ROOM = "/table/room.webp"
const CHAIR = "/table/chair.webp"
const LICH = "/table/lich.webp"
const LICH_LOOP = "/table/lich.webm"
const PLAYER_ART = [1, 2, 3, 4, 5, 6, 7].map((n) => `/table/player-${n}.webp`)
// Each player's idle loop (and the Lich's): see-through VP9 video, 5 s, first frame = the still, so the swap
// from still to motion is invisible. Safari cannot play see-through WebM, so it keeps the stills.
const PLAYER_LOOP = [1, 2, 3, 4, 5, 6, 7].map((n) => `/table/player-${n}.webm`)

/** True where a see-through WebM plays (Chrome, Edge, Firefox, Android); false on Safari and iOS. */
function useAlphaVideo(): boolean {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    const ua = navigator.userAgent
    const safari = /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(ua) || /iP(hone|ad|od)/.test(ua)
    setOk(!safari && typeof document !== "undefined" && document.createElement("video").canPlayType('video/webm; codecs="vp9"') !== "")
  }, [])
  return ok
}

/** A still, or its idle loop where the browser can play it. */
function Art({ still, loop, video, alt, className, style }: { still: string; loop: string | null; video: boolean; alt: string; className?: string; style?: React.CSSProperties }) {
  if (video && loop) return <video src={loop} poster={still} autoPlay loop muted playsInline aria-label={alt} className={className} style={style} />
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={still} alt={alt} className={className} style={style} />
}
// The screen in room.webp, as a polygon in percent of the painting: drawn again on top of the Lich so he
// stands BEHIND it.
const SCREEN_CLIP = "polygon(57.2% 32.3%, 59.9% 34.8%, 74.3% 37.4%, 83.5% 35.9%, 83.5% 55.7%, 74.3% 57.5%, 59.9% 54.4%, 57.2% 51.2%)"

// THE SCREEN'S ART (Sam, 2026-10-28: "have some DND art on the screen the lich is using"). A real DM screen wears
// art on the players' side, so the three leather leaves carry the campaign's own key art — the title poster
// (public/images/intro-poster.webp, Sam's approved art) cut into three slices in public/table/: the elf on the
// narrow left leaf, the Lich in the middle, the two men on the right. No new art. Each leaf is the quadrilateral
// it paints in percent of the room (x0..x1 across; tl/tr/br/bl the four corners' heights); the art is skewed to
// follow the leaf's slope and clipped to an octagon inside it, so the painted frame and the brass corners stay on
// top. `pos` is object-position: which part of a slice shows where the leaf is a different shape from it.
const SCREEN_LEAVES = [
  { art: "/table/screen-left.webp", x0: 57.2, x1: 59.9, tl: 32.3, tr: 34.8, br: 54.4, bl: 51.2, chamfer: [0.7, 2.0], pos: "50% 50%" },
  { art: "/table/screen-mid.webp", x0: 59.9, x1: 74.3, tl: 34.8, tr: 37.4, br: 57.5, bl: 54.4, chamfer: [1.6, 2.9], pos: "50% 50%" },
  { art: "/table/screen-right.webp", x0: 74.3, x1: 83.5, tl: 37.4, tr: 35.9, br: 55.7, bl: 57.5, chamfer: [1.6, 2.9], pos: "50% 50%" },
]
type Leaf = (typeof SCREEN_LEAVES)[number]
const ROOM_W = 1920, ROOM_H = 1072   // the room box's aspect (the painting is 2752x1536, the same shape)
const LEAF_FRAME = [0.35, 0.65]      // the painted frame round each leaf, percent of the room (across, down)
const LEAF_PAD = 1.5                 // the art box overhangs the leaf a little; the clip trims it

/** The octagon inside a leaf: the quadrilateral inset by the frame, each corner cut off for the brass. */
function leafClip(l: Leaf): string {
  const [fx, fy] = LEAF_FRAME, [cx, cy] = l.chamfer
  const x0 = l.x0 + fx, x1 = l.x1 - fx
  const top = (x: number) => l.tl + ((l.tr - l.tl) * (x - l.x0)) / (l.x1 - l.x0) + fy
  const bottom = (x: number) => l.bl + ((l.br - l.bl) * (x - l.x0)) / (l.x1 - l.x0) - fy
  const pts = [
    [x0 + cx, top(x0 + cx)], [x1 - cx, top(x1 - cx)],
    [x1, top(x1) + cy], [x1, bottom(x1) - cy],
    [x1 - cx, bottom(x1 - cx)], [x0 + cx, bottom(x0 + cx)],
    [x0, bottom(x0) - cy], [x0, top(x0) + cy],
  ]
  return `polygon(${pts.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(", ")})`
}
/** How far the leaf's top edge tilts, in degrees, so the art leans with it. */
function leafSkew(l: Leaf): number {
  return (Math.atan(((l.tr - l.tl) * ROOM_H) / ((l.x1 - l.x0) * ROOM_W)) * 180) / Math.PI
}

// THE CANDLES (Sam, 2026-10-28: "Candle lights should flicker"). Nine flames in the painting: two on the table at
// the left, two at the right, five on the chandelier. Each gets a small living flame drawn over the painted one
// (screen blend, so it only ever adds light) and a halo of candlelight on whatever is near it, and the whole room
// breathes with them. Every flame runs on its own clock from its own start, so no two flicker together. x, y: the
// middle of the painted flame; h: its height — all percent of the room.
const FLAMES = [
  { x: 48.6, y: 33.0, h: 3.6, dur: 1.9, delay: -0.3 },
  { x: 51.8, y: 27.3, h: 4.6, dur: 2.3, delay: -1.1 },
  { x: 88.5, y: 38.4, h: 3.8, dur: 2.1, delay: -0.7 },
  { x: 93.2, y: 37.5, h: 4.0, dur: 1.7, delay: -1.5 },
  { x: 43.5, y: 3.3, h: 4.4, dur: 2.0, delay: -0.2 },
  { x: 49.3, y: 5.2, h: 2.6, dur: 1.6, delay: -0.9 },
  { x: 50.7, y: 2.6, h: 5.0, dur: 2.2, delay: -1.3 },
  { x: 58.2, y: 5.0, h: 2.6, dur: 1.8, delay: -0.5 },
  { x: 61.3, y: 3.0, h: 4.8, dur: 2.4, delay: -1.7 },
]
const FLAME_W = 0.42 * (ROOM_H / ROOM_W)   // a flame is about 0.42 of its height wide; widths are percent of the room's width
const DARK_MS = 2600   // the room goes dark, a beat of black, then the Act
// Room music (Sam, 2026-10-28: "have some background music playing while at the table"): Camp Embers, the lute
// over cello he approved for the camp, looped. It plays unless refused HERE (the speaker button, remembered under
// TABLE_MUSIC_KEY) or the Settings sheet's intro-score switch is off. The dashboard's older global mute
// (aop_music_off, lib/audio-prefs.ts) no longer silences the table — Sam's browser carried it from the dashboard,
// so the table sat silent with no button to turn it on.
const ROOM_MUSIC = "/audio/camp-embers.mp3"
const ROOM_MUSIC_VOLUME = 0.45   // the file is levelled to -27 LUFS like the rest of the library
const TABLE_MUSIC_KEY = "aop_table_music"   // "off" only when the speaker button was pressed at the table
const ACT_TITLE = { act: "Act I", name: "Awakening into the Nightmare" }
const ACT_CARD_MS = 4200

type RosterEntry = { id: string; name: string; cls: string; invited: boolean; seated: boolean; companion: boolean; away: boolean }
type View = { state: TableState; dmLight: Light | null; seats: SeatView[]; mine: SeatView | null; isDm?: boolean; invited?: boolean; roster?: RosterEntry[]; refused?: string; note?: string; error?: string }

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
@keyframes aop-flame { 0% { transform: scale(1,1) skewX(0deg); opacity: .9 } 23% { transform: scale(.9,1.1) skewX(-5deg); opacity: 1 } 41% { transform: scale(1.08,.88) skewX(4deg); opacity: .78 } 58% { transform: scale(.94,1.14) skewX(-2deg); opacity: .96 } 77% { transform: scale(1.05,.94) skewX(6deg); opacity: .84 } 100% { transform: scale(1,1) skewX(0deg); opacity: .9 } }
@keyframes aop-halo { 0% { opacity: .75; transform: scale(1) } 19% { opacity: 1; transform: scale(1.06) } 37% { opacity: .6; transform: scale(.95) } 55% { opacity: .9; transform: scale(1.03) } 72% { opacity: .7; transform: scale(.98) } 100% { opacity: .75; transform: scale(1) } }
@keyframes aop-room-breathe { 0% { opacity: .7 } 13% { opacity: 1 } 29% { opacity: .55 } 46% { opacity: .85 } 61% { opacity: .65 } 80% { opacity: .95 } 100% { opacity: .7 } }
@media (prefers-reduced-motion: reduce) { [data-flicker] { animation: none !important } }
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

  // A player takes their seat once the DM has the table open AND has opened a seat to them (Sam, 2026-10-25:
  // "NO player can sit at the table without me FIRST opening up the seat to them"). If he takes the invitation
  // back, the latch resets so a fresh invitation sits them down again.
  useEffect(() => {
    if (role !== "player" || !view || leaving.current) return
    if (!view.invited) { sat.current = false; return }
    if (sat.current) return
    if (view.state.status === "lobby" && !view.mine) { sat.current = true; send("sit") }
  }, [role, view, send])

  // The session began (Sam, 2026-10-25): "The whole table should darken after they start. Then after a
  // second or so the cinematic for the act starts up." Everyone in the room sees the dark first.
  const [dark, setDark] = useState(false)
  useEffect(() => {
    if (!view || view.state.status !== "live" || dark) return
    // A player the DM has stepped out waits here; he lets them back in and they go in with the rest.
    if (role !== "dm" && !(role === "player" && view.mine && !view.mine.away)) return
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

  // Room music: calm, looped, only on the real site (Sam's test-copy rule) and only if the Settings sheet allows
  // intro scores. The browser will not start sound before a click, so it tries at once and again on the first
  // press anywhere; the speaker button shows as soon as the player exists, so a refused table is one press away.
  const music = useRef<HTMLAudioElement | null>(null)
  const [musicOn, setMusicOn] = useState(false)
  const [hasMusic, setHasMusic] = useState(false)
  useEffect(() => {
    fadeOutThemeAudio()
    const real = typeof window !== "undefined" && window.location.hostname.endsWith("playacartagena.com")
    if (!real || !readSettings().introMusic) return
    const a = new Audio(ROOM_MUSIC); a.loop = true; a.volume = ROOM_MUSIC_VOLUME; music.current = a
    setHasMusic(true)
    let refused = false
    try { refused = window.localStorage.getItem(TABLE_MUSIC_KEY) === "off" } catch { /* storage blocked */ }
    if (refused) return () => { a.pause() }
    const go = () => { a.play().then(() => { setMusicOn(true); window.removeEventListener("pointerdown", go) }).catch(() => {}) }
    go()
    window.addEventListener("pointerdown", go)
    return () => { a.pause(); window.removeEventListener("pointerdown", go) }
  }, [])
  const toggleMusic = () => {
    const a = music.current; if (!a) return
    if (a.paused) {
      a.play().then(() => setMusicOn(true)).catch(() => {})
      try { window.localStorage.removeItem(TABLE_MUSIC_KEY) } catch { /* storage blocked */ }
    } else {
      a.pause(); setMusicOn(false)
      try { window.localStorage.setItem(TABLE_MUSIC_KEY, "off") } catch { /* storage blocked */ }
    }
  }

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
          {hasMusic && (
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
      <Room view={view} isDm={role === "dm"} busy={busy} dark={dark}
        locked={role !== "dm" && view != null && view.state.status === "lobby" && !view.mine && !view.invited}
        onRemove={(id) => send("remove", { characterId: id })} onExcuse={(id) => send("excuse", { characterId: id })} onReadmit={(id) => send("readmit", { characterId: id })} />

      {/* the box under the table: what this browser can do now */}
      <section className="relative z-10 mx-auto mt-6 max-w-xl px-4 pb-16 text-center">
        {msg && <p role="alert" className="mb-3 text-sm text-[#d9bd7e]">{msg}</p>}
        {!view && <p className="text-[11px] uppercase tracking-[0.4em] text-stone-600">Lighting the candles…</p>}
        {view && role === "dm" && <DmControls view={view} busy={busy} send={send} onRehearse={() => router.push(mapHref(true))} />}
        {view && role === "dm" && <SeatInvites view={view} busy={busy} send={send} />}
        {view && role === "dm" && <RestartCampaign busy={busy} onDone={load} />}
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

function Room({ view, isDm, busy, dark, locked, onRemove, onExcuse, onReadmit }: { view: View | null; isDm: boolean; busy: boolean; dark: boolean; locked: boolean; onRemove: (id: string) => void; onExcuse: (id: string) => void; onReadmit: (id: string) => void }) {
  const seats = view?.seats ?? []
  const bySeat = new Map(seats.map((s, i) => [s.seat ?? i + 1, s]))
  const figures = assignFigures(seats)
  const live = view?.state.status === "live"
  const closed = (view?.state.status ?? "closed") === "closed" || locked
  const light = view?.dmLight ?? null
  const video = useAlphaVideo()
  return (
    <section className="relative z-10 mx-auto mt-3 w-full max-w-6xl px-4">
      <div className="relative w-full overflow-hidden rounded-[4px] border border-[#3d3020] shadow-[0_30px_80px_rgba(0,0,0,0.7)]" style={{ aspectRatio: "1920 / 1072" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ROOM} alt="A candlelit round table with the Dungeon Master's screen" className="absolute inset-0 h-full w-full object-cover" />
        {/* the Lich, behind his screen */}
        <div className="absolute left-[56%] top-[3%] w-[25.6%] origin-bottom animate-[aop-lich-loom_5s_ease-in-out_infinite]">
          <Art still={LICH} loop={LICH_LOOP} video={video} alt="Malachar the Lich" className="w-full [filter:drop-shadow(0_0_20px_rgba(140,60,200,0.35))]" />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ROOM} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ clipPath: SCREEN_CLIP }} />
        {/* the art on the three leaves of the screen */}
        {SCREEN_LEAVES.map((l) => (
          <div key={l.art} aria-hidden className="pointer-events-none absolute inset-0" style={{ clipPath: leafClip(l) }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={l.art} alt="" className="absolute max-w-none object-cover"
              style={{ left: `${l.x0}%`, top: `${l.tl - LEAF_PAD}%`, width: `${l.x1 - l.x0}%`, height: `${l.bl - l.tl + 2 * LEAF_PAD}%`, objectPosition: l.pos, transformOrigin: "0 0", transform: `skewY(${leafSkew(l).toFixed(2)}deg)` }} />
            {/* candlelight on leather, not a lit painting: the art sits a shade darker than the poster */}
            <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(28,12,6,.15), rgba(28,12,6,.36))" }} />
          </div>
        ))}
        {/* the candles: a living flame over each painted one, its halo, and the room breathing with them */}
        <div aria-hidden data-flicker className="pointer-events-none absolute inset-0 mix-blend-screen" style={{ background: "radial-gradient(ellipse 60% 55% at 60% 38%, rgba(255,170,70,.13), transparent 70%)", animation: "aop-room-breathe 3.7s ease-in-out infinite" }} />
        {FLAMES.map((f, i) => {
          const w = f.h * FLAME_W
          return (
            <div key={i} aria-hidden className="pointer-events-none absolute inset-0">
              <div data-flicker className="absolute mix-blend-screen" style={{ left: `${f.x - w * 1.9}%`, top: `${f.y - f.h * .9}%`, width: `${w * 3.8}%`, height: `${f.h * 2.6}%`, transformOrigin: "50% 50%",
                background: "radial-gradient(ellipse at 50% 50%, rgba(255,180,80,.38) 0%, rgba(255,140,40,.14) 42%, rgba(255,120,30,0) 70%)", animation: `aop-halo ${(f.dur * 1.37).toFixed(2)}s ease-in-out ${f.delay}s infinite` }} />
              <div data-flicker className="absolute mix-blend-screen" style={{ left: `${f.x - w / 2}%`, top: `${f.y - f.h / 2}%`, width: `${w}%`, height: `${f.h}%`, transformOrigin: "50% 100%", filter: "blur(0.6px)",
                background: "radial-gradient(ellipse 50% 58% at 50% 62%, rgba(255,252,220,.95) 0%, rgba(255,208,95,.85) 30%, rgba(255,140,30,.42) 58%, rgba(255,90,10,0) 78%)", animation: `aop-flame ${f.dur}s ease-in-out ${f.delay}s infinite` }} />
            </div>
          )
        })}
        {/* the DM's light on the screen */}
        <span className={cn("absolute left-[67.1%] top-[46%] aspect-square w-[1.5%] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-500", light ? LIGHT_CLASS[light] : "bg-stone-800")}
          aria-label={light ? `Dungeon Master: ${light}` : "The Dungeon Master is not here"} />
        {/* five chairs */}
        {SLOTS.map((slot, i) => {
          const s = bySeat.get(i + 1) ?? null
          const fig = s ? figures.get(s.id) ?? 0 : null
          const art = fig == null ? CHAIR : PLAYER_ART[fig]
          const fade = slot.side ? { WebkitMaskImage: "linear-gradient(to bottom,#000 80%,transparent 100%)", maskImage: "linear-gradient(to bottom,#000 80%,transparent 100%)" } : undefined
          return (
            <div key={i} className="absolute flex -translate-x-1/2 -translate-y-full justify-center" style={{ left: `${slot.x}%`, top: `${slot.y}%`, height: `${slot.h}%`, width: `${slot.h * 0.9}%`, zIndex: Math.round(slot.y) }}>
              <Art key={`${s?.id ?? "empty"}:${fig}`} still={art} loop={fig == null ? null : PLAYER_LOOP[fig]} video={video} alt={s ? `${s.name}'s player` : "An empty chair"}
                className={cn("absolute bottom-0 h-full w-auto max-w-none", s?.away && "opacity-35 saturate-0", s ? (video ? "animate-[aop-figure-sit_.7s_cubic-bezier(.3,1.5,.6,1)_both]" : "animate-[aop-figure-sit_.7s_cubic-bezier(.3,1.5,.6,1)_both,aop-figure-idle_3.6s_ease-in-out_.8s_infinite]") : "")}
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
              {s.away && <span className="rounded-sm bg-black/80 px-1.5 text-[10px] uppercase tracking-[0.18em] text-amber-300">stepped out</span>}
              {isDm && !live && (
                <button type="button" disabled={busy} onClick={() => onRemove(s.id)} className="flex items-center gap-1 rounded-sm bg-black/70 px-1.5 text-[10px] uppercase tracking-[0.2em] text-stone-400 hover:text-red-300 disabled:opacity-40">
                  <UserMinus className="h-3 w-3" /> remove
                </button>
              )}
              {isDm && live && !s.dm && (
                <button type="button" disabled={busy} onClick={() => (s.away ? onReadmit(s.id) : onExcuse(s.id))} className="flex items-center gap-1 rounded-sm bg-black/70 px-1.5 text-[10px] uppercase tracking-[0.2em] text-stone-400 hover:text-amber-200 disabled:opacity-40">
                  {s.away ? <><UserPlus className="h-3 w-3" /> let back in</> : <><UserMinus className="h-3 w-3" /> excuse</>}
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

// Who may sit (Sam, 2026-10-25). Every hero in the game, with the one button that fits where they are: open a
// seat to them, take it back, or — once the game is live — step them out and let them back in.
function SeatInvites({ view, busy, send }: { view: View; busy: boolean; send: (a: string, e?: Record<string, unknown>) => Promise<View | null> }) {
  const roster = view.roster ?? []
  const status = view.state.status
  const btn = "flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] disabled:opacity-40"
  return (
    <div className="mt-6 rounded-sm border border-[#3d3428] bg-black/50 text-left">
      <div className="border-b border-[#2a241e] px-4 py-2 text-[10px] uppercase tracking-[0.35em] text-[#8a6a3a]">Who sits at the table</div>
      {roster.length === 0 && <p className="px-4 py-3 text-sm text-stone-500">No player characters yet.</p>}
      <ul className="divide-y divide-[#2a241e]">
        {roster.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <div>
              <div className="font-serif text-[15px] text-[#e8d9ae]">{c.name}</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
                {c.cls || "Adventurer"} · {c.companion ? "your companion" : c.away ? "stepped out" : c.seated ? "seated" : c.invited ? "seat open — waiting for them" : "not invited"}
              </div>
            </div>
            <div>
              {status !== "live" && !c.seated && !c.invited && (
                <button type="button" disabled={busy} onClick={() => send("invite", { characterId: c.id })} className={cn(btn, "border-[#3d3428] text-stone-400 hover:border-[#c9a868] hover:text-[#e8c56a]")}><UserPlus className="h-3.5 w-3.5" /> Open a seat</button>
              )}
              {status !== "live" && !c.companion && (c.invited || c.seated) && (
                <button type="button" disabled={busy} onClick={() => send("uninvite", { characterId: c.id })} className={cn(btn, "border-[#3d3428] text-stone-400 hover:border-red-500/60 hover:text-red-200")}><UserMinus className="h-3.5 w-3.5" /> {c.seated ? "Remove" : "Withdraw"}</button>
              )}
              {status === "live" && c.seated && !c.companion && (
                <button type="button" disabled={busy} onClick={() => send(c.away ? "readmit" : "excuse", { characterId: c.id })} className={cn(btn, "border-[#3d3428] text-stone-400 hover:border-amber-300/60 hover:text-amber-200")}>
                  {c.away ? <><UserPlus className="h-3.5 w-3.5" /> Let back in</> : <><UserMinus className="h-3.5 w-3.5" /> Excuse</>}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {status === "closed" && <p className="border-t border-[#2a241e] px-4 py-2 text-[12px] text-stone-600">Open the table, then open a seat to each player. Nobody sits uninvited.</p>}
    </div>
  )
}

function DmControls({ view, busy, send, onRehearse }: { view: View; busy: boolean; send: (a: string, e?: Record<string, unknown>) => Promise<View | null>; onRehearse: () => void }) {
  const s = view.state
  const waiting = view.seats.filter((x) => x.light !== "green")
  if (s.status === "closed") {
    // No Open button here: the table opens ONLY from the DM door on the title screen (Sam, 2026-10-25;
    // lib/dm-door.ts). Rehearsal still lives here, since it never opens the table.
    return (
      <div className="space-y-3">
        <p className="text-sm text-stone-400">The table is dark. It opens only from the Dungeon Master&apos;s door on the title screen.</p>
        <a href="/intro" className="flex w-full items-center justify-center gap-3 rounded-sm border-2 border-[#8a6a3a] bg-gradient-to-b from-[#2a2015] to-[#120e0a] py-4 font-serif text-lg uppercase tracking-[0.3em] text-[#e8c56a] shadow-[0_0_40px_rgba(201,168,104,0.3)] hover:border-[#f4e0a8]">
          <DoorOpen className="h-5 w-5" /> To the DM door
        </a>
        <button type="button" onClick={onRehearse} className="text-[11px] uppercase tracking-[0.3em] text-stone-600 hover:text-stone-400">Rehearsal — sandbox, nothing saves</button>
      </div>
    )
  }
  if (s.status === "live") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-emerald-300/80">Session {s.session} is live. The roster is locked.</p>
        <EndButton busy={busy} send={send} prominent label="End the game" />
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

function EndButton({ busy, send, label = "End the session", prominent = false }: { busy: boolean; send: (a: string) => Promise<View | null>; label?: string; prominent?: boolean }) {
  // While the game is live this is THE way out for the DM (Sam, 2026-10-25: "a button that gets me to end the
  // game and kicks everyone out"), so it is a real red button, not the faint text link it was.
  return (
    <button type="button" disabled={busy} onClick={() => { if (window.confirm(`${label}? Everyone is sent back to the door; the world stays exactly as it is for next time.`)) send("end") }} className={prominent
      ? "flex w-full items-center justify-center gap-2 rounded-sm border-2 border-red-700/80 bg-gradient-to-b from-[#3a1414] to-[#1f0b0b] py-3 font-serif text-sm uppercase tracking-[0.3em] text-red-100 shadow-[0_0_30px_rgba(185,28,28,0.25)] hover:border-red-400 disabled:opacity-40"
      : "text-[11px] uppercase tracking-[0.3em] text-stone-600 hover:text-red-300 disabled:opacity-40"}>
      {label}
    </button>
  )
}

// Start the whole campaign over (Sam, 2026-10-25: "I also want to reset the game button so we can restart the
// campaign"). The dashboard had this, but the DM no longer has a dashboard, so it lives at his table now. The
// work is /api/restart-campaign (DM only): it wipes the run and keeps the heroes. It also clears every world
// flag, which closes this table and empties every seat, so anyone still in the game is sent back to the table
// (components/session-guard.tsx). Two steps, because it cannot be undone.
function RestartCampaign({ busy, onDone }: { busy: boolean; onDone: () => void }) {
  const [step, setStep] = useState<"idle" | "ask" | "working">("idle")
  const [note, setNote] = useState<string | null>(null)
  const restart = async () => {
    setStep("working"); setNote(null)
    try {
      const r = await fetch("/api/restart-campaign", { method: "POST", headers: { "Content-Type": "application/json", ...dmHeaders() } })
      const j = await r.json().catch(() => null)
      if (r.status === 403) { setNote("The server did not accept your DM code. Nothing was restarted. Sign in at the DM door again."); return }
      if (!r.ok || !j?.ok) { setNote("The restart did not fully finish. Some of the old run may still be there; tell Claude before you play."); return }
      // Bring every screen that follows the shared stage back to the table, as the dashboard's restart did.
      fetch("/api/stage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "table", by: "dm", at: new Date().toISOString(), caption: "A new game begins." }) }).catch(() => {})
      const run = typeof j.report?.run?.number === "number" ? ` Run ${j.report.run.number} begins.` : ""
      setNote(`The campaign is back at the beginning.${run} Open the table when the players are ready.`)
      onDone()
    } catch {
      setNote("Could not reach the server. Nothing was changed.")
    } finally {
      setStep("idle")
    }
  }
  return (
    <div className="mt-10 border-t border-[#2a221a] pt-5">
      {note && <p role="status" className="mb-3 text-sm text-[#d9bd7e]">{note}</p>}
      {step === "ask" ? (
        <div className="rounded-sm border border-red-800/70 bg-[#1a0b0b]/90 p-4 text-left">
          <div className="font-serif text-base text-red-100">Restart the whole campaign?</div>
          <p className="mt-2 text-sm leading-relaxed text-stone-400">
            Everything that happened in this campaign is wiped: the story so far, what Malachar and the NPCs remember, every
            choice the world recorded, everything the party carries, and every seat at this table. The heroes themselves are kept,
            with their sheets, levels and art. The party wakes again in rags, in the slave pen of Velkynvelve.
          </p>
          <p className="mt-2 text-sm text-red-300/90">This cannot be undone.</p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={restart} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-sm border-2 border-red-700/80 bg-gradient-to-b from-[#3a1414] to-[#1f0b0b] py-3 font-serif text-sm uppercase tracking-[0.25em] text-red-100 hover:border-red-400 disabled:opacity-40">
              <RotateCcw className="h-4 w-4" /> Yes, start over
            </button>
            <button type="button" onClick={() => setStep("idle")} className="flex-1 rounded-sm border border-[#3d3428] py-3 text-[12px] uppercase tracking-[0.25em] text-stone-400 hover:text-stone-200">
              Keep this campaign
            </button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={busy || step === "working"} onClick={() => setStep("ask")} className="inline-flex items-center gap-2 rounded-sm border border-red-900/60 px-4 py-2 text-[11px] uppercase tracking-[0.3em] text-red-300/80 hover:border-red-500/80 hover:text-red-200 disabled:opacity-40">
          <RotateCcw className="h-3.5 w-3.5" /> {step === "working" ? "Restarting…" : "Restart the campaign"}
        </button>
      )}
    </div>
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
  if (s.status === "live" && mine?.away) {
    return (
      <div className="rounded-sm border border-amber-900/60 bg-black/60 p-5">
        <div className="font-serif text-lg text-amber-200">The Dungeon Master has stepped you out.</div>
        <p className="mt-1 text-sm text-stone-500">Your chair is held. Wait here — you go back in the moment he lets you.</p>
        <div className="mx-auto mt-4 h-1 w-24 animate-pulse rounded-full bg-[#8a6a3a]/60" />
      </div>
    )
  }
  if (s.status === "lobby" && !mine && !view.invited) {
    return (
      <div className="rounded-sm border border-[#3d3428] bg-black/60 p-5">
        <div className="font-serif text-lg text-[#e8d9ae]">The table is open — but not to you yet.</div>
        <p className="mt-1 text-sm text-stone-500">The Dungeon Master chooses who sits. Wait here; your chair appears when he opens a seat for you.</p>
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
