"use client"

import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { X, Sparkles } from "lucide-react"

// D&D 5E Standard Dice Types
export type DiceType = "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "d100"
export type RollType = "normal" | "advantage" | "disadvantage"

interface DiceConfig {
  type: DiceType
  sides: number
  color: string
  bgColor: string
  borderColor: string
  glowColor: string
}

const DICE_CONFIG: Record<DiceType, DiceConfig> = {
  d4: { type: "d4", sides: 4, color: "text-red-400", bgColor: "from-red-900/60 to-red-950/80", borderColor: "border-red-500/50", glowColor: "shadow-red-500/30" },
  d6: { type: "d6", sides: 6, color: "text-orange-400", bgColor: "from-orange-900/60 to-orange-950/80", borderColor: "border-orange-500/50", glowColor: "shadow-orange-500/30" },
  d8: { type: "d8", sides: 8, color: "text-yellow-400", bgColor: "from-yellow-900/60 to-yellow-950/80", borderColor: "border-yellow-500/50", glowColor: "shadow-yellow-500/30" },
  d10: { type: "d10", sides: 10, color: "text-green-400", bgColor: "from-green-900/60 to-green-950/80", borderColor: "border-green-500/50", glowColor: "shadow-green-500/30" },
  d12: { type: "d12", sides: 12, color: "text-blue-400", bgColor: "from-blue-900/60 to-blue-950/80", borderColor: "border-blue-500/50", glowColor: "shadow-blue-500/30" },
  d20: { type: "d20", sides: 20, color: "text-purple-400", bgColor: "from-purple-900/60 to-purple-950/80", borderColor: "border-purple-500/50", glowColor: "shadow-purple-500/30" },
  d100: { type: "d100", sides: 100, color: "text-pink-400", bgColor: "from-pink-900/60 to-pink-950/80", borderColor: "border-pink-500/50", glowColor: "shadow-pink-500/30" },
}

export interface RollRequest {
  dice: DiceType
  count: number
  modifier: number
  label: string
  rollType?: RollType
  abilityModifier?: number
}

export interface RollResult {
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

interface DiceRollModalProps {
  isOpen: boolean
  onClose: () => void
  rollRequest: RollRequest | null
  onRollComplete: (result: RollResult) => void
}

// Animated dice face component
function AnimatedDie({ 
  type, 
  isRolling, 
  finalValue,
  index = 0 
}: { 
  type: DiceType
  isRolling: boolean
  finalValue: number | null
  index?: number
}) {
  const [displayValue, setDisplayValue] = useState<number>(1)
  const config = DICE_CONFIG[type]
  
  // Animate random values while rolling
  useEffect(() => {
    if (!isRolling) {
      if (finalValue !== null) {
        setDisplayValue(finalValue)
      }
      return
    }
    
    const interval = setInterval(() => {
      setDisplayValue(Math.floor(Math.random() * config.sides) + 1)
    }, 50)
    
    return () => clearInterval(interval)
  }, [isRolling, finalValue, config.sides])

  const isCrit = type === "d20" && finalValue === 20
  const isFail = type === "d20" && finalValue === 1

  return (
    <div 
      className={cn(
        "relative w-20 h-20 rounded-lg border-2 flex items-center justify-center",
        "bg-gradient-to-br transition-all duration-300",
        config.bgColor,
        config.borderColor,
        isRolling && "animate-bounce",
        isCrit && "ring-4 ring-yellow-400/60 shadow-[0_0_30px_rgba(250,204,21,0.5)]",
        isFail && "ring-4 ring-red-500/60 shadow-[0_0_30px_rgba(239,68,68,0.5)]"
      )}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Dice shape indicator */}
      <div className="absolute top-1 left-1 text-[10px] text-stone-500 font-mono">
        {type}
      </div>
      
      {/* Value display */}
      <span className={cn(
        "text-3xl font-bold font-serif transition-all",
        isRolling ? "blur-[1px] opacity-70" : "",
        isCrit ? "text-yellow-300 drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]" : "",
        isFail ? "text-red-400" : config.color
      )}>
        {displayValue}
      </span>
      
      {/* Rolling shimmer effect */}
      {isRolling && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer rounded-lg overflow-hidden" />
      )}
    </div>
  )
}

