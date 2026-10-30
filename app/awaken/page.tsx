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
//   6. WHAT YOU HAVE Malachar narrates the actual result (handed to him as a direction, spoken through
//                    /api/tts in his own voice, shown as the same crawl) — then the lich cinematic
//                    surfaces out of the black and he laughs.
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
// narration of the result, and the voice for it. Already rolled this run: straight to the pen.
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
// SKIPPABLE (Sam, 2026-10-11: sitting through it every time is annoying; 2026-10-24: "an option to
// not have cinematics or intro scores"). A Skip button is up for the whole of the show; with
// Cinematics OFF in the settings (lib/settings.ts) the show is replaced by one still line and the
// page goes straight to the roll. The ROLL itself is never skipped — it is gameplay, and the bag
// depends on it. Intro music OFF keeps "Dark and Stormy" silent; the voices still speak.

import React, { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { DiceProvider } from "@/components/dice/dice-provider"
import { FortuneRoll } from "@/components/dashboard/fortune-roll"
import { useLich } from "@/lib/hooks/use-lich"
import { MusicToggle } from "@/components/music-toggle"
import { fadeOutThemeAudio } from "@/components/theme-audio"
import { isMusicOff, onMusicPrefChange } from "@/lib/audio-prefs"
import { cinematicsOn, introMusicOn, onSettingsChange } from "@/lib/settings"
import { sanitizeForTTS } from "@/lib/tts"
import { EntryGate } from "@/components/entry-gate"

const PEN_ROUTE = "/velkynvelve"
/** How long the Act I card holds when it plays on its own (a saved game, or Cinematics off). */
const ACT_CARD_MS = 4200
const MEDIA = "/awaken"
/** The NPC idle/talking loops the dashboard uses (public bucket). */
const LOOPS = "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/character-loops"

/** Malachar's dream speech — shared by every character (book facts, his phrasing). */
const DREAM_TEXT =
  "Captured by the drow.\nYou wouldn't wish it on anyone — and yet, here you are.\n\n" +
  "A dark cave. The cold weight of iron at your throat, at your wrists. And a priestess who calls herself " +
  "Mistress Ilvara of House Mizzrym, telling you, scourge in hand, that your life belongs to her now.\n\n" +
  "“Accept your fate. Learn to obey. And you may survive.”"
const PREROLL_TEXT = "They stripped you to your underclothes.\nBut the drow count bolts, not pockets.\n\nLet's see what you kept."
/** The still line that stands in for the whole show when Cinematics is off (his words, cut to one card). */
const STILL_TEXT = "Captured by the drow. A collar at your throat, a priestess who says your life is hers now.\n\nLet's see what you kept."

/** Per-character pieces, keyed by the character's first name (lower-case). Anyone else: the shared speech alone. */
const PCS: Record<string, { hook: string }> = {
  fifi: { hook: "Sleep, little thief. You came all this way for an orc. Wait until you see who's in the next cage." },
  kenta: { hook: "A merchant's son, praying to the god of the dead. How practical. Kelemvor is not listening down here. I am." },
  samson: { hook: "Your sun doesn't rise down here, priest. But do keep reading omens. I'll be writing them." },
  scott: { hook: "Save your voice, bard. You'll want it for the screaming. Or the encore. We'll see which." },
}

const WAKERS = [
  { key: "jimjar", loop: "jimjar" },
  { key: "eldeth", loop: "eldeth" },
  { key: "derendil", loop: "prince_derendil" },
] as const
type WakerKey = (typeof WAKERS)[number]["key"]

type Step = "seat" | "tap" | "film" | "where" | "dream" | "title" | "waker" | "roll" | "result" | "laugh" | "act" | "gate"

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

/** The longest any one beat may hold the show (ms). A beat that runs past it is passed over. */
const CEILING = {
  tap: 5000,        // the browser wants a gesture for sound: carry on silently after this
  where: 10000,     // "Where am I?"
  clip: 60000,      // one voice clip (the dream is the longest, ~40 s)
  film: 150000,     // a hero film whose length the browser can't read
  narration: 15000, // Malachar writing his line about the roll
  meta: 4000,       // learning how long his voice runs
  laugh: 15000,
} as const
const AUTO_ROLL_MS = 30000
const AUTO_DISMISS_MS = 10000

/** Resolves when p does, or after ms — whichever is first. */
const within = <T,>(p: Promise<T>, ms: number): Promise<T | void> => Promise.race([p, sleep(ms)])

function pcKeyFor(name: string | null): string | null {
  const first = (name || "").trim().split(/\s+/)[0]?.toLowerCase()
  return first && PCS[first] ? first : null
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
  const { sendMessage } = useLich("abyss")

  const started = useRef(false)
  const dead = useRef(false)
  // Skip: pressed once, it wins every wait in the show (sleep, clip, video) from then on. The
  // sequence checks it between beats and jumps to the roll (or, past the roll, to the pen).
  const skipped = useRef(false)
  const skipResolve = useRef<() => void>(() => {})
  const skipP = useRef<Promise<void>>(new Promise<void>((r) => { skipResolve.current = r }))
  const music = useRef<HTMLAudioElement>(null)
  const clip = useRef<HTMLAudioElement>(null)
  const idleVid = useRef<HTMLVideoElement>(null)
  const talkVid = useRef<HTMLVideoElement>(null)
  const laughVid = useRef<HTMLVideoElement>(null)
  const filmVid = useRef<HTMLVideoElement>(null)
  // Malachar's narration of the roll: text + his voice, fetched while the result card is still up.
  const narration = useRef<Promise<{ text: string; audio: string | null }> | null>(null)
  const rollDone = useRef<(rolled: boolean) => void>(() => {})

  useEffect(() => () => { dead.current = true }, [])

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

  const playClip = useCallback(async (src: string): Promise<void> => {
    const a = clip.current
    if (!a || dead.current || skipped.current) return
    a.src = src
    a.currentTime = 0
    await race(within(new Promise<void>((res) => {
      const done = () => { a.removeEventListener("ended", done); a.removeEventListener("error", done); res() }
      a.addEventListener("ended", done)
      a.addEventListener("error", done)
      a.play().catch(done)
    }), CEILING.clip))
    if (skipped.current || !a.ended) { a.pause() }
  }, [race])

  const skip = useCallback(() => {
    if (skipped.current) return
    skipped.current = true
    setSkipShown(false)
    skipResolve.current()
    try { clip.current?.pause() } catch { /* nothing playing */ }
    try { laughVid.current?.pause() } catch { /* nothing playing */ }
    try { filmVid.current?.pause() } catch { /* nothing playing */ }
    setCrawl(null); setCaption(null); setFaceOpen(false); setTalking(false); setLaughOn(false); setFilmOn(false)
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
    narration.current = (async () => {
      let text = ""
      try {
        const res = await sendMessage(direction, seat.id, seat.token, { director: true })
        text = (res?.text ?? "").trim()
      } catch (e) {
        console.error("[awaken] narration failed:", e)
      }
      const spoken = sanitizeForTTS(text)
      let audio: string | null = null
      if (spoken) {
        try {
          const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: spoken, voice: "onyx" }) })
          if (r.ok) audio = URL.createObjectURL(await r.blob())
        } catch (e) {
          console.error("[awaken] his voice failed:", e)
        }
      }
      return { text: spoken, audio }
    })()
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
    const pcKey = pcKeyFor(seat.name)
    const w = pickWaker()
    setWaker(w)
    const guard = () => { if (dead.current) throw new Error("left") }

    const show = cinematicsOn()

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
          // Skip on the film skips the film only: the dream and the waker still play.
          if (skipped.current) rearmSkip()
          setSkipShown(show)
          await wait(900); guard()
        }
      }

      if (show) {
        setSkipShown(true)

        // 1 — black. The character's voice. (A page loaded cold has no gesture yet: if the browser
        //     refuses the first sound, ask for one tap and start again from the top.)
        setStep("where")
        await wait(1400); guard()
        if (pcKey && !skipped.current) {
          const a = clip.current!
          a.src = `${MEDIA}/where-${pcKey}.mp3`
          try { await within(a.play(), CEILING.tap) } catch {
            setStep("tap")
            await race(within(new Promise<void>((res) => window.addEventListener("pointerdown", () => res(), { once: true })), CEILING.tap))
            guard(); setStep("where"); await wait(600)
            // Still no sound allowed: show the line instead of saying it, and carry on.
            if (!skipped.current) await within(a.play(), CEILING.tap).catch(() => setCaption("…where am I?"))
          }
          await race(within(new Promise<void>((res) => { if (a.ended || a.paused) return res(); a.addEventListener("ended", () => res(), { once: true }) }), CEILING.where))
          if (skipped.current || !a.ended) a.pause()
          setCaption(null)
        } else if (!skipped.current) {
          setCaption("…where am I?"); await wait(2200); setCaption(null)
        }
        await wait(1400); guard()

        // 2 — the dream. Dark and Stormy in under him; his words as the crawl.
        if (!skipped.current) {
          setStep("dream")
          musicIn(0, 0.45, 4000)
          const hook = pcKey ? PCS[pcKey].hook : null
          const dreamSeconds = 22 + (hook ? 9 : 0) + 6
          setCrawl({ text: DREAM_TEXT + (hook ? `\n\n${hook}` : ""), seconds: dreamSeconds, key: 1 })
          await playClip(`${MEDIA}/lich-dream.mp3`); guard()
          if (pcKey) { await wait(500); await playClip(`${MEDIA}/hook-${pcKey}.mp3`); guard() }
          await wait(1200); setCrawl(null)
        }

        // 3 — the title. The music swells, then cuts on the last frame.
        if (!skipped.current) {
          setStep("title"); musicTo(0.6, 1500)
          await wait(4200); guard()
          music.current?.pause()
          setStep("waker")
          await wait(700); guard()
        }

        // 4 — the waker. Eyes open on the idle loop; the talking loop takes the line.
        if (!skipped.current) {
          idleVid.current?.play().catch(() => {})
          await wait(250)
          setFaceOpen(true)
          await wait(2800); guard()
          talkVid.current?.play().catch(() => {})
          setTalking(true)
          await playClip(`${MEDIA}/wake-${w}.mp3`); guard()
          setTalking(false); talkVid.current?.pause()
          await wait(1200)
          setFaceOpen(false)
          await wait(1200); guard()
          idleVid.current?.pause()
        }
      }

      // 5 — back into the dark: the music returns, "let's see what you kept", then the real roll.
      //     (Cinematics off, or skipped: the still line stands in for the whole show.)
      // The Act I card always plays (Sam, 2026-10-25: "Always, even in saved games, play the ACT 1 cinematic location
      // screen unless it is already queued to play"). The show above carries it; with Cinematics off it was not
      // queued, so it plays here on its own, before the roll.
      if (!show){ setStep("title"); await sleep(ACT_CARD_MS); guard() }
      setSkipShown(false)
      setStep("roll")
      music.current?.pause()
      const showWasSkipped = skipped.current
      rearmSkip()
      if (show && !showWasSkipped) {
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
      const rolled = await new Promise<boolean>((res) => { rollDone.current = res })
      guard()
      if (!rolled) { goToPen(); return }

      // 6 — what you have: his narration of the actual result, in his voice, then the laugh.
      //     Skip here means straight to the pen; the roll already happened and the bag is written.
      setStep("result")
      setSkipShown(true)
      // His narration is a live model call plus a voice: if it hasn't come back in time, he says nothing.
      const said = narration.current ? await race(within(narration.current, CEILING.narration)) : { text: "", audio: null }
      guard()
      if (said && said.text && !skipped.current) {
        if (said.audio) {
          // His voice: learn how long it runs so the crawl keeps pace with him.
          const a = clip.current!
          a.src = said.audio
          await race(within(new Promise<void>((res) => {
            a.addEventListener("loadedmetadata", () => res(), { once: true })
            a.addEventListener("error", () => res(), { once: true })
            a.load()
          }), CEILING.meta))
          const seconds = isFinite(a.duration) && a.duration > 0 ? a.duration : 20
          if (show) setCrawl({ text: said.text, seconds: seconds + 5, key: 3 })
          else setCaption(said.text)
          await race(within(new Promise<void>((res) => {
            a.addEventListener("ended", () => res(), { once: true })
            a.addEventListener("error", () => res(), { once: true })
            a.play().catch(() => res())
          }), seconds * 1000 + 4000))
          if (skipped.current || !a.ended) a.pause()
          URL.revokeObjectURL(said.audio)
        } else {
          const seconds = Math.max(8, said.text.length / 14)
          if (show) setCrawl({ text: said.text, seconds: seconds + 5, key: 3 })
          else setCaption(said.text)
          await wait(seconds * 1000)
        }
        guard()
        await wait(800); setCrawl(null); setCaption(null); await wait(300)
      }
      if (show && !showWasSkipped && !skipped.current) {
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
      musicTo(0, skipped.current ? 400 : 1800)
      await sleep(skipped.current ? 300 : 1600); guard()

      // 7 — the pen.
      goToPen()
    }
    run().catch((e) => { if (!dead.current) console.error("[awaken]", e) })
  }, [seat, playClip, musicIn, musicTo, goToPen, race, wait, rearmSkip])

  const wakerLoop = waker ? WAKERS.find((x) => x.key === waker)!.loop : null
  const dark = step === "where" || step === "dream" || step === "tap" || step === "roll" || step === "result"

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-stone-200">
      <style>{`
        @keyframes awk-crawl { from { transform: translateX(-50%) rotateX(24deg) translateY(100%) } to { transform: translateX(-50%) rotateX(24deg) translateY(-130%) } }
        .awk-crawlbox { position: absolute; inset: 0; overflow: hidden; perspective: 420px; perspective-origin: 50% 30%; pointer-events: none;
          -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 18%, #000 92%, transparent 100%); mask-image: linear-gradient(to bottom, transparent 0%, #000 18%, #000 92%, transparent 100%); }
        .awk-crawl { position: absolute; left: 50%; bottom: 0; width: min(78%, 720px); transform-origin: 50% 100%; transform: translateX(-50%) rotateX(24deg) translateY(100%);
          font-family: var(--font-serif), serif; font-weight: 600; font-size: clamp(19px, 2.8vw, 32px); line-height: 1.5; letter-spacing: .04em; color: #b98cf0;
          text-shadow: 0 0 18px rgba(123,47,214,.55); text-align: center; text-wrap: balance; white-space: pre-line; animation: awk-crawl linear forwards; animation-duration: var(--dur, 40s); }
        .awk-face { position: absolute; inset: 0; opacity: 0; clip-path: ellipse(70% 0% at 50% 50%); transition: opacity .4s ease, clip-path 2.6s cubic-bezier(.3,0,.2,1); background: #000; }
        .awk-face.open { opacity: 1; clip-path: ellipse(120% 120% at 50% 50%); }
        .awk-face video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; object-position: center center; background: #000; opacity: 0; transition: opacity .35s ease; }
        .awk-face video.on { opacity: 1; }
        .awk-lich { position: absolute; inset: 0; opacity: 0; transition: opacity .9s ease; background: #000; }
        .awk-lich.on { opacity: 1; }
        .awk-lich video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 20%; }
        @media (prefers-reduced-motion: reduce) { .awk-crawl { animation: none; transform: translateX(-50%) translateY(-20%); } .awk-face { transition: opacity .4s ease; } }
      `}</style>
      <MusicToggle />

      {/* the bed and the voices */}
      <audio ref={music} preload="auto" src={`${MEDIA}/dark-and-stormy.mp3`} />
      <audio ref={clip} preload="auto" />

      {/* the waker's face */}
      <div className={`awk-face${faceOpen ? " open" : ""}`} aria-hidden={!faceOpen}>
        {wakerLoop && (
          <>
            <video ref={idleVid} className={talking ? "" : "on"} muted loop playsInline preload="auto" src={`${LOOPS}/${wakerLoop}_idle.webm`} />
            <video ref={talkVid} className={talking ? "on" : ""} muted loop playsInline preload="auto" src={`${LOOPS}/${wakerLoop}_talking.webm`} />
          </>
        )}
      </div>

      {/* a forged hero's own intro film — step 0 */}
      <div className={`awk-lich${filmOn ? " on" : ""}`} aria-hidden={!filmOn}>
        <video ref={filmVid} playsInline preload="auto" style={{ objectFit: "contain", objectPosition: "center center" }} />
      </div>

      {/* the lich, for the laugh */}
      <div className={`awk-lich${laughOn ? " on" : ""}`} aria-hidden={!laughOn}>
        <video ref={laughVid} playsInline preload="auto" src={`${MEDIA}/lich-laugh.mp4`} />
      </div>

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
            autoRollMs={AUTO_ROLL_MS}
            autoDismissMs={AUTO_DISMISS_MS}
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
