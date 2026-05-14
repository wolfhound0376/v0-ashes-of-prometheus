"use client"

import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { rollDice, formatDiceResult, DiceRollResult, parseDice } from "@/lib/world-ai/dice"

interface DiceModalProps {
  open: boolean
  onClose: () => void
  notation: string
  name?: string
  onResult: (result: DiceRollResult) => void
}

export function DiceModal({ open, onClose, notation, name, onResult }: DiceModalProps) {
  const [rolling, setRolling] = useState(false)
  const [result, setResult] = useState<DiceRollResult | null>(null)
  const [animatingNumber, setAnimatingNumber] = useState<number | null>(null)

  const parsed = parseDice(notation)
  const sides = parsed?.sides || 20

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setRolling(true)
      setResult(null)
      setAnimatingNumber(null)
      
      // Animate random numbers
      let animationFrame = 0
      const animate = () => {
        setAnimatingNumber(Math.floor(Math.random() * sides) + 1)
        animationFrame++
        if (animationFrame < 20) {
          setTimeout(animate, 50 + animationFrame * 10)
        } else {
          // Final roll
          const finalResult = rollDice(notation, name)
          if (finalResult) {
            setResult(finalResult)
            setAnimatingNumber(null)
            setRolling(false)
          }
        }
      }
      
      setTimeout(animate, 100)
    }
  }, [open, notation, name, sides])

  const handleClose = useCallback(() => {
    if (!rolling && result) {
      onResult(result)
      onClose()
    }
  }, [rolling, result, onResult, onClose])

  if (!open) return null

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-gradient-radial from-[#140f08]/85 via-[#0a0806]/95 to-black/95 backdrop-blur-sm" />
      
      {/* Dice Stage */}
      <div 
        className="relative w-full max-w-[500px] flex flex-col items-center gap-6 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dice Bowl */}
        <div className="relative w-[400px] h-[320px] max-w-[92vw] rounded-3xl border border-[#d4b15a]/30 overflow-hidden">
          {/* Mystical background */}
          <div className="absolute inset-0 bg-gradient-radial from-[#ffaa55]/10 via-[#60309a]/10 to-[#080410]/90" />
          <div className="absolute inset-0 shadow-[inset_0_0_80px_rgba(120,80,200,0.12),inset_0_0_30px_rgba(0,0,0,0.85)]" />
          
          {/* Runic circles */}
          <div className="absolute inset-[8%] border border-dashed border-[#d4b15a]/20 rounded-full animate-[spin_30s_linear_infinite]" />
          <div className="absolute inset-[22%] border border-[#d4b15a]/10 rounded-full animate-[spin_45s_linear_infinite_reverse]" />

          {/* Die display */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={cn(
              "w-32 h-32 flex items-center justify-center rounded-2xl transition-all duration-300",
              rolling 
                ? "bg-[#1a1510] border-2 border-[#e0651a] shadow-[0_0_30px_rgba(224,101,26,0.5)] animate-pulse"
                : result?.isCrit
                  ? "bg-[#1a2a1a] border-2 border-[#4ade80] shadow-[0_0_40px_rgba(74,222,128,0.6)]"
                  : result?.isFail
                    ? "bg-[#2a1a1a] border-2 border-[#ef4444] shadow-[0_0_40px_rgba(239,68,68,0.6)]"
                    : "bg-[#1a1510] border-2 border-[#d4b15a] shadow-[0_0_30px_rgba(212,177,90,0.4)]"
            )}>
              <span className={cn(
                "font-serif text-5xl font-bold transition-all",
                rolling && "animate-bounce",
                result?.isCrit && "text-[#4ade80]",
                result?.isFail && "text-[#ef4444]",
                !result?.isCrit && !result?.isFail && "text-[#ffd97a]"
              )}>
                {rolling ? animatingNumber : result?.total || "?"}
              </span>
            </div>
          </div>

          {/* Dice type label */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-xs font-serif uppercase tracking-wider text-[#d4b15a]">
            {sides === 100 ? "d%" : `d${sides}`}
          </div>
        </div>

        {/* Result Info */}
        <div className={cn(
          "text-center transition-all duration-300",
          rolling ? "opacity-0" : "opacity-100"
        )}>
          {/* Roll name */}
          <div className="text-xs font-serif uppercase tracking-[0.3em] text-[#d4b15a] mb-2">
            {name || `${parsed?.count || 1}D${sides} ROLL`}
          </div>

          {/* Formula */}
          {result && (
            <div className="text-sm text-stone-400 mb-2">
              {formatDiceResult(result)}
            </div>
          )}

          {/* Crit/Fail badge */}
          {result?.isCrit && (
            <div className="inline-block px-4 py-1 rounded-full bg-[#4ade80]/15 border border-[#4ade80] text-[#4ade80] text-xs font-serif uppercase tracking-wider shadow-[0_0_16px_rgba(74,222,128,0.3)] animate-in zoom-in duration-300">
              Critical Success
            </div>
          )}
          {result?.isFail && (
            <div className="inline-block px-4 py-1 rounded-full bg-[#ef4444]/15 border border-[#ef4444] text-[#ef4444] text-xs font-serif uppercase tracking-wider shadow-[0_0_16px_rgba(239,68,68,0.3)] animate-in zoom-in duration-300">
              Critical Failure
            </div>
          )}
        </div>

        {/* Dismiss hint */}
        {!rolling && result && (
          <div className="text-[10px] uppercase tracking-wider text-stone-500 animate-pulse">
            Click anywhere to dismiss
          </div>
        )}
      </div>
    </div>
  )
}
