"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { FantasyPanel } from "@/components/ui/fantasy-panel"
import { ChevronDown, ChevronUp, Zap } from "lucide-react"
import { IconFrame } from "@/components/ui/fantasy-icons"

interface Reaction {
  id: string
  name: string
  description: string
  iconUrl?: string
  trigger: string
  available: boolean
}

interface ReactionsPanelProps {
  reactions: Reaction[]
  reactionCount: number
  onReactionUse: (reactionId: string) => void
  characterClass?: string
}

// Default D&D 5E reactions available to all characters
const DEFAULT_REACTIONS: Reaction[] = [
  {
    id: "opportunity-attack",
    name: "Opportunity Attack",
    description: "Make a melee attack against a creature leaving your reach",
    trigger: "Enemy leaves your reach without Disengaging",
    iconUrl: "/icons/actions/opportunity-attack.png",
    available: true,
  },
  {
    id: "readied-action",
    name: "Readied Action",
    description: "Execute an action you readied earlier",
    trigger: "Your specified trigger occurs",
    iconUrl: "/icons/actions/ready.png",
    available: true,
  },
]

// Class-specific reactions
const CLASS_REACTIONS: Record<string, Reaction[]> = {
  rogue: [
    {
      id: "uncanny-dodge",
      name: "Uncanny Dodge",
      description: "Halve the damage from an attack you can see",
      trigger: "An attacker you can see hits you",
      iconUrl: "/icons/actions/uncanny-dodge.png",
      available: true,
    },
  ],
  wizard: [
    {
      id: "shield-spell",
      name: "Shield",
      description: "+5 AC until start of next turn, including vs triggering attack",
      trigger: "You are hit by an attack or targeted by Magic Missile",
      iconUrl: "/icons/spells/shield.png",
      available: true,
    },
    {
      id: "counterspell",
      name: "Counterspell",
      description: "Attempt to interrupt a creature casting a spell",
      trigger: "A creature within 60 ft casts a spell",
      iconUrl: "/icons/spells/counterspell.png",
      available: true,
    },
  ],
  paladin: [
    {
      id: "protection",
      name: "Protection",
      description: "Impose disadvantage on attack against adjacent ally",
      trigger: "Ally within 5 ft is attacked (requires shield)",
      iconUrl: "/icons/actions/protection.png",
      available: true,
    },
  ],
  fighter: [
    {
      id: "riposte",
      name: "Riposte",
      description: "Make an attack when a creature misses you",
      trigger: "A creature misses you with a melee attack (Battle Master)",
      iconUrl: "/icons/actions/riposte.png",
      available: true,
    },
  ],
  monk: [
    {
      id: "deflect-missiles",
      name: "Deflect Missiles",
      description: "Reduce ranged weapon damage by 1d10 + DEX + level",
      trigger: "You are hit by a ranged weapon attack",
      iconUrl: "/icons/actions/deflect-missiles.png",
      available: true,
    },
    {
      id: "slow-fall",
      name: "Slow Fall",
      description: "Reduce falling damage by 5x your monk level",
      trigger: "You are falling",
      iconUrl: "/icons/actions/slow-fall.png",
      available: true,
    },
  ],
  sorcerer: [
    {
      id: "shield-spell",
      name: "Shield",
      description: "+5 AC until start of next turn",
      trigger: "You are hit by an attack or targeted by Magic Missile",
      iconUrl: "/icons/spells/shield.png",
      available: true,
    },
  ],
  warlock: [
    {
      id: "hellish-rebuke",
      name: "Hellish Rebuke",
      description: "Deal fire damage to creature that damaged you",
      trigger: "You are damaged by a creature you can see",
      iconUrl: "/icons/spells/hellish-rebuke.png",
      available: true,
    },
  ],
}

export function ReactionsPanel({ 
  reactions: customReactions = [], 
  reactionCount, 
  onReactionUse,
  characterClass 
}: ReactionsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Combine default reactions with class-specific ones
  const classReactions = characterClass 
    ? CLASS_REACTIONS[characterClass.toLowerCase()] || []
    : []
  
  const allReactions = [...DEFAULT_REACTIONS, ...classReactions, ...customReactions]

  return (
    <FantasyPanel className="flex-shrink-0">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#2a2420]/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#b87ac8]" />
          <span className="text-xs font-semibold tracking-[0.15em] uppercase text-[#c9b896]">
            Reactions
          </span>
          <span className={cn(
            "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
            reactionCount > 0 
              ? "bg-[#3a2a4a] text-[#b87ac8]" 
              : "bg-[#2a2420] text-stone-600"
          )}>
            {reactionCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-stone-500">
            {allReactions.length} available
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-stone-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-stone-500" />
          )}
        </div>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* Reaction explanation */}
          <p className="text-[10px] text-stone-500 italic px-1">
            Reactions trigger in response to specific events, even on others&apos; turns.
          </p>

          {/* Reaction list */}
          <div className="space-y-1">
            {allReactions.map((reaction) => (
              <button
                key={reaction.id}
                onClick={() => reactionCount > 0 && onReactionUse(reaction.id)}
                disabled={reactionCount === 0}
                className={cn(
                  "w-full flex items-start gap-3 p-2 rounded border transition-all text-left",
                  reactionCount > 0
                    ? "border-[#7a4a8a]/40 bg-[#2a1a2a]/30 hover:border-[#9a6aaa] hover:bg-[#3a2a4a]/40 cursor-pointer"
                    : "border-[#3d3428]/40 bg-[#1a1614]/40 opacity-50 cursor-not-allowed"
                )}
              >
                <IconFrame className="w-10 h-10 flex-shrink-0">
                  {reaction.iconUrl ? (
                    <img src={reaction.iconUrl} alt={reaction.name} className="w-full h-full object-cover" />
                  ) : (
                    <Zap className="w-6 h-6 text-[#b87ac8]" />
                  )}
                </IconFrame>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#c9a8d8]">{reaction.name}</p>
                  <p className="text-[10px] text-stone-500 leading-tight">{reaction.description}</p>
                  <p className="text-[10px] text-[#7a4a8a] mt-0.5 italic">
                    Trigger: {reaction.trigger}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {allReactions.length === 0 && (
            <p className="text-center text-stone-500 text-sm italic py-4">
              No reactions available
            </p>
          )}
        </div>
      )}
    </FantasyPanel>
  )
}
