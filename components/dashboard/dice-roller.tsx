"use client"

import { useState, useCallback } from "react"
import { FantasyPanel } from "@/components/ui/fantasy-panel"
import { cn } from "@/lib/utils"
import { Dices, ChevronUp, ChevronDown, RotateCcw, Sparkles } from "lucide-react"

// D&D 5E Standard Dice Types
type DiceType = "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "d100"

interface DiceConfig {
  type: DiceType
  sides: number
  color: string
  bgColor: string
  borderColor: string
}

const DICE_CONFIG: Record<DiceType, DiceConfig> = {
  d4: { type: "d4", sides: 4, color: "text-red-400", bgColor: "from-red-900/40 to-red-950/60", borderColor: "border-red-500/40" },
  d6: { type: "d6", sides: 6, color: "text-orange-400", bgColor: "from-orange-900/40 to-orange-950/60", borderColor: "border-orange-500/40" },
  d8: { type: "d8", sides: 8, color: "text-yellow-400", bgColor: "from-yellow-900/40 to-yellow-950/60", borderColor: "border-yellow-500/40" },
  d10: { type: "d10", sides: 10, color: "text-green-400", bgColor: "from-green-900/40 to-green-950/60", borderColor: "border-green-500/40" },
  d12: { type: "d12", sides: 12, color: "text-blue-400", bgColor: "from-blue-900/40 to-blue-950/60", borderColor: "border-blue-500/40" },
  d20: { type: "d20", sides: 20, color: "text-purple-400", bgColor: "from-purple-900/40 to-purple-950/60", borderColor: "border-purple-500/40" },
  d100: { type: "d100", sides: 100, color: "text-pink-400", bgColor: "from-pink-900/40 to-pink-950/60", borderColor: "border-pink-500/40" },
}

// Roll Types for D&D 5E
type RollType = "normal" | "advantage" | "disadvantage"

interface RollResult {
  dice: DiceType
  rolls: number[]
  modifier: number
  total: number
  rollType: RollType
  isCritical?: boolean
  isCriticalFail?: boolean
  label?: string
  timestamp: Date
}

interface AbilityModifier {
  name: string
  abbr: string
  modifier: number
}

interface DiceRollerProps {
  abilityModifiers?: AbilityModifier[]
  proficiencyBonus?: number
  onRoll?: (result: RollResult) => void
  className?: string
}

