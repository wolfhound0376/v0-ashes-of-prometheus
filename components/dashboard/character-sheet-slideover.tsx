"use client"

// Full character sheet slide-over (v3.0). Right-anchored panel that covers ~60%
// of the width on desktop and the full screen on mobile. Dimmed backdrop; closes
// on the ✕ button, Escape, or a backdrop click. Focus is moved into the panel on
// open, trapped while open, and returned to the trigger element on close. The
// panel scrolls internally; the underlying dashboard scroll is never disturbed.

import { useEffect, useRef } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha"

const ABILITY_NAMES: Record<AbilityKey, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
}

const SKILLS_BY_ABILITY: Record<AbilityKey, string[]> = {
  str: ["Athletics"],
  dex: ["Acrobatics", "Sleight of Hand", "Stealth"],
  con: [],
  int: ["Arcana", "History", "Investigation", "Nature", "Religion"],
  wis: ["Animal Handling", "Insight", "Medicine", "Perception", "Survival"],
  cha: ["Deception", "Intimidation", "Performance", "Persuasion"],
}

const toSkillKey = (s: string) => s.toLowerCase().replace(/ /g, "_")
const signed = (n: number) => `${n >= 0 ? "+" : ""}${n}`

interface SheetCharacter {
  name: string
  race: string
  class: string
  subclass?: string | null
  level: number
  background?: string
  alignment?: string
  avatarUrl?: string | null
  experiencePoints?: number
  ac: number
  proficiencyBonus: number
  passivePerception: number
  abilities: Record<AbilityKey, { score: number; modifier: number }>
  savingThrowProficiencies: AbilityKey[]
  skillProficiencies: string[]
  skillExpertises: string[]
  languages?: string[]
  armorProficiencies?: string[]
  weaponProficiencies?: string[]
  toolProficiencies?: string[]
  features?: string[]
  personality?: unknown
}

// sheet_personality may be a plain string, or an object keyed by the four
// standard fields (in a few possible spellings). Normalize to labeled sections.
function normalizePersonality(
  personality: unknown,
): { label: string; value: string }[] {
  if (!personality) return []
  if (typeof personality === "string") {
    return personality.trim() ? [{ label: "Personality", value: personality.trim() }] : []
  }
  if (typeof personality === "object") {
    const p = personality as Record<string, unknown>
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const v = p[k]
        if (typeof v === "string" && v.trim()) return v.trim()
        if (Array.isArray(v) && v.length) return v.join(", ")
      }
      return ""
    }
    const out = [
      { label: "Traits", value: pick("traits", "personality_traits", "trait") },
      { label: "Ideals", value: pick("ideals", "ideal") },
      { label: "Bonds", value: pick("bonds", "bond") },
      { label: "Flaws", value: pick("flaws", "flaw") },
    ]
    return out.filter((o) => o.value)
  }
  return []
}

function ProfLine({ label, values }: { label: string; values?: string[] }) {
  if (!values || values.length === 0) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wider text-stone-500">{label}</span>
      <span className="text-sm text-stone-300">{values.join(", ")}</span>
    </div>
  )
}

