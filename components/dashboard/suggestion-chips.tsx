"use client"

/**
 * Per-player suggested actions. (PR-3)
 *
 * With each narration beat, the player sees 2–4 clickable suggestions tailored
 * to THEIR character — diegetic phrasing first, the relevant skill in
 * parentheses tinted with the character's class color:
 *
 *   Talk him down (Persuasion)
 *
 * Locked decisions honored here:
 *  - Per-player only. Chips are generated for the selected character in this
 *    browser and never shared across clients.
 *  - Generated per character (Haiku, via /api/suggestions), not once per beat.
 *  - No regeneration when the scene changes without a new beat — the fetch is
 *    keyed strictly on the latest DM-or-NPC dialogue row. (NPC rows count:
 *    the chat route stores each quoted NPC line under the NPC's own name, so
 *    keying on Malachar alone skipped the very line the player is answering.
 *    See buildSuggestionContext in lib/suggestions.ts.)
 *  - Static quick replies remain as the fallback whenever there is no live
 *    character or the generator returns nothing, so the row never goes empty.
 */

import { useEffect, useState } from "react"
import { classifySpeaker } from "@/lib/tts"
import { getClassColor } from "@/lib/class-colors"
import { buildSuggestionContext, type Suggestion } from "@/lib/suggestions"
import { SKILL_ABILITY, normaliseSkill } from "@/lib/game-context"
import type { Character, InventoryItem } from "@/lib/types/database"

interface ChipDialogueEntry {
  id?: string
  speaker: string
  text: string
}

interface SuggestionChipsProps {
  /** The live player character to tailor for; undefined = fall back to statics. */
  character?: Character
  dialogue: ChipDialogueEntry[]
  inventory: InventoryItem[]
  location: string
  /** Who the player sat down with (camp / map talk), when that is known. */
  talkWith?: string | null
  /** The NPC currently holding the window, if any. */
  onStage?: string | null
  /** Static quick replies shown when no generated chips are available. These
   *  carry their own observe chip so the look-around action survives a failed
   *  generation — the one chip that must never go missing. */
  fallback: Suggestion[]
  disabled?: boolean
  /** isObserve is true for the look-around chip; the parent uses it to decide
   *  whether this pick may also roll a cinematic. */
  onPick?: (text: string, isObserve: boolean) => void
  /** "parley": the Parley skin's slab chips — the option's text takes the colour of the ability its check
   *  calls for (Sam, 2026-10-28), white when there is no check. Default: the classic green chips. */
  variant?: "parley"
}

/** The ability a suggestion's skill rolls on ("Persuasion" → "cha"), or null for a check-free line. */
function abilityOf(skill: string | null): string | null {
  if (!skill) return null
  const key = normaliseSkill(skill)
  return key ? SKILL_ABILITY[key] : null
}

const CHIP_CLASS =
  "rounded-full border border-[#2f8f68] bg-[#08251c] px-3.5 py-1.5 text-xs bg-gradient-to-b from-[#fff4b0] via-[#f6c453] to-[#a96f08] bg-clip-text text-transparent drop-shadow-[0_1px_1px_rgba(255,255,255,0.35)] shadow-[0_0_8px_rgba(52,211,153,0.16)] hover:border-[#6ee7b7] hover:bg-[#0d3b2a] disabled:opacity-50"

export function SuggestionChips(props: SuggestionChipsProps) {
  const { character, dialogue, inventory, location, talkWith, onStage, fallback, disabled, onPick, variant } = props
  const parley = variant === "parley"
  const chipClass = parley ? "p-slab p-sug" : CHIP_CLASS
  const rowClass = parley ? "p-chips" : "flex flex-wrap gap-1.5 px-3 pt-2"
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)

  // The latest DM-or-NPC row is the ONLY regeneration trigger. The context
  // carries the last few lines of the exchange and who is being spoken to.
  const context = buildSuggestionContext(dialogue, classifySpeaker, { talkWith, onStage })
  const beatKey = context.beatKey
  const characterId = character?.id ?? null

  useEffect(() => {
    if (!character || !characterId || !beatKey || !context.sceneText) {
      setSuggestions([])
      return
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const response = await fetch("/api/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            character: {
              name: character.name,
              class: character.class,
              level: character.level,
              skills: character.skills,
              conditions: character.conditions,
            },
            inventory: inventory.map((item) => (item.quantity > 1 ? `${item.name} x${item.quantity}` : item.name)),
            sceneText: context.sceneText,
            talkingTo: context.talkingTo,
            present: context.present,
            location,
          }),
        })
        const data = response.ok ? await response.json() : null
        if (!cancelled) setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : [])
      } catch {
        if (!cancelled) setSuggestions([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // Keyed on the beat + character identity only — inventory/location/partner
    // changes alone must NOT regenerate (locked: no regen without a new beat).
    // A talk opener is logged as an NPC row, so sitting down with someone IS a
    // new beat and the partner is read fresh when it fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId, beatKey])

  const skillColor = character ? getClassColor(character.class) : undefined

  if (character && loading && !suggestions.length) {
    return (
      <div className={rowClass} aria-busy="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={parley ? "p-slab p-sug ghost" : "h-7 w-28 animate-pulse rounded-full border border-[#4b3a19] bg-[#171109]"} />
        ))}
      </div>
    )
  }

  if (character && suggestions.length) {
    return (
      <div className={rowClass}>
        {suggestions.map((suggestion) => {
          const sent = suggestion.skill ? `${suggestion.text} (${suggestion.skill})` : suggestion.text
          const ability = parley ? abilityOf(suggestion.skill) : null
          return (
            <button
              key={sent}
              disabled={disabled}
              onClick={() => onPick?.(sent, suggestion.kind === "observe")}
              className={chipClass}
              data-ability={ability ?? undefined}
              title={suggestion.skill ? `${suggestion.skill} check` : undefined}
            >
              {suggestion.text}
              {parley
                ? (ability ? <i>{ability.toUpperCase()}</i> : null)
                : suggestion.skill ? <span style={{ color: skillColor }}>{` (${suggestion.skill})`}</span> : null}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className={rowClass}>
      {fallback.map((reply) => (
        <button
          key={reply.text}
          disabled={disabled}
          onClick={() => onPick?.(reply.text, reply.kind === "observe")}
          className={chipClass}
        >
          {reply.text}
        </button>
      ))}
    </div>
  )
}
