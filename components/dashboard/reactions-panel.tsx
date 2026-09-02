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
  /**
   * Class level required, per the SRD. A level-1 rogue does not have Uncanny
   * Dodge and a level-1 wizard cannot Counterspell, and offering them anyway
   * is how a player ends up declaring something Malachar has to refuse — the
   * worst kind of UI, one that suggests an illegal move.
   */
  minLevel?: number
  /**
   * A prerequisite this app cannot check: a subclass, a fighting style, a
   * spell you had to prepare.
   *
   * Shown as a caveat rather than used to hide the entry. The dashboard does
   * not know Scott's martial archetype or whose spellbook has Shield in it,
   * and silently hiding a reaction a player DOES have is worse than showing
   * one with "if you have it" attached — the first looks like a bug, the
   * second reads as the sheet asking a question.
   */
  needs?: string
}

interface ReactionsPanelProps {
  reactions?: Reaction[]
  reactionCount: number
  onReactionUse: (reaction: { id: string; name: string; trigger: string }) => void
  characterClass?: string
  characterLevel?: number
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

/**
 * Prerequisites below are SRD 5.1 as written, not house rules. Where a
 * reaction depends on something the dashboard cannot see — a subclass, a
 * fighting style, whether a spell is prepared — that is recorded in `needs`
 * rather than guessed at.
 */
const CLASS_REACTIONS: Record<string, Reaction[]> = {
  rogue: [
    {
      id: "uncanny-dodge",
      name: "Uncanny Dodge",
      description: "Halve the damage from an attack you can see",
      trigger: "An attacker you can see hits you",
      available: true,
      minLevel: 5,
    },
  ],
  wizard: [
    {
      id: "shield-spell",
      name: "Shield",
      description: "+5 AC until start of next turn",
      trigger: "You are hit by an attack or targeted by Magic Missile",
      available: true,
      needs: "Shield prepared, and a 1st-level slot",
    },
    {
      id: "counterspell",
      name: "Counterspell",
      description: "Attempt to interrupt a creature casting a spell",
      minLevel: 5,
      needs: "Counterspell prepared, and a 3rd-level slot",
      trigger: "A creature within 60 ft casts a spell",
      available: true,
    },
  ],
  paladin: [
    {
      id: "protection",
      name: "Protection",
      description: "Impose disadvantage on attack against adjacent ally",
      trigger: "Ally within 5 ft is attacked",
      available: true,
      needs: "the Protection fighting style, and a shield",
    },
  ],
  fighter: [
    {
      id: "riposte",
      name: "Riposte",
      description: "Make an attack when a creature misses you",
      trigger: "A creature misses you with a melee attack",
      available: true,
      minLevel: 3,
      needs: "Battle Master, and a superiority die",
    },
  ],
  monk: [
    {
      id: "deflect-missiles",
      name: "Deflect Missiles",
      description: "Reduce ranged weapon damage by 1d10 + DEX + level",
      trigger: "You are hit by a ranged weapon attack",
      available: true,
      minLevel: 3,
    },
    {
      id: "slow-fall",
      name: "Slow Fall",
      description: "Reduce falling damage by 5x your monk level",
      trigger: "You are falling",
      available: true,
      minLevel: 4,
    },
  ],
  sorcerer: [
    {
      id: "shield-spell",
      name: "Shield",
      description: "+5 AC until start of next turn",
      trigger: "You are hit by an attack or targeted by Magic Missile",
      available: true,
      needs: "Shield known, and a 1st-level slot",
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
  characterLevel,
}: ReactionsPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const classReactions = characterClass
    ? CLASS_REACTIONS[characterClass.toLowerCase()] || []
    : []
  // Level gate. Without a level we show everything rather than nothing: an
  // unknown level is missing information, and hiding the whole panel because
  // a prop did not arrive would look like the feature is broken.
  const allReactions = [...DEFAULT_REACTIONS, ...classReactions, ...customReactions]
    .filter((r) => !r.minLevel || characterLevel === undefined || characterLevel >= r.minLevel)
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
                  onReactionUse({ id: reaction.id, name: reaction.name, trigger: reaction.trigger })
                  setIsOpen(false)
                }}
                className="w-full text-left px-3 py-2 hover:bg-[#3a2a4a]/50 transition-colors"
              >
                <p className="text-xs font-medium text-[#c9a8d8]">{reaction.name}</p>
                <p className="text-[10px] text-stone-500 leading-tight mt-0.5">{reaction.description}</p>
                {/*
                  The TRIGGER, which this panel has always carried in its data
                  and never once shown. It is the thing a player actually needs:
                  a reaction is not something you choose, it is something you
                  are ALLOWED to choose at one specific moment, and a list of
                  names with no triggers cannot tell you whether this is that
                  moment.
                */}
                <p className="text-[10px] text-stone-600 leading-tight mt-1 italic">
                  when: {reaction.trigger}
                </p>
                {reaction.needs && (
                  <p className="text-[10px] text-[#8a6a4a] leading-tight mt-0.5">
                    needs {reaction.needs}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
