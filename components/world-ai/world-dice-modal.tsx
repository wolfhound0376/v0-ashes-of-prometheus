"use client"

import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"

interface WorldDiceModalProps {
  isOpen: boolean
  onClose: () => void
  notation: string // e.g., "1d20", "2d6+3"
  rollName: string
  onRollComplete: (total: number) => void
}

// Parse dice notation like "1d20", "2d6+3", "1d100"
function parseDiceNotation(notation: string): { count: number; sides: number; modifier: number } {
  const match = notation.match(/(\d+)?d(\d+)([+-]\d+)?/)
  if (!match) return { count: 1, sides: 20, modifier: 0 }
  return {
    count: parseInt(match[1] || "1"),
    sides: parseInt(match[2]),
    modifier: parseInt(match[3] || "0")
  }
}

// Roll a single die
function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1
}

export function WorldDiceModal({ isOpen, onClose, notation, rollName, onRollComplete }: WorldDiceModalProps) {
  const [isRolling, setIsRolling] = useState(false)
  const [rollResult, setRollResult] = useState<{
    rolls: number[]
    modifier: number
    total: number
    isCrit: boolean
    isFail: boolean
  } | null>(null)
  const [displayValues, setDisplayValues] = useState<number[]>([])

  const { count, sides, modifier } = parseDiceNotation(notation)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsRolling(false)
      setRollResult(null)
      setDisplayValues(Array(count).fill(1))
    }
  }, [isOpen, count])

  // Animate dice tumbling
  useEffect(() => {
    if (!isRolling) return

    const interval = setInterval(() => {
      setDisplayValues(Array(count).fill(0).map(() => rollDie(sides)))
    }, 80)

    const timeout = setTimeout(() => {
      clearInterval(interval)
      
      // Final roll
      const rolls = Array(count).fill(0).map(() => rollDie(sides))
      const total = rolls.reduce((a, b) => a + b, 0) + modifier
      const isCrit = count === 1 && sides === 20 && rolls[0] === 20
      const isFail = count === 1 && sides === 20 && rolls[0] === 1

      setDisplayValues(rolls)
      setRollResult({ rolls, modifier, total, isCrit, isFail })
      setIsRolling(false)
      
      // Notify after a brief delay for the result to show
      setTimeout(() => {
        onRollComplete(total)
      }, 1500)
    }, 1200)

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [isRolling, count, sides, modifier, onRollComplete])

  const handleRoll = useCallback(() => {
    if (isRolling || rollResult) return
    setIsRolling(true)
  }, [isRolling, rollResult])

  const handleBackdropClick = () => {
    if (rollResult) {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(20,15,8,0.85)_0%,rgba(0,0,0,0.95)_80%)] backdrop-blur-[10px] animate-in fade-in duration-300"
    >
      <div onClick={e => e.stopPropagation()} className="relative w-full max-w-[600px] flex flex-col items-center gap-4 px-5">
        {/* Dice stage */}
        <div className="relative w-[480px] h-[380px] max-w-[92vw] max-h-[50vh] rounded-[22px] border border-[rgba(212,177,90,0.3)] overflow-hidden"
          style={{
            background: `
              radial-gradient(ellipse at 30% 20%, rgba(255,210,140,0.10), transparent 60%),
              radial-gradient(ellipse at 70% 85%, rgba(160,120,255,0.08), transparent 60%),
              radial-gradient(ellipse at center, rgba(60,30,90,0.35), rgba(8,4,16,0.9) 75%)
            `,
            boxShadow: "inset 0 0 80px rgba(120,80,200,0.12), inset 0 0 30px rgba(0,0,0,0.85), 0 25px 70px rgba(0,0,0,0.7)"
          }}
        >
          {/* Spinning rune circles */}
          <div className="absolute inset-[8%] rounded-full border border-dashed border-[rgba(212,177,90,0.18)] animate-spin" style={{ animationDuration: "30s" }} />
          <div className="absolute inset-[22%] rounded-full border border-[rgba(212,177,90,0.08)] animate-spin" style={{ animationDuration: "45s", animationDirection: "reverse" }} />

          {/* Dice display area */}
          <div className="absolute inset-0 flex items-center justify-center gap-4 flex-wrap p-8">
            {displayValues.map((value, i) => (
              <div
                key={i}
                className={cn(
                  "w-20 h-20 rounded-lg flex items-center justify-center text-3xl font-serif font-bold transition-all duration-100",
                  isRolling && "animate-bounce",
                  rollResult?.isCrit && "text-[#4ade80] shadow-[0_0_20px_rgba(74,222,128,0.5)]",
                  rollResult?.isFail && "text-[#ef4444] shadow-[0_0_20px_rgba(239,68,68,0.5)]",
                  !rollResult?.isCrit && !rollResult?.isFail && "text-[#ffd97a]"
                )}
                style={{
                  background: "linear-gradient(135deg, rgba(60,50,40,0.8) 0%, rgba(30,25,20,0.9) 100%)",
                  border: "2px solid rgba(212,177,90,0.4)",
                  boxShadow: "inset 0 2px 4px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.4)"
                }}
              >
                {value}
              </div>
            ))}
          </div>

          {/* Roll button overlay */}
          {!isRolling && !rollResult && (
            <button
              onClick={handleRoll}
              className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-[#e0651a] hover:bg-[#ff8530] text-[#0a0908] font-serif text-sm tracking-[0.15em] font-bold px-8 py-3 rounded transition-all hover:shadow-[0_0_24px_rgba(224,101,26,0.6)]"
            >
              ROLL {notation.toUpperCase()}
            </button>
          )}
        </div>

        {/* Result display */}
        <div className={cn(
          "text-center transition-all duration-400",
          rollResult ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3.5"
        )}>
          <div className="font-serif text-xs tracking-[0.3em] text-[#d4b15a] mb-1.5" style={{ fontVariant: "small-caps" }}>
            {rollName}
          </div>
          <div className="font-mono text-xs text-[#8a8070] mb-1">
            {rollResult && (
              <>
                [{rollResult.rolls.join(" + ")}]
                {modifier !== 0 && ` ${modifier >= 0 ? "+" : ""}${modifier}`}
                {" = "}
                <span className="text-[#ffd97a] font-bold text-base">{rollResult.total}</span>
              </>
            )}
          </div>
          {/* Crit/fail tag */}
          {rollResult?.isCrit && (
            <span className="inline-block mt-2 font-serif text-xs tracking-[0.22em] px-3.5 py-1 rounded-full bg-[rgba(74,222,128,0.18)] border border-[#4ade80] text-[#4ade80] shadow-[0_0_16px_rgba(74,222,128,0.3)]" style={{ fontVariant: "small-caps" }}>
              CRITICAL HIT
            </span>
          )}
          {rollResult?.isFail && (
            <span className="inline-block mt-2 font-serif text-xs tracking-[0.22em] px-3.5 py-1 rounded-full bg-[rgba(239,68,68,0.18)] border border-[#ef4444] text-[#ef4444] shadow-[0_0_16px_rgba(239,68,68,0.3)]" style={{ fontVariant: "small-caps" }}>
              CRITICAL FAIL
            </span>
          )}
        </div>

        {/* Dismiss hint */}
        {rollResult && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-[#8a8070] tracking-[0.25em] font-mono animate-pulse">
            CLICK ANYWHERE TO DISMISS
          </div>
        )}
      </div>
    </div>
  )
}
