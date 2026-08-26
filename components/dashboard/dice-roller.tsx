"use client"

// Presentation-only dice controls. All results still come from the shared
// DiceProvider and its @3d-dice/dice-box physics engine.

import { useCallback, useState } from "react"
import { ChevronDown, ChevronUp, Dices, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { FantasyPanel } from "@/components/ui/fantasy-panel"
import { useDice, describeRoll, type DiceResult, type RollMode, type RollSpec } from "@/components/dice/dice-provider"

interface DiceRollerProps {
  onRollResult?: (result: DiceResult) => void
  onSendToLich?: (message: string) => void
  characterName?: string
  presentation?: "panel" | "modal"
  onClose?: () => void
}

const DICE_TYPES = [
  { die: "d4", image: "/images/ui/dice-stills/d4.png" },
  { die: "d6", image: "/images/ui/dice-stills/d6.png" },
  { die: "d8", image: "/images/ui/dice-stills/d8.png" },
  { die: "d10", image: "/images/ui/dice-stills/d10.png" },
  { die: "d12", image: "/images/ui/dice-stills/d12.png" },
  { die: "d20", image: "/images/ui/dice-stills/d20.png" },
  { die: "d100", image: "/images/ui/dice-stills/d100.png" },
] as const

export function DiceRoller({
  onRollResult,
  onSendToLich,
  characterName = "Player",
  presentation = "panel",
  onClose,
}: DiceRollerProps) {
  const { roll, announce, busy, ready } = useDice()
  const [isExpanded, setIsExpanded] = useState(true)
  const [selectedDie, setSelectedDie] = useState<string>("d20")
  const [numDice, setNumDice] = useState(1)
  const [modifier, setModifier] = useState(0)
  const [rollMode, setRollMode] = useState<RollMode>("normal")
  const [rollLabel, setRollLabel] = useState("")
  const [lastResult, setLastResult] = useState<DiceResult | null>(null)

  const initiateRoll = useCallback(async (spec: RollSpec) => {
    const result = await roll(spec)
    setLastResult(result)
    onRollResult?.(result)
    // Every tray roll is announced AND sent to Malachar automatically. The
    // physics result is the only truth — the player never types (or invents)
    // a number. This is the anti-tamper contract: the die reports itself.
    announce(describeRoll(result), { toLich: true, result })
  }, [announce, onRollResult, roll])


  const body = (
    <div className="aop-dice-body space-y-4 px-4 pb-4 pt-3">
      {!ready && <p className="text-center text-[9px] uppercase tracking-[.16em] text-[#806b47]">The bones are warming - classic fallback remains available</p>}

      <section>
        <p className="aop-dice-label">Quantity</p>
        <div className="mx-auto mt-1 flex w-48 items-center justify-between">
          <CounterButton label="Decrease quantity" onClick={() => setNumDice(Math.max(1, numDice - 1))}>-</CounterButton>
          <span className="font-serif text-xl text-[#f0d6a0]">{numDice}</span>
          <CounterButton label="Increase quantity" onClick={() => setNumDice(Math.min(10, numDice + 1))}>+</CounterButton>
        </div>
      </section>

      <div className="aop-gold-rule" />

      <section>
        <p className="aop-dice-label">Die Type</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {DICE_TYPES.map((dieType) => (
            <button
              key={dieType.die}
              type="button"
              onClick={() => { setSelectedDie(dieType.die); if (dieType.die !== "d20") setRollMode("normal") }}
              className={cn("aop-die-choice group", selectedDie === dieType.die && "is-selected")}
              aria-pressed={selectedDie === dieType.die}
            >
              <img src={dieType.image} alt="" className="mx-auto mt-0.5 block h-[58px] w-[72px] rounded object-contain drop-shadow-[0_5px_4px_#000]" aria-hidden />
              <span className="mt-1 block text-[10px] text-[#d7bd86]">{dieType.die}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="aop-gold-rule" />

      <section>
        <p className="aop-dice-label">Roll Mode</p>
        <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Roll mode">
          {(["advantage", "normal", "disadvantage"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={selectedDie !== "d20" && mode !== "normal"}
              aria-pressed={rollMode === mode}
              onClick={() => setRollMode(mode)}
              className={cn("aop-roll-mode", `is-${mode}`, rollMode === mode && "is-selected")}
            >
              {mode}
            </button>
          ))}
        </div>
        {selectedDie !== "d20" && <p className="mt-1 text-center text-[9px] text-[#776548]">Advantage and disadvantage apply to d20 checks.</p>}
      </section>

      <div className="aop-gold-rule" />

      <section className="grid grid-cols-2 gap-3">
        <div>
          <p className="aop-dice-label">Modifier</p>
          <div className="mt-1 flex items-center justify-between rounded-sm border border-[#65451e] bg-black/55 p-1">
            <button type="button" onClick={() => setModifier(modifier - 1)} className="aop-mini-control">-</button>
            <span className={cn("font-serif text-lg", modifier < 0 ? "text-[#d85845]" : "text-[#efd59c]")}>{modifier >= 0 ? `+${modifier}` : modifier}</span>
            <button type="button" onClick={() => setModifier(modifier + 1)} className="aop-mini-control">+</button>
          </div>
        </div>
        <div>
          <p className="aop-dice-label">Current Roll</p>
          <div className="mt-1 rounded-sm border border-[#65451e] bg-black/55 py-2 text-center font-serif text-lg text-[#efd59c]">
            {numDice}{selectedDie}{modifier === 0 ? "" : modifier > 0 ? `+${modifier}` : modifier}
            {rollMode !== "normal" && <small className="ml-1 text-[8px] uppercase tracking-wider text-[#b78c48]">{rollMode}</small>}
          </div>
        </div>
      </section>

      <input
        value={rollLabel}
        onChange={(event) => setRollLabel(event.target.value)}
        placeholder="Purpose of the roll (optional)"
        className="aop-lich-input w-full px-3 py-2 text-xs"
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => initiateRoll({ die: selectedDie, numDice, modifier, label: rollLabel || undefined, rollMode })}
        className="aop-roll-button w-full"
      >
        <span aria-hidden>✦</span>
        <span>{busy ? "Casting Dice..." : "Roll Dice"}</span>
        <span aria-hidden>✦</span>
      </button>

      {/* Keyframes for the crit/fumble drama (16-bit combat diegetic). The
          face-cycling number stage from the original prototype is gone on
          purpose: the shared DiceProvider's 3D physics overlay is the roll
          animation now, and fake generated numbers must never appear. */}
      <style>{`
        @keyframes aopCritPulse {
          0%   { transform: scale(0.9); box-shadow: 0 0 0 rgba(212,177,90,0); }
          40%  { transform: scale(1.06); box-shadow: 0 0 28px rgba(212,177,90,0.85); }
          100% { transform: scale(1); box-shadow: 0 0 8px rgba(212,177,90,0.3); }
        }
        @keyframes aopFumble {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          20% { transform: translateX(-5px) rotate(-1deg); }
          40% { transform: translateX(5px) rotate(1deg); }
          60% { transform: translateX(-4px) rotate(-1deg); }
          80% { transform: translateX(4px) rotate(1deg); }
        }
      `}</style>

      {lastResult && (
        <section
          key={lastResult.timestamp.getTime()}
          className={cn("aop-roll-result", lastResult.isCrit && "is-critical", lastResult.isFail && "is-fumble")}
          style={{
            animation: lastResult.isCrit
              ? "aopCritPulse 1.4s ease-out"
              : lastResult.isFail
              ? "aopFumble 0.6s ease-in-out"
              : undefined,
          }}
        >
          <div>
            <p className="text-[9px] uppercase tracking-[.16em] text-[#9a7a48]">{lastResult.label || "Latest result"}</p>
            <p className="mt-1 text-xs text-[#cbb78d]">[{lastResult.rolls.join(", ")}]{lastResult.keptRolls && lastResult.keptRolls !== lastResult.rolls ? ` keep ${lastResult.keptRolls.join(", ")}` : ""}{lastResult.modifier ? ` ${lastResult.modifier > 0 ? "+" : ""}${lastResult.modifier}` : ""}</p>
          </div>
          <strong className={cn("font-serif text-4xl", lastResult.isCrit ? "text-[#ffe9a8]" : lastResult.isFail ? "text-[#ff8a7a]" : "text-[#f1cf83]")}>{lastResult.total}</strong>
          {/* No manual send button: every tray roll is auto-announced to
              Malachar the moment the die settles (see initiateRoll). */}
        </section>
      )}

    </div>
  )

  if (presentation === "modal") {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="Dice Roller" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
        <section className="aop-dice-modal relative max-h-[92vh] w-full max-w-[390px] overflow-y-auto">
          <DiceHeader onClose={onClose} />
          {body}
        </section>
      </div>
    )
  }

  return (
    <FantasyPanel className="aop-dice-panel flex-shrink-0 overflow-hidden">
      <button type="button" onClick={() => setIsExpanded(!isExpanded)} className="aop-dice-header w-full">
        <span className="flex items-center gap-2"><Dices className="h-4 w-4" /> Dice Roller</span>
        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {isExpanded && body}
    </FantasyPanel>
  )
}

function DiceHeader({ onClose }: { onClose?: () => void }) {
  return (
    <header className="aop-dice-header">
      <span className="flex-1 text-center">Dice Roller</span>
      {onClose && <button type="button" onClick={onClose} className="absolute right-3 text-[#c6a060] hover:text-white" aria-label="Close Dice Roller"><X className="h-4 w-4" /></button>}
    </header>
  )
}

function CounterButton({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return <button type="button" aria-label={label} onClick={onClick} className="h-9 w-14 rounded-sm border border-[#755126] bg-[#100b07] font-serif text-xl text-[#deb86d] shadow-[inset_0_0_12px_#000] hover:border-[#d3a85b] hover:text-white">{children}</button>
}
