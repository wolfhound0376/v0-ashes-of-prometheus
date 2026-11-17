"use client"

// /awaken — Act I, "Awakening into the Nightmare": the opening sequence between the door and the pen.
//
// Sam, 2026-10-14, from the approved storyboard (artifact "Awakening storyboard", v8):
//
//   1. BLACK         nothing on screen. The character's own voice: "Where am I?"
//   2. THE DREAM     still dark. Malachar, as if into the dream, with Dark and Stormy underneath: the
//                    situation (book facts, ch.1 — captured by the drow, the collar, Ilvara's words),
//                    then one hook line per character. His words rise through the dark as a centred,
//                    receding crawl in necrotic violet.
//   3. TITLE CARD    "ACT I — AWAKENING INTO THE NIGHTMARE". The music swells and cuts.
//   4. THE WAKER     one of three (Jimjar, Eldeth, Prince Derendil — never the same one twice running)
//                    opens on the screen like eyelids: their idle loop, then their talking loop under
//                    their own voice saying "wake up" and where you are. No caption — face and voice.
//   5. THE ROLL      back into the dark; the music returns. "Let's see what you kept." Then the real
//                    fortune roll on the shared dice (components/dashboard/fortune-roll.tsx): 1d20 +
//                    days held (1d10), the book's table, a catalog item in the bag.
//   6. WHAT YOU HAVE Malachar writes his line on the actual result into the shared log (not voiced, not
//                    waited on — 2026-11-13), and the lich cinematic surfaces out of the black and laughs.
//   7. THE GATE      the music fades to black and they wait for the rest of the party (and the DM), then
//                    everyone steps into /velkynvelve, Area 11, at the same moment (lib/entry.ts — Sam,
//                    2026-10-29: "The DM should NOT enter the map after them but we all enter the same time").
//
// 0. THE HERO'S OWN FILM (Sam, 2026-10-27, for Lynkes: "add it"). A FORGED hero who has an intro
//    film (cinematic_clips 'hero-intro' + their character_id, read by /api/hero-film) sees it first,
//    before "Where am I?" — it ends on their capture, so the black that follows is the same black.
//    Canon heroes watched theirs on /choose and get null, so nobody sees a film twice. Skip during
//    the film skips the film only; the rest of the show still plays. Cinematics OFF: no film.
//
// Everything pre-recorded lives in public/awaken/ (voices rendered from the characters' and NPCs' saved
// ElevenLabs voices; the lich cinematic is Sam's). The only live pieces are the dice, Malachar's
// line about the result (written to the log, not voiced). Already rolled this run: straight to the pen.
//
// Invented vs sourced: the situation is the book's; the hook lines, the wakers' lines and Malachar's
// "let's see what you kept" are written lines Sam approved in the storyboard.
//
// NEVER STALLS (Sam, 2026-10-29: "awaken shows the beats but is designed not to stall"). Every wait in
// the show has a ceiling (CEILING below): a tap the browser asks for, a voice that won't load, a film that
// stops buffering, Malachar's narration, the laugh. A beat whose media fails is passed over, never waited
// on. The fortune roll rolls itself after AUTO_ROLL_MS and its result card closes itself after
// AUTO_DISMISS_MS, so a player who walked away from the screen never holds the table up.
//
// THE FASTER AWAKEN (Sam, 2026-11-13: "awakenings takes way too long"; "go" to the cut). A hero whose own
// film played skips "where am I" and the dream (the film already ends on the capture); the title holds
// 2.5 s; the roll rolls itself after 10 s; no black wait and no voiced recap after the roll.
//
// SKIPPABLE (Sam, 2026-10-11: sitting through it every time is annoying; 2026-10-24: "an option to
// not have cinematics or intro scores"). A Skip button is up for the whole of the show; with
// Cinematics OFF in the settings (lib/settings.ts) the show is replaced by one still line and the
// page goes straight to the roll. The ROLL itself is never skipped — it is gameplay, and the bag
// depends on it. Intro music OFF keeps "Dark and Stormy" silent; the voices still speak.
//
// SKIP MEANS SKIP (Sam, 2026-11-13: after Skip "the pause occurs because I think I'm expected to click on the
// screen. Why isn't that automatic?"). Skip pressed ANYWHERE in the show (the film included) now also hurries the
// roll: no black beat and no Malachar pre-roll line before it, the dice throw themselves after QUICK_ROLL_MS instead
// of a 10 s countdown, the result card closes after QUICK_DISMISS_MS, and no laugh — straight to the pen. The roll
// still happens (the bag depends on it) and the Act I title still shows. Without Skip, nothing changes.

