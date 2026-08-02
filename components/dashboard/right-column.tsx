"use client"

import { useState } from "react"
import { FantasyPanel } from "@/components/ui/fantasy-panel"
import { FloatingWindow } from "@/components/ui/floating-window"
import { BackpackIcon, IconFrame } from "@/components/ui/fantasy-icons"
import { Sparkles, ChevronDown, Package, Swords, BookOpen, User2, Shield, Heart, Zap, Eye, Star, Dices } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDice, describeRoll } from "@/components/dice/dice-provider"
import { BasicInventory } from "./basic-inventory"
import { EquippedItemsPanel } from "./equipped-items-panel"
import {
  characterVisualState,
  VISUAL_STATE_FILTER,
  VISUAL_STATE_OVERLAY,
} from "@/lib/character-visual-state"

// Import panel content components
import { ProficienciesPanel } from "./panels/proficiencies-panel"
import { AttacksSpellcasting } from "./panels/attacks-spellcasting"
import { DetailedStats } from "./panels/detailed-stats"
import { AcBreakdownModal, AbilityDetailModal, type AbilityKey } from "./panels/stat-modals"
import { CharacterSheetSlideOver } from "./character-sheet-slideover"
import { XPTracker } from "./xp-tracker"

import type { Character as DBCharacter, InventoryItem as DBInventoryItem, EquipmentItem as DBEquipmentItem } from "@/lib/types/database"
import { ConditionBadges } from "@/components/conditions/condition-badges"

interface RightColumnProps {
  characters: DBCharacter[]
  selectedCharacterId: string | null
  onCharacterSelect: (id: string) => void
  // When true (claim-locked browser), hide the character picker entirely so a
  // player can't switch to someone else's sheet.
  disableCharacterSelect?: boolean
  selectedCharacter?: DBCharacter
  characterInventory: DBInventoryItem[]
  characterEquipment: DBEquipmentItem[]
  loading: boolean
  onEquipItem?: (itemId: string, slot: string) => void
  onUnequipItem?: (slot: string) => void
  onAddXP?: (characterId: string, amount: number, reason: string) => void
  onLevelUp?: (characterId: string) => void
}

// Equipment Slot Button Component. Doubles as a drag-and-drop target: pass
// `dropState` to render hover ("over"), accept ("valid") or reject ("reject")
// feedback, and the onDrag* handlers to wire native HTML5 drop events.
function EquipmentSlotButton({ 
  slot, 
  equipped, 
  isSelected, 
  onClick, 
  className,
  dropState = "idle",
  onDragOver,
  onDragLeave,
  onDrop,
}: { 
  slot: { id: string; label: string; icon: string }
  equipped: { id: string; name: string; iconUrl?: string | null; slot?: string } | null | undefined
  isSelected: boolean
  onClick: () => void
  className?: string
  dropState?: "idle" | "valid" | "reject"
  onDragOver?: (e: React.DragEvent) => void
  onDragLeave?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
}) {
  return (
    <button
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "rounded border transition-all flex items-center justify-center group",
        equipped 
          ? "border-[#4a7a9a]/60 bg-[#1a2a35]/60 shadow-[0_0_10px_rgba(100,150,200,0.3)]" 
          : "border-[#3d3428]/60 bg-[#1a1614]/90 hover:border-[#5d5448] hover:bg-[#2a2420]/80",
        isSelected && "ring-2 ring-[#d4b15a]/60 border-[#d4b15a]/40",
        dropState === "valid" && "ring-2 ring-emerald-400/80 border-emerald-400/60 bg-emerald-500/10",
        dropState === "reject" && "ring-2 ring-red-500/80 border-red-500/70 bg-red-500/15 animate-pulse",
        className
      )}
      title={equipped ? equipped.name : slot.label}
    >
      {equipped ? (
        equipped.iconUrl ? (
          <img src={equipped.iconUrl} alt={equipped.name} className="w-[85%] h-[85%] object-cover rounded" />
        ) : (
          <BackpackIcon className="w-[60%] h-[60%] text-[#7aa8c8]" />
        )
      ) : (
        <img src={slot.icon} alt={slot.label} className="w-[70%] h-[70%] opacity-40 group-hover:opacity-70 transition-opacity" />
      )}
    </button>
  )
}

// Equipment slot definitions with icon paths and positions
const EQUIPMENT_SLOTS = [
  { id: "head", label: "Head", icon: "/icons/equipment/head.png", position: "top" },
  { id: "neck", label: "Neck", icon: "/icons/equipment/neck.png", position: "top-right" },
  { id: "torso", label: "Torso", icon: "/icons/equipment/torso.png", position: "right" },
  { id: "main_hand", label: "Main Hand", icon: "/icons/equipment/main-hand.png", position: "left" },
  { id: "off_hand", label: "Off Hand", icon: "/icons/equipment/off-hand.png", position: "right-low" },
  { id: "legs", label: "Legs", icon: "/icons/equipment/legs.png", position: "bottom-left" },
  { id: "feet", label: "Feet", icon: "/icons/equipment/feet.png", position: "bottom" },
  { id: "ring1", label: "Ring", icon: "/icons/equipment/ring.png", position: "left-low" },
  { id: "ring2", label: "Ring", icon: "/icons/equipment/ring2.png", position: "bottom-right" },
] as const

