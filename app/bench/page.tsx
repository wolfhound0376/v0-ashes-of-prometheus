"use client"

// /bench — the alchemy bench and nothing else. Sam, 2026-10-01: from the camp
// at the fire, "Clicking this button should open the alchemy bench directly",
// and the dashboard flashing up first "is unnecessary"; "Exiting out of the
// alchemy should take me straight to camp at the fire."
//
// So this page renders no dashboard at all: the bench, over its own dice. The
// character is this browser's own seat (localStorage, set by /join or a claim
// link, AGENTS.md §5), never sessions.active_character_id. The bench routes
// take that characterId exactly as they do from the dashboard.
//
// Leaving: the camp scene opened this page in a new tab, so closing the bench
// closes the tab and the player is back at the fire. A browser only lets a
// page close a tab it was opened into; if this page was reached any other way
// and the tab stays open, it falls back to the game's own Camp tab.

import { useEffect, useState } from "react"
import { DiceProvider } from "@/components/dice/dice-provider"
import { AlchemyBench } from "@/components/alchemy/alchemy-bench"

// The same keys app/page.tsx keeps the per-browser seat under.
const CHARACTER_LS_KEY = "aop_character_id"
const ROLE_LS_KEY = "aop_access_role"

function leave() {
  window.close()
  // Still here: this tab was not one a script may close.
  window.setTimeout(() => window.location.replace("/?view=compact&from=camp"), 250)
}

export default function BenchPage() {
  // undefined = not read yet; null = this browser has no player seat.
  const [characterId, setCharacterId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    try {
      const id = window.localStorage.getItem(CHARACTER_LS_KEY)
      const role = window.localStorage.getItem(ROLE_LS_KEY)
      setCharacterId(id && role !== "dm" ? id : null)
      // Coming from camp is not a new arrival: no intro ceremony on the way back.
      window.sessionStorage.setItem("aop_intro_seen", "1")
    } catch {
      setCharacterId(null)
    }
  }, [])

  if (characterId === undefined) return <div className="fixed inset-0 bg-[#070605]" />

  if (characterId === null) {
    return (
      <main className="fixed inset-0 flex items-center justify-center bg-[#070605] p-6 text-center text-stone-300">
        <div className="max-w-sm space-y-4">
          <p className="font-serif text-lg text-[#e3b95c]">No character on this browser yet</p>
          <p className="text-sm text-stone-400">
            The bench works for the character this browser plays. Enter your access code first, then come back to the fire.
          </p>
          <a href="/join" className="inline-block rounded-sm border border-[#9c7a3a] px-4 py-2 font-serif text-xs uppercase tracking-[0.2em] text-[#e3b95c] hover:border-[#e3b95c]">
            Enter your code
          </a>
        </div>
      </main>
    )
  }

  return (
    <DiceProvider>
      <main className="fixed inset-0 bg-[#070605]">
        <AlchemyBench characterId={characterId} onClose={leave} />
      </main>
    </DiceProvider>
  )
}
