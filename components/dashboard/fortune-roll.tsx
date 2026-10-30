"use client"

// ============================================================================
// THE OPENING FORTUNE ROLL — "what did you manage to keep?"
//
// Out of the Abyss, ch.1: each prisoner rolls 1d20 and adds the days they have
// been held (1d10, rolled separately for each). The dice tumble on the shared
// 3D roller so the whole table watches; /api/fortune-roll turns the total into
// the book's row and the row into a catalog item in the bag (lib/scavenged.ts
// has the table and the reason it is NOT a d100). Malachar is then handed the
// result as a stage direction and narrates it in his own voice — he never
// picks the item.
//
// Shown once per run to a claimed character who has not rolled (the flag is
// cleared by a restart). Sam, 2026-10-14: "The game then has you roll ... to
// determine what you start out with and Malachar narrates briefly."
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react"
import { useDice } from "@/components/dice/dice-provider"
import { DAYS_DIE, FORTUNE_DIE } from "@/lib/scavenged"

type Fortune = { days: number; d20: number; total: number; text: string; item: string | null }

export function FortuneRoll({
  characterId,
  claimToken,
  characterName,
  onNarrate,
  onDismiss,
  autoRollMs,
  autoDismissMs,
}: {
  characterId: string | null
  claimToken: string | null
  characterName: string | null
  /** Hands Malachar the result as a stage direction. */
  onNarrate: (direction: string) => void
  /** Told once the card is out of the way: already rolled this run, or dismissed after rolling. */
  onDismiss?: (rolled: boolean) => void
  /**
   * Never stall (Sam, 2026-10-29, /awaken "designed not to stall"): nobody presses Roll within this long →
   * the dice roll themselves; the result card closes itself after autoDismissMs. Two failed rolls in this
   * mode give up and dismiss without a roll, rather than looping. Unset = waits for the player, as before.
   */
  autoRollMs?: number
  autoDismissMs?: number
}) {
  const { roll } = useDice()
  const [state, setState] = useState<"unknown" | "due" | "rolling" | "done" | "dismissed">("unknown")
  const [fortune, setFortune] = useState<Fortune | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const failures = useRef(0)
  const [left, setLeft] = useState<number | null>(null)

  // Is this character's fortune still unrolled for the run?
  useEffect(() => {
    if (!characterId || !claimToken) { setState("unknown"); return }
    let live = true
    fetch(`/api/fortune-roll?characterId=${encodeURIComponent(characterId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!live) return; if (j?.rolled){ setState("dismissed"); onDismiss?.(false) } else setState("due") })
      // Unreadable: in never-stall mode offer the roll anyway (the POST is the real check); otherwise stay hidden.
      .catch(() => { if (live) setState(autoRollMs ? "due" : "unknown") })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId, claimToken])

  const doRoll = useCallback(async () => {
    if (!characterId || !claimToken || state !== "due") return
    setState("rolling")
    try {
      const days = await roll({ die: `d${DAYS_DIE}`, numDice: 1, modifier: 0, label: "Days imprisoned" })
      // A table roll, not a D20 Test: no trait (Halfling Luck) may touch it.
      const d20 = await roll({ die: `d${FORTUNE_DIE}`, numDice: 1, modifier: 0, label: "Scavenged possession", test: false })
      const res = await fetch("/api/fortune-roll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, claimToken, days: days.rolls[0], d20: d20.rolls[0] }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.ok) {
        setProblem(j?.error || "The roll could not be recorded.")
        failures.current += 1
        if (autoRollMs && failures.current >= 2) { setState("dismissed"); onDismiss?.(false); return }
        setState("due"); return
      }
      const f: Fortune = j.fortune
      setFortune(f)
      setProblem(j.problem ?? null)
      setState("done")
      const name = characterName || "The character"
      onNarrate(
        `${name} has been a prisoner in Velkynvelve for ${f.days} day${f.days === 1 ? "" : "s"} (rolled d10: ${f.days}). ` +
        `Their scavenged-possessions roll is d20 ${f.d20} + ${f.days} days = ${f.total}: ${f.text}` +
        (f.item ? ` (the ${f.item} is already in their inventory — do not award it again, do not change it).` : " (they have nothing — award nothing).") +
        ` In one or two lines, in your own voice, say how the days passed and how they came by it — or didn't. Do not ask for any other roll. This is the only possessions roll there is.`,
      )
    } catch (e) {
      console.error("[fortune] roll failed:", e)
      setProblem("The dice did not settle. Try again.")
      failures.current += 1
      if (autoRollMs && failures.current >= 2) { setState("dismissed"); onDismiss?.(false); return }
      setState("due")
    }
  }, [characterId, claimToken, characterName, onNarrate, roll, state, autoRollMs, onDismiss])

  // The clocks that keep the card from holding the table up. A visible countdown, so it never feels like a glitch.
  const latest = useRef(doRoll)
  latest.current = doRoll
  useEffect(() => {
    const ms = state === "due" ? autoRollMs : state === "done" ? autoDismissMs : undefined
    if (!ms) { setLeft(null); return }
    const end = Date.now() + ms
    setLeft(Math.ceil(ms / 1000))
    const tick = window.setInterval(() => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 500)
    const fire = window.setTimeout(() => {
      if (state === "due") void latest.current()
      else { setState("dismissed"); onDismiss?.(true) }
    }, ms)
    return () => { window.clearInterval(tick); window.clearTimeout(fire) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, autoRollMs, autoDismissMs])

  if (state === "unknown" || state === "dismissed") return null

  return (
    <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1a1614] border border-[#3d3428] rounded-lg p-6 max-w-md mx-4 shadow-2xl text-center">
        <div className="text-[10px] tracking-[0.3em] uppercase text-amber-500/70 mb-2">Velkynvelve · the slave pen</div>
        <h2 className="text-xl font-serif text-amber-200 mb-3">What did you manage to keep?</h2>
        {state !== "done" ? (
          <>
            <p className="text-stone-300 mb-2">
              You have been a prisoner here for days. A d10 says how many; a d20 plus those days says
              what the drow missed when they stripped you.
            </p>
            <p className="text-stone-500 text-xs mb-5">Out of the Abyss, chapter 1 — rolled once, on the shared dice.</p>
            {problem && <p className="text-red-400 text-sm mb-3">{problem}</p>}
            <button
              onClick={doRoll}
              disabled={state === "rolling"}
              className="px-5 py-2 rounded bg-amber-500/15 border border-amber-500/50 text-amber-300 hover:bg-amber-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-serif tracking-wide"
            >
              {state === "rolling" ? "Rolling…" : "Roll d10, then d20"}
            </button>
            {state === "due" && left != null && <p className="mt-3 text-[11px] text-stone-600">The dice roll themselves in {left}s.</p>}
          </>
        ) : fortune ? (
          <>
            <p className="text-stone-300 mb-1">
              <span className="text-amber-300">{fortune.days}</span> day{fortune.days === 1 ? "" : "s"} in the pen · d20{" "}
              <span className="text-amber-300">{fortune.d20}</span> + {fortune.days} = <span className="text-amber-300">{fortune.total}</span>
            </p>
            <p className="text-lg font-serif text-amber-100 mb-2 capitalize">{fortune.text}</p>
            {problem && <p className="text-red-400 text-xs mb-2">{problem}</p>}
            <p className="text-stone-500 text-xs mb-5">
              {fortune.item ? `${fortune.item} is in your bag.` : "Nothing goes in the bag."} Malachar has the rest.
            </p>
            <button
              onClick={() => { setState("dismissed"); onDismiss?.(true) }}
              className="px-5 py-2 rounded bg-[#2a2520] border border-[#3d3428] text-stone-300 hover:text-stone-100 hover:border-stone-500 transition-colors"
            >
              Into the dark{left != null ? ` (${left})` : ""}
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
