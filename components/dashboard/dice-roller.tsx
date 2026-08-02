"use client"

// Presentation-only dice controls. All results still come from the shared
// DiceProvider and its @3d-dice/dice-box physics engine.

import { useCallback, useState } from "react"
import { ChevronDown, ChevronUp, Dices, Send, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { FantasyPanel } from "@/components/ui/fantasy-panel"
import { useDice, type DiceResult, type RollMode, type RollSpec } from "@/components/dice/dice-provider"

interface DiceRollerProps {
  onRollResult?: (result: DiceResult) => void
  onSendToLich?: (message: string) => void
  characterName?: string
  presentation?: "panel" | "modal"
  onClose?: () => void
}

const DICE_TYPES = [
  { die: "d4", position: "-826px -369px" },
  { die: "d6", position: "-896px -369px" },
  { die: "d8", position: "-963px -369px" },
  { die: "d10", position: "-1029px -369px" },
  { die: "d12", position: "-842px -457px" },
  { die: "d20", position: "-915px -457px" },
  { die: "d100", position: "-999px -457px" },
] as const

export function DiceRoller({
  onRollResult,
  onSendToLich,
  characterName = "Player",
  presentation = "panel",
  onClose,
}: DiceRollerProps) {
  const { roll, busy, ready } = useDice()
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
  }, [onRollResult, roll])

  const sendResultToLich = useCallback(() => {
    if (!lastResult || !onSendToLich) return
    const modifierStr = lastResult.modifier === 0 ? "" : lastResult.modifier > 0 ? `+${lastResult.modifier}` : `${lastResult.modifier}`
    const rollDescription = lastResult.label ? `${lastResult.label}: ` : ""
    const modeDescription = lastResult.rollMode && lastResult.rollMode !== "normal" ? ` with ${lastResult.rollMode}` : ""
    const keptDescription = lastResult.keptRolls && lastResult.rollMode && lastResult.rollMode !== "normal" ? `, kept [${lastResult.keptRolls.join(", ")}]` : ""
    onSendToLich(`[Dice Roll] ${characterName} rolled ${lastResult.rolls.length}${lastResult.die}${modifierStr}${modeDescription}${rollDescription ? ` for ${rollDescription}` : ""}: [${lastResult.rolls.join(", ")}]${keptDescription}${modifierStr} = **${lastResult.total}**`)
  }, [characterName, lastResult, onSendToLich])

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
          {DICE_TYPES.map(({ die, position }) => (
            <button
              key={die}
              type="button"
              onClick={() => { setSelectedDie(die); if (die !== "d20") setRollMode("normal") }}
              className={cn("aop-die-choice group", selectedDie === die && "is-selected")}
              aria-pressed={selectedDie === die}
            >
              <span className={cn("aop-die-model", die === "d100" && "is-percentile")} data-face={die.slice(1)} style={{ backgroundPosition: position }} aria-hidden />
              <span className="mt-1 block text-[10px] text-[#d7bd86]">{die}</span>
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

      {lastResult && (
        <section className={cn("aop-roll-result", lastResult.isCrit && "is-critical", lastResult.isFail && "is-fumble")}>
          <div>
            <p className="text-[9px] uppercase tracking-[.16em] text-[#9a7a48]">{lastResult.label || "Latest result"}</p>
            <p className="mt-1 text-xs text-[#cbb78d]">[{lastResult.rolls.join(", ")}]{lastResult.keptRolls && lastResult.keptRolls !== lastResult.rolls ? ` keep ${lastResult.keptRolls.join(", ")}` : ""}{lastResult.modifier ? ` ${lastResult.modifier > 0 ? "+" : ""}${lastResult.modifier}` : ""}</p>
          </div>
          <strong className="font-serif text-4xl text-[#f1cf83]">{lastResult.total}</strong>
          {onSendToLich && (
            <button type="button" onClick={sendResultToLich} className="aop-send-lich" title="Send result to the Lich"><Send className="h-4 w-4" /></button>
          )}
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
