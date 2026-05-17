"use client"

import { useState } from "react"
import { ChevronDown, Check, User, Dumbbell, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

// D&D 5E Skills mapped to abilities
const SKILLS = {
  str: ["Athletics"],
  dex: ["Acrobatics", "Sleight of Hand", "Stealth"],
  con: [],
  int: ["Arcana", "History", "Investigation", "Nature", "Religion"],
  wis: ["Animal Handling", "Insight", "Medicine", "Perception", "Survival"],
  cha: ["Deception", "Intimidation", "Performance", "Persuasion"]
} as const

const ABILITY_NAMES = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma"
} as const

type AbilityKey = keyof typeof ABILITY_NAMES

interface AbilityScore {
  base: number
  score: number
  modifier: number
}

interface CharacterDetails {
  name: string
  race: string
  class: string
  subclass?: string
  level: number
  background: string
  alignment: string
  age?: number
  height?: string
  weight?: string
  eyes?: string
  skin?: string
  hair?: string
  avatarUrl?: string | null
  abilities: Record<AbilityKey, AbilityScore>
  savingThrowProficiencies: AbilityKey[]
  skillProficiencies: string[]
  skillExpertises: string[]
  proficiencyBonus: number
}

interface ClassAbility {
  name: string
  options: string[]
  selected?: string
}

interface DetailedStatsProps {
  character: CharacterDetails
  classAbilities?: Record<string, ClassAbility>
  onClassAbilityChange?: (abilityName: string, selected: string) => void
}

