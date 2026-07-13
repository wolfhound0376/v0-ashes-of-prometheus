"use client"

import { useState } from "react"
import { FantasyPanel } from "@/components/ui/fantasy-panel"
import { FloatingWindow } from "@/components/ui/floating-window"
import { BackpackIcon, IconFrame } from "@/components/ui/fantasy-icons"
import { Sparkles, ChevronDown, Package, Swords, BookOpen, User2, Shield, Heart, Zap, Eye, Star } from "lucide-react"
import { cn } from "@/lib/utils"

// Import panel content components
import { ProficienciesPanel } from "./panels/proficiencies-panel"
import { AttacksSpellcasting } from "./panels/attacks-spellcasting"
import { DetailedStats } from "./panels/detailed-stats"
import { XPTracker } from "./xp-tracker"

import type { Character as DBCharacter, InventoryItem as DBInventoryItem, EquipmentItem as DBEquipmentItem } from "@/lib/types/database"
import { ConditionBadges } from "@/components/conditions/condition-badges"

interface RightColumnProps {
  characters: DBCharacter[]
  selectedCharacterId: string | null
  onCharacterSelect: (id: string) => void
  selectedCharacter?: DBCharacter
  characterInventory: DBInventoryItem[]
  characterEquipment: DBEquipmentItem[]
  loading: boolean
  onEquipItem?: (itemId: string, slot: string) => void
  onUnequipItem?: (slot: string) => void
  onAddXP?: (characterId: string, amount: number, reason: string) => void
  onLevelUp?: (characterId: string) => void
}

// Equipment Slot Button Component
function EquipmentSlotButton({ 
  slot, 
  equipped, 
  isSelected, 
  onClick, 
  className 
}: { 
  slot: { id: string; label: string; icon: string }
  equipped: { id: string; name: string; iconUrl?: string } | null
  isSelected: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded border transition-all flex items-center justify-center group",
        equipped 
          ? "border-[#4a7a9a]/60 bg-[#1a2a35]/60 shadow-[0_0_10px_rgba(100,150,200,0.3)]" 
          : "border-[#3d3428]/60 bg-[#1a1614]/90 hover:border-[#5d5448] hover:bg-[#2a2420]/80",
        isSelected && "ring-2 ring-[#d4b15a]/60 border-[#d4b15a]/40",
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
  
// Floating window states
  const [equippedItemsOpen, setEquippedItemsOpen] = useState(false)
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [attacksOpen, setAttacksOpen] = useState(false)
  const [proficienciesOpen, setProficienciesOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)

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
    conditions: [] as ConditionKey[],
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
                    onClick={() => setShowCharacterDropdown(!showCharacterDropdown)}
                    className="flex items-center gap-1.5 font-serif text-lg text-[#e8dcc8] hover:text-[#7aa8c8] transition-colors"
                    disabled={loading || characters.length === 0}
                  >
                    {loading ? 'Loading...' : character.name}
                    {characters.length > 0 && (
                      <ChevronDown className={cn("w-4 h-4 transition-transform", showCharacterDropdown && "rotate-180")} />
                    )}
                  </button>
                  
                  {showCharacterDropdown && characters.length > 0 && (
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
                </div>
              </div>
              <div className="text-right">
                <span className="text-stone-400 text-sm">Level {character.level}</span>
                <span className="text-[#7aa8c8] text-sm ml-2 font-medium">{character.class}</span>
              </div>
            </div>
          </div>

          {/* Basic Status */}
          <div className="p-3 border-b border-[#3d3428]/40">
            {/* HP Bar */}
            <div className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-stone-400">HP</span>
                <span className="text-red-400">{character.hp.current} / {character.hp.max}</span>
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
              <div className="bg-[#1a1614]/60 rounded p-2 border border-[#3d3428]/30">
                <Shield className="w-4 h-4 mx-auto mb-1 text-amber-600" />
                <div className="text-lg font-bold text-stone-200">{character.ac}</div>
                <div className="text-[9px] uppercase tracking-wider text-stone-500">AC</div>
              </div>
              <div className="bg-[#1a1614]/60 rounded p-2 border border-[#3d3428]/30">
                <Star className="w-4 h-4 mx-auto mb-1 text-yellow-400" />
                <div className="text-lg font-bold text-stone-200">+{character.initiative}</div>
                <div className="text-[9px] uppercase tracking-wider text-stone-500">Init</div>
              </div>
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

            {/* Reference stats: senses & skills (shown when present). Speed
                already appears in the core stats row above. */}
            {(character.senses || character.skills) && (
              <div className="mt-2 space-y-1 text-xs">
                {character.senses && (
                  <div className="flex gap-2">
                    <span className="text-stone-500 uppercase tracking-wider w-14 flex-shrink-0">Senses</span>
                    <span className="text-stone-300 flex-1">{character.senses}</span>
                  </div>
                )}
                {character.skills && (
                  <div className="flex gap-2">
                    <span className="text-stone-500 uppercase tracking-wider w-14 flex-shrink-0">Skills</span>
                    <span className="text-stone-300 flex-1">{character.skills}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Equipped Items Button - Opens Full Window */}
          <button
            onClick={() => setEquippedItemsOpen(true)}
            className="w-full p-3 border-b border-[#3d3428]/40 flex items-center justify-between hover:bg-[#2a2420]/40 transition-colors group"
          >
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#7aa8c8]" />
              <span className="text-sm text-stone-300">Equipped Items</span>
            </div>
            <span className="text-xs text-stone-500 group-hover:text-stone-400">Click to open</span>
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
                  className="w-28 h-28"
                />
                <span className="text-base text-stone-400 font-medium">Feet</span>
              </div>
            </div>
            
            {/* Center - Character Image */}
            <div className="h-full max-h-[600px] aspect-[3/4] mx-8 border border-[#3d3428] rounded-lg overflow-hidden bg-[#0a0908]">
              <img 
                src={(character as any).avatarUrl || (character.gender === "female" 
                  ? "/icons/paperdoll/silhouette-female.jpg" 
                  : "/icons/paperdoll/silhouette-male.jpg"
                )}
                alt={character.name}
                className="w-full h-full object-cover"
              />
            </div>
            
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
                        onClick={() => {
                          handleEquipFromInventory(item.id)
                          setSelectedSlot(null)
                        }}
                        className="w-full flex items-center gap-3 p-2 rounded border border-[#3d3428]/60 hover:border-[#d4b15a]/50 hover:bg-[#2a2420]/60 transition-all text-left"
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
              <div className="text-center py-8 text-stone-500 text-sm italic">
                Click an equipment slot to equip items
              </div>
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
    </>
  )
}