export function DiceRollModal({ 
  isOpen, 
  onClose, 
  rollRequest, 
  onRollComplete 
}: DiceRollModalProps) {
  const [isRolling, setIsRolling] = useState(false)
  const [rollResult, setRollResult] = useState<RollResult | null>(null)
  const [rollType, setRollType] = useState<RollType>("normal")
  const [showResult, setShowResult] = useState(false)

  // Reset state when modal opens with new request
  useEffect(() => {
    if (isOpen && rollRequest) {
      setRollResult(null)
      setShowResult(false)
      setRollType(rollRequest.rollType || "normal")
    }
  }, [isOpen, rollRequest])

  // Roll a single die
  const rollDie = useCallback((sides: number): number => {
    return Math.floor(Math.random() * sides) + 1
  }, [])

  // Perform the roll
  const performRoll = useCallback(() => {
    if (!rollRequest) return
    
    setIsRolling(true)
    setShowResult(false)
    
    const config = DICE_CONFIG[rollRequest.dice]
    let rolls: number[] = []
    let finalRolls: number[] = []
    
    // For d20 with advantage/disadvantage, roll 2 and take best/worst
    if (rollRequest.dice === "d20" && rollType !== "normal") {
      const roll1 = rollDie(config.sides)
      const roll2 = rollDie(config.sides)
      rolls = [roll1, roll2]
      
      if (rollType === "advantage") {
        finalRolls = [Math.max(roll1, roll2)]
      } else {
        finalRolls = [Math.min(roll1, roll2)]
      }
    } else {
      // Normal roll - roll count dice
      for (let i = 0; i < rollRequest.count; i++) {
        rolls.push(rollDie(config.sides))
      }
      finalRolls = rolls
    }
    
    // Calculate total with modifier
    const rollSum = finalRolls.reduce((a, b) => a + b, 0)
    const totalModifier = rollRequest.modifier + (rollRequest.abilityModifier || 0)
    const total = rollSum + totalModifier
    
    // Check for critical (natural 20) or critical fail (natural 1) on d20
    const isCritical = rollRequest.dice === "d20" && finalRolls.some(r => r === 20)
    const isCriticalFail = rollRequest.dice === "d20" && finalRolls.some(r => r === 1) && !isCritical
    
    const result: RollResult = {
      dice: rollRequest.dice,
      rolls: rollType !== "normal" && rollRequest.dice === "d20" ? rolls : finalRolls,
      modifier: totalModifier,
      total,
      rollType,
      isCritical,
      isCriticalFail,
      label: rollRequest.label,
      timestamp: new Date(),
    }
    
    // Animate, then show result
    setTimeout(() => {
      setRollResult(result)
      setIsRolling(false)
      setShowResult(true)
    }, 1200)
    
  }, [rollRequest, rollType, rollDie])

  // Handle completion and close
  const handleComplete = () => {
    if (rollResult) {
      onRollComplete(rollResult)
    }
    onClose()
  }

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isRolling) {
        onClose()
      }
    }
    window.addEventListener("keydown", handleEscape)
    return () => window.removeEventListener("keydown", handleEscape)
  }, [onClose, isRolling])

  if (!isOpen || !rollRequest) return null

  const config = DICE_CONFIG[rollRequest.dice]
  const diceCount = rollType !== "normal" && rollRequest.dice === "d20" ? 2 : rollRequest.count
  const totalModifier = rollRequest.modifier + (rollRequest.abilityModifier || 0)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={() => !isRolling && onClose()}
      />
      
      {/* Modal */}
      <div className={cn(
        "relative bg-gradient-to-br from-[#1a1614] to-[#0a0908] border-2 border-[#3d3428]/80",
        "rounded-xl shadow-2xl shadow-black/50 p-6 min-w-[400px] max-w-[500px]",
        "animate-in fade-in zoom-in-95 duration-200"
      )}>
        {/* Close button */}
        {!isRolling && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-stone-500 hover:text-stone-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        
        {/* Header */}
        <div className="text-center mb-4">
          <h2 className="text-xl font-bold text-[#c9b896] font-serif">
            {rollRequest.label}
          </h2>
          <p className="text-sm text-stone-500 mt-1">
            Roll {rollRequest.count}{rollRequest.dice}
            {totalModifier !== 0 && (
              <span className={totalModifier > 0 ? "text-green-400" : "text-red-400"}>
                {" "}{totalModifier > 0 ? "+" : ""}{totalModifier}
              </span>
            )}
          </p>
        </div>

        {/* Advantage/Disadvantage for d20 */}
        {rollRequest.dice === "d20" && !showResult && (
          <div className="flex justify-center gap-2 mb-4">
            <button
              onClick={() => setRollType("disadvantage")}
              disabled={isRolling}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all border",
                rollType === "disadvantage"
                  ? "bg-red-900/50 border-red-500/60 text-red-300"
                  : "bg-[#1a1614] border-[#3d3428] text-stone-500 hover:text-stone-300 hover:border-[#5a4a3a]"
              )}
            >
              Disadvantage
            </button>
            <button
              onClick={() => setRollType("normal")}
              disabled={isRolling}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all border",
                rollType === "normal"
                  ? "bg-stone-700/50 border-stone-500/60 text-stone-300"
                  : "bg-[#1a1614] border-[#3d3428] text-stone-500 hover:text-stone-300 hover:border-[#5a4a3a]"
              )}
            >
              Normal
            </button>
            <button
              onClick={() => setRollType("advantage")}
              disabled={isRolling}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all border",
                rollType === "advantage"
                  ? "bg-green-900/50 border-green-500/60 text-green-300"
                  : "bg-[#1a1614] border-[#3d3428] text-stone-500 hover:text-stone-300 hover:border-[#5a4a3a]"
              )}
            >
              Advantage
            </button>
          </div>
        )}
        
        {/* Dice Display Area */}
        <div className="flex justify-center items-center gap-3 py-6 flex-wrap min-h-[120px]">
          {Array.from({ length: diceCount }).map((_, i) => (
            <AnimatedDie
              key={i}
              type={rollRequest.dice}
              isRolling={isRolling}
              finalValue={rollResult?.rolls[i] ?? null}
              index={i}
            />
          ))}
        </div>

        {/* Result Display */}
        {showResult && rollResult && (
          <div className={cn(
            "text-center py-4 rounded-lg border mb-4 animate-in fade-in slide-in-from-bottom-4 duration-300",
            rollResult.isCritical 
              ? "bg-gradient-to-br from-yellow-900/40 to-yellow-950/60 border-yellow-500/60"
              : rollResult.isCriticalFail
                ? "bg-gradient-to-br from-red-900/40 to-red-950/60 border-red-500/60"
                : "bg-gradient-to-br from-[#2a2420] to-[#1a1614] border-[#3d3428]"
          )}>
            {/* Advantage/Disadvantage indicator */}
            {rollResult.rollType !== "normal" && rollResult.dice === "d20" && (
              <div className="flex justify-center gap-2 mb-2">
                {rollResult.rolls.map((roll, i) => {
                  const isUsed = rollResult.rollType === "advantage" 
                    ? roll === Math.max(...rollResult.rolls)
                    : roll === Math.min(...rollResult.rolls)
                  return (
                    <span key={i} className={cn(
                      "text-lg font-bold px-3 py-1 rounded",
                      isUsed ? "text-white bg-[#3d3428]" : "text-stone-600 line-through"
                    )}>
                      {roll}
                    </span>
                  )
                })}
                <span className="text-stone-500 text-sm self-center capitalize">
                  ({rollResult.rollType})
                </span>
              </div>
            )}
            
            {/* Main total */}
            <div className="flex items-center justify-center gap-3">
              {rollResult.isCritical && (
                <Sparkles className="w-8 h-8 text-yellow-400 animate-pulse" />
              )}
              <span className={cn(
                "text-6xl font-bold font-serif",
                rollResult.isCritical 
                  ? "text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.8)] animate-pulse"
                  : rollResult.isCriticalFail
                    ? "text-red-400 drop-shadow-[0_0_20px_rgba(239,68,68,0.5)]"
                    : "text-[#c9b896]"
              )}>
                {rollResult.total}
              </span>
              {rollResult.isCritical && (
                <Sparkles className="w-8 h-8 text-yellow-400 animate-pulse" />
              )}
            </div>
            
            {/* Breakdown */}
            <p className="text-sm text-stone-400 mt-2">
              {rollResult.rollType === "normal" || rollResult.dice !== "d20" ? (
                <>
                  [{rollResult.rolls.join(" + ")}]
                  {rollResult.modifier !== 0 && (
                    <span className={rollResult.modifier > 0 ? "text-green-400" : "text-red-400"}>
                      {" "}{rollResult.modifier > 0 ? "+" : ""}{rollResult.modifier}
                    </span>
                  )}
                </>
              ) : (
                <>
                  Used: {rollResult.rollType === "advantage" ? Math.max(...rollResult.rolls) : Math.min(...rollResult.rolls)}
                  {rollResult.modifier !== 0 && (
                    <span className={rollResult.modifier > 0 ? "text-green-400" : "text-red-400"}>
                      {" "}{rollResult.modifier > 0 ? "+" : ""}{rollResult.modifier}
                    </span>
                  )}
                </>
              )}
            </p>
            
            {/* Critical indicators */}
            {rollResult.isCritical && (
              <p className="text-yellow-400 font-bold text-lg mt-3 uppercase tracking-wider animate-pulse">
                Critical Hit!
              </p>
            )}
            {rollResult.isCriticalFail && (
              <p className="text-red-400 font-bold text-lg mt-3 uppercase tracking-wider">
                Critical Fail!
              </p>
            )}
          </div>
        )}

        {/* Roll / Done Button */}
        {!showResult ? (
          <button
            onClick={performRoll}
            disabled={isRolling}
            className={cn(
              "w-full py-4 rounded-lg font-bold text-xl uppercase tracking-wider transition-all",
              "bg-gradient-to-br border-2",
              config.bgColor,
              config.borderColor,
              "hover:brightness-110 hover:scale-[1.02]",
              "active:scale-[0.98]",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100",
              isRolling && "animate-pulse"
            )}
          >
            <span className={cn("flex items-center justify-center gap-3", config.color)}>
              {isRolling ? (
                <>
                  <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Rolling...
                </>
              ) : (
                <>
                  Roll {diceCount}{rollRequest.dice}
                </>
              )}
            </span>
          </button>
        ) : (
          <button
            onClick={handleComplete}
            className={cn(
              "w-full py-4 rounded-lg font-bold text-xl uppercase tracking-wider transition-all",
              "bg-gradient-to-br from-[#4a5a4a] to-[#2a3a2a] border-2 border-green-500/50",
              "hover:brightness-110 hover:scale-[1.02]",
              "active:scale-[0.98]",
              "text-green-300"
            )}
          >
            Done
          </button>
        )}
      </div>
    </div>
  )
}

// CSS for shimmer animation (add to globals.css if needed)
// @keyframes shimmer {
//   0% { transform: translateX(-100%); }
//   100% { transform: translateX(100%); }
// }
// .animate-shimmer {
//   animation: shimmer 0.8s infinite;
// }