export function DetailedStats({ 
  character, 
  classAbilities = {},
  onClassAbilityChange 
}: DetailedStatsProps) {
  const [showAppearance, setShowAppearance] = useState(false)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Character Identity Header */}
      <div className="p-3 border-b border-[#3d3428]/40">
        <div className="flex items-center gap-2 mb-2">
          <User className="w-4 h-4 text-[#7aa8c8]" />
          <span className="text-lg font-serif text-[#e8dcc8]">{character.name}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-stone-500">Race</span>
            <span className="text-stone-300">{character.race}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-500">Class</span>
            <span className="text-[#7aa8c8]">{character.class} {character.level}</span>
          </div>
          {character.subclass && (
            <div className="flex justify-between">
              <span className="text-stone-500">Subclass</span>
              <span className="text-purple-400">{character.subclass}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-stone-500">Background</span>
            <span className="text-stone-300">{character.background}</span>
          </div>
          <div className="flex justify-between col-span-2">
            <span className="text-stone-500">Alignment</span>
            <span className="text-stone-300">{character.alignment}</span>
          </div>
        </div>
        
        {/* Appearance Toggle */}
        <button
          onClick={() => setShowAppearance(!showAppearance)}
          className="mt-2 w-full flex items-center justify-between text-xs text-stone-500 hover:text-stone-300 transition-colors"
        >
          <span className="uppercase tracking-wider">Appearance</span>
          <ChevronDown className={cn("w-4 h-4 transition-transform", showAppearance && "rotate-180")} />
        </button>
        {showAppearance && (
          <div className="mt-2 space-y-3">
            {/* Character Portrait */}
            <div className="flex justify-center">
              <div className="w-24 h-24 rounded-full bg-[#0a0908] border-2 border-[#c9a868]/60 shadow-[0_0_12px_rgba(201,168,104,0.3)] overflow-hidden flex items-center justify-center">
                {character.avatarUrl ? (
                  <img 
                    src={character.avatarUrl} 
                    alt={character.name} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-10 h-10 text-[#4a5a6a]" />
                )}
              </div>
            </div>
            {/* Physical Details */}
            <div className="grid grid-cols-3 gap-2 text-xs">
            {character.age && (
              <div className="text-center p-1 bg-[#1a1614]/60 rounded">
                <div className="text-stone-500">Age</div>
                <div className="text-stone-300">{character.age}</div>
              </div>
            )}
            {character.height && (
              <div className="text-center p-1 bg-[#1a1614]/60 rounded">
                <div className="text-stone-500">Height</div>
                <div className="text-stone-300">{character.height}</div>
              </div>
            )}
            {character.weight && (
              <div className="text-center p-1 bg-[#1a1614]/60 rounded">
                <div className="text-stone-500">Weight</div>
                <div className="text-stone-300">{character.weight}</div>
              </div>
            )}
            {character.eyes && (
              <div className="text-center p-1 bg-[#1a1614]/60 rounded">
                <div className="text-stone-500">Eyes</div>
                <div className="text-stone-300">{character.eyes}</div>
              </div>
            )}
            {character.skin && (
              <div className="text-center p-1 bg-[#1a1614]/60 rounded">
                <div className="text-stone-500">Skin</div>
                <div className="text-stone-300">{character.skin}</div>
              </div>
            )}
            {character.hair && (
              <div className="text-center p-1 bg-[#1a1614]/60 rounded">
                <div className="text-stone-500">Hair</div>
                <div className="text-stone-300">{character.hair}</div>
              </div>
            )}
            </div>
          </div>
        )}
      </div>

      {/* Ability Scores & Skills */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {(Object.keys(ABILITY_NAMES) as AbilityKey[]).map((ability) => {
          const abilityData = character.abilities[ability]
          const hasSaveProf = character.savingThrowProficiencies.includes(ability)
          const saveBonus = abilityData.modifier + (hasSaveProf ? character.proficiencyBonus : 0)
          const skills = SKILLS[ability]

          return (
            <div key={ability} className="border border-[#3d3428]/40 rounded overflow-hidden">
              {/* Ability Header */}
              <div className="flex items-center gap-2 p-2 bg-[#1a1614]/60">
                <Dumbbell className="w-4 h-4 text-stone-500" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#c9b896]">{ABILITY_NAMES[ability]}</span>
                    <span className="text-xs text-stone-500">({ability.toUpperCase()})</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-stone-200">{abilityData.score}</div>
                  <div className="text-xs text-stone-400">
                    {abilityData.base !== abilityData.score && (
                      <span className="text-stone-500">Base {abilityData.base} → </span>
                    )}
                    <span className={abilityData.modifier >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {abilityData.modifier >= 0 ? "+" : ""}{abilityData.modifier}
                    </span>
                  </div>
                </div>
              </div>

              {/* Saving Throw & Skills */}
              <div className="p-2 space-y-1 text-sm">
                {/* Saving Throw */}
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-3 h-3 rounded-full border flex items-center justify-center",
                    hasSaveProf ? "bg-emerald-400 border-emerald-400" : "border-stone-500"
                  )}>
                    {hasSaveProf && <Check className="w-2 h-2 text-[#1a1614]" />}
                  </div>
                  <span className="flex-1 text-stone-400">Saving Throw</span>
                  <span className={cn(
                    "font-medium",
                    hasSaveProf ? "text-emerald-400" : "text-stone-400"
                  )}>
                    {saveBonus >= 0 ? "+" : ""}{saveBonus}
                  </span>
                </div>

                {/* Skills */}
                {skills.map((skill) => {
                  const skillKey = skill.toLowerCase().replace(/ /g, '_')
                  const hasProf = character.skillProficiencies.includes(skillKey)
                  const hasExpertise = character.skillExpertises.includes(skillKey)
                  const bonus = abilityData.modifier + 
                    (hasExpertise ? character.proficiencyBonus * 2 : 
                     hasProf ? character.proficiencyBonus : 0)

                  return (
                    <div key={skill} className="flex items-center gap-2">
                      <div className={cn(
                        "w-3 h-3 rounded-full border flex items-center justify-center",
                        hasExpertise ? "bg-yellow-400 border-yellow-400" :
                        hasProf ? "bg-emerald-400 border-emerald-400" : "border-stone-500"
                      )}>
                        {(hasProf || hasExpertise) && <Check className="w-2 h-2 text-[#1a1614]" />}
                      </div>
                      <span className={cn(
                        "flex-1",
                        hasExpertise ? "text-yellow-300" :
                        hasProf ? "text-emerald-300" : "text-stone-400"
                      )}>
                        {skill}
                        {hasExpertise && <span className="text-[10px] ml-1">(E)</span>}
                      </span>
                      <span className={cn(
                        "font-medium",
                        hasExpertise ? "text-yellow-400" :
                        hasProf ? "text-emerald-400" : "text-stone-400"
                      )}>
                        {bonus >= 0 ? "+" : ""}{bonus}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Class-Specific Abilities (Domains, etc.) */}
        {Object.keys(classAbilities).length > 0 && (
          <div className="border border-[#3d3428]/40 rounded overflow-hidden">
            <div className="flex items-center gap-2 p-2 bg-[#1a1614]/60">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-[#c9b896]">Class Abilities</span>
            </div>
            <div className="p-2 space-y-2">
              {Object.entries(classAbilities).map(([key, ability]) => (
                <div key={key}>
                  <label className="block text-xs text-stone-500 mb-1">{ability.name}</label>
                  <select
                    value={ability.selected || ""}
                    onChange={(e) => onClassAbilityChange?.(key, e.target.value)}
                    className="w-full bg-[#1a1614] border border-[#3d3428] rounded px-2 py-1.5 text-sm text-stone-300 focus:border-[#7aa8c8] focus:outline-none"
                  >
                    <option value="">Select...</option>
                    {ability.options.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
