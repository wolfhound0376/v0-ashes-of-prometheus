"use client"

// /pit — THE PIT, the prologue. A new game starts here, before the awakening.
//
// Sam, 2026-11-16: a pixel arena fight that "begins BEFORE the heroes wake in the pen": the heroes are walked
// into a drow arena, Ilvara throws a dagger into the sand, and they fight prisoners, kuo-toa and a spider in
// real time. "The video sequence plays before the fight, fades into the pixel fight, then fades out into the
// Awakening." Win and you are knocked out and wake in the pen (/awaken). Lose and it is GAME OVER, and the
// fight starts over (nothing else has happened in the campaign yet, so starting over IS the Pit again).
//
// The fight is a self-contained canvas game served same-origin from /pit-arena/index.html (public/pit-arena/)
// inside an iframe, the way /cave frames public/cave-pov/, so it keeps its own loop, input and audio graph.
// This page only decides who is in it and where to go after. Rules: lib/pit.ts.
//
//   - /awaken sends a hero here first when lib/pit.ts pitComesFirst says so (new game, a hero with Pit art,
//     not yet won this run). Anyone else who lands here is passed straight on to /awaken.
//   - The frame says {aop:"pit", ready} when it has loaded and {aop:"pit", result:"won"} when the fight is won.
//   - NEVER STALLS (Sam, 2026-10-29, on /awaken): a frame that has not reported in READY_CEILING_MS is passed
//     over and the hero goes on to the awakening. A lost fight restarts inside the frame.
//   - The host (signed in with the DM code) gets "Skip the Pit", and can try it without a seat at
//     /pit?try=fifi,kenta (first name = the hero you play; back to the table afterwards).
//
// Not here yet: XP for the fight (the pilot showed a card; Sam has not ruled on the numbers), heroes without
// Pit art (Lynkes, Gandalf, Kingasaur, forged heroes), and any shared state between players' screens.

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { fadeOutThemeAudio } from "@/components/theme-audio"
import { isMusicOff } from "@/lib/audio-prefs"
import { cinematicsOn } from "@/lib/settings"
import { PIT_DONE_KEY, pitDoneFor, pitParty, pitSrc, pitTryParty, type PitHero } from "@/lib/pit"

const AWAKEN = "/awaken"
/** How long the framed game has to say it loaded before the hero is sent on without it. */
const READY_CEILING_MS = 25000

type Plan = { src: string; done: string | null; after: string }

export default function PitPage() {
  const router = useRouter()
  const frame = useRef<HTMLIFrameElement | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [sound, setSound] = useState(true)
  const [isDm, setIsDm] = useState(false)
  const left = useRef(false)

  const leave = useCallback((p: Plan | null, won: boolean) => {
    if (left.current) return
    left.current = true
    // Only a win (or the host's skip) marks the Pit done for this run; a frame that never loaded does too, so
    // a broken asset cannot send the same hero back here on every visit to /awaken.
    try { if (p?.done) window.localStorage.setItem(PIT_DONE_KEY, p.done) } catch { /* storage blocked */ }
    console.info(`[pit] ${won ? "won" : "passed over"} -> ${p?.after ?? AWAKEN}`)
    router.replace(p?.after ?? AWAKEN)
  }, [router])

  // Who is in the Pit.
  useEffect(() => {
    let live = true
    const film = cinematicsOn()
    const snd = !isMusicOff()
    setSound(snd)
    let role = ""
    try { role = window.localStorage.getItem("aop_access_role") ?? "" } catch { /* storage blocked */ }
    setIsDm(role === "dm")
    fadeOutThemeAudio()

    // The host trying it without a seat.
    const tryParty = role === "dm" ? pitTryParty(new URLSearchParams(window.location.search).get("try")) : null
    if (tryParty) {
      setPlan({ src: pitSrc(tryParty[0], tryParty, { film, sound: snd }), done: null, after: "/table" })
      return
    }

    let id = "", token = ""
    try { id = window.localStorage.getItem("aop_character_id") ?? ""; token = window.localStorage.getItem("aop_claim_token") ?? "" } catch { /* storage blocked */ }
    if (!id || !token) { router.replace("/join"); return }

    Promise.all([
      fetch(`/api/verify-claim`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ characterId: id, claimToken: token }) }).then((r) => r.json()),
      fetch(`/api/fortune-roll?characterId=${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch(`/api/table?characterId=${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ])
      .then(([claim, fortune, table]) => {
        if (!live) return
        if (!claim?.valid) { router.replace("/join"); return }
        if (table && !table.error && !(table.state?.status === "live" && table.mine)) { router.replace("/table"); return }
        const run: string | null = typeof table?.run === "string" ? table.run : null
        const rolled = Boolean(fortune?.rolled)
        const done = run ? pitDoneFor(run, typeof table?.state?.session === "number" ? table.state.session : null, id, rolled) : null
        const seats = Array.isArray(table?.seats) ? (table.seats as { id: string; name: string; away?: boolean }[]) : []
        const { me, party } = pitParty(id, claim?.character?.name, seats)
        // A saved game with nobody at the table owing the Pit, a hero the Pit cannot draw, or a run the table could
        // not name: straight to the awakening. A hero who has rolled goes in when the table goes (lib/pit.ts TOGETHER).
        if ((rolled && table?.pitDue !== true) || !me || !run) { leave({ src: "", done: rolled ? null : done, after: AWAKEN }, false); return }
        setPlan({ src: pitSrc(me as PitHero, party, { film, sound: snd }), done, after: AWAKEN })
      })
      .catch(() => router.replace("/join"))
    return () => { live = false }
  }, [router, leave])

  // What the frame tells us, and the ceiling on a frame that tells us nothing.
  useEffect(() => {
    if (!plan?.src) return
    let ready = false
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const d = e.data as { aop?: string; ready?: number; result?: string } | null
      if (!d || d.aop !== "pit") return
      if (d.ready) ready = true
      if (d.result === "won") leave(plan, true)
      if (d.result === "lost") console.info("[pit] lost; the fight starts over")
    }
    window.addEventListener("message", onMsg)
    const t = window.setTimeout(() => { if (!ready) leave(plan, false) }, READY_CEILING_MS)
    return () => { window.removeEventListener("message", onMsg); window.clearTimeout(t) }
  }, [plan, leave])

  const toggleSound = () => {
    const on = !sound
    setSound(on)
    frame.current?.contentWindow?.postMessage({ aop: "pit-sound", on }, window.location.origin)
  }

  return (
    <main className="relative flex h-dvh flex-col bg-[#07040b] text-stone-200">
      {plan?.src ? (
        <iframe
          ref={frame}
          src={plan.src}
          title="The Pit of Velkynvelve"
          className="min-h-0 w-full flex-1 border-0"
          allow="autoplay; fullscreen"
        />
      ) : (
        <div className="flex-1" />
      )}
      {plan?.src && (
        <div className="pointer-events-none absolute right-3 top-3 flex gap-2">
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={sound}
            className="pointer-events-auto border border-amber-700/50 bg-black/60 px-2.5 py-1 font-serif text-[11px] uppercase tracking-[0.16em] text-amber-300/90 hover:bg-amber-900/30"
          >
            Sound {sound ? "on" : "off"}
          </button>
          {isDm && (
            <button
              type="button"
              onClick={() => leave(plan, false)}
              className="pointer-events-auto border border-amber-700/50 bg-black/60 px-2.5 py-1 font-serif text-[11px] uppercase tracking-[0.16em] text-amber-300/90 hover:bg-amber-900/30"
            >
              Skip the Pit
            </button>
          )}
        </div>
      )}
    </main>
  )
}
