"use client"

// /bench — the alchemy bench and nothing else. Sam, 2026-10-01: from the camp
// at the fire, "Clicking this button should open the alchemy bench directly",
// and the dashboard flashing up first "is unnecessary"; "Exiting out of the
// alchemy should take me straight to camp at the fire."
//
// So this page renders no dashboard at all: the bench, over its own dice.
//
// Who is at the bench follows the dashboard's own rules (app/page.tsx):
//   * a claimed player seat (/join code or claim link) is always that player;
//     nothing in the address can change it (AGENTS.md §5);
//   * the DM has no seat of their own. The camp scene says who the DM is
//     playing at the fire (?as=Fifi), and that wins; otherwise this browser's
//     last pick, then the DM's spotlight, then the first player in the party.
// The bench routes take that characterId exactly as they do from the dashboard.
//
// Leaving: the camp scene opened this page in a new tab, so closing the bench
// closes the tab and the player is back at the fire. A browser only lets a
// page close a tab it was opened into; if this page was reached any other way
// and the tab stays open, it falls back to the game's own Camp tab.

import { useEffect, useState } from "react"
import { DiceProvider } from "@/components/dice/dice-provider"
import { AlchemyBench } from "@/components/alchemy/alchemy-bench"
import { createClient } from "@/lib/supabase/client"

// The same keys app/page.tsx keeps the per-browser seat under.
const CHARACTER_LS_KEY = "aop_character_id"
const TOKEN_LS_KEY = "aop_claim_token"
const ROLE_LS_KEY = "aop_access_role"

type Row = { id: string; name: string; is_player: boolean | null; in_party: boolean | null }

/** The DM's character at the bench: the name the camp scene sent, then this
 *  browser's last pick, then the spotlight, then the first player in the party. */
async function dmCharacter(asName: string | null, stored: string | null): Promise<string | null> {
  const db = createClient()
  const { data } = await db.from("characters").select("id, name, is_player, in_party")
  const rows = ((data ?? []) as Row[]).filter((c) => c.is_player)
  if (asName) {
    // The scene uses first names ("Fifi"); the sheet may carry more ("Fifi of Copperas Cove").
    const want = asName.trim().toLowerCase()
    const hit =
      rows.find((c) => c.name.toLowerCase() === want) ?? rows.find((c) => c.name.toLowerCase().startsWith(want + " "))
    if (hit) return hit.id
  }
  if (stored && rows.some((c) => c.id === stored)) return stored
  const { data: sess } = await db
    .from("sessions")
    .select("status, started_at, active_character_id")
    .order("started_at", { ascending: false })
  const list = (sess ?? []) as { status: string | null; active_character_id: string | null }[]
  const spot = (list.find((x) => x.status === "active") ?? list[0])?.active_character_id ?? null
  if (spot && rows.some((c) => c.id === spot)) return spot
  return (rows.find((c) => c.in_party) ?? rows[0])?.id ?? null
}

function leave() {
  window.close()
  // Still here: this tab was not one a script may close.
  window.setTimeout(() => window.location.replace("/?view=compact&from=camp"), 250)
}

export default function BenchPage() {
  // undefined = still working it out; null = nobody this browser may play.
  const [characterId, setCharacterId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let live = true
    const done = (id: string | null) => { if (live) setCharacterId(id) }
    try {
      // Coming from camp is not a new arrival: no intro ceremony on the way back.
      window.sessionStorage.setItem("aop_intro_seen", "1")
      const role = window.localStorage.getItem(ROLE_LS_KEY)
      const stored = window.localStorage.getItem(CHARACTER_LS_KEY)
      const token = window.localStorage.getItem(TOKEN_LS_KEY)
      const asName = new URLSearchParams(window.location.search).get("as")
      if (role === "player") {
        done(stored && token ? stored : null)
      } else if (role === "dm") {
        dmCharacter(asName, stored).then(done, () => done(null))
      } else {
        // No code entered on this browser. The dashboard lets such a browser in
        // only while the code gate is off; the bench does the same.
        fetch("/api/claim-code")
          .then((r) => r.json())
          .then((cfg) => (cfg?.dmGate ? done(null) : dmCharacter(asName, stored).then(done)))
          .catch(() => done(null))
      }
    } catch {
      done(null)
    }
    return () => { live = false }
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
