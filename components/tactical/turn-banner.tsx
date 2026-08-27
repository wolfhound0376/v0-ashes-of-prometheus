"use client"

// ============================================================================
// YOUR TURN — the moment the table looks up.
//
// Sam's brief: something conspicuous in the middle of the screen, clicked to
// acknowledge, and the phases shown plainly beside it.
//
// WHO SEES IT: only the browser whose claimed character is the active
// combatant. The DM does not get it (they drive the order), and a player
// watching someone else's turn does not get it — a banner that shows for
// everyone teaches everyone to ignore it.
//
// The phases are the real 5e action economy: one action, one bonus action,
// one reaction, plus movement. They live in the database so the DM can audit
// them across four browsers, and they reset when the turn passes.
// ============================================================================

import { useEffect, useState } from "react"

export interface TurnEconomy {
  action?: boolean
  bonus?: boolean
  reaction?: boolean
  moved_ft?: number
  acknowledged?: boolean
}

const PHASES = [
  { key: "action" as const, label: "Action", hint: "Attack, cast a spell, dash, dodge…" },
  { key: "bonus" as const, label: "Bonus Action", hint: "Only if something grants one" },
  { key: "reaction" as const, label: "Reaction", hint: "Opportunity attack, shield, counterspell" },
]

export function TurnBanner({
  active,
  isMine,
  characterName,
  economy,
  speedFt,
  onAcknowledge,
  onSpend,
}: {
  active: boolean
  isMine: boolean
  characterName: string
  economy: TurnEconomy
  speedFt: number
  onAcknowledge: () => void
  onSpend: (kind: "action" | "bonus" | "reaction") => void
}) {
  const [entering, setEntering] = useState(false)
  useEffect(() => {
    if (active && isMine && !economy.acknowledged) {
      setEntering(true)
      const t = window.setTimeout(() => setEntering(false), 420)
      return () => window.clearTimeout(t)
    }
  }, [active, isMine, economy.acknowledged])

  if (!active || !isMine) return null

  // BEFORE the click: the full-screen call. Deliberately blocking — this is
  // the one moment the game wants the player's hand on the table.
  if (!economy.acknowledged) {
    return (
      <div className="absolute inset-0 z-40 grid place-items-center bg-black/45 backdrop-blur-[2px]">
        <button
          onClick={onAcknowledge}
          className="group relative"
          style={{ transform: entering ? "scale(1.06)" : "scale(1)", transition: "transform 380ms cubic-bezier(.2,.9,.3,1)" }}
        >
          {/* The plate: blackened steel with a bronze edge, a wide gold rule
              above and below, in the house style. */}
          <div
            className="relative px-16 py-4"
            style={{
              background: "linear-gradient(180deg,#1a1206 0%,#0b0805 55%,#140e07 100%)",
              border: "2px solid #a88745",
              boxShadow: "0 0 40px #000, 0 0 26px #c9a22733, inset 0 0 30px #00000099",
            }}
          >
            <div className="absolute inset-x-6 top-[3px] h-[1px] bg-gradient-to-r from-transparent via-[#f0cd7a] to-transparent" />
            <div className="absolute inset-x-6 bottom-[3px] h-[1px] bg-gradient-to-r from-transparent via-[#f0cd7a] to-transparent" />
            <div className="font-serif text-[26px] uppercase tracking-[0.42em] text-[#f4e6c4] [text-shadow:0_2px_6px_#000,0_0_18px_#c9a22766]">
              Your Turn
            </div>
            <div className="mt-1 text-center font-serif text-[11px] uppercase tracking-[0.3em] text-[#a89468]">
              {characterName}
            </div>
          </div>
          <div className="mt-3 text-center font-serif text-[10px] uppercase tracking-[0.3em] text-[#8a7952] transition-colors group-hover:text-[#c9a227]">
            Click to begin
          </div>
        </button>
      </div>
    )
  }

  // AFTER the click: the phases, out of the way but unmissable.
  const moved = economy.moved_ft ?? 0
  return (
    <div className="pointer-events-none absolute left-1/2 top-[92px] z-30 -translate-x-1/2">
      <div className="pointer-events-auto flex items-stretch gap-1 rounded-sm border border-[#6b5123] bg-[#0c0a06]/95 p-1 shadow-[0_0_24px_#000]">
        {PHASES.map((p) => {
          const spent = Boolean(economy[p.key])
          return (
            <button
              key={p.key}
              onClick={() => onSpend(p.key)}
              title={`${p.hint}${spent ? " — marked used, click to restore" : ""}`}
              className={
                "min-w-[104px] rounded-sm border px-3 py-1.5 text-center transition-colors " +
                (spent
                  ? "border-[#2a2216] bg-black/50 text-[#5f5540] line-through"
                  : "border-[#8b6427] bg-gradient-to-b from-[#2a1f10] to-[#140e07] text-[#f0cd7a] hover:border-[#f4e0a8]")
              }
            >
              <div className="font-serif text-[10px] uppercase tracking-[0.18em]">{p.label}</div>
              <div className="text-[8px] uppercase tracking-wider opacity-70">{spent ? "used" : "ready"}</div>
            </button>
          )
        })}

        {/* Movement is not a toggle — it is a budget, so it reads as one. */}
        <div className="min-w-[104px] rounded-sm border border-[#4a3a1e] bg-black/40 px-3 py-1.5 text-center">
          <div className="font-serif text-[10px] uppercase tracking-[0.18em] text-[#c9bca0]">Movement</div>
          <div className="text-[9px] text-[#8a7952]">
            <span className="text-[#e0d2ae]">{Math.max(0, speedFt - moved)}</span> / {speedFt} ft
          </div>
        </div>
      </div>
    </div>
  )
}
