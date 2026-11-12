"use client"

// /cinematics — the DM's films, one click away.
//
// Sam (2026-11-12): "I need an easier way to get to my cinematics." The catalogue lived four steps deep — the
// dashboard (which the DM does not use), DM Mode, the DM Assets drawer, then the last of nine tabs — and in a
// drawer a third of the screen wide. This is the same tab on its own page, full width, with its own address:
// bookmark it, or reach it from the "Cinematics" link in the DM's map header.
//
// Nothing here is new machinery. It is components/dashboard/dm-assets/cinematics-tab.tsx, unchanged, and every
// write still re-checks the DM code on the server. A browser without the code can look (the catalogue is
// public to read, as it is to the game) but cannot change anything; the strip at the top takes the code once.

import { useEffect, useState } from "react"
import { Clapperboard, Crown, Map as MapIcon } from "lucide-react"
import { CinematicsTab } from "@/components/dashboard/dm-assets/cinematics-tab"
import { hasDmKey, onDmKeyChange, setDmKey } from "@/lib/dm-key"

export default function CinematicsPage() {
  // Read after mount only: localStorage does not exist during server rendering.
  const [keySet, setKeySet] = useState(true)
  const [draft, setDraft] = useState("")
  // Remount the tab when the code arrives, so its history strip loads without a refresh.
  const [epoch, setEpoch] = useState(0)

  useEffect(() => {
    const sync = () => setKeySet(hasDmKey())
    sync()
    return onDmKeyChange(sync)
  }, [])

  const link = "inline-flex items-center gap-1.5 font-serif text-xs uppercase tracking-[0.18em] text-[#e8c56a] hover:text-[#fff3cf]"

  return (
    <main className="flex h-dvh flex-col bg-[radial-gradient(circle_at_top,#1d1509,#0a0806_65%)] text-stone-200">
      <header className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-[#3d3428] px-5 py-3">
        <h1 className="inline-flex items-center gap-2 font-serif text-lg tracking-wide text-[#c4a777]">
          <Clapperboard className="h-4 w-4" aria-hidden />
          Cinematics
        </h1>
        <p className="hidden min-w-0 flex-1 truncate text-[12px] text-stone-500 md:block">
          Every film, when it fires, who fires it, and what the game has been asking for.
        </p>
        <nav className="ml-auto flex items-center gap-5">
          <a href="/velkynvelve" className={link}><MapIcon className="h-3.5 w-3.5" aria-hidden />The Map</a>
          <a href="/table" className={link}><Crown className="h-3.5 w-3.5" aria-hidden />The Table</a>
        </nav>
      </header>

      {!keySet ? (
        <form
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-700/40 bg-amber-900/15 px-5 py-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!draft.trim()) return
            setDmKey(draft)
            setDraft("")
            setEpoch((n) => n + 1)
          }}
        >
          <label htmlFor="dm-code" className="text-[12px] text-amber-200">Looking only. Enter the DM code to edit films and see their history:</label>
          <input
            id="dm-code"
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoComplete="off"
            placeholder="the DM code"
            className="w-44 rounded-sm border border-[#7a5f33]/70 bg-black/60 px-2 py-1 font-mono text-sm text-stone-100 placeholder:text-stone-600 focus:border-[#c9a868] focus:outline-none"
          />
          <button type="submit" disabled={!draft.trim()} className="rounded-sm border border-[#c9a868] bg-[#c4a777]/12 px-3 py-1 text-[11px] uppercase tracking-wider text-[#f0dcae] hover:bg-[#c4a777]/20 disabled:opacity-50">
            Unlock
          </button>
        </form>
      ) : null}

      <div className="mx-auto flex min-h-0 w-full max-w-[1500px] flex-1 flex-col">
        <CinematicsTab key={epoch} />
      </div>
    </main>
  )
}
