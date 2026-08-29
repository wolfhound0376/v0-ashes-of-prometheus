"use client"

// ============================================================================
// THE TURN, ANNOUNCED — the moment the table looks up.
//
// Sam's brief (v2): the WHOLE table sees whose turn it is, centre screen,
// and sees the actions available. The original owner-only design argued a
// banner for everyone teaches everyone to ignore it; Sam overruled — this
// is a show as much as a game, and the audience needs the state of play.
//
// So it splits by who you are:
//   THE ACTIVE PLAYER  — the blocking "YOUR TURN / click to begin" plate,
//                        then the interactive phase tray. Unchanged.
//   EVERYONE ELSE      — a transient centre plate ("FIFI'S TURN") that
//                        announces the turn and fades, then a read-only
//                        phase tray so the table can see what's spent.
//   THE DM             — same as everyone else, but their tray is LIVE:
//                        the DM can mark a distracted player's action spent.
//
// The phases are the real 5e action economy: one action, one bonus action,
// one reaction, plus movement. They live in the database so every browser
// agrees, and they reset when the turn passes.
// ============================================================================

import { useEffect, useRef, useState } from "react"

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

/** The plate itself, shared by the blocking and transient forms. */
function TurnPlate({ title, name, entering }: { title: string; name: string; entering: boolean }) {
  return (
    <div
      className="relative px-16 py-4"
      style={{
        background: "linear-gradient(180deg,#1a1206 0%,#0b0805 55%,#140e07 100%)",
        border: "2px solid #a88745",
        boxShadow: "0 0 40px #000, 0 0 26px #c9a22733, inset 0 0 30px #00000099",
        transform: entering ? "scale(1.06)" : "scale(1)",
        transition: "transform 380ms cubic-bezier(.2,.9,.3,1)",
      }}
    >
      <div className="absolute inset-x-6 top-[3px] h-[1px] bg-gradient-to-r from-transparent via-[#f0cd7a] to-transparent" />
      <div className="absolute inset-x-6 bottom-[3px] h-[1px] bg-gradient-to-r from-transparent via-[#f0cd7a] to-transparent" />
      <div className="font-serif text-[26px] uppercase tracking-[0.42em] text-[#f4e6c4] [text-shadow:0_2px_6px_#000,0_0_18px_#c9a22766]">
        {title}
      </div>
      {name && (
        <div className="mt-1 text-center font-serif text-[11px] uppercase tracking-[0.3em] text-[#a89468]">{name}</div>
      )}
    </div>
  )
}