export function CharacterSheetSlideOver({
  open,
  onClose,
  character,
}: {
  open: boolean
  onClose: () => void
  character: SheetCharacter
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    // Move focus into the panel on open.
    const t = requestAnimationFrame(() => panelRef.current?.focus())

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (focusable.length === 0) {
          e.preventDefault()
          panelRef.current.focus()
          return
        }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === first || active === panelRef.current)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      cancelAnimationFrame(t)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  // Return focus to the trigger when the panel closes.
  useEffect(() => {
    if (!open && previouslyFocused.current) {
      previouslyFocused.current.focus?.()
      previouslyFocused.current = null
    }
  }, [open])

  if (!open) return null

  const personality = normalizePersonality(character.personality)
  const xp = character.experiencePoints ?? 0

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={`${character.name} character sheet`}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute right-0 top-0 h-full w-full md:w-[60%] max-w-3xl overflow-y-auto border-l border-[#7a5f33]/60 bg-[#0f0c09] shadow-2xl outline-none animate-in slide-in-from-right duration-300"
      >
        {/* Banner */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[#3d3428]/70 bg-gradient-to-b from-[#1d1710] to-[#14100b] px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#c9a868]/60 bg-[#0a0908] shadow-[0_0_12px_rgba(201,168,104,0.3)]">
              {character.avatarUrl ? (
                <img src={character.avatarUrl || "/placeholder.svg"} alt={character.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl text-[#4a5a6a]">?</span>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-serif text-xl text-[#e6c878]">{character.name}</h2>
              <p className="truncate text-sm text-stone-400">
                Level {character.level} {character.race} {character.class}
                {character.subclass ? ` · ${character.subclass}` : ""}
              </p>
              <p className="text-[11px] text-stone-500">
                XP {xp.toLocaleString()}
                {character.background ? ` · ${character.background}` : ""}
                {character.alignment ? ` · ${character.alignment}` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close character sheet"
            className="rounded-sm p-1.5 text-stone-500 transition-colors hover:text-stone-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-5 p-4">
          {/* Ability medallions */}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {(Object.keys(ABILITY_NAMES) as AbilityKey[]).map((ab) => {
              const d = character.abilities[ab]
              return (
                <div
                  key={ab}
                  className="flex flex-col items-center rounded-lg border border-[#7a5f33]/50 bg-[#14100b] py-3"
                >
                  <span className="text-[10px] uppercase tracking-widest text-stone-500">{ABILITY_NAMES[ab]}</span>
                  <span className={cn("text-2xl font-bold", d.modifier >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {signed(d.modifier)}
                  </span>
                  <span className="mt-0.5 flex h-6 w-9 items-center justify-center rounded-full border border-[#c9a868]/40 text-xs text-stone-300">
                    {d.score}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-md border border-[#3d3428]/60 bg-[#14100b] py-2">
              <div className="text-lg font-bold text-stone-200">{character.ac}</div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500">Armor Class</div>
            </div>
            <div className="rounded-md border border-[#3d3428]/60 bg-[#14100b] py-2">
              <div className="text-lg font-bold text-stone-200">{signed(character.proficiencyBonus)}</div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500">Proficiency</div>
            </div>
            <div className="rounded-md border border-[#3d3428]/60 bg-[#14100b] py-2">
              <div className="text-lg font-bold text-stone-200">{character.passivePerception}</div>
              <div className="text-[10px] uppercase tracking-wider text-stone-500">Passive Perc.</div>
            </div>
          </div>

          {/* Saves + Skills */}
          <div className="grid gap-4 md:grid-cols-2">
            <section>
              <h3 className="mb-2 font-serif text-sm text-[#d9bd7e]">Saving Throws</h3>
              <div className="grid grid-cols-2 gap-1">
                {(Object.keys(ABILITY_NAMES) as AbilityKey[]).map((ab) => {
                  const prof = character.savingThrowProficiencies.includes(ab)
                  const bonus = character.abilities[ab].modifier + (prof ? character.proficiencyBonus : 0)
                  return (
                    <div
                      key={ab}
                      className="flex items-center justify-between rounded-sm border border-[#3d3428]/50 px-2 py-1 text-sm"
                    >
                      <span className="flex items-center gap-1.5 text-stone-400">
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            prof ? "bg-emerald-400" : "border border-stone-600",
                          )}
                        />
                        {ABILITY_NAMES[ab]}
                      </span>
                      <span className={prof ? "font-medium text-emerald-400" : "text-stone-400"}>{signed(bonus)}</span>
                    </div>
                  )
                })}
              </div>
            </section>

            <section>
              <h3 className="mb-2 font-serif text-sm text-[#d9bd7e]">Skills</h3>
              <div className="grid grid-cols-1 gap-0.5">
                {(Object.keys(SKILLS_BY_ABILITY) as AbilityKey[]).flatMap((ab) =>
                  SKILLS_BY_ABILITY[ab].map((skill) => {
                    const key = toSkillKey(skill)
                    const prof = character.skillProficiencies.includes(key)
                    const expertise = character.skillExpertises.includes(key)
                    const bonus =
                      character.abilities[ab].modifier +
                      (expertise ? character.proficiencyBonus * 2 : prof ? character.proficiencyBonus : 0)
                    return (
                      <div key={skill} className="flex items-center justify-between rounded-sm px-2 py-1 text-sm">
                        <span
                          className={cn(
                            "flex items-center gap-1.5",
                            expertise ? "text-yellow-300" : prof ? "text-emerald-300" : "text-stone-400",
                          )}
                        >
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full",
                              expertise ? "bg-yellow-400" : prof ? "bg-emerald-400" : "border border-stone-600",
                            )}
                          />
                          {skill}
                          <span className="text-[10px] text-stone-600">{ABILITY_NAMES[ab]}</span>
                        </span>
                        <span
                          className={cn(
                            "font-medium",
                            expertise ? "text-yellow-400" : prof ? "text-emerald-400" : "text-stone-400",
                          )}
                        >
                          {signed(bonus)}
                        </span>
                      </div>
                    )
                  }),
                )}
              </div>
            </section>
          </div>

          {/* Personality */}
          {personality.length > 0 && (
            <section>
              <h3 className="mb-2 font-serif text-sm text-[#d9bd7e]">Personality</h3>
              <div className="flex flex-col gap-2">
                {personality.map((p) => (
                  <div key={p.label} className="rounded-sm border border-[#3d3428]/50 bg-[#14100b] px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wider text-stone-500">{p.label}</div>
                    <p className="text-sm leading-relaxed text-stone-300">{p.value}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Proficiencies */}
          <section>
            <h3 className="mb-2 font-serif text-sm text-[#d9bd7e]">Proficiencies &amp; Languages</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <ProfLine label="Languages" values={character.languages} />
              <ProfLine label="Armor" values={character.armorProficiencies} />
              <ProfLine label="Weapons" values={character.weaponProficiencies} />
              <ProfLine label="Tools" values={character.toolProficiencies} />
            </div>
            {character.features && character.features.length > 0 && (
              <div className="mt-3 flex flex-col gap-0.5">
                <span className="text-[11px] uppercase tracking-wider text-stone-500">Features</span>
                <span className="text-sm text-stone-300">{character.features.join(", ")}</span>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