export function DiceRoller({ 
  abilityModifiers = [],
  proficiencyBonus = 2,
  onRoll,
  className 
}: DiceRollerProps) {
  const [selectedDice, setSelectedDice] = useState<DiceType>("d20")
  const [diceCount, setDiceCount] = useState(1)
  const [modifier, setModifier] = useState(0)
  const [rollType, setRollType] = useState<RollType>("normal")
  const [isRolling, setIsRolling] = useState(false)
  const [lastResult, setLastResult] = useState<RollResult | null>(null)
  const [rollHistory, setRollHistory] = useState<RollResult[]>([])
  const [selectedAbility, setSelectedAbility] = useState<string | null>(null)

  // Roll a single die
  const rollDie = useCallback((sides: number): number => {
    return Math.floor(Math.random() * sides) + 1
  }, [])

  // Main roll function following D&D 5E rules
  const performRoll = useCallback((customLabel?: string) => {
    setIsRolling(true)
    
    const config = DICE_CONFIG[selectedDice]
    let rolls: number[] = []
    let finalRolls: number[] = []
    
    // For d20 with advantage/disadvantage, roll 2 and take best/worst
    if (selectedDice === "d20" && rollType !== "normal") {
      const roll1 = rollDie(config.sides)
      const roll2 = rollDie(config.sides)
      rolls = [roll1, roll2]
      
      if (rollType === "advantage") {
        finalRolls = [Math.max(roll1, roll2)]
      } else {
        finalRolls = [Math.min(roll1, roll2)]
      }
    } else {
      // Normal roll - roll diceCount dice
      for (let i = 0; i < diceCount; i++) {
        rolls.push(rollDie(config.sides))
      }
      finalRolls = rolls
    }
    
    // Calculate total with modifier
    const rollSum = finalRolls.reduce((a, b) => a + b, 0)
    const total = rollSum + modifier
    
    // Check for critical (natural 20) or critical fail (natural 1) on d20
    const isCritical = selectedDice === "d20" && finalRolls.some(r => r === 20)
    const isCriticalFail = selectedDice === "d20" && finalRolls.some(r => r === 1) && !isCritical
    
    const result: RollResult = {
      dice: selectedDice,
      rolls: rollType !== "normal" && selectedDice === "d20" ? rolls : finalRolls,
      modifier,
      total,
      rollType,
      isCritical,
      isCriticalFail,
      label: customLabel || (selectedAbility ? `${selectedAbility} Check` : undefined),
      timestamp: new Date(),
    }
    
    // Animate the roll
    setTimeout(() => {
      setLastResult(result)
      setRollHistory(prev => [result, ...prev].slice(0, 10))
      setIsRolling(false)
      onRoll?.(result)
    }, 600)
  }, [selectedDice, diceCount, modifier, rollType, rollDie, onRoll, selectedAbility])

  // Quick roll with ability modifier
  const quickAbilityRoll = (ability: AbilityModifier) => {
    setSelectedDice("d20")
    setDiceCount(1)
    setModifier(ability.modifier)
    setSelectedAbility(ability.name)
    
    // Perform the roll after state updates
    setTimeout(() => {
      performRoll(`${ability.name} Check`)
    }, 50)
  }

  // Quick attack roll (d20 + modifier)
  const quickAttackRoll = () => {
    setSelectedDice("d20")
    setDiceCount(1)
    performRoll("Attack Roll")
  }

  // Quick saving throw
  const quickSavingThrow = (ability: AbilityModifier, isProficient: boolean) => {
    const totalMod = ability.modifier + (isProficient ? proficiencyBonus : 0)
    setSelectedDice("d20")
    setDiceCount(1)
    setModifier(totalMod)
    performRoll(`${ability.name} Save`)
  }

  return (
    <FantasyPanel title="Dice Roller" className={className}>
      <div className="p-3 space-y-3">
        {/* Dice Selection */}
        <div className="flex gap-1 justify-center flex-wrap">
          {(Object.keys(DICE_CONFIG) as DiceType[]).map((dice) => {
            const config = DICE_CONFIG[dice]
            return (
              <button
                key={dice}
                onClick={() => {
                  setSelectedDice(dice)
                  setSelectedAbility(null)
                }}
                className={cn(
                  "px-2 py-1.5 rounded text-xs font-bold uppercase transition-all border",
                  "bg-gradient-to-br",
                  config.bgColor,
                  config.borderColor,
                  selectedDice === dice 
                    ? cn(config.color, "ring-2 ring-offset-1 ring-offset-[#1a1614]", config.borderColor.replace("border-", "ring-"))
                    : "text-stone-400 hover:text-stone-200"
                )}
              >
                {dice}
              </button>
            )
          })}
        </div>

        {/* Roll Configuration */}
        <div className="flex items-center justify-center gap-4">
          {/* Dice Count */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDiceCount(Math.max(1, diceCount - 1))}
              className="w-6 h-6 rounded bg-[#2a2420] border border-[#3d3428] flex items-center justify-center text-stone-400 hover:text-white hover:border-[#5a4a3a] transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <span className="text-lg font-bold text-[#c9b896] w-6 text-center">{diceCount}</span>
            <button
              onClick={() => setDiceCount(Math.min(10, diceCount + 1))}
              className="w-6 h-6 rounded bg-[#2a2420] border border-[#3d3428] flex items-center justify-center text-stone-400 hover:text-white hover:border-[#5a4a3a] transition-colors"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>

          <span className={cn("text-2xl font-bold", DICE_CONFIG[selectedDice].color)}>
            {selectedDice}
          </span>

          {/* Modifier */}
          <div className="flex items-center gap-1">
            <span className="text-stone-400">+</span>
            <button
              onClick={() => setModifier(modifier - 1)}
              className="w-6 h-6 rounded bg-[#2a2420] border border-[#3d3428] flex items-center justify-center text-stone-400 hover:text-white hover:border-[#5a4a3a] transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <span className={cn(
              "text-lg font-bold w-8 text-center",
              modifier >= 0 ? "text-green-400" : "text-red-400"
            )}>
              {modifier >= 0 ? `+${modifier}` : modifier}
            </span>
            <button
              onClick={() => setModifier(modifier + 1)}
              className="w-6 h-6 rounded bg-[#2a2420] border border-[#3d3428] flex items-center justify-center text-stone-400 hover:text-white hover:border-[#5a4a3a] transition-colors"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Advantage/Disadvantage for d20 */}
        {selectedDice === "d20" && (
          <div className="flex justify-center gap-2">
            <button
              onClick={() => setRollType("disadvantage")}
              className={cn(
                "px-3 py-1 rounded text-xs font-medium transition-all border",
                rollType === "disadvantage"
                  ? "bg-red-900/40 border-red-500/60 text-red-300"
                  : "bg-[#1a1614] border-[#3d3428] text-stone-500 hover:text-stone-300"
              )}
            >
              Disadvantage
            </button>
            <button
              onClick={() => setRollType("normal")}
              className={cn(
                "px-3 py-1 rounded text-xs font-medium transition-all border",
                rollType === "normal"
                  ? "bg-stone-700/40 border-stone-500/60 text-stone-300"
                  : "bg-[#1a1614] border-[#3d3428] text-stone-500 hover:text-stone-300"
              )}
            >
              Normal
            </button>
            <button
              onClick={() => setRollType("advantage")}
              className={cn(
                "px-3 py-1 rounded text-xs font-medium transition-all border",
                rollType === "advantage"
                  ? "bg-green-900/40 border-green-500/60 text-green-300"
                  : "bg-[#1a1614] border-[#3d3428] text-stone-500 hover:text-stone-300"
              )}
            >
              Advantage
            </button>
          </div>
        )}

        {/* Roll Button */}
        <button
          onClick={() => performRoll()}
          disabled={isRolling}
          className={cn(
            "w-full py-3 rounded-lg font-bold text-lg uppercase tracking-wider transition-all",
            "bg-gradient-to-br from-[#4a3a2a] to-[#2a1a0a] border-2 border-[#8a6a4a]/60",
            "hover:from-[#5a4a3a] hover:to-[#3a2a1a] hover:border-[#aa8a6a]/80",
            "active:scale-[0.98]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            isRolling && "animate-pulse"
          )}
        >
          <span className="flex items-center justify-center gap-2">
            <Dices className={cn("w-5 h-5", isRolling && "animate-spin")} />
            {isRolling ? "Rolling..." : `Roll ${diceCount}${selectedDice}`}
          </span>
        </button>

        {/* Result Display */}
        {lastResult && (
          <div className={cn(
            "p-4 rounded-lg border text-center transition-all",
            lastResult.isCritical 
              ? "bg-gradient-to-br from-yellow-900/40 to-yellow-950/60 border-yellow-500/60 animate-pulse"
              : lastResult.isCriticalFail
                ? "bg-gradient-to-br from-red-900/40 to-red-950/60 border-red-500/60"
                : "bg-gradient-to-br from-[#2a2420] to-[#1a1614] border-[#3d3428]"
          )}>
            {lastResult.label && (
              <p className="text-xs uppercase tracking-wider text-stone-400 mb-1">
                {lastResult.label}
              </p>
            )}
            
            {/* Show both rolls for advantage/disadvantage */}
            {lastResult.rollType !== "normal" && lastResult.dice === "d20" && (
              <div className="flex justify-center gap-2 mb-2">
                {lastResult.rolls.map((roll, i) => {
                  const isUsed = lastResult.rollType === "advantage" 
                    ? roll === Math.max(...lastResult.rolls)
                    : roll === Math.min(...lastResult.rolls)
                  return (
                    <span key={i} className={cn(
                      "text-lg font-bold px-2 py-0.5 rounded",
                      isUsed ? "text-white bg-[#3d3428]" : "text-stone-600 line-through"
                    )}>
                      {roll}
                    </span>
                  )
                })}
                <span className="text-stone-500 text-sm self-center">
                  ({lastResult.rollType})
                </span>
              </div>
            )}
            
            {/* Main total */}
            <div className="flex items-center justify-center gap-2">
              {lastResult.isCritical && (
                <Sparkles className="w-6 h-6 text-yellow-400 animate-bounce" />
              )}
              <span className={cn(
                "text-4xl font-bold font-serif",
                lastResult.isCritical 
                  ? "text-yellow-400 drop-shadow-[0_0_10px_rgba(250,200,50,0.8)]"
                  : lastResult.isCriticalFail
                    ? "text-red-400"
                    : "text-[#c9b896]"
              )}>
                {lastResult.total}
              </span>
              {lastResult.isCritical && (
                <Sparkles className="w-6 h-6 text-yellow-400 animate-bounce" />
              )}
            </div>
            
            {/* Breakdown */}
            <p className="text-sm text-stone-400 mt-1">
              {lastResult.rollType === "normal" || lastResult.dice !== "d20" ? (
                <>
                  [{lastResult.rolls.join(" + ")}]
                  {lastResult.modifier !== 0 && (
                    <span className={lastResult.modifier > 0 ? "text-green-400" : "text-red-400"}>
                      {" "}{lastResult.modifier > 0 ? "+" : ""}{lastResult.modifier}
                    </span>
                  )}
                </>
              ) : (
                <>
                  Used: {lastResult.rollType === "advantage" ? Math.max(...lastResult.rolls) : Math.min(...lastResult.rolls)}
                  {lastResult.modifier !== 0 && (
                    <span className={lastResult.modifier > 0 ? "text-green-400" : "text-red-400"}>
                      {" "}{lastResult.modifier > 0 ? "+" : ""}{lastResult.modifier}
                    </span>
                  )}
                </>
              )}
            </p>
            
            {/* Critical indicators */}
            {lastResult.isCritical && (
              <p className="text-yellow-400 font-bold text-sm mt-2 uppercase tracking-wider animate-pulse">
                Natural 20! Critical Hit!
              </p>
            )}
            {lastResult.isCriticalFail && (
              <p className="text-red-400 font-bold text-sm mt-2 uppercase tracking-wider">
                Natural 1! Critical Fail!
              </p>
            )}
          </div>
        )}

        {/* Quick Ability Checks */}
        {abilityModifiers.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-2 text-center">
              Quick Ability Checks
            </p>
            <div className="flex flex-wrap gap-1 justify-center">
              {abilityModifiers.map((ability) => (
                <button
                  key={ability.abbr}
                  onClick={() => quickAbilityRoll(ability)}
                  className={cn(
                    "px-2 py-1 rounded text-xs font-medium transition-all border",
                    "bg-gradient-to-br from-[#2a2a3a] to-[#1a1a2a] border-[#4a4a6a]/40",
                    "hover:border-[#6a6a8a]/60 hover:text-white text-stone-400"
                  )}
                >
                  {ability.abbr} ({ability.modifier >= 0 ? "+" : ""}{ability.modifier})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Roll History */}
        {rollHistory.length > 1 && (
          <div className="border-t border-[#3d3428]/40 pt-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] uppercase tracking-wider text-stone-500">
                Recent Rolls
              </p>
              <button
                onClick={() => setRollHistory([])}
                className="text-stone-600 hover:text-stone-400 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
            <div className="flex gap-1 flex-wrap">
              {rollHistory.slice(1, 6).map((result, i) => (
                <span
                  key={i}
                  className={cn(
                    "px-2 py-0.5 rounded text-xs",
                    result.isCritical 
                      ? "bg-yellow-900/30 text-yellow-400"
                      : result.isCriticalFail
                        ? "bg-red-900/30 text-red-400"
                        : "bg-[#2a2420] text-stone-400"
                  )}
                  title={result.label || `${result.dice} roll`}
                >
                  {result.total}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </FantasyPanel>
  )
}

// Export types for use elsewhere
export type { RollResult, DiceType, RollType, AbilityModifier }