export function TurnBanner({
  active,
  isMine,
  dm = false,
  characterName,
  economy,
  speedFt,
  onAcknowledge,
  onSpend,
}: {
  active: boolean
  isMine: boolean
  dm?: boolean
  characterName: string
  economy: TurnEconomy
  speedFt: number
  onAcknowledge: () => void
  onSpend: (kind: "action" | "bonus" | "reaction") => void
}) {
  const [entering, setEntering] = useState(false)
  // The transient announcement for spectators and the DM: shows on each
  // change of whose turn it is, then gets out of the way.
  const [announce, setAnnounce] = useState(false)
  const lastTurnKey = useRef("")
  // An ARMED phase: the player pressed Action (or Bonus Action) and the
  // rack below is showing what it can buy. Purely local UI - the spend
  // itself only happens when an option is used (or on Shift+click).
  const [armed, setArmed] = useState<"action" | "bonus" | null>(null)

  useEffect(() => {
    if (active && isMine && !economy.acknowledged) {
      setEntering(true)
      const t = window.setTimeout(() => setEntering(false), 420)
      return () => window.clearTimeout(t)
    }
  }, [active, isMine, economy.acknowledged])

  useEffect(() => {
    if (!active || !characterName) return
    if (lastTurnKey.current === characterName) return
    lastTurnKey.current = characterName
    if (isMine) return // the owner gets the blocking plate instead
    setAnnounce(true)
    const t = window.setTimeout(() => setAnnounce(false), 2400)
    return () => window.clearTimeout(t)
  }, [active, characterName, isMine])

  // Broadcast the economy to the rest of the HUD - the cards' gems and the
  // rack's highlights. The banner and the rack hang from different parents,
  // so the state crosses as a DOM event; the board file stays untouched
  // (another session is live in it). Re-publish on request so a listener
  // that mounted late still syncs.
  useEffect(() => {
    const publish = () =>
      window.dispatchEvent(
        new CustomEvent("aop:economy", {
          detail: { action: Boolean(economy.action), bonus: Boolean(economy.bonus), armed, live: active },
        }),
      )
    publish()
    window.addEventListener("aop:economy-request", publish)
    return () => window.removeEventListener("aop:economy-request", publish)
  }, [economy.action, economy.bonus, armed, active])

  // A new turn, or the armed phase getting spent elsewhere, disarms.
  useEffect(() => {
    setArmed(null)
  }, [characterName])
  useEffect(() => {
    if (armed && economy[armed]) setArmed(null)
  }, [economy.action, economy.bonus, armed])

  // The rack reports a cast; the phase it cost is spent HERE, where the
  // spend callback lives. Guarded to this browser's own live tray.
  useEffect(() => {
    const h = (e: Event) => {
      const phase = (e as CustomEvent).detail?.phase as "action" | "bonus" | undefined
      if (!phase || !active || !(isMine || dm)) return
      if (!economy[phase]) onSpend(phase)
      setArmed(null)
    }
    window.addEventListener("aop:ability-used", h)
    return () => window.removeEventListener("aop:ability-used", h)
  }, [active, isMine, dm, economy.action, economy.bonus, onSpend])

  if (!active) {
    lastTurnKey.current = ""
    return null
  }

  // THE ACTIVE PLAYER, before the click: the full-screen call. Deliberately
  // blocking — this is the one moment the game wants their hand on the table.
  if (isMine && !economy.acknowledged) {
    return (
      <div className="absolute inset-0 z-40 grid place-items-center bg-black/45 backdrop-blur-[2px]">
        <button onClick={onAcknowledge} className="group relative">
          <TurnPlate title="Your Turn" name={characterName} entering={entering} />
          <div className="mt-3 text-center font-serif text-[10px] uppercase tracking-[0.3em] text-[#8a7952] transition-colors group-hover:text-[#c9a227]">
            Click to begin
          </div>
        </button>
      </div>
    )
  }

  const canTouch = isMine || dm
  const moved = economy.moved_ft ?? 0

  return (
    <>
      {/* EVERYONE ELSE, on the turn change: the announcement, centre screen,
          non-blocking, gone in a breath. */}
      {announce && (
        <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center">
          <div style={{ animation: "aopTurnFade 2.4s ease forwards" }}>
            <TurnPlate title={`${characterName}'s Turn`} name="" entering={false} />
          </div>
          <style>{`@keyframes aopTurnFade { 0% { opacity: 0; transform: scale(1.05) } 10% { opacity: 1; transform: scale(1) } 78% { opacity: 1 } 100% { opacity: 0; transform: scale(0.98) } }`}</style>
        </div>
      )}

      {/* The phase tray: what this turn still holds. Live for the owner and
          the DM; the table reads it. */}
      {/* Sam: "move this down so it isn't in the way of other boxes." The tray
          used to sit at 92px, hard against the bottom of the initiative rail
          and level with the top of the combat log — three panels competing
          for the same band of screen. Dropped clear of the rail's round
          counter, which is the lowest thing above it. */}
      <div className="pointer-events-none absolute left-1/2 top-[168px] z-30 -translate-x-1/2">
        <div className="pointer-events-auto flex items-stretch gap-1 rounded-sm border border-[#6b5123] bg-[#0c0a06]/95 p-1 shadow-[0_0_24px_#000]">
          {/* Whose actions these are — the table shouldn't have to guess. */}
          <div className="grid min-w-[84px] place-items-center rounded-sm border border-[#4a3a1e] bg-black/40 px-2">
            <div className="font-serif text-[10px] uppercase tracking-[0.2em] text-[#35d94a] [text-shadow:0_0_8px_#35d94a55]">
              {characterName}
            </div>
          </div>
          {PHASES.map((p) => {
            const spent = Boolean(economy[p.key])
            const armedThis = armed === p.key && !spent
            // Sam's brief: pressing Action shows you what it buys - the rack
            // lights its legal options - rather than instantly marking it
            // used. Spending happens when an option is used, on Shift+click
            // (narrative spends: grapple, improvised nonsense), on any click
            // from the DM's tray, and Reaction stays a straight toggle since
            // the rack holds nothing it can buy.
            const handleClick = (e: { shiftKey: boolean }) => {
              if (spent) { onSpend(p.key); return }               // restore a mis-mark
              if (p.key === "reaction" || e.shiftKey || (dm && !isMine)) {
                onSpend(p.key)
                setArmed(null)
                return
              }
              setArmed(armedThis ? null : p.key)
            }
            return (
              <button
                key={p.key}
                onClick={canTouch ? handleClick : undefined}
                disabled={!canTouch}
                title={
                  canTouch
                    ? spent
                      ? `${p.hint} — marked used, click to restore`
                      : p.key === "reaction" || (dm && !isMine)
                        ? p.hint
                        : `${p.hint} — click to see your options below · Shift+click to mark used`
                    : p.hint
                }
                className={
                  "min-w-[104px] rounded-sm border px-3 py-1.5 text-center transition-colors " +
                  (spent
                    ? "border-[#2a2216] bg-black/50 text-[#5f5540] line-through"
                    : armedThis
                      ? (p.key === "action"
                          ? "border-[#7cc0ff] shadow-[0_0_12px_#4fa8ff88] "
                          : "border-[#ff8a76] shadow-[0_0_12px_#ff5a4488] ") +
                        "bg-gradient-to-b from-[#2a1f10] to-[#140e07] text-[#fff3cf]"
                      : "border-[#8b6427] bg-gradient-to-b from-[#2a1f10] to-[#140e07] text-[#f0cd7a]" +
                        (canTouch ? " hover:border-[#f4e0a8]" : " opacity-80")) +
                  (canTouch ? "" : " cursor-default")
                }
              >
                <div className="font-serif text-[10px] uppercase tracking-[0.18em]">{p.label}</div>
                <div className="text-[8px] uppercase tracking-wider opacity-70">
                  {spent ? "used" : armedThis ? "choose below" : "ready"}
                </div>
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
    </>
  )
}
