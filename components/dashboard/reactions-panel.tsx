"use client"

import { useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"

interface Reaction {
  id: string
  name: string
  description: string
  trigger: string
  available: boolean
}

interface ReactionsPanelProps {
  reactions: Reaction[]
  reactionCount: number
  onReactionUse: (reactionId: string) => void
  characterClass?: string
}

const DEFAULT_REACTIONS: Reaction[] = [
  {
    id: "opportunity-attack",
    name: "Opportunity Attack",
    description: "Make a melee attack against a creature leaving your reach",
    trigger: "Enemy leaves your reach without Disengaging",
    available: true,
  },
  {
    id: "readied-action",
    name: "Readied Action",
    description: "Execute an action you readied earlier",
    trigger: "Your specified trigger occurs",
    available: true,
  },
]

const CLASS_REACTIONS: Record<string, Reaction[]> = {
  rogue: [
    {
      id: "uncanny-dodge",
      name: "Uncanny Dodge",
      description: "Halve the damage from an attack you can see",
      trigger: "An attacker you can see hits you",
      available: true,
    },
  ],
  wizard: [
    {
      id: "shield-spell",
      name: "Shield",
      description: "+5 AC until start of next turn",
      trigger: "You are hit by an attack or targeted by Magic Missile",
      available: true,
    },
    {
      id: "counterspell",
      name: "Counterspell",
      description: "Attempt to interrupt a creature casting a spell",
      trigger: "A creature within 60 ft casts a spell",
      available: true,
    },
  ],
  paladin: [
    {
      id: "protection",
      name: "Protection",
      description: "Impose disadvantage on attack against adjacent ally",
      trigger: "Ally within 5 ft is attacked (requires shield)",
      available: true,
    },
  ],
  fighter: [
    {
      id: "riposte",
      name: "Riposte",
      description: "Make an attack when a creature misses you",
      trigger: "A creature misses you with a melee attack (Battle Master)",
      available: true,
    },
  ],
  monk: [
    {
      id: "deflect-missiles",
      name: "Deflect Missiles",
      description: "Reduce ranged weapon damage by 1d10 + DEX + level",
      trigger: "You are hit by a ranged weapon attack",
      available: true,
    },
    {
      id: "slow-fall",
      name: "Slow Fall",
      description: "Reduce falling damage by 5x your monk level",
      trigger: "You are falling",
      available: true,
    },
  ],
  sorcerer: [
    {
      id: "shield-spell",
      name: "Shield",
      description: "+5 AC until start of next turn",
      trigger: "You are hit by an attack or targeted by Magic Missile",
      available: true,
    },
  ],
  warlock: [
    {
      id: "hellish-rebuke",
      name: "Hellish Rebuke",
      description: "Deal fire damage to creature that damaged you",
      trigger: "You are damaged by a creature you can see",
      available: true,
    },
  ],
}

export function ReactionsPanel({
  reactions: customReactions = [],
  reactionCount,
  onReactionUse,
  characterClass,
}: ReactionsPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const classReactions = characterClass
    ? CLASS_REACTIONS[characterClass.toLowerCase()] || []
    : []
  const allReactions = [...DEFAULT_REACTIONS, ...classReactions, ...customReactions]
  const hasReaction = reactionCount > 0

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  return (
    <div ref={dropdownRef} className="relative inline-block">
      {/* Dropdown trigger */}
      <button
        onClick={() => hasReaction && setIsOpen(!isOpen)}
        disabled={!hasReaction}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-medium transition-all",
          hasReaction
            ? "border-[#7a4a8a]/50 bg-[#2a1a2a]/40 hover:border-[#9a6aaa] hover:bg-[#3a2a4a]/50 text-[#c9a8d8] cursor-pointer"
            : "border-[#3d3428]/30 bg-[#1a1614]/30 text-stone-600 cursor-not-allowed"
        )}
      >
        {/* Availability light */}
        <span
          className={cn(
            "w-2 h-2 rounded-full flex-shrink-0",
            hasReaction
              ? "bg-[#b87ac8] shadow-[0_0_6px_1px_rgba(184,122,200,0.5)]"
              : "bg-stone-700"
          )}
        />
        <span>Reaction</span>
        <ChevronDown className={cn(
          "w-3 h-3 transition-transform",
          isOpen && "rotate-180"
        )} />
      </button>

      {/* Dropdown menu */}
      {isOpen && hasReaction && (
        <div className="absolute bottom-full left-0 mb-1 w-56 rounded border border-[#7a4a8a]/40 bg-[#1a1218]/95 backdrop-blur-sm shadow-xl z-50">
          <div className="py-1">
            {allReactions.map((reaction) => (
              <button
                key={reaction.id}
                onClick={() => {
                  onReactionUse(reaction.id)
                  setIsOpen(false)
                }}
                className="w-full text-left px-3 py-2 hover:bg-[#3a2a4a]/50 transition-colors"
              >
                <p className="text-xs font-medium text-[#c9a8d8]">{reaction.name}</p>
                <p className="text-[10px] text-stone-500 leading-tight mt-0.5">{reaction.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
