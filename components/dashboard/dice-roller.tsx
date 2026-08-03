"use client"

// The dashboard dice tray. UI ONLY — the actual dice engine (3D renderer,
// cinematic overlay, physics results, fallback) lives in the shared
// DiceProvider (components/dice/dice-provider.tsx), which this component rolls
// through exactly like the character sheet does. One roller, one truth.

import { useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import { FantasyPanel } from "@/components/ui/fantasy-panel"
import { Dices, Send, ChevronDown, ChevronUp } from "lucide-react"
import { useDice, type DiceResult, type RollSpec } from "@/components/dice/dice-provider"

interface DiceRollerProps {
  onRollResult?: (result: DiceResult) => void
  onSendToLich?: (message: string) => void
  characterName?: string
  /** Mount collapsed. The V4 centre column has no room to give the roller a
   *  permanent open panel, so it starts as its own slim bar there. */
  defaultExpanded?: boolean
}

// Standard D&D dice
const DICE_TYPES = [
  { die: "d4", sides: 4, color: "from-[#4a3a2a] to-[#2a1a0a]", border: "border-[#8a6a4a]" },
  { die: "d6", sides: 6, color: "from-[#3a4a2a] to-[#1a2a0a]", border: "border-[#6a8a4a]" },
  { die: "d8", sides: 8, color: "from-[#2a3a4a] to-[#0a1a2a]", border: "border-[#4a6a8a]" },
  { die: "d10", sides: 10, color: "from-[#4a2a3a] to-[#2a0a1a]", border: "border-[#8a4a6a]" },
  { die: "d12", sides: 12, color: "from-[#3a2a4a] to-[#1a0a2a]", border: "border-[#6a4a8a]" },
  { die: "d20", sides: 20, color: "from-[#4a4a2a] to-[#2a2a0a]", border: "border-[#8a8a4a]" },
  { die: "d100", sides: 100, color: "from-[#2a2a2a] to-[#0a0a0a]", border: "border-[#6a6a6a]" },
]

export function DiceRoller({ onRollResult, onSendToLich, characterName = "Player", defaultExpanded = true }: DiceRollerProps) {
  const { roll, busy, ready } = useDice()

  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const [selectedDie, setSelectedDie] = useState<string>("d20")
  const [numDice, setNumDice] = useState(1)
  const [modifier, setModifier] = useState(0)
  const [rollLabel, setRollLabel] = useState("")
  const [lastResult, setLastResult] = useState<DiceResult | null>(null)

  // Initiate ANY tray roll through the shared engine, then commit the result
  // to the tray's log + telemetry callback.
  const initiateRoll = useCallback(
    async (spec: RollSpec) => {
      const result = await roll(spec)
      setLastResult(result)
      onRollResult?.(result)
    },
    [roll, onRollResult],
  )

  const sendResultToLich = useCallback(() => {
    if (!lastResult || !onSendToLich) return

    const modifierStr =
      lastResult.modifier !== 0
        ? lastResult.modifier > 0
          ? `+${lastResult.modifier}`
          : `${lastResult.modifier}`
        : ""

    const rollDescription = lastResult.label ? `${lastResult.label}: ` : ""

    const message = `[Dice Roll] ${characterName} rolled ${lastResult.rolls.length}${lastResult.die}${modifierStr}${rollDescription ? ` for ${rollDescription}` : ""}: [${lastResult.rolls.join(", ")}]${modifierStr} = **${lastResult.total}**`

    onSendToLich(message)
  }, [lastResult, onSendToLich, characterName])

  // Quick rolls initiate a roll immediately through the cinematic overlay.
  // Attack / Initiative / Saving Throw are d20 checks; Damage uses the currently
  // selected die + count. All carry the current modifier.
  const quickRolls: { label: string; spec: RollSpec }[] = [
    { label: "Attack", spec: { die: "d20", numDice: 1, modifier, label: "Attack roll" } },
    { label: "Damage", spec: { die: selectedDie, numDice, modifier, label: "Damage roll" } },
    { label: "Initiative", spec: { die: "d20", numDice: 1, modifier, label: "Initiative" } },
    { label: "Saving Throw", spec: { die: "d20", numDice: 1, modifier, label: "Saving throw" } },
  ]

  return (
    <FantasyPanel className="flex-shrink-0">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#2a2420]/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Dices className="w-4 h-4 text-[#c9a868]" />
          <span className="text-xs font-semibold tracking-[0.15em] uppercase text-[#c9b896]">Dice Roller</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-stone-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-stone-500" />
        )}
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
          {!ready && (
            <p className="text-[10px] text-stone-600">3D dice warming up — rolls fall back locally if unavailable.</p>
          )}

          {/* Dice Selection */}
          <div className="flex gap-1 justify-center flex-wrap">
            {DICE_TYPES.map((dieType) => (
              <button
                key={dieType.die}
                onClick={() => setSelectedDie(dieType.die)}
                className={cn(
                  "w-10 h-10 rounded border-2 flex items-center justify-center text-xs font-bold transition-all",
                  "bg-gradient-to-br",
                  dieType.color,
                  selectedDie === dieType.die
                    ? cn(dieType.border, "ring-2 ring-[#d4b15a]/60 shadow-lg")
                    : "border-[#3d3428]/60 hover:border-[#5d5448]",
                  selectedDie === dieType.die ? "text-white" : "text-stone-400",
                )}
              >
                {dieType.die}
              </button>
            ))}
          </div>

          {/* Number of Dice & Modifier */}
          <div className="flex gap-2 items-center justify-center">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setNumDice(Math.max(1, numDice - 1))}
                className="w-6 h-6 rounded bg-[#2a2420] border border-[#3d3428] text-stone-400 hover:text-white hover:border-[#5d5448] transition-colors"
              >
                -
              </button>
              <span className="w-8 text-center text-sm font-bold text-[#c9a868]">{numDice}</span>
              <button
                onClick={() => setNumDice(Math.min(10, numDice + 1))}
                className="w-6 h-6 rounded bg-[#2a2420] border border-[#3d3428] text-stone-400 hover:text-white hover:border-[#5d5448] transition-colors"
              >
                +
              </button>
            </div>

            <span className="text-stone-500 text-lg font-bold">{selectedDie}</span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setModifier(modifier - 1)}
                className="w-6 h-6 rounded bg-[#2a2420] border border-[#3d3428] text-stone-400 hover:text-white hover:border-[#5d5448] transition-colors"
              >
                -
              </button>
              <span
                className={cn(
                  "w-10 text-center text-sm font-bold",
                  modifier > 0 ? "text-[#7ac87a]" : modifier < 0 ? "text-[#c87a7a]" : "text-stone-500",
                )}
              >
                {modifier >= 0 ? `+${modifier}` : modifier}
              </span>
              <button
                onClick={() => setModifier(modifier + 1)}
                className="w-6 h-6 rounded bg-[#2a2420] border border-[#3d3428] text-stone-400 hover:text-white hover:border-[#5d5448] transition-colors"
              >
                +
              </button>
            </div>
          </div>

          {/* Roll Label */}
          <input
            type="text"
            value={rollLabel}
            onChange={(e) => setRollLabel(e.target.value)}
            placeholder="Roll label (optional)"
            className="w-full px-2 py-1 text-xs bg-[#1a1614] border border-[#3d3428] rounded text-stone-300 placeholder:text-stone-600 focus:outline-none focus:border-[#5d5448]"
          />

          {/* Roll Button — routes through the shared cinematic overlay */}
          <button
            onClick={() => initiateRoll({ die: selectedDie, numDice, modifier, label: rollLabel || undefined })}
            disabled={busy}
            className={cn(
              "w-full py-2 rounded font-bold uppercase tracking-wider text-sm transition-all",
              "bg-gradient-to-r from-[#4a3a2a] via-[#5a4a3a] to-[#4a3a2a]",
              "border border-[#8a6a4a] hover:border-[#c9a868]",
              "text-[#c9a868] hover:text-white",
              "shadow-[0_0_15px_rgba(200,150,80,0.2)] hover:shadow-[0_0_20px_rgba(200,150,80,0.4)]",
              busy && "opacity-60 cursor-not-allowed",
            )}
          >
            {busy
              ? "Rolling..."
              : `Roll ${numDice}${selectedDie}${modifier !== 0 ? (modifier > 0 ? `+${modifier}` : modifier) : ""}`}
          </button>

          {/* Last Result — the roll log (shared by overlay + fallback results) */}
          {lastResult && (
            <div className="p-2 bg-[#0f0d0c] border border-[#3d3428] rounded">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wider text-stone-500">
                  {lastResult.label || "Result"}
                </span>
                <span className="text-[10px] text-stone-600">
                  {lastResult.rolls.length}
                  {lastResult.die}
                  {lastResult.modifier !== 0 &&
                    (lastResult.modifier > 0 ? `+${lastResult.modifier}` : lastResult.modifier)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex gap-1 flex-wrap">
                  {lastResult.rolls.map((roll, i) => (
                    <span
                      key={i}
                      className={cn(
                        "w-6 h-6 rounded flex items-center justify-center text-xs font-bold",
                        "bg-[#2a2420] border border-[#3d3428]",
                        // Highlight natural 20s and 1s for d20
                        lastResult.die === "d20" && roll === 20 && "bg-[#2a4a2a] border-[#4a8a4a] text-[#7ac87a]",
                        lastResult.die === "d20" && roll === 1 && "bg-[#4a2a2a] border-[#8a4a4a] text-[#c87a7a]",
                        !(lastResult.die === "d20" && (roll === 20 || roll === 1)) && "text-stone-300",
                      )}
                    >
                      {roll}
                    </span>
                  ))}
                  {lastResult.modifier !== 0 && (
                    <span
                      className={cn(
                        "px-1 h-6 rounded flex items-center justify-center text-xs font-bold",
                        lastResult.modifier > 0 ? "text-[#7ac87a]" : "text-[#c87a7a]",
                      )}
                    >
                      {lastResult.modifier > 0 ? `+${lastResult.modifier}` : lastResult.modifier}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-2xl font-serif font-bold text-[#d4b15a]">{lastResult.total}</span>

                  {/* Send to Lich button */}
                  {onSendToLich && (
                    <button
                      onClick={sendResultToLich}
                      className="p-1.5 rounded bg-[#2a1a2a] border border-[#6a4a8a]/60 hover:border-[#8a6aaa] text-[#a87ac8] hover:text-white transition-colors"
                      title="Send result to the Lich"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Quick Roll Buttons — each initiates a cinematic roll */}
          <div className="flex gap-1 flex-wrap">
            {quickRolls.map((qr) => (
              <button
                key={qr.label}
                onClick={() => initiateRoll(qr.spec)}
                disabled={busy}
                className={cn(
                  "px-2 py-1 text-[10px] uppercase tracking-wider rounded bg-[#2a2420] border border-[#3d3428]/60 text-stone-500 hover:text-stone-300 hover:border-[#5d5448] transition-colors",
                  busy && "opacity-60 cursor-not-allowed",
                )}
              >
                {qr.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </FantasyPanel>
  )
}
