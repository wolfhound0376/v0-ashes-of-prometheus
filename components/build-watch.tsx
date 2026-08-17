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
// Deliberately NOT an auto-reload. Reloading the page out from under someone
// mid-sentence at a live table is worse than the problem. The player decides.
//
// Mounted once in app/layout.tsx, so it covers the dashboard, /join, /intro,
// /forge — everything.
// ============================================================================

import { useCallback, useEffect, useState } from "react"

/** How often to ask, in ms. Cheap: a few bytes, no database, no AI. */
const POLL_MS = 60_000

/** This tab's own build, frozen at the moment it was compiled. */
const MY_BUILD = process.env.NEXT_PUBLIC_BUILD_ID || "dev"

export function BuildWatch() {
  const [liveBuild, setLiveBuild] = useState<string | null>(null)

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/version", { cache: "no-store" })
      if (!res.ok) return
      const data = (await res.json()) as { buildId?: unknown }
      if (typeof data?.buildId === "string" && data.buildId) setLiveBuild(data.buildId)
    } catch {
      // Offline, asleep, flaky hotel wifi — say nothing. A false "you are out
      // of date" during a session is worse than staying quiet.
    }
  }, [])

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

  // Quiet in development (both sides report "dev"), quiet before the first
  // successful check, quiet when the builds agree.
  const stale = Boolean(liveBuild) && liveBuild !== MY_BUILD && MY_BUILD !== "dev"
  if (!stale) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-3 rounded-sm border border-[#a88745] bg-gradient-to-b from-[#241a08] to-[#12100b] px-4 py-2.5 shadow-[0_0_30px_rgba(0,0,0,0.6)]"
    >
      <span className="font-serif text-[11px] tracking-wide text-[#ead39e]">
        A newer version of the table is live.
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