//
// KNOCKOUT TO WAKE (Sam, 2026-11-17: asked how to "make this look better and improve the intro sequence into the
// pen after the fight"; "go" to cutting the crawl). Beats 1-2 above (the hero's "Where am I?" and Malachar's dream
// crawl with the per-hero hook) are replaced by one wordless beat, "wake": black with a ringing head and a slow
// heartbeat, the eyes opening twice on the pen painting, and ONE line — Ilvara's, from the book — in her saved
// voice and her own tongue, in the pen's comic balloon. A seat that understands Undercommon or Elvish reads it in
// English; a seat that does not reads her words (the one-language balloon rule, Sam 2026-10-28). The old recordings
// stay in public/awaken/ (archive, never delete). Every wait has a ceiling and Skip cuts it, like every other beat.
// A hero with their own intro film (Lynkes, Gandalf) gets this beat too, after the film (Sam, same day: "yes").
// NOT here: the blow itself — that belongs to the end of the Pit fight, which is not in the repo yet.

import React, { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { DiceProvider } from "@/components/dice/dice-provider"
import { FortuneRoll } from "@/components/dashboard/fortune-roll"
import { useLich } from "@/lib/hooks/use-lich"
import { MusicToggle } from "@/components/music-toggle"
import { fadeOutThemeAudio } from "@/components/theme-audio"
import { isMusicOff, onMusicPrefChange } from "@/lib/audio-prefs"
import { cinematicsOn, introMusicOn, onSettingsChange } from "@/lib/settings"
import { EntryGate } from "@/components/entry-gate"
import { createClient } from "@/lib/supabase/client"
import { gibberish, listenerFromCharacter, understands } from "@/lib/languages"

const PEN_ROUTE = "/velkynvelve"
/** How long the Act I card holds when it plays on its own (a saved game, or Cinematics off). */
const ACT_CARD_MS = 4200
const MEDIA = "/awaken"
/** The NPC idle/talking loops the dashboard uses (public bucket). */
const LOOPS = "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/character-loops"

/** The one line of the wake beat: Ilvara's words to her prisoners (Out of the Abyss, ch. 1). */
const ILVARA_LINE = "Accept your fate. Learn to obey. And you may survive."
const ILVARA_TONGUE = "Undercommon"
/** The pen plate the Underwalk opens on (the same painting, so the eyes open on the room you then stand in). */
const PEN_ART = "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/scenes/velkynvelve/walk/img/node-11-slave-pen.jpg"
const PREROLL_TEXT = "They stripped you to your underclothes.\nBut the drow count bolts, not pockets.\n\nLet's see what you kept."
/** The still line that stands in for the whole show when Cinematics is off (his words, cut to one card). */
const STILL_TEXT = "Captured by the drow. A collar at your throat, a priestess who says your life is hers now.\n\nLet's see what you kept."

const WAKERS = [
  { key: "jimjar", loop: "jimjar" },
  { key: "eldeth", loop: "eldeth" },
  { key: "derendil", loop: "prince_derendil" },
] as const
type WakerKey = (typeof WAKERS)[number]["key"]

type Step = "seat" | "tap" | "film" | "wake" | "title" | "waker" | "roll" | "result" | "laugh" | "act" | "gate"

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

/** The longest any one beat may hold the show (ms). A beat that runs past it is passed over. */
const CEILING = {
  tap: 5000,        // the browser wants a gesture for sound: carry on silently after this
  line: 6000,       // Ilvara's line being fetched: past this it is shown without her voice
  clip: 60000,      // one voice clip
  film: 150000,     // a hero film whose length the browser can't read
  laugh: 15000,
} as const
/** A voice clip that pauses on its own is given this long to resume before its beat moves on (ms). */
const CLIP_PAUSE_GRACE_MS = 1500
/** Slack past a voice clip's own length before its beat moves on without it (ms). */
const CLIP_SLACK_MS = 3000
const AUTO_ROLL_MS = 10000 // was 20 s (Sam, 2026-11-13: the faster awaken)
const AUTO_DISMISS_MS = 7000
/** After Skip: long enough to see the card and the dice, short enough that nobody reaches for the mouse. */
const QUICK_ROLL_MS = 1500
const QUICK_DISMISS_MS = 3000
/** The roll beat's own ceiling: the card's two clocks, the dice, and slack. Past it the show goes on without a roll. */
const ROLL_BEAT_MS = AUTO_ROLL_MS + AUTO_DISMISS_MS + 45000

/** Resolves when p does, or after ms — whichever is first. */
const within = <T,>(p: Promise<T>, ms: number): Promise<T | void> => Promise.race([p, sleep(ms)])

type PenLine = { text: string; understood: boolean; url: string | null }

/** Ilvara's line for this seat: her words in her tongue, voiced in her saved voice; English only for ears that know it. */
async function fetchIlvaraLine(characterId: string): Promise<PenLine> {
  const spoken = gibberish(ILVARA_LINE, ILVARA_TONGUE)
  let understood = false
  try {
    const { data } = await createClient().from("characters").select("languages, conditions").eq("id", characterId).limit(1).maybeSingle()
    const ears = listenerFromCharacter(data as { languages?: unknown; conditions?: unknown } | null)
    understood = !!data && (understands(ears, "Undercommon") || understands(ears, "Elvish"))
  } catch { /* unknown ears: her own words */ }
  let url: string | null = null
  try {
    const r = await fetch("/api/npc-tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: spoken, npcName: "Ilvara Mizzrym" }) })
    if (r.ok) url = URL.createObjectURL(await r.blob())
  } catch { /* no voice: the balloon alone */ }
  return { text: understood ? ILVARA_LINE : spoken, understood, url }
}

/** A ringing head and a slow heartbeat, made in the browser (no file). Silent if the browser will not allow sound. */
function knockoutTone(seconds: number): () => void {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return () => {}
    const ac = new AC(), t0 = ac.currentTime + 0.05, out = ac.createGain()
    out.gain.value = 0.9; out.connect(ac.destination)
    const ring = ac.createOscillator(), rg = ac.createGain()
    ring.type = "sine"; ring.frequency.value = 3100
    rg.gain.setValueAtTime(0.0001, t0); rg.gain.exponentialRampToValueAtTime(0.045, t0 + 0.08); rg.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds)
    ring.connect(rg).connect(out); ring.start(t0); ring.stop(t0 + seconds + 0.1)
    for (let b = 0; b * 1.05 < seconds; b++) {
      for (const [off, vol] of [[0, 0.5], [0.3, 0.32]] as const) {
        const at = t0 + 0.4 + b * 1.05 + off, o = ac.createOscillator(), g = ac.createGain()
        o.type = "sine"; o.frequency.setValueAtTime(62, at); o.frequency.exponentialRampToValueAtTime(38, at + 0.22)
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.26)
        o.connect(g).connect(out); o.start(at); o.stop(at + 0.3)
      }
    }
    const end = window.setTimeout(() => { void ac.close().catch(() => {}) }, (seconds + 1) * 1000)
    return () => { window.clearTimeout(end); try { out.gain.setTargetAtTime(0, ac.currentTime, 0.08) } catch {} ; window.setTimeout(() => { void ac.close().catch(() => {}) }, 400) }
  } catch { return () => {} }
}

