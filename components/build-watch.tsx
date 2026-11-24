"use client"

// ============================================================================
// BUILD WATCH — tells a stale tab that it is stale.
//
// A browser keeps whatever JavaScript it loaded until something makes it let
// go. Nothing in this app ever did. On 17 Aug a player was hunting for voice
// toggles that her cached bundle had been built before — the buttons existed
// in main, on production, and on every screen at the table except hers, and
// there was no signal anywhere that her copy was months behind.
//
// So: the bundle knows its own build id (baked in by next.config.mjs at build
// time). This asks the server what build production is serving now. Different
// answer means this tab is running old code, and it says so.
//
// Mid-scene it is still NOT an auto-reload: reloading the page out from under
// someone mid-sentence at a live table is worse than the problem, so the
// player decides. But at a SAFE MOMENT — the title, the table, the room-code
// page, the hero chooser, the code door, nobody typing — the tab now refreshes
// itself, once per new build (Sam, 2026-11-23, "fix cache memory"; the rule is
// lib/safe-reload.ts). A tab that sat through a deploy mid-scene catches up the
// moment it next reaches the table or the title.
//
// The framed games (the map, the Pit, the cave, the road) are static pages in
// public/. Vercel serves those "public, max-age=0, must-revalidate", so every
// reload of the page around them fetches them fresh: this one watch covers them.
//
// Mounted once in app/layout.tsx, so it covers the dashboard, /join, /intro,
// /forge — everything.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { isSafeMoment, isTyping, momentDecision, reloadDecision, RELOADED_FOR_KEY } from "@/lib/safe-reload"

/** How often to ask, in ms. Cheap: a few bytes, no database, no AI. */
const POLL_MS = 60_000

/** This tab's own build, frozen at the moment it was compiled. */
const MY_BUILD = process.env.NEXT_PUBLIC_BUILD_ID || "dev"

export function BuildWatch() {
  const [liveBuild, setLiveBuild] = useState<string | null>(null)
  const pathname = usePathname()
  const [tick, setTick] = useState(0)

  const liveRef = useRef<string | null>(null)
  const [updating, setUpdating] = useState(false)

  const check = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/version", { cache: "no-store" })
      if (!res.ok) return liveRef.current
      const data = (await res.json()) as { buildId?: unknown }
      if (typeof data?.buildId === "string" && data.buildId) { liveRef.current = data.buildId; setLiveBuild(data.buildId) }
    } catch {
      // Offline, asleep, flaky hotel wifi — say nothing. A false "you are out
      // of date" during a session is worse than staying quiet.
    }
    return liveRef.current
  }, [])

  // THE MAP'S SAFE MOMENT (lib/safe-reload.ts): the map, in its frame, says the party has just walked onto another
  // plate with nothing in hand. A stale tab asks once more what is live, and catches up then, once per build.
  useEffect(() => {
    let going = false
    const onMessage = (e: MessageEvent) => {
      if (going || e.origin !== window.location.origin || !isSafeMoment(e.data)) return
      void (async () => {
        const live = await check()
        let reloadedFor: string | null = null
        try { reloadedFor = sessionStorage.getItem(RELOADED_FOR_KEY) } catch { return }   // no loop guard, no self-reload: the notice stays
        if (going || !live || momentDecision({ mine: MY_BUILD, live, reloadedFor }) !== "reload") return
        going = true
        try { sessionStorage.setItem(RELOADED_FOR_KEY, live) } catch { going = false; return }
        setUpdating(true)
        window.setTimeout(() => window.location.reload(), 350)   // the dark card is up before the page goes
      })()
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [check])

  useEffect(() => {
    void check()
    const timer = setInterval(() => void check(), POLL_MS)
    // Phones suspend timers when the screen locks. A player who pockets their
    // phone during someone else's turn gets a fresh check the moment they look
    // back at it — which is exactly when a mid-session deploy would land.
    const onFocus = () => void check()
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
    }
  }, [check])

  // At a safe moment, refresh by ourselves (lib/safe-reload.ts). Someone typing
  // on a safe page is asked again every few seconds until they stop.
  const [decision, setDecision] = useState<"none" | "reload" | "wait" | "notice">("none")
  useEffect(() => {
    let reloadedFor: string | null = null
    try { reloadedFor = sessionStorage.getItem(RELOADED_FOR_KEY) } catch { /* blocked storage: no loop guard, the notice still works */ }
    const d = reloadDecision({ mine: MY_BUILD, live: liveBuild, pathname, typing: isTyping(document.activeElement as HTMLElement | null), reloadedFor })
    setDecision(d)
    if (d === "reload" && liveBuild) {
      try { sessionStorage.setItem(RELOADED_FOR_KEY, liveBuild) } catch { /* see above */ }
      window.location.reload()
      return
    }
    if (d === "wait") {
      const t = setTimeout(() => setTick((n) => n + 1), 4000)
      return () => clearTimeout(t)
    }
  }, [liveBuild, pathname, tick])

  // Quiet in development (both sides report "dev"), quiet before the first
  // successful check, quiet when the builds agree — and quiet while a safe page
  // is about to refresh itself.
  if (updating) return (
    <div role="status" aria-live="polite" className="fixed inset-0 z-[300] grid place-items-center bg-[#050403]">
      <span className="font-serif text-[12px] uppercase tracking-[0.4em] text-[#c9a868]">Updating the game…</span>
    </div>
  )
  if (decision !== "notice") return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-3 rounded-sm border border-[#a88745] bg-gradient-to-b from-[#241a08] to-[#12100b] px-4 py-2.5 shadow-[0_0_30px_rgba(0,0,0,0.6)]"
    >
      <span className="font-serif text-[11px] tracking-wide text-[#ead39e]">
        A newer version of the table is live. It updates itself as you next walk to another area.
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-sm border border-[#a88745] bg-[#1c1408] px-3 py-1 font-serif text-[10px] uppercase tracking-[0.18em] text-[#f0cd7a] transition-colors hover:border-[#f4e0a8] hover:text-[#fff3cf]"
      >
        Refresh
      </button>
      <span className="font-mono text-[9px] text-[#6d6450]" title="this tab → production">
        {MY_BUILD} → {liveBuild}
      </span>
    </div>
  )
}

/**
 * The quiet version: just the build id, for putting somewhere you can read it
 * off a player's screen over the phone. No polling, no banner.
 */
export function BuildStamp({ className }: { className?: string }) {
  return (
    <span className={className} title="Build running in this browser">
      build {MY_BUILD}
    </span>
  )
}