export function RightColumn({
  characters,
  selectedCharacterId,
  onCharacterSelect,
  disableCharacterSelect = false,
  selectedCharacter,
  characterInventory,
  characterEquipment,
  loading,
  onEquipItem,
  onUnequipItem,
  onAddXP,
  onLevelUp
}: RightColumnProps) {
  const [showCharacterDropdown, setShowCharacterDropdown] = useState(false)

  // Sheet rolls go through the SHARED dice roller — never a local RNG.
  const { roll: sharedRoll, announce: announceRoll, busy: diceBusy } = useDice()
  
// Floating window states
  const [equippedItemsOpen, setEquippedItemsOpen] = useState(false)
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [attacksOpen, setAttacksOpen] = useState(false)
  const [proficienciesOpen, setProficienciesOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  // v3.0 stat inspection + full-sheet slide-over.
  const [acModalOpen, setAcModalOpen] = useState(false)
  const [abilityModal, setAbilityModal] = useState<AbilityKey | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Transform character data
  const character = selectedCharacter ? {
    name: selectedCharacter.name,
    race: (selectedCharacter as any).race || "Human",
    class: selectedCharacter.class,
    subclass: (selectedCharacter as any).subclass,
    level: selectedCharacter.level,
    background: (selectedCharacter as any).background || "Unknown",
    alignment: (selectedCharacter as any).alignment || "Neutral",
age: (selectedCharacter as any).age,
  height: (selectedCharacter as any).height,
  weight: (selectedCharacter as any).character_weight,
  gender: (selectedCharacter as any).gender || "male",
    hp: { 
      current: selectedCharacter.hp_current, 
      max: selectedCharacter.hp_max,
      temp: (selectedCharacter as any).temp_hp || 0
    },
    ac: selectedCharacter.ac,
    initiative: selectedCharacter.initiative,
    speed: selectedCharacter.speed || 30,
    senses: selectedCharacter.senses || null,
    skills: selectedCharacter.skills || null,
    proficiencyBonus: selectedCharacter.proficiency_bonus,
    passivePerception: selectedCharacter.passive_perception,
      conditions: ((selectedCharacter as any).conditions || []) as string[],
    abilities: {
      str: { base: (selectedCharacter as any).str_base || selectedCharacter.str_score, score: selectedCharacter.str_score, modifier: selectedCharacter.str_modifier },
      dex: { base: (selectedCharacter as any).dex_base || selectedCharacter.dex_score, score: selectedCharacter.dex_score, modifier: selectedCharacter.dex_modifier },
      con: { base: (selectedCharacter as any).con_base || selectedCharacter.con_score, score: selectedCharacter.con_score, modifier: selectedCharacter.con_modifier },
      int: { base: (selectedCharacter as any).int_base || selectedCharacter.int_score, score: selectedCharacter.int_score, modifier: selectedCharacter.int_modifier },
      wis: { base: (selectedCharacter as any).wis_base || selectedCharacter.wis_score, score: selectedCharacter.wis_score, modifier: selectedCharacter.wis_modifier },
      cha: { base: (selectedCharacter as any).cha_base || selectedCharacter.cha_score, score: selectedCharacter.cha_score, modifier: selectedCharacter.cha_modifier },
    },
    savingThrowProficiencies: ((selectedCharacter as any).saving_throw_proficiencies || []) as ("str" | "dex" | "con" | "int" | "wis" | "cha")[],
    skillProficiencies: (selectedCharacter as any).skill_proficiencies || [],
    skillExpertises: (selectedCharacter as any).skill_expertises || [],
    languages: (selectedCharacter as any).languages || ["Common"],
    armorProficiencies: (selectedCharacter as any).armor_proficiencies || [],
    weaponProficiencies: (selectedCharacter as any).weapon_proficiencies || [],
    toolProficiencies: (selectedCharacter as any).tool_proficiencies || [],
    features: (selectedCharacter as any).features || [],
    spellcastingAbility: (selectedCharacter as any).spellcasting_ability,
    spellSaveDC: (selectedCharacter as any).spell_save_dc,
    spellAttackBonus: (selectedCharacter as any).spell_attack_bonus,
    avatarUrl: selectedCharacter.avatar_image_url,
    experiencePoints: (selectedCharacter as any).experience_points || 0,
    personality: (selectedCharacter as any).sheet_personality ?? null,
  } : {
    name: "No Character",
    race: "Unknown",
    class: "Unknown",
    subclass: null,
    level: 1,
    background: "Unknown",
    alignment: "Neutral",
    age: null,
    height: null,
    weight: null,
    hp: { current: 10, max: 10, temp: 0 },
    ac: 10,
    initiative: 0,
    speed: 30,
    senses: null,
    skills: null,
    proficiencyBonus: 2,
    passivePerception: 10,
    conditions: [] as string[],
    abilities: {
      str: { base: 10, score: 10, modifier: 0 },
      dex: { base: 10, score: 10, modifier: 0 },
      con: { base: 10, score: 10, modifier: 0 },
      int: { base: 10, score: 10, modifier: 0 },
      wis: { base: 10, score: 10, modifier: 0 },
      cha: { base: 10, score: 10, modifier: 0 },
    },
    savingThrowProficiencies: [] as ("str" | "dex" | "con" | "int" | "wis" | "cha")[],
    skillProficiencies: [],
    skillExpertises: [],
    languages: ["Common"],
    armorProficiencies: [],
    weaponProficiencies: [],
    toolProficiencies: [],
    features: [],
    spellcastingAbility: null,
    spellSaveDC: null,
    spellAttackBonus: null,
    avatarUrl: null,
    experiencePoints: 0,
    personality: null,
  }

  // Transform inventory
  const inventory = characterInventory.map(item => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    iconUrl: item.icon_url,
    preset_icon: item.preset_icon,
    equippable_slot: item.equippable_slot,
  }))

  // Transform equipped items
  const equippedItems = characterEquipment.map(item => ({
    id: item.id,
    name: item.name,
    slot: item.slot,
    iconUrl: item.icon_url,
  }))

  // Get item equipped in a slot
  const getEquippedItem = (slotId: string) => equippedItems.find(item => item.slot === slotId)

  // Handle equipping an item to the selected slot
  const handleEquipFromInventory = (itemId: string) => {
    if (selectedSlot && onEquipItem) {
      onEquipItem(itemId, selectedSlot)
      setSelectedSlot(null)
      setInventoryOpen(false)
    }
  }

  // --- Drag-and-drop equipping (v3.0) ---
  // `dragValidSlot` highlights the slot currently hovered by a compatible item;
  // `dragRejectSlot` briefly flashes a slot red when an incompatible item is
  // dropped. Both the drag path and the click path funnel through onEquipItem,
  // so equipping a slot that's already filled replaces it (the mutation on the
  // page swaps the old item back to inventory).
  const [dragValidSlot, setDragValidSlot] = useState<string | null>(null)
  const [dragRejectSlot, setDragRejectSlot] = useState<string | null>(null)

  const handleSlotDragOver = (slotId: string) => (e: React.DragEvent) => {
    // Must preventDefault so the browser fires a drop event.
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    if (dragValidSlot !== slotId) setDragValidSlot(slotId)
  }

  const handleSlotDragLeave = (slotId: string) => () => {
    setDragValidSlot((cur) => (cur === slotId ? null : cur))
  }

  const handleSlotDrop = (slotId: string) => (e: React.DragEvent) => {
    e.preventDefault()
    setDragValidSlot(null)
    let itemId = ""
    let itemSlot: string | null = null
    const raw = e.dataTransfer.getData("application/x-aop-item") || e.dataTransfer.getData("text/plain")
    try {
      const parsed = JSON.parse(raw) as { id?: string; equippableSlot?: string }
      itemId = parsed.id ?? ""
      itemSlot = parsed.equippableSlot ?? null
    } catch {
      /* malformed payload — treated as a rejected drop below */
    }
    if (itemId && itemSlot === slotId && onEquipItem) {
      onEquipItem(itemId, slotId)
      setSelectedSlot(null)
    } else {
      // Incompatible slot: brief red flash, no mutation.
      setDragRejectSlot(slotId)
      setTimeout(() => setDragRejectSlot((cur) => (cur === slotId ? null : cur)), 600)
    }
  }

  const makeItemDragStart = (item: { id: string; equippable_slot?: string | null }) => (e: React.DragEvent) => {
    const payload = JSON.stringify({ id: item.id, equippableSlot: item.equippable_slot ?? null })
    e.dataTransfer.setData("application/x-aop-item", payload)
    e.dataTransfer.setData("text/plain", payload)
    e.dataTransfer.effectAllowed = "move"
  }

  const slotDropState = (slotId: string): "idle" | "valid" | "reject" =>
    dragRejectSlot === slotId ? "reject" : dragValidSlot === slotId ? "valid" : "idle"

  // Mock attacks based on equipped weapons
  const attacks = equippedItems
    .filter(item => item.slot === "main_hand" || item.slot === "off_hand")
    .map(item => ({
      id: item.id,
      name: item.name,
      attackBonus: character.abilities.str.modifier + character.proficiencyBonus,
      damage: "1d8",
      damageType: "slashing",
      isEquipped: true,
    }))

  const canCastSpells = ["Wizard", "Sorcerer", "Cleric", "Druid", "Bard", "Warlock", "Paladin", "Ranger"].includes(character.class)

  // --- Abbreviated skills + passive senses (v3.0 reference panel) ---------
  // Map each D&D 5E skill to its governing ability so a proficient skill's
  // bonus can be derived from the authoritative ability modifiers.
  const SKILL_ABILITY: Record<string, AbilityKey> = {
    athletics: "str",
    acrobatics: "dex", sleight_of_hand: "dex", stealth: "dex",
    arcana: "int", history: "int", investigation: "int", nature: "int", religion: "int",
    animal_handling: "wis", insight: "wis", medicine: "wis", perception: "wis", survival: "wis",
    deception: "cha", intimidation: "cha", performance: "cha", persuasion: "cha",
  }
  const normSkill = (s: string) => s.toLowerCase().replace(/ /g, "_")
  const titleSkill = (key: string) =>
    key.split("_").map((w, i) => (i > 0 && (w === "of" || w === "the") ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ")
  const skillProfKeys = (character.skillProficiencies as string[]).map(normSkill)
  const skillExpKeys = (character.skillExpertises as string[]).map(normSkill)
  // Only proficient skills are listed (the reference shows a compact set).
  const proficientSkills = skillProfKeys
    .map((key) => {
      const ability = SKILL_ABILITY[key]
      if (!ability) return null
      const expertise = skillExpKeys.includes(key)
      const bonus = character.abilities[ability].modifier + character.proficiencyBonus * (expertise ? 2 : 1)
      return { key, label: titleSkill(key), bonus }
    })
    .filter((s): s is { key: string; label: string; bonus: number } => s !== null)
  const passiveInvestigation =
    10 + character.abilities.int.modifier + (skillProfKeys.includes("investigation") ? character.proficiencyBonus : 0)
  const passiveInsight =
    10 + character.abilities.wis.modifier + (skillProfKeys.includes("insight") ? character.proficiencyBonus : 0)
  const inspiration = Boolean((selectedCharacter as any)?.inspiration)
  const fmtBonus = (n: number) => `${n >= 0 ? "+" : ""}${n}`

  return (
    <>
      <div className="flex flex-col gap-2 h-full overflow-hidden">
        <FantasyPanel title="Character" className="flex-1 min-h-0 flex flex-col">
          {/* Character Header */}
          <div className="p-3 border-b border-[#3d3428]/40">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3 relative">
                {/* Character Avatar */}
                <div className="w-14 h-14 rounded-full bg-[#0a0908] border-2 border-[#c9a868]/60 shadow-[0_0_12px_rgba(201,168,104,0.3)] overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {character.avatarUrl ? (
                    <img 
                      src={character.avatarUrl} 
                      alt={character.name} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User2 className="w-7 h-7 text-[#4a5a6a]" />
                  )}
                </div>
                <div>
                  <button
                    onClick={() => !disableCharacterSelect && setShowCharacterDropdown(!showCharacterDropdown)}
                    className={cn(
                      "flex items-center gap-1.5 font-serif text-lg text-[#e8dcc8] transition-colors",
                      !disableCharacterSelect && "hover:text-[#7aa8c8]",
                      disableCharacterSelect && "cursor-default",
                    )}
                    disabled={loading || characters.length === 0 || disableCharacterSelect}
                  >
                    {loading ? 'Loading...' : character.name}
                    {!disableCharacterSelect && characters.length > 0 && (
                      <ChevronDown className={cn("w-4 h-4 transition-transform", showCharacterDropdown && "rotate-180")} />
                    )}
                  </button>
                  
                  {!disableCharacterSelect && showCharacterDropdown && characters.length > 0 && (
                    <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] bg-[#1a1614] border border-[#3d3428] rounded-lg shadow-xl overflow-hidden">
                      {characters.map((char) => (
                        <button
                          key={char.id}
                          onClick={() => {
                            onCharacterSelect(char.id)
                            setShowCharacterDropdown(false)
                          }}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[#2a2420] transition-colors",
                            char.id === selectedCharacterId && "bg-[#1a2a35]/60"
                          )}
                        >
                          <div className="w-8 h-8 rounded-full bg-[#0a0908] border border-[#3d3428]/60 overflow-hidden flex items-center justify-center flex-shrink-0">
                            {char.avatar_image_url ? (
                              <img src={char.avatar_image_url} alt={char.name} className="w-full h-full object-cover" />
                            ) : (
                              <Sparkles className="w-4 h-4 text-[#4a5a6a]" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-sm font-serif truncate", char.id === selectedCharacterId ? "text-[#7aa8c8]" : "text-stone-300")}>
                              {char.name}
                            </p>
                            <p className="text-xs text-stone-500">Level {char.level} {char.class}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Species · Class (Subclass) — matches the reference subtitle. */}
                  <p className="mt-0.5 text-xs text-stone-400">
                    {character.race} {character.class}
                    {character.subclass ? ` (${character.subclass})` : ""}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-sm text-stone-400">Level {character.level}</span>
                {inspiration && (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-[#c9a868]/50 bg-[#241a10] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[#e6c878]">
                    <Sparkles className="h-3 w-3" />
                    Inspiration
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Basic Status */}
          <div className="p-3 border-b border-[#3d3428]/40">
            {/* HP Bar */}
            <div className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-stone-400">HP</span>
                <span className="flex items-center gap-2">
                  <span className="text-red-400">{character.hp.current} / {character.hp.max}</span>
                  {character.hp.temp > 0 && (
                    <span className="rounded-sm bg-[#1a2a35] px-1.5 py-0.5 text-[10px] font-medium text-cyan-300">
                      +{character.hp.temp} temp
                    </span>
                  )}
                </span>
              </div>
              <div className="h-2 bg-[#1a1614] rounded-full overflow-hidden border border-[#3d3428]/40">
                <div 
                  className="h-full bg-gradient-to-r from-red-600 to-red-500 transition-all"
                  style={{ width: `${(character.hp.current / character.hp.max) * 100}%` }}
                />
              </div>
            </div>

            {/* XP Tracker */}
            <div className="mb-3">
              <XPTracker
                currentXP={character.experiencePoints}
                currentLevel={character.level}
                characterName={character.name}
                onLevelUp={() => onLevelUp?.(selectedCharacterId!)}
                onAddXP={(amount, reason) => onAddXP?.(selectedCharacterId!, amount, reason)}
              />
            </div>

            {/* Core Stats Row */}
            <div className="grid grid-cols-5 gap-2 text-center">
              <button
                onClick={() => setAcModalOpen(true)}
                title="View Armor Class breakdown"
                className="bg-[#1a1614]/60 rounded p-2 border border-[#3d3428]/30 hover:border-amber-600/60 transition-colors"
              >
                <Shield className="w-4 h-4 mx-auto mb-1 text-amber-600" />
                <div className="text-lg font-bold text-stone-200">{character.ac}</div>
                <div className="text-[9px] uppercase tracking-wider text-stone-500">AC</div>
              </button>
              <button
                onClick={async () => {
                  const result = await sharedRoll({
                    die: "d20",
                    numDice: 1,
                    modifier: character.initiative,
                    label: "Initiative",
                  })
                  announceRoll(describeRoll(result))
                }}
                disabled={diceBusy}
                title={`Roll initiative (1d20+${character.initiative})`}
                className="group bg-[#1a1614]/60 rounded p-2 border border-[#3d3428]/30 hover:border-[#8a6a4a] transition-colors disabled:opacity-60"
              >
                <Star className="w-4 h-4 mx-auto mb-1 text-yellow-400 group-hover:hidden" />
                <Dices className="w-4 h-4 mx-auto mb-1 text-[#c9a868] hidden group-hover:block" />
                <div className="text-lg font-bold text-stone-200">+{character.initiative}</div>
                <div className="text-[9px] uppercase tracking-wider text-stone-500">Init</div>
              </button>
              <div className="bg-[#1a1614]/60 rounded p-2 border border-[#3d3428]/30">
                <Zap className="w-4 h-4 mx-auto mb-1 text-cyan-400" />
                <div className="text-lg font-bold text-stone-200">{character.speed}</div>
                <div className="text-[9px] uppercase tracking-wider text-stone-500">Speed</div>
              </div>
              <div className="bg-[#1a1614]/60 rounded p-2 border border-[#3d3428]/30">
                <div className="text-lg font-bold text-stone-200 mt-1">+{character.proficiencyBonus}</div>
                <div className="text-[9px] uppercase tracking-wider text-stone-500">Prof</div>
              </div>
              <div className="bg-[#1a1614]/60 rounded p-2 border border-[#3d3428]/30">
                <Eye className="w-4 h-4 mx-auto mb-1 text-purple-400" />
                <div className="text-lg font-bold text-stone-200">{character.passivePerception}</div>
                <div className="text-[9px] uppercase tracking-wider text-stone-500">PP</div>
              </div>
            </div>

            {/* Conditions */}
            <div className="mt-2">
              <ConditionBadges conditions={character.conditions} emptyLabel="No conditions" />
            </div>

            {/* Ability score boxes (v3.0 design) — each rolls a check through
                the SHARED dice roller. */}
            <div className="mt-3 grid grid-cols-6 gap-1">
              {(["str", "dex", "con", "int", "wis", "cha"] as const).map((ab) => {
                const data = character.abilities[ab]
                return (
                  <button
                    key={ab}
                    onClick={() => setAbilityModal(ab)}
                    title={`View ${ab.toUpperCase()} details`}
                    className="rounded-[3px] border border-[#7a5f33]/45 bg-[#12100c] px-0.5 py-1.5 text-center transition-colors hover:border-[#c9a868]/80 disabled:opacity-60"
                  >
                    <div className="text-[9px] uppercase tracking-wider text-stone-500">{ab}</div>
                    <div className="text-base font-bold leading-tight text-stone-200">{data.score}</div>
                    <div
                      className={cn(
                        "text-[10px] font-medium",
                        data.modifier >= 0 ? "text-emerald-400" : "text-red-400",
                      )}
                    >
                      {data.modifier >= 0 ? "+" : ""}
                      {data.modifier}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Saving Throws · Senses · Skills (v3.0 two-column reference block) */}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-[3px] border border-[#7a5f33]/40 bg-[#12100c] p-2">
                <div className="mb-1 font-serif text-[11px] text-[#d9bd7e]">Saving Throws</div>
                <div className="space-y-0.5">
                  {(["str", "dex", "con", "int", "wis", "cha"] as const).map((ab) => {
                    const prof = character.savingThrowProficiencies.includes(ab)
                    const bonus = character.abilities[ab].modifier + (prof ? character.proficiencyBonus : 0)
                    return (
                      <button
                        key={ab}
                        onClick={async () => {
                          const result = await sharedRoll({
                            die: "d20",
                            numDice: 1,
                            modifier: bonus,
                            label: `${ab.toUpperCase()} Save`,
                          })
                          announceRoll(describeRoll(result))
                        }}
                        disabled={diceBusy}
                        title={`Roll ${ab.toUpperCase()} save (1d20${bonus >= 0 ? "+" : ""}${bonus})`}
                        className="flex w-full items-center justify-between rounded px-1 text-[11px] transition-colors hover:bg-[#241a10] disabled:opacity-60"
                      >
                        <span className="uppercase text-stone-400">{ab}</span>
                        <span className={prof ? "font-medium text-emerald-400" : "text-stone-400"}>
                          {bonus >= 0 ? "+" : ""}
                          {bonus}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="rounded-[3px] border border-[#7a5f33]/40 bg-[#12100c] p-2">
                  <div className="mb-1 font-serif text-[11px] text-[#d9bd7e]">Senses</div>
                  <div className="space-y-0.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-stone-400">Passive Perception</span>
                      <span className="text-stone-200">{character.passivePerception}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-stone-400">Passive Investigation</span>
                      <span className="text-stone-200">{passiveInvestigation}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-stone-400">Passive Insight</span>
                      <span className="text-stone-200">{passiveInsight}</span>
                    </div>
                    {character.senses && <div className="pt-0.5 text-stone-500">{character.senses}</div>}
                  </div>
                </div>

                <div className="rounded-[3px] border border-[#7a5f33]/40 bg-[#12100c] p-2">
                  <div className="mb-1 font-serif text-[11px] text-[#d9bd7e]">Skills</div>
                  {proficientSkills.length > 0 ? (
                    <div className="space-y-0.5">
                      {proficientSkills.map((s) => (
                        <button
                          key={s.key}
                          onClick={async () => {
                            const result = await sharedRoll({
                              die: "d20",
                              numDice: 1,
                              modifier: s.bonus,
                              label: s.label,
                            })
                            announceRoll(describeRoll(result))
                          }}
                          disabled={diceBusy}
                          title={`Roll ${s.label} (1d20${fmtBonus(s.bonus)})`}
                          className="flex w-full items-center justify-between rounded px-1 text-[11px] transition-colors hover:bg-[#241a10] disabled:opacity-60"
                        >
                          <span className="text-stone-300">{s.label}</span>
                          <span className="font-medium text-emerald-400">{fmtBonus(s.bonus)}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] italic text-stone-500">No proficient skills</div>
                  )}
                </div>
              </div>
            </div>

            {/* View Full Character Sheet — opens the slide-over across the centre. */}
            <button
              onClick={() => setSheetOpen(true)}
              className="mt-2 w-full rounded-[3px] border border-[#7a5f33]/60 bg-gradient-to-b from-[#1d1710] to-[#120e0a] py-1.5 text-[11px] text-stone-300 transition-colors hover:border-[#c9a868] hover:text-[#e0cfa0]"
            >
              View Full Character Sheet
            </button>
          </div>

          {/* Full-screen paper-doll equipment editor (the inline bar below the
              inventory is the quick view; this opens the large editor). */}
          <button
            onClick={() => setEquippedItemsOpen(true)}
            className="w-full p-3 border-b border-[#3d3428]/40 flex items-center justify-between hover:bg-[#2a2420]/40 transition-colors group"
          >
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#7aa8c8]" />
              <span className="text-sm text-stone-300">Equipment Editor</span>
            </div>
            <span className="text-xs text-stone-500 group-hover:text-stone-400">Full screen</span>
          </button>

          {/* Window Toggle Buttons */}
          <div className="p-3 flex flex-col gap-2">
            <button
              onClick={() => setInventoryOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded border border-[#3d3428]/60 bg-[#1a1614]/40 hover:bg-[#2a2420]/60 hover:border-[#5d5448] transition-all text-left"
            >
              <Package className="w-4 h-4 text-[#c9a868]" />
              <span className="text-sm text-stone-300">Inventory</span>
              <span className="ml-auto text-xs text-stone-500">({inventory.length})</span>
            </button>
            
            <button
              onClick={() => setAttacksOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded border border-[#3d3428]/60 bg-[#1a1614]/40 hover:bg-[#2a2420]/60 hover:border-[#5d5448] transition-all text-left"
            >
              <Swords className="w-4 h-4 text-red-400" />
              <span className="text-sm text-stone-300">Attacks & Spellcasting</span>
            </button>
            
            <button
              onClick={() => setProficienciesOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded border border-[#3d3428]/60 bg-[#1a1614]/40 hover:bg-[#2a2420]/60 hover:border-[#5d5448] transition-all text-left"
            >
              <BookOpen className="w-4 h-4 text-[#7aa8c8]" />
              <span className="text-sm text-stone-300">Proficiencies & Features</span>
            </button>
            
            <button
              onClick={() => setStatsOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded border border-[#3d3428]/60 bg-[#1a1614]/40 hover:bg-[#2a2420]/60 hover:border-[#5d5448] transition-all text-left"
            >
              <User2 className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-stone-300">Character Details</span>
            </button>
          </div>
        </FantasyPanel>

        {/* Basic Inventory (v3.0 design) */}
        <BasicInventory
          items={characterInventory.map((i) => ({
            id: i.id,
            name: i.name,
            quantity: i.quantity,
            weight: (i as any).weight,
            item_type: (i as any).item_type,
            iconUrl: i.icon_url,
          }))}
          weightCurrent={(selectedCharacter as any)?.weight_current}
          weightMax={(selectedCharacter as any)?.weight_max}
          currency={(selectedCharacter as any)?.sheet_currency}
          onManage={() => setInventoryOpen(true)}
        />

        {/* Collapsible Equipped Items bar (v3.0 reference image 3) */}
        <EquippedItemsPanel
          slots={EQUIPMENT_SLOTS}
          equipped={equippedItems}
          eligible={inventory.filter((i) => !!i.equippable_slot)}
          portraitUrl={character.avatarUrl}
          characterName={character.name}
          onEquip={(itemId, slotId) => onEquipItem?.(itemId, slotId)}
          onUnequip={(slotId) => onUnequipItem?.(slotId)}
        />
      </div>

      {/* Equipped Items - Large Paper Doll Window */}
      <FloatingWindow
        title="Equipped Items"
        isOpen={equippedItemsOpen}
        onClose={() => { setEquippedItemsOpen(false); setSelectedSlot(null); }}
        size="fullscreen"
      >
        <div className="h-full flex">
          {/* Main Content Area */}
          <div className="flex-1 flex items-center justify-center p-8">
            {/* Left Column - Head, Neck, Torso, Legs, Feet */}
            <div className="flex flex-col gap-6 mr-8">
              {/* Head */}
              <div className="flex items-center gap-4">
                <EquipmentSlotButton 
                  slot={EQUIPMENT_SLOTS[0]} 
                  equipped={getEquippedItem("head")}
                  isSelected={selectedSlot === "head"}
                  onClick={() => setSelectedSlot(selectedSlot === "head" ? null : "head")}
                  dropState={slotDropState("head")}
                  onDragOver={handleSlotDragOver("head")}
                  onDragLeave={handleSlotDragLeave("head")}
                  onDrop={handleSlotDrop("head")}
                  className="w-28 h-28"
                />
                <span className="text-base text-stone-400 font-medium">Head</span>
              </div>
              
              {/* Neck */}
              <div className="flex items-center gap-4">
                <EquipmentSlotButton 
                  slot={EQUIPMENT_SLOTS[1]} 
                  equipped={getEquippedItem("neck")}
                  isSelected={selectedSlot === "neck"}
                  onClick={() => setSelectedSlot(selectedSlot === "neck" ? null : "neck")}
                  dropState={slotDropState("neck")}
                  onDragOver={handleSlotDragOver("neck")}
                  onDragLeave={handleSlotDragLeave("neck")}
                  onDrop={handleSlotDrop("neck")}
                  className="w-28 h-28"
                />
                <span className="text-base text-stone-400 font-medium">Neck</span>
              </div>
              
              {/* Torso */}
              <div className="flex items-center gap-4">
                <EquipmentSlotButton 
                  slot={EQUIPMENT_SLOTS[2]} 
                  equipped={getEquippedItem("torso")}
                  isSelected={selectedSlot === "torso"}
                  onClick={() => setSelectedSlot(selectedSlot === "torso" ? null : "torso")}
                  dropState={slotDropState("torso")}
                  onDragOver={handleSlotDragOver("torso")}
                  onDragLeave={handleSlotDragLeave("torso")}
                  onDrop={handleSlotDrop("torso")}
                  className="w-28 h-28"
                />
                <span className="text-base text-stone-400 font-medium">Torso</span>
              </div>
              
              {/* Legs */}
              <div className="flex items-center gap-4">
                <EquipmentSlotButton 
                  slot={EQUIPMENT_SLOTS[5]} 
                  equipped={getEquippedItem("legs")}
                  isSelected={selectedSlot === "legs"}
                  onClick={() => setSelectedSlot(selectedSlot === "legs" ? null : "legs")}
                  dropState={slotDropState("legs")}
                  onDragOver={handleSlotDragOver("legs")}
                  onDragLeave={handleSlotDragLeave("legs")}
                  onDrop={handleSlotDrop("legs")}
                  className="w-28 h-28"
                />
                <span className="text-base text-stone-400 font-medium">Legs</span>
              </div>
              
              {/* Feet */}
              <div className="flex items-center gap-4">
                <EquipmentSlotButton 
                  slot={EQUIPMENT_SLOTS[6]} 
                  equipped={getEquippedItem("feet")}
                  isSelected={selectedSlot === "feet"}
                  onClick={() => setSelectedSlot(selectedSlot === "feet" ? null : "feet")}
                  dropState={slotDropState("feet")}
                  onDragOver={handleSlotDragOver("feet")}
                  onDragLeave={handleSlotDragLeave("feet")}
                  onDrop={handleSlotDrop("feet")}
                  className="w-28 h-28"
                />
                <span className="text-base text-stone-400 font-medium">Feet</span>
              </div>
            </div>
            
            {/* Center - Character Image. The portrait reacts to game state
                (conditions + HP) via the shared visual-state rules — Phase 1
                of the living character sheet. */}
            {(() => {
              const visualState = characterVisualState({
                hp_current: character.hp.current,
                hp_max: character.hp.max,
                conditions: (character as any).conditions,
              })
              const overlayTint = VISUAL_STATE_OVERLAY[visualState]
              return (
                <div className="relative h-full max-h-[600px] aspect-[3/4] mx-8 border border-[#3d3428] rounded-lg overflow-hidden bg-[#0a0908]">
                  <img
                    src={(character as any).avatarUrl || (character.gender === "female"
                      ? "/icons/paperdoll/silhouette-female.jpg"
                      : "/icons/paperdoll/silhouette-male.jpg"
                    )}
                    alt={character.name}
                    className="w-full h-full object-cover transition-[filter] duration-700"
                    style={{ filter: VISUAL_STATE_FILTER[visualState] }}
                  />
                  {/* Flat condition tint (poisoned / restrained / downed). */}
                  {overlayTint && (
                    <div
                      className="pointer-events-none absolute inset-0 transition-opacity duration-700"
                      style={{ backgroundColor: overlayTint }}
                    />
                  )}
                  {/* Injured: pulsing red vignette (respects reduced motion). */}
                  {visualState === "injured" && (
                    <div className="pointer-events-none absolute inset-0 aop-injured-vignette" />
                  )}
                  {/* Downed: quiet label so the state reads at a glance. */}
                  {visualState === "downed" && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[10px] font-bold uppercase tracking-[0.3em] text-red-300/80">
                      Downed
                    </div>
                  )}
                  <style>{`
                    @keyframes aopInjuredPulse {
                      0%, 100% { box-shadow: inset 0 0 60px 18px rgba(160, 30, 30, 0.35); }
                      50% { box-shadow: inset 0 0 90px 30px rgba(190, 40, 40, 0.55); }
                    }
                    .aop-injured-vignette {
                      animation: aopInjuredPulse 2.4s ease-in-out infinite;
                    }
                    @media (prefers-reduced-motion: reduce) {
                      .aop-injured-vignette {
                        animation: none;
                        box-shadow: inset 0 0 70px 22px rgba(175, 35, 35, 0.45);
                      }
                    }
                  `}</style>
                </div>
              )
            })()}
            
            {/* Right Column - Main Hand, Off Hand, Ring, Ring */}
            <div className="flex flex-col gap-6 ml-8">
              {/* Main Hand */}
              <div className="flex items-center gap-4">
                <span className="text-base text-stone-400 font-medium w-24 text-right">Main Hand</span>
                <EquipmentSlotButton 
                  slot={EQUIPMENT_SLOTS[3]} 
                  equipped={getEquippedItem("main_hand")}
                  isSelected={selectedSlot === "main_hand"}
                  onClick={() => setSelectedSlot(selectedSlot === "main_hand" ? null : "main_hand")}
                  dropState={slotDropState("main_hand")}
                  onDragOver={handleSlotDragOver("main_hand")}
                  onDragLeave={handleSlotDragLeave("main_hand")}
                  onDrop={handleSlotDrop("main_hand")}
                  className="w-28 h-28"
                />
              </div>
              
              {/* Off Hand */}
              <div className="flex items-center gap-4">
                <span className="text-base text-stone-400 font-medium w-24 text-right">Off Hand</span>
                <EquipmentSlotButton 
                  slot={EQUIPMENT_SLOTS[4]} 
                  equipped={getEquippedItem("off_hand")}
                  isSelected={selectedSlot === "off_hand"}
                  onClick={() => setSelectedSlot(selectedSlot === "off_hand" ? null : "off_hand")}
                  dropState={slotDropState("off_hand")}
                  onDragOver={handleSlotDragOver("off_hand")}
                  onDragLeave={handleSlotDragLeave("off_hand")}
                  onDrop={handleSlotDrop("off_hand")}
                  className="w-28 h-28"
                />
              </div>
              
              {/* Ring 1 */}
              <div className="flex items-center gap-4">
                <span className="text-base text-stone-400 font-medium w-24 text-right">Ring</span>
                <EquipmentSlotButton
                  slot={EQUIPMENT_SLOTS[7]}
                  equipped={getEquippedItem("ring1")}
                  isSelected={selectedSlot === "ring1"}
                  onClick={() => setSelectedSlot(selectedSlot === "ring1" ? null : "ring1")}
                  dropState={slotDropState("ring1")}
                  onDragOver={handleSlotDragOver("ring1")}
                  onDragLeave={handleSlotDragLeave("ring1")}
                  onDrop={handleSlotDrop("ring1")}
                  className="w-28 h-28"
                />
              </div>

              {/* Ring 2 */}
              <div className="flex items-center gap-4">
                <span className="text-base text-stone-400 font-medium w-24 text-right">Ring</span>
                <EquipmentSlotButton
                  slot={EQUIPMENT_SLOTS[8]}
                  equipped={getEquippedItem("ring2")}
                  isSelected={selectedSlot === "ring2"}
                  onClick={() => setSelectedSlot(selectedSlot === "ring2" ? null : "ring2")}
                  dropState={slotDropState("ring2")}
                  onDragOver={handleSlotDragOver("ring2")}
                  onDragLeave={handleSlotDragLeave("ring2")}
                  onDrop={handleSlotDrop("ring2")}
                  className="w-28 h-28"
                />
              </div>
            </div>
          </div>
          
          {/* Sidebar - Inventory for selected slot */}
          <div className="w-72 border-l border-[#3d3428] bg-[#0f0d0c] p-4 overflow-y-auto">
            <h3 className="text-xs font-semibold tracking-[0.15em] uppercase text-[#c9b896] mb-3">
              {selectedSlot ? `Select for ${EQUIPMENT_SLOTS.find(s => s.id === selectedSlot)?.label}` : "Select a slot"}
            </h3>
            
            {selectedSlot ? (
              <div className="space-y-2">
                {/* Unequip option if something is equipped */}
                {getEquippedItem(selectedSlot) && (
                  <button
                    onClick={() => {
                      onUnequipItem?.(selectedSlot)
                      setSelectedSlot(null)
                    }}
                    className="w-full p-2 rounded border border-red-500/30 bg-red-500/10 text-red-400 text-sm hover:bg-red-500/20 transition-colors"
                  >
                    Unequip {getEquippedItem(selectedSlot)?.name}
                  </button>
                )}

                {/* Available items — only show items flagged equippable in this slot */}
                {inventory.filter(item => item.equippable_slot === selectedSlot).length > 0 ? (
                  inventory
                    .filter(item => item.equippable_slot === selectedSlot)
                    .map(item => (
                      <button
                        key={item.id}
                        draggable
                        onDragStart={makeItemDragStart(item)}
                        onClick={() => {
                          handleEquipFromInventory(item.id)
                          setSelectedSlot(null)
                        }}
                        className="w-full flex items-center gap-3 p-2 rounded border border-[#3d3428]/60 hover:border-[#d4b15a]/50 hover:bg-[#2a2420]/60 transition-all text-left cursor-grab active:cursor-grabbing"
                      >
                        <div className="w-10 h-10 rounded border border-[#3d3428]/60 bg-[#1a1614] overflow-hidden flex items-center justify-center">
                          {item.iconUrl ? (
                            <img src={item.iconUrl} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <BackpackIcon className="w-6 h-6 text-stone-600" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm text-stone-200">{item.name}</div>
                        </div>
                      </button>
                    ))
                ) : (
                  <div className="text-center py-4 text-stone-500 text-sm italic">
                    No items available
                  </div>
                )}
              </div>
            ) : (
              /* No slot selected: list every equippable item as a drag source so
                 items can be dragged straight onto a matching slot. */
              (() => {
                const equippable = inventory.filter(item => item.equippable_slot)
                if (equippable.length === 0) {
                  return (
                    <div className="text-center py-8 text-stone-500 text-sm italic">
                      No equippable items — click a slot to browse
                    </div>
                  )
                }
                return (
                  <div className="space-y-2">
                    <p className="text-[11px] text-stone-500 leading-relaxed">
                      Drag an item onto a matching slot, or click a slot to browse.
                    </p>
                    {equippable.map(item => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={makeItemDragStart(item)}
                        className="w-full flex items-center gap-3 p-2 rounded border border-[#3d3428]/60 hover:border-[#d4b15a]/50 hover:bg-[#2a2420]/60 transition-all text-left cursor-grab active:cursor-grabbing"
                      >
                        <div className="w-10 h-10 rounded border border-[#3d3428]/60 bg-[#1a1614] overflow-hidden flex items-center justify-center flex-shrink-0">
                          {item.iconUrl ? (
                            <img src={item.iconUrl} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <BackpackIcon className="w-6 h-6 text-stone-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-stone-200 truncate">{item.name}</div>
                          <div className="text-[10px] uppercase tracking-wide text-[#d4b15a]/80">
                            {EQUIPMENT_SLOTS.find(s => s.id === item.equippable_slot)?.label ?? "Equippable"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()
            )}
          </div>
        </div>
      </FloatingWindow>

      {/* Floating Windows */}
      <FloatingWindow
        title={selectedSlot ? `Select Item for ${EQUIPMENT_SLOTS.find(s => s.id === selectedSlot)?.label}` : "Inventory"}
        isOpen={inventoryOpen}
        onClose={() => { setInventoryOpen(false); setSelectedSlot(null); }}
        size="md"
      >
        <div className="p-4">
          {inventory.length === 0 ? (
            <div className="text-center py-8 text-stone-500 italic">No items in inventory</div>
          ) : (
            <div className="space-y-1">
              {inventory.map(item => (
                <button
                  key={item.id}
                  onClick={() => selectedSlot ? handleEquipFromInventory(item.id) : null}
                  className={cn(
                    "w-full flex items-center gap-3 p-2 rounded border transition-all text-left",
                    selectedSlot 
                      ? "border-[#3d3428]/60 hover:border-[#d4b15a]/50 hover:bg-[#2a2420]/60 cursor-pointer"
                      : "border-[#3d3428]/40 cursor-default"
                  )}
                >
                  <div className="w-10 h-10 rounded border border-[#3d3428]/60 bg-[#1a1614] overflow-hidden flex items-center justify-center">
                    {item.iconUrl ? (
                      <img src={item.iconUrl} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <BackpackIcon className="w-6 h-6 text-stone-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-stone-200">{item.name}</div>
                    {item.quantity > 1 && <div className="text-xs text-stone-500">Quantity: {item.quantity}</div>}
                    {/* Slot badge: shows where an equippable item can go. Never
                        reveals cursed status — cursed items must look ordinary. */}
                    {item.equippable_slot && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded border border-[#d4b15a]/40 bg-[#d4b15a]/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#d4b15a]">
                        <Swords className="w-2.5 h-2.5" />
                        {EQUIPMENT_SLOTS.find(s => s.id === item.equippable_slot)?.label ?? "Equippable"}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </FloatingWindow>

      <FloatingWindow
        title="Attacks & Spellcasting"
        isOpen={attacksOpen}
        onClose={() => setAttacksOpen(false)}
        size="lg"
      >
        <AttacksSpellcasting
          attacks={attacks}
          canCastSpells={canCastSpells}
          spellcastingAbility={character.spellcastingAbility}
          spellSaveDC={character.spellSaveDC}
          spellAttackBonus={character.spellAttackBonus}
          strModifier={character.abilities.str.modifier}
          proficiencyBonus={character.proficiencyBonus}
          characterClass={character.class}
          characterLevel={character.level}
        />
      </FloatingWindow>

      <FloatingWindow
        title="Proficiencies & Features"
        isOpen={proficienciesOpen}
        onClose={() => setProficienciesOpen(false)}
        size="md"
      >
        <ProficienciesPanel
          languages={character.languages}
          armorProficiencies={character.armorProficiencies}
          weaponProficiencies={character.weaponProficiencies}
          toolProficiencies={character.toolProficiencies}
          features={character.features}
        />
      </FloatingWindow>

      <FloatingWindow
        title="Character Details"
        isOpen={statsOpen}
        onClose={() => setStatsOpen(false)}
        size="lg"
      >
        <DetailedStats
          character={character}
        />
      </FloatingWindow>

      {/* AC breakdown modal */}
      {acModalOpen && (
        <AcBreakdownModal
          character={{
            class: character.class,
            ac: character.ac,
            abilities: character.abilities,
            savingThrowProficiencies: character.savingThrowProficiencies,
            skillProficiencies: character.skillProficiencies,
            skillExpertises: character.skillExpertises,
            proficiencyBonus: character.proficiencyBonus,
          }}
          equipped={equippedItems.map((e) => ({ name: e.name, slot: e.slot }))}
          onClose={() => setAcModalOpen(false)}
        />
      )}

      {/* Ability detail modal */}
      {abilityModal && (
        <AbilityDetailModal
          ability={abilityModal}
          character={{
            class: character.class,
            ac: character.ac,
            abilities: character.abilities,
            savingThrowProficiencies: character.savingThrowProficiencies,
            skillProficiencies: character.skillProficiencies,
            skillExpertises: character.skillExpertises,
            proficiencyBonus: character.proficiencyBonus,
          }}
          onClose={() => setAbilityModal(null)}
          onRoll={async (label, modifier) => {
            const result = await sharedRoll({ die: "d20", numDice: 1, modifier, label })
            announceRoll(describeRoll(result))
            setAbilityModal(null)
          }}
        />
      )}

      {/* Full character sheet slide-over */}
      <CharacterSheetSlideOver
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        character={character}
        inventory={characterInventory}
      />
    </>
  )
}
