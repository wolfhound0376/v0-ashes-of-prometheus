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
 *  - No regeneration when the scene changes without a new narration beat —
 *    the fetch is keyed strictly on the latest DM dialogue row.
 *  - Static quick replies remain as the fallback whenever there is no live
 *    character or the generator returns nothing, so the row never goes empty.
 */

import { useEffect, useState } from "react"
import { classifySpeaker } from "@/lib/tts"
import { getClassColor } from "@/lib/class-colors"
import type { Suggestion } from "@/lib/suggestions"
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
  /** Static quick replies shown when no generated chips are available. These
   *  carry their own observe chip so the look-around action survives a failed
   *  generation — the one chip that must never go missing. */
  fallback: Suggestion[]
  disabled?: boolean
  /** isObserve is true for the look-around chip; the parent uses it to decide
   *  whether this pick may also roll a cinematic. */
  onPick?: (text: string, isObserve: boolean) => void
}

const CHIP_CLASS =
  "rounded-full border border-[#695326] bg-[#171109] px-3.5 py-1.5 text-xs text-[#cdb276] hover:bg-[#251a0d] disabled:opacity-50"

export function SuggestionChips(props: SuggestionChipsProps) {
  const { character, dialogue, inventory, location, fallback, disabled, onPick } = props
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)

  // The latest DM narration beat is the ONLY regeneration trigger.
  const lastBeat = [...dialogue].reverse().find((entry) => entry.text?.trim() && classifySpeaker(entry.speaker) === "dm")
  const beatKey = lastBeat ? lastBeat.id ?? lastBeat.text : null
  const characterId = character?.id ?? null

  useEffect(() => {
    if (!character || !characterId || !lastBeat || !beatKey) {
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
            sceneText: lastBeat.text,
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
    // Keyed on the beat + character identity only — inventory/location changes
    // alone must NOT regenerate (locked: no regen without a new narration beat).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId, beatKey])

  const skillColor = character ? getClassColor(character.class) : undefined

  if (character && loading && !suggestions.length) {
    return (
      <div className="flex flex-wrap gap-1.5 px-3 pt-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-7 w-28 animate-pulse rounded-full border border-[#4b3a19] bg-[#171109]" />
        ))}
      </div>
    )
  }

  if (character && suggestions.length) {
    return (
      <div className="flex flex-wrap gap-1.5 px-3 pt-2">
        {suggestions.map((suggestion) => {
          const sent = suggestion.skill ? `${suggestion.text} (${suggestion.skill})` : suggestion.text
          return (
            <button
              key={sent}
              disabled={disabled}
              onClick={() => onPick?.(sent, suggestion.kind === "observe")}
              className={CHIP_CLASS}
            >
              {suggestion.text}
              {suggestion.skill ? <span style={{ color: skillColor }}>{` (${suggestion.skill})`}</span> : null}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-1.5 px-3 pt-2">
      {fallback.map((reply) => (
        <button
          key={reply.text}
          disabled={disabled}
          onClick={() => onPick?.(reply.text, reply.kind === "observe")}
          className={CHIP_CLASS}
        >
          {reply.text}
        </button>
      ))}
    </div>
  )
}
