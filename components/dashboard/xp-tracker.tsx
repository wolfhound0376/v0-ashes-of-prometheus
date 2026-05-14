"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { XP_THRESHOLDS, getXPForNextLevel, getXPToNextLevel, canLevelUp, getXPProgressPercent } from "@/lib/game-data"
import { Star, ChevronUp, Sparkles, TrendingUp } from "lucide-react"

interface XPTrackerProps {
  currentXP: number
  currentLevel: number
  characterName?: string
  onLevelUp?: () => void
  onAddXP?: (amount: number, reason: string) => void
  className?: string
}

export function XPTracker({
  currentXP,
  currentLevel,
  characterName = "Character",
  onLevelUp,
  onAddXP,
  className
}: XPTrackerProps) {
  const [showXPInput, setShowXPInput] = useState(false)
  const [xpAmount, setXpAmount] = useState("")
  const [xpReason, setXpReason] = useState("")

  const readyToLevelUp = canLevelUp(currentXP, currentLevel)
  const xpToNext = getXPToNextLevel(currentXP, currentLevel)
  const xpForNextLevel = getXPForNextLevel(currentLevel)
  const progressPercent = getXPProgressPercent(currentXP, currentLevel)
  const currentLevelXP = XP_THRESHOLDS[currentLevel] || 0

  const handleAddXP = () => {
    const amount = parseInt(xpAmount)
    if (amount > 0 && onAddXP) {
      onAddXP(amount, xpReason || "XP gained")
      setXpAmount("")
      setXpReason("")
      setShowXPInput(false)
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* XP Bar Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Star className="w-3.5 h-3.5 text-[#d4b15a]" />
          <span className="text-[10px] uppercase tracking-wider text-stone-500">Experience</span>
        </div>
        <div className="text-xs text-stone-400">
          <span className="text-[#d4b15a] font-medium">{currentXP.toLocaleString()}</span>
          <span className="text-stone-600"> / </span>
          <span>{xpForNextLevel.toLocaleString()} XP</span>
        </div>
      </div>

      {/* XP Progress Bar */}
      <div className="relative h-4 bg-[#1a1614] rounded border border-[#3d3428]/60 overflow-hidden">
        <div 
          className={cn(
            "absolute inset-y-0 left-0 transition-all duration-500",
            readyToLevelUp 
              ? "bg-gradient-to-r from-[#d4b15a] via-[#f0d78c] to-[#d4b15a] animate-pulse" 
              : "bg-gradient-to-r from-[#4a3a2a] to-[#6a5a4a]"
          )}
          style={{ width: `${progressPercent}%` }}
        />
        {/* XP text overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-medium text-stone-300 drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
            {currentLevel >= 20 ? "MAX LEVEL" : `${xpToNext.toLocaleString()} XP to Level ${currentLevel + 1}`}
          </span>
        </div>
      </div>

      {/* Level Up Alert */}
      {readyToLevelUp && (
        <button
          onClick={onLevelUp}
          className="w-full flex items-center justify-center gap-2 p-2 rounded border border-[#d4b15a]/50 bg-gradient-to-r from-[#2a2a1a] to-[#3a3a2a] hover:from-[#3a3a2a] hover:to-[#4a4a3a] transition-all group"
        >
          <Sparkles className="w-4 h-4 text-[#d4b15a] animate-pulse" />
          <span className="text-sm font-medium text-[#f0d78c]">Ready to Level Up!</span>
          <ChevronUp className="w-4 h-4 text-[#d4b15a] group-hover:translate-y-[-2px] transition-transform" />
        </button>
      )}

      {/* Add XP Button / Form */}
      {!showXPInput ? (
        <button
          onClick={() => setShowXPInput(true)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-stone-500 hover:text-stone-300 transition-colors"
        >
          <TrendingUp className="w-3 h-3" />
          <span>Add XP</span>
        </button>
      ) : (
        <div className="space-y-2 p-2 rounded border border-[#3d3428]/60 bg-[#0f0d0c]">
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="XP Amount"
              value={xpAmount}
              onChange={(e) => setXpAmount(e.target.value)}
              className="flex-1 px-2 py-1 text-sm bg-[#1a1614] border border-[#3d3428] rounded text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-[#5d5448]"
            />
            <input
              type="text"
              placeholder="Reason (optional)"
              value={xpReason}
              onChange={(e) => setXpReason(e.target.value)}
              className="flex-1 px-2 py-1 text-sm bg-[#1a1614] border border-[#3d3428] rounded text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-[#5d5448]"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddXP}
              disabled={!xpAmount || parseInt(xpAmount) <= 0}
              className="flex-1 py-1 text-xs font-medium text-[#1a1614] bg-[#d4b15a] rounded hover:bg-[#e0c06a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Add XP
            </button>
            <button
              onClick={() => { setShowXPInput(false); setXpAmount(""); setXpReason(""); }}
              className="px-3 py-1 text-xs text-stone-400 hover:text-stone-200 transition-colors"
            >
              Cancel
            </button>
          </div>
          {/* Quick XP buttons */}
          <div className="flex gap-1 flex-wrap">
            {[25, 50, 100, 200, 500].map(amount => (
              <button
                key={amount}
                onClick={() => setXpAmount(amount.toString())}
                className="px-2 py-0.5 text-[10px] text-stone-500 border border-[#3d3428]/60 rounded hover:bg-[#2a2420] hover:text-stone-300 transition-colors"
              >
                +{amount}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* XP Milestones */}
      <div className="flex justify-between text-[9px] text-stone-600 px-1">
        <span>Lvl {currentLevel}: {currentLevelXP.toLocaleString()}</span>
        {currentLevel < 20 && <span>Lvl {currentLevel + 1}: {xpForNextLevel.toLocaleString()}</span>}
      </div>
    </div>
  )
}
