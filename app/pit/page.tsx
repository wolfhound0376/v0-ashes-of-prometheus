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
//   - THE PIT, TOGETHER (Sam, 2026-11-20: "Fifi and Kenta playing together were not synced. We played different
//     instances."): with two or more heroes this page joins the table's realtime channel (lib/pit.ts pitChannel) and
//     relays the frame's messages over it. Presence decides which screen runs the fight (pitRoles); the frame does
//     the rest (public/pit-arena: THE PIT, TOGETHER). Alone, or trying it as the host, nothing is shared.
//
// Not here yet: XP for the fight (the pilot showed a card; Sam has not ruled on the numbers), heroes without
// Pit art (Lynkes, Gandalf, Kingasaur, forged heroes).

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { fadeOutThemeAudio } from "@/components/theme-audio"
import { isMusicOff } from "@/lib/audio-prefs"
import { cinematicsOn } from "@/lib/settings"
import { PIT_DONE_KEY, pitChannel, pitDoneFor, pitParty, pitRoles, pitSrc, pitTryParty, type PitHero, type PitMember } from "@/lib/pit"
import { createClient } from "@/lib/supabase/client"

const AWAKEN = "/awaken"
/** How long the framed game has to say it loaded before the hero is sent on without it. */
const READY_CEILING_MS = 25000

/** `net`: this screen shares one fight with the rest of the table over this channel. */
type Plan = { src: string; done: string | null; after: string; net?: { channel: string; me: PitHero; party: PitHero[] } }

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
        const session = typeof table?.state?.session === "number" ? table.state.session : null
        const net = party.length > 1 ? { channel: pitChannel(run, session), me: me as PitHero, party } : undefined
        setPlan({ src: pitSrc(me as PitHero, party, { film, sound: snd, net: Boolean(net) }), done, after: AWAKEN, net })
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

  // THE PIT, TOGETHER: one channel for the table's fight. This page only carries messages and says who runs it.
  useEffect(() => {
    const net = plan?.net
    if (!net) return
    const supabase = createClient()
    const at = Date.now()
    const tell = (m: unknown) => frame.current?.contentWindow?.postMessage(m, window.location.origin)
    let last = ""
    const channel = supabase.channel(net.channel, { config: { broadcast: { self: false, ack: false }, presence: { key: `${net.me}:${at}` } } })
    const roles = () => {
      const state = channel.presenceState() as Record<string, PitMember[]>
      const r = pitRoles(Object.values(state).flat(), net.party, net.me)
      if (!r.role) return
      const sig = `${r.role}|${r.present.join(",")}`
      if (sig !== last) console.info(`[pit] ${r.role}, here: ${r.present.join(", ")}`)
      last = sig
      tell({ aop: "pitnet", role: r.role, present: r.present })
    }
    channel
      .on("broadcast", { event: "pit" }, ({ payload }: { payload: unknown }) => tell({ aop: "pitnet", msg: payload }))
      .on("presence", { event: "sync" }, roles)
      .subscribe((status: string) => { if (status === "SUBSCRIBED") void channel.track({ key: net.me, at }) })
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return
      const d = e.data as { aop?: string; send?: unknown; ready?: number } | null
      if (d?.aop === "pitnet" && d.send) void channel.send({ type: "broadcast", event: "pit", payload: d.send })
      if (d?.aop === "pit" && d.ready) roles()   // the frame has loaded: tell it again who runs the fight
    }
    window.addEventListener("message", onMsg)
    const again = window.setInterval(roles, 5000)
    return () => { window.removeEventListener("message", onMsg); window.clearInterval(again); void supabase.removeChannel(channel) }
  }, [plan])

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
