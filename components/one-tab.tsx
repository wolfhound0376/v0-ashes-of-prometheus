"use client"

// One game tab per browser plays at a time; the newest wins (rules: lib/one-tab.ts). Mounted once in
// app/layout.tsx. Renders nothing until another tab takes over, then a card over this one.

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { ONE_TAB_CHANNEL, isOneTabPage, shouldStepAside, type OneTabMessage } from "@/lib/one-tab"

export function OneTab() {
  const pathname = usePathname()
  const [away, setAway] = useState(false)
  const chan = useRef<BroadcastChannel | null>(null)
  const tab = useRef<string>("")
  const playing = useRef(false)
  const awayNow = useRef(false)
  useEffect(() => { awayNow.current = away }, [away])

  // One channel for the life of the tab.
  useEffect(() => {
    try { if (window.top !== window) return } catch { return }
    if (typeof BroadcastChannel === "undefined") return
    tab.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const c = new BroadcastChannel(ONE_TAB_CHANNEL)
    c.onmessage = (e) => { if (playing.current && shouldStepAside(e.data, tab.current)) setAway(true) }
    chan.current = c
    return () => { c.close(); chan.current = null }
  }, [])

  // Arriving on a game page claims the browser for this tab (effects run in order, so the channel exists).
  // A tab that has stepped aside does NOT reclaim when its page changes under it (the session guard moving
  // it to /table, say): only its own "Play here" takes the browser back.
  useEffect(() => {
    const game = isOneTabPage(pathname, typeof window === "undefined" ? "" : window.location.search)
    playing.current = game
    if (!game) { setAway(false); return }
    if (awayNow.current) return
    chan.current?.postMessage({ type: "here", tab: tab.current } satisfies OneTabMessage)
  }, [pathname])

  if (!away) return null
  const playHere = () => {
    chan.current?.postMessage({ type: "here", tab: tab.current } satisfies OneTabMessage)
    setAway(false)
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="The game is open in another tab"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm"
    >
      <div className="mx-4 max-w-sm rounded-lg border border-amber-700/60 bg-[#14100c] px-8 py-7 text-center shadow-2xl">
        <p className="font-serif text-xl tracking-wide text-amber-200">Your hero is in another tab</p>
        <p className="mt-3 font-sans text-base text-stone-300">Only one window can play at a time.</p>
        <button
          type="button"
          onClick={playHere}
          className="mt-6 rounded border border-amber-500/70 bg-amber-900/40 px-6 py-2 font-serif tracking-wider text-amber-100 transition hover:bg-amber-800/60"
        >
          Play here
        </button>
      </div>
    </div>
  )
}
