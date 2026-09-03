"use client"

// THE SUMMON'S OWN CARD - Mage Hand.
//
// Sits under its caster's character card, because it is the caster's: the
// hand has no turn, no hit points and no armour class in the SRD, so it gets
// no stone row and no globes. What it has is a duration, a leash, and four
// things it can do - and those are what the card says. Every button spends
// the caster's ACTION, exactly as the spell reads, so they light only on the
// caster's turn while the action is unspent.
//
// The card is translucent, like the hand. A spectral thing should look it.

import type { CSSProperties } from "react"
import { HAND_USES, MAGE_HAND, roundsLeft, type HandUse, type SummonOnBoard } from "@/lib/summons"

export function SummonCard({
  summon,
  casterName,
  round,
  distanceFt,
  canAct,
  arming,
  onMove,
  onUse,
  onDismiss,
  width = 320,
}: {
  summon: SummonOnBoard
  casterName: string
  round: number
  /** From its caster, in feet. Past 30 it is already gone. */
  distanceFt: number | null
  /** The caster's turn, action unspent. */
  canAct: boolean
  /** MOVE has been pressed and the board is waiting for a square. */
  arming: boolean
  onMove: () => void
  onUse: (what: HandUse) => void
  onDismiss: () => void
  width?: number
}) {
  const left = roundsLeft(summon.info, round)
  const W = width
  const gold = "#c9a45c"
  const dim = "#6d6552"
  const btn = (enabled: boolean, accent = "#7fc4ff"): CSSProperties => ({
    fontFamily: "Georgia, serif",
    fontSize: Math.max(7, W * 0.026),
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    padding: `${W * 0.012}px ${W * 0.02}px`,
    border: `1px solid ${enabled ? accent : "#3a3428"}`,
    background: enabled ? "rgba(20,40,70,0.55)" : "rgba(0,0,0,0.35)",
    color: enabled ? "#dff0ff" : dim,
    cursor: enabled ? "pointer" : "default",
    whiteSpace: "nowrap",
  })

  return (
    <div
      title={`${MAGE_HAND.name} - ${casterName}'s. Spectral. Cannot attack, activate magic items, or carry more than ${MAGE_HAND.carryLb} lb. Vanishes beyond ${MAGE_HAND.leashFt} ft.`}
      style={{
        width: W,
        marginTop: 4,
        padding: W * 0.025,
        border: "1px solid rgba(127,196,255,0.45)",
        background: "linear-gradient(180deg, rgba(10,22,40,0.62), rgba(4,8,16,0.55))",
        boxShadow: "0 0 18px rgba(80,160,255,0.22), inset 0 1px 0 rgba(160,210,255,0.18)",
        backdropFilter: "blur(2px)",
        color: "#d8e4f2",
        fontFamily: "Georgia, serif",
        display: "grid",
        gridTemplateColumns: `${W * 0.2}px 1fr`,
        gap: W * 0.02,
        alignItems: "center",
        opacity: 0.92,
      }}
    >
      <img
        src={MAGE_HAND.icon}
        alt=""
        draggable={false}
        style={{ width: W * 0.2, height: W * 0.2, objectFit: "cover", opacity: 0.85, filter: "drop-shadow(0 0 8px rgba(90,170,255,0.7))" }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: Math.max(9, W * 0.036), letterSpacing: "0.16em", textTransform: "uppercase", color: "#9fd2ff", textShadow: "0 0 8px rgba(90,170,255,0.6)" }}>
            {MAGE_HAND.name}
          </span>
          <span style={{ fontSize: Math.max(7, W * 0.026), color: gold, whiteSpace: "nowrap" }}>
            {left} {left === 1 ? "round" : "rounds"} left
          </span>
        </div>
        <div style={{ fontSize: Math.max(7, W * 0.025), color: "#a9b8c9", marginTop: 2 }}>
          {casterName}&rsquo;s &middot; spectral &middot; {MAGE_HAND.carryLb} lb
          {distanceFt != null ? ` · ${distanceFt} ft away` : ""}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: W * 0.018 }}>
          <button type="button" disabled={!canAct} onClick={onMove} style={btn(canAct, arming ? "#f3c94b" : "#7fc4ff")}>
            {arming ? "Click a square · Esc" : `Move ${MAGE_HAND.moveFt} ft`}
          </button>
          {HAND_USES.map((u) => (
            <button
              key={u.key} type="button" disabled={!canAct}
              onClick={() => onUse(u.key)}
              style={btn(canAct)}
              title={u.label}
            >
              <span style={{ marginRight: 4, opacity: 0.95 }}>{u.glyph}</span>
              {u.label}
            </button>
          ))}
          <button type="button" disabled={!canAct} onClick={onDismiss} style={btn(canAct, "#b6a888")}>
            Dismiss
          </button>
        </div>
        {!canAct && (
          <div style={{ fontSize: Math.max(6, W * 0.022), color: dim, fontStyle: "italic", marginTop: 3 }}>
            controlled with {casterName}&rsquo;s action, on their turn
          </div>
        )}
      </div>
    </div>
  )
}