function pickWaker(): WakerKey {
  let last: string | null = null
  try { last = window.localStorage.getItem("aop_last_waker") } catch {}
  const pool = WAKERS.filter((w) => w.key !== last)
  const pick = pool[Math.floor(Math.random() * pool.length)].key
  try { window.localStorage.setItem("aop_last_waker", pick) } catch {}
  return pick
}

export default function AwakenPage() {
  const router = useRouter()
  const [seat, setSeat] = useState<{ id: string; token: string; name: string | null; film: string | null } | null>(null)
  /** Who this browser is, for the gate — set on every path, the saved-game one included. */
  const [door, setDoor] = useState<{ id: string; token: string } | null>(null)
  const [step, setStep] = useState<Step>("seat")
  const [caption, setCaption] = useState<string | null>(null)
  const [crawl, setCrawl] = useState<{ text: string; seconds: number; key: number } | null>(null)
  const [faceOpen, setFaceOpen] = useState(false)
  const [talking, setTalking] = useState(false)
  const [waker, setWaker] = useState<WakerKey | null>(null)
  const [laughOn, setLaughOn] = useState(false)
  const [skipShown, setSkipShown] = useState(false)
  const [filmOn, setFilmOn] = useState(false)
  const [quickRoll, setQuickRoll] = useState(false)
  /** The wake beat: the eyelids over the pen painting, and Ilvara's balloon. */
  const [eyes, setEyes] = useState<"shut" | "half" | "open" | null>(null)
  const [penLine, setPenLine] = useState<PenLine | null>(null)
  const hush = useRef<() => void>(() => {})
  const { sendMessage } = useLich("abyss")

  const started = useRef(false)
  const dead = useRef(false)
  // Skip: pressed once, it wins every wait in the show (sleep, clip, video) from then on. The
  // sequence checks it between beats and jumps to the roll (or, past the roll, to the pen).
  const skipped = useRef(false)
  const skipResolve = useRef<() => void>(() => {})
  const skipP = useRef<Promise<void>>(new Promise<void>((r) => { skipResolve.current = r }))
  // Unlike `skipped`, never re-armed: did the player press Skip at any point in this run? (Skip means skip.)
  const everSkipped = useRef(false)
  const music = useRef<HTMLAudioElement>(null)
  const clip = useRef<HTMLAudioElement>(null)
  const idleVid = useRef<HTMLVideoElement>(null)
  const talkVid = useRef<HTMLVideoElement>(null)
  const laughVid = useRef<HTMLVideoElement>(null)
  const filmVid = useRef<HTMLVideoElement>(null)
  const rollDone = useRef<(rolled: boolean) => void>(() => {})

  useEffect(() => () => { dead.current = true }, [])
  // A breadcrumb per beat, so a stall can be read off the browser console instead of guessed at.
  useEffect(() => { console.info(`[awaken] ${step}`) }, [step])

  // The seat this browser holds. Nobody seated: the door. Already rolled this run: the pen.
  useEffect(() => {
    try {
      const id = window.localStorage.getItem("aop_character_id")
      const token = window.localStorage.getItem("aop_claim_token")
      if (!id || !token) { router.replace("/join"); return }
      window.sessionStorage.setItem("aop_intro_seen", "1")
      fadeOutThemeAudio()
      Promise.all([
        fetch(`/api/verify-claim`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ characterId: id, claimToken: token }) }).then((r) => r.json()),
        fetch(`/api/fortune-roll?characterId=${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch(`/api/table?characterId=${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch(`/api/hero-film?characterId=${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ])
        .then(([claim, fortune, table, heroFilm]) => {
          if (!claim?.valid) { router.replace("/join"); return }
          // Nobody walks in until the DM has started the session and they hold a seat at it (Sam, 2026-10-25).
          // An unreadable table lets them through rather than locking the family out on a network blip.
          if (table && !table.error && !(table.state?.status === "live" && table.mine)) { router.replace("/table"); return }
          setDoor({ id, token })
          if (fortune?.rolled) { setStep("act"); return }   // a saved game: the Act I card, then the gate
          setSeat({ id, token, name: claim?.character?.name ?? null, film: typeof heroFilm?.film === "string" && heroFilm?.seen !== true ? heroFilm.film : null })
        })
        .catch(() => router.replace("/join"))
    } catch { router.replace("/join") }
  }, [router])

  // --- helpers ------------------------------------------------------------------------------------
  /** A wait the Skip button can cut short. */
  const race = useCallback(<T,>(p: Promise<T>): Promise<T | void> => Promise.race([p, skipP.current]), [])
  const wait = useCallback((ms: number) => race(sleep(ms)), [race])

  // A CLIP THAT STOPS ENDS ITS BEAT (Sam, 2026-11-13: "Still a long lull, why?"). Measured on his run: the dream
  // voice-over stood paused at 4.9 s of 22 with the music still under it and no later clip loaded. Something outside
  // the show paused it (not Skip: Skip would have rushed the roll), so "ended" never came and the beat sat out the
  // flat 60 s ceiling on black once the crawl had scrolled away. Now an unasked-for pause ends the beat after a
  // moment's grace (a stall that resumes carries on), and each clip's ceiling is its own length plus slack once the
  // browser knows it, with the flat ceiling only for a clip whose length it can't read.
  const playClip = useCallback(async (src: string): Promise<void> => {
    const a = clip.current
    if (!a || dead.current || skipped.current) return
    a.src = src
    a.currentTime = 0
    let hold: number = CEILING.clip
    let fire: (() => void) | null = null
    const ends = new Promise<void>((res) => { fire = res })
    let grace: number | null = null
    const done = () => fire?.()
    const paused = () => {
      if (a.ended) return done()
      if (grace) window.clearTimeout(grace)
      grace = window.setTimeout(() => { if (a.paused) done() }, CLIP_PAUSE_GRACE_MS)
    }
    const sized = () => {
      if (isFinite(a.duration) && a.duration > 0) {
        hold = Math.min(CEILING.clip, (a.duration - a.currentTime) * 1000 + CLIP_SLACK_MS)
        if (ceil) window.clearTimeout(ceil)
        ceil = window.setTimeout(done, hold)
      }
    }
    let ceil: number | null = window.setTimeout(done, hold)
    a.addEventListener("ended", done)
    a.addEventListener("error", done)
    a.addEventListener("pause", paused)
    a.addEventListener("loadedmetadata", sized)
    if (a.readyState >= 1) sized()
    a.play().catch(done)
    try { await race(ends) } finally {
      a.removeEventListener("ended", done); a.removeEventListener("error", done)
      a.removeEventListener("pause", paused); a.removeEventListener("loadedmetadata", sized)
      if (grace) window.clearTimeout(grace)
      if (ceil) window.clearTimeout(ceil)
    }
    if (skipped.current || !a.ended) { a.pause() }
  }, [race])

  const skip = useCallback(() => {
    if (skipped.current) return
    skipped.current = true
    everSkipped.current = true
    setSkipShown(false)
    skipResolve.current()
    try { clip.current?.pause() } catch { /* nothing playing */ }
    try { laughVid.current?.pause() } catch { /* nothing playing */ }
    try { filmVid.current?.pause() } catch { /* nothing playing */ }
    try { hush.current() } catch { /* no tone playing */ }
    setCrawl(null); setCaption(null); setFaceOpen(false); setTalking(false); setLaughOn(false); setFilmOn(false)
    setEyes(null); setPenLine(null)
  }, [])

  /** Skipping the show must not also skip what comes after the roll, so the button is re-armed between acts. */
  const rearmSkip = useCallback(() => {
    skipped.current = false
    skipP.current = new Promise<void>((r) => { skipResolve.current = r })
  }, [])

  const musicTo = useCallback((vol: number, ms: number) => {
    const m = music.current
    if (!m) return
    const from = m.volume, t0 = performance.now()
    const tick = () => {
      if (dead.current) return
      const k = Math.min(1, (performance.now() - t0) / ms)
      m.volume = Math.max(0, Math.min(1, from + (vol - from) * k))
      if (k < 1) requestAnimationFrame(tick)
      else if (vol === 0) m.pause()
    }
    tick()
  }, [])

  const musicIn = useCallback((at: number, vol: number, ms: number) => {
    const m = music.current
    if (!m || isMusicOff() || !introMusicOn()) return
    m.currentTime = at
    m.volume = 0
    m.play().catch(() => {})
    musicTo(vol, ms)
  }, [musicTo])

  // "Music off" (either switch) silences the bed at once; "on" again lets the next cue start it.
  useEffect(() => {
    const hush = () => { if (isMusicOff() || !introMusicOn()) music.current?.pause() }
    const a = onMusicPrefChange(hush)
    const b = onSettingsChange(hush)
    return () => { a(); b() }
  }, [])

  // Malachar's words on the roll — the direction comes from FortuneRoll. His voice is /api/tts (the
  // same route the dashboard uses for him); the text is what he wrote.
  const narrate = useCallback((direction: string) => {
    if (!seat) return
    // Fire and forget: /api/chat writes his line into the shared log. Not voiced and not waited on (the faster
    // awaken, 2026-11-13) — the laugh plays straight after the roll.
    void sendMessage(direction, seat.id, seat.token, { director: true }).catch((e: unknown) => console.error("[awaken] narration failed:", e))
  }, [seat, sendMessage])

  // The show is over: to the gate, where everyone steps onto the map together (components/entry-gate.tsx,
  // lib/entry.ts — Sam, 2026-10-29: "we all enter the same time"). The name stays: the pen is still where it ends.
  const goToPen = useCallback(() => {
    setStep("gate")
    musicTo(0, 1200)
  }, [musicTo])
  const stepThrough = useCallback(() => router.replace(PEN_ROUTE), [router])

  // --- the sequence -------------------------------------------------------------------------------
  useEffect(() => {
    if (!seat || started.current) return
    started.current = true
    // THE WAKER HAS MOVED TO THE MAP (Sam, 2026-11-10: the start "is a bit slow" — "Go on the faster start"). Their
    // face used to fill this screen for 16-20 s before the roll. The pick is still made here, and handed to the
    // Underwalk in sessionStorage: the same prisoner walks over on the pen plate and says the same recorded line
    // (scripts/velkynvelve-walk/template.html, wakeOnMap). The film now stops at the title.
    const w = pickWaker()
    try { window.sessionStorage.setItem("aop_wake", w) } catch { /* no storage: nobody walks over, nothing breaks */ }
    const guard = () => { if (dead.current) throw new Error("left") }

    const show = cinematicsOn()
    // FASTER AWAKEN (Sam, 2026-11-13: "awakenings takes way too long" — Lynkes measured ~2:20 door to gate).
    // A hero whose own film actually played has already watched their capture; the "where am I" and the
    // dream retold it (~27 s). Set true once the film starts (or is skipped mid-play); a film that never
    // started leaves it false, so that hero still gets the dream.
    let filmTold = false

    const run = async () => {
      // 0 — the hero's own film, when they have one and have not seen it this run (lib/hero-film.ts). It
      //     plays whatever the Cinematics switch says (Sam, 2026-10-27: "make sure this plays whenever
      //     lynkes plays for the first time or restarts campaign"). Its sound needs a gesture on a cold
      //     page: if the browser refuses, ask for one tap, then play it.
      {
        const fv = filmVid.current
        if (seat.film && fv) {
          setSkipShown(true)
          setStep("film")
          fv.src = seat.film
          fv.currentTime = 0
          let ok = true
          // play() can sit pending for ever on a big file that will not buffer (Sam, 2026-10-29: Lynkes "stuck on
          // awaken"), and an un-raced await ignores Skip. Race it against Skip and a 10 s ceiling; a film that has not
          // started by then is passed over, never waited on.
          try {
            const started = await race(Promise.race([fv.play().then(() => true), sleep(10000).then(() => false)]))
            if (started === false) ok = false
          } catch {
            setStep("tap")
            const tapped = await race(within(new Promise<boolean>((res) => window.addEventListener("pointerdown", () => res(true), { once: true })), CEILING.tap))
            guard(); setStep("film")
            // No tap in time: the film plays without its sound rather than holding the show.
            if (tapped !== true) fv.muted = true
            if (!skipped.current) await within(fv.play(), CEILING.tap).catch(() => { ok = false })
          }
          if (ok) filmTold = true
          if (ok && !skipped.current) {
            setFilmOn(true)
            const runs = isFinite(fv.duration) && fv.duration > 0 ? (fv.duration - fv.currentTime) * 1000 + 5000 : CEILING.film
            await race(within(new Promise<void>((res) => {
              if (fv.ended) return res()
              fv.addEventListener("ended", () => res(), { once: true })
              fv.addEventListener("error", () => res(), { once: true })
            }), runs))
          }
          fv.pause(); setFilmOn(false)
          guard()
          // Watched or skipped, it counts as seen for this run; a restart clears the flag.
          void fetch("/api/hero-film", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ characterId: seat.id, claimToken: seat.token }),
          }).catch(() => { /* worst case the gate plays it once more */ })
          // Skip on the film skips the film only: the title and the roll still play.
          if (skipped.current) rearmSkip()
          setSkipShown(show)
          await wait(filmTold ? 300 : 900); guard()
        }
      }

      // EVERY HERO WAKES (Sam, 2026-11-17: "yes" to film heroes getting the wake beat after their film). Until then a
      // hero whose own film played went straight to the title; the wake is ~12 s, not the ~27 s that cut removed.
      if (show) {
        setSkipShown(true)

        // 1 — knocked out. Black, a ringing head, a slow heartbeat. Her line is fetched while nothing shows.
        setStep("wake")
        const said = fetchIlvaraLine(seat.id)
        hush.current = knockoutTone(5.5)
        await wait(2600); guard()

        // 2 — the eyes open on the pen: a heavy half-blink, shut, then open and the room comes into focus.
        if (!skipped.current) {
          musicIn(0, 0.3, 4000)
          setEyes("half"); await wait(1300); guard()
          setEyes("shut"); await wait(600); guard()
          if (!skipped.current) { setEyes("open"); await wait(2400); guard() }
        }

        // 3 — the one line. Her voice in her tongue; the balloon in whichever language this seat can read.
        if (!skipped.current) {
          const line = ((await race(within(said, CEILING.line))) as PenLine | void) || { text: gibberish(ILVARA_LINE, ILVARA_TONGUE), understood: false, url: null }
          guard()
          if (!skipped.current) {
            setPenLine(line)
            const t0 = performance.now()
            if (line.url) await playClip(line.url)
            // No voice (or the browser refused it): the balloon still holds long enough to read.
            const held = performance.now() - t0
            if (held < 4200) await wait(4200 - held)
            guard()
            await wait(700); setPenLine(null)
          }
        }
        void said.then((l) => { if (l.url) window.setTimeout(() => URL.revokeObjectURL(l.url!), 30000) }).catch(() => {})
        setEyes((e) => (e ? "shut" : null)); await wait(650); guard()
        setEyes(null)
      }

      if (show) {
        setSkipShown(true)
        // 3 — the title. The music swells, then cuts on the last frame. (2.5 s, was 4.2 — the faster awaken.)
        if (!skipped.current) {
          setStep("title"); musicTo(0.6, 1200)
          await wait(2500); guard()
          music.current?.pause()
          await wait(400); guard()
        }
      }

      // 5 — back into the dark: the music returns, "let's see what you kept", then the real roll.
      //     (Cinematics off, or skipped: the still line stands in for the whole show.)
      // The Act I card always plays (Sam, 2026-10-25: "Always, even in saved games, play the ACT 1 cinematic location
      // screen unless it is already queued to play"). The show above carries it; with Cinematics off it was not
      // queued, so it plays here on its own, before the roll.
      if (!show){ setStep("title"); await sleep(ACT_CARD_MS); guard() }
      setSkipShown(false)
      // THE ROLL BEAT CANNOT STALL (Sam, 2026-11-10: "Stalling on playerside with awaken. Requires refreshing it" —
      // his screenshot is this beat: black, no Skip, no card). It was the one beat with no ceiling, and it listened
      // for the card's answer only AFTER Malachar's "let's see what you kept" line had finished, while the card was
      // already on screen and able to answer during it; an answer in that window fell on a no-op and the show then
      // waited for ever on a black screen. Now the answer is listened for before the card exists, and the beat has
      // a ceiling like every other: past it the show goes on to the gate without a roll.
      const answered = new Promise<boolean>((res) => { rollDone.current = res })
      const hurry = everSkipped.current
      setQuickRoll(hurry)
      setStep("roll")
      music.current?.pause()
      const showWasSkipped = skipped.current
      rearmSkip()
      if (hurry) {
        // Skip means skip: the bed under the roll, and the card straight away.
        musicIn(30, 0.35, 1200)
      } else if (show && !showWasSkipped) {
        musicIn(30, 0.45, 2500)
        await wait(600); guard()
        setCrawl({ text: PREROLL_TEXT, seconds: 6 + 5, key: 2 })
        await playClip(`${MEDIA}/lich-preroll.mp3`); guard()
        setCrawl(null)
      } else {
        // The bed still plays under the roll when the score is allowed; only the show is gone.
        musicIn(30, 0.35, 2500)
        setCaption(STILL_TEXT)
        await sleep(2600); guard()
        setCaption(null)
      }
      const rolled = (await within(answered, ROLL_BEAT_MS)) === true
      guard()
      if (!rolled) { goToPen(); return }

      // 6 — what you have: the laugh (his line on the result goes to the log).
      //     Skip here means straight to the pen; the roll already happened and the bag is written.
      setStep("result")
      setSkipShown(true)
      // No waiting on his narration here any more (Sam, 2026-11-13: the faster awaken). It used to hold a black
      // screen ~7 s for the model, then read a ~13 s recap of a result the dice card had already shown. His line
      // is still written — narrate() fires it into the shared log — it is just not read aloud over the black.
      if (show && !showWasSkipped && !hurry && !skipped.current) {
        setStep("laugh")
        const lv = laughVid.current
        if (lv) {
          lv.currentTime = 0; lv.volume = 1
          setLaughOn(true); musicTo(0.2, 600)
          await race(within(new Promise<void>((res) => {
            lv.addEventListener("ended", () => res(), { once: true })
            lv.addEventListener("error", () => res(), { once: true })
            lv.play().catch(() => res())
          }), CEILING.laugh))
          guard()
          setLaughOn(false)
        }
      }
      setSkipShown(false)
      const fast = hurry || skipped.current
      musicTo(0, fast ? 400 : 1800)
      await sleep(fast ? 300 : 1600); guard()

      // 7 — the pen.
      goToPen()
    }
    run().catch((e) => { if (!dead.current) console.error("[awaken]", e) })
  }, [seat, playClip, musicIn, musicTo, goToPen, race, wait, rearmSkip])

  const dark = step === "wake" || step === "tap" || step === "roll" || step === "result"

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-stone-200">
      <style>{`
        @keyframes awk-crawl { from { transform: translateX(-50%) rotateX(24deg) translateY(55%) } to { transform: translateX(-50%) rotateX(24deg) translateY(-130%) } }
        .awk-crawlbox { position: absolute; inset: 0; overflow: hidden; perspective: 420px; perspective-origin: 50% 30%; pointer-events: none;
          -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 18%, #000 92%, transparent 100%); mask-image: linear-gradient(to bottom, transparent 0%, #000 18%, #000 92%, transparent 100%); }
        .awk-crawl { position: absolute; left: 50%; bottom: 0; width: min(78%, 720px); transform-origin: 50% 100%; transform: translateX(-50%) rotateX(24deg) translateY(55%);
          font-family: var(--font-serif), serif; font-weight: 600; font-size: clamp(19px, 2.8vw, 32px); line-height: 1.5; letter-spacing: .04em; color: #b98cf0;
          text-shadow: 0 0 18px rgba(123,47,214,.55); text-align: center; text-wrap: balance; white-space: pre-line; animation: awk-crawl linear forwards; animation-duration: var(--dur, 40s); }
        .awk-face { position: absolute; inset: 0; opacity: 0; clip-path: ellipse(70% 0% at 50% 50%); transition: opacity .4s ease, clip-path 2.6s cubic-bezier(.3,0,.2,1); background: #000; }
        .awk-face.open { opacity: 1; clip-path: ellipse(120% 120% at 50% 50%); }
        .awk-face video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; object-position: center center; background: #000; opacity: 0; transition: opacity .35s ease; }
        .awk-face video.on { opacity: 1; }
        .awk-lich { position: absolute; inset: 0; opacity: 0; transition: opacity .9s ease; background: #000; }
        .awk-lich.on { opacity: 1; }
        .awk-lich video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 20%; }
        .awk-wake { position: absolute; inset: 0; overflow: hidden; background: #000; pointer-events: none; clip-path: ellipse(80% 0% at 50% 50%); transition: clip-path .55s cubic-bezier(.4,0,.6,1); }
        .awk-wake.half { clip-path: ellipse(80% 13% at 50% 50%); transition-duration: 1.1s; }
        .awk-wake.open { clip-path: ellipse(130% 130% at 50% 50%); transition-duration: 1.7s; }
        .awk-pen { position: absolute; left: 50%; top: 50%; width: max(100vw, calc(100vh * 1.7917)); aspect-ratio: 2752 / 1536; transform: translate(-50%, -50%) scale(1.06);
          background: #05030a center / cover no-repeat; filter: blur(16px) brightness(.45); transition: filter 2.3s ease, transform 6s ease-out; }
        .awk-wake.open .awk-pen { filter: blur(0) brightness(.92); transform: translate(-50%, -50%) scale(1); }
        .awk-wake::after { content: ""; position: absolute; inset: 0; box-shadow: inset 0 0 22vh 6vh #000; }
        .awk-say { position: absolute; left: 31%; top: 30%; transform: translate(-50%, -100%); max-width: min(300px, 60vw); background: #fffdf6; color: #14110f; border: 2.5px solid #14110f;
          border-radius: 48% 52% 50% 50% / 46% 48% 52% 54%; padding: 14px 24px 15px; text-align: center; font-family: "Comic Neue", "Comic Sans MS", sans-serif; font-weight: 700;
          font-size: clamp(15px, 1.5vw, 19px); line-height: 1.22; box-shadow: 4px 4px 0 rgba(0,0,0,.45); text-wrap: balance; animation: awk-pop .18s ease-out; }
        .awk-say b { display: block; font-family: "Bangers", "Impact", sans-serif; font-weight: 400; font-size: .92em; letter-spacing: .06em; color: #8a1f12; margin-bottom: 2px; }
        .awk-say .elv { font-style: italic; letter-spacing: .05em; color: #5a2a7a; }
        .awk-say::before, .awk-say::after { content: ""; position: absolute; left: 50%; width: 0; height: 0; border-style: solid; transform: skewX(-8deg); transform-origin: top; }
        .awk-say::before { bottom: -66px; margin-left: -11px; border-width: 66px 6px 0 9px; border-color: #14110f transparent transparent transparent; }
        .awk-say::after { bottom: -58px; margin-left: -7px; border-width: 60px 3px 0 6px; border-color: #fffdf6 transparent transparent transparent; }
        @keyframes awk-pop { from { transform: translate(-50%, -100%) scale(.7); opacity: 0 } to { transform: translate(-50%, -100%) scale(1); opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { .awk-wake, .awk-pen { transition: none; } .awk-crawl { animation: none; transform: translateX(-50%) translateY(-20%); } .awk-face { transition: opacity .4s ease; } }
      `}</style>
      <MusicToggle />

      {/* the bed and the voices */}
      <audio ref={music} preload="auto" src={`${MEDIA}/dark-and-stormy.mp3`} />
      <audio ref={clip} preload="auto" />

      {/* a forged hero's own intro film — step 0 */}
      <div className={`awk-lich${filmOn ? " on" : ""}`} aria-hidden={!filmOn}>
        <video ref={filmVid} playsInline preload="auto" style={{ objectFit: "contain", objectPosition: "center center" }} />
      </div>

      {/* the lich, for the laugh */}
      <div className={`awk-lich${laughOn ? " on" : ""}`} aria-hidden={!laughOn}>
        <video ref={laughVid} playsInline preload="auto" src={`${MEDIA}/lich-laugh.mp4`} />
      </div>

      {/* the wake beat: the pen through opening eyes, and Ilvara's one line in the pen's own balloon */}
      {eyes && (
        <div className={`awk-wake ${eyes}`} aria-hidden={!penLine}>
          <link rel="stylesheet" precedence="default" href="https://fonts.googleapis.com/css2?family=Comic+Neue:wght@700&family=Bangers&display=swap" />
          <div className="awk-pen" style={{ backgroundImage: `url(${PEN_ART})` }}>
            {penLine && (
              <div className="awk-say" aria-live="polite">
                <b>{penLine.understood ? "Ilvara" : `Ilvara · in ${ILVARA_TONGUE}`}</b>
                <span className={penLine.understood ? undefined : "elv"}>{penLine.text}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Malachar's words */}
      {crawl && (
        <div className="awk-crawlbox" aria-live="polite">
          <div key={crawl.key} className="awk-crawl" style={{ "--dur": `${crawl.seconds}s` } as React.CSSProperties}>{crawl.text}</div>
        </div>
      )}

      {/* the title card */}
      <div className={`pointer-events-none absolute inset-0 grid place-items-center bg-black transition-opacity duration-[1200ms] ${step === "title" || step === "act" ? "opacity-100" : "opacity-0"}`}>
        <div className="text-center px-6">
          <div className="text-[12px] uppercase tracking-[0.5em] text-[#8a6a3a]">Act I</div>
          <h1 className="mt-3 font-serif text-[clamp(26px,5vw,56px)] tracking-[0.14em] text-[#c9a868]">Awakening into the Nightmare</h1>
        </div>
      </div>

      <DiceProvider>
        {step === "roll" && seat && (
          <FortuneRoll
            characterId={seat.id}
            claimToken={seat.token}
            characterName={seat.name}
            onNarrate={narrate}
            onDismiss={(rolled) => rollDone.current(rolled)}
            autoRollMs={quickRoll ? QUICK_ROLL_MS : AUTO_ROLL_MS}
            autoDismissMs={quickRoll ? QUICK_DISMISS_MS : AUTO_DISMISS_MS}
          />
        )}
      </DiceProvider>

      <div className="relative mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-6 py-14 text-center">
        {step === "seat" && <div className="text-[11px] uppercase tracking-[0.4em] text-stone-600">Finding your seat…</div>}
        {step === "tap" && <div className="animate-pulse text-[11px] uppercase tracking-[0.4em] text-stone-500">Tap to wake</div>}
        {caption && dark && <div className="whitespace-pre-line font-serif text-xl leading-relaxed text-[#cfd8e6] [text-wrap:balance]">{caption}</div>}
        {step === "act" && <ActCard onDone={goToPen} musicIn={musicIn} />}
        {step === "gate" && <EntryGate who={door} onGo={stepThrough} />}
      </div>

      {/* Skip — up for the whole show, re-armed for the aftermath. Never shown over the roll. */}
      {skipShown && (
        <button
          type="button"
          onClick={skip}
          className="fixed bottom-6 right-8 z-50 rounded-sm border border-[#8a6a3a]/50 bg-black/50 px-4 py-2 text-[11px] uppercase tracking-[0.3em] text-stone-400 backdrop-blur-sm transition-colors hover:border-[#c9a868] hover:text-[#e8c56a]"
        >
          Skip ▸
        </button>
      )}
    </div>
  )
}

/** A saved game (fortune already rolled this run): the Act I card on its own, the score swelling under it, then the pen. */
function ActCard({ onDone, musicIn }: { onDone: () => void; musicIn: (at: number, vol: number, ms: number) => void }) {
  useEffect(() => {
    musicIn(0, 0.5, 1200)
    const t = window.setTimeout(onDone, ACT_CARD_MS)
    return () => window.clearTimeout(t)
  }, [onDone, musicIn])
  return null
}
