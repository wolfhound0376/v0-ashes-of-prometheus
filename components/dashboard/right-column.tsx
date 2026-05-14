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

import type { Character as DBCharacter, InventoryItem as DBInventoryItem, EquipmentItem as DBEquipmentItem } from "@/lib/types/database"

// D&D 5E Conditions
const DND_CONDITIONS = {
  blinded: { name: "Blinded", color: "text-stone-400" },
  charmed: { name: "Charmed", color: "text-pink-400" },
  deafened: { name: "Deafened", color: "text-stone-400" },
  frightened: { name: "Frightened", color: "text-purple-400" },
  grappled: { name: "Grappled", color: "text-orange-400" },
  incapacitated: { name: "Incapacitated", color: "text-red-400" },
  invisible: { name: "Invisible", color: "text-cyan-400" },
  paralyzed: { name: "Paralyzed", color: "text-yellow-400" },
  petrified: { name: "Petrified", color: "text-stone-500" },
  poisoned: { name: "Poisoned", color: "text-green-400" },
  prone: { name: "Prone", color: "text-amber-400" },
  restrained: { name: "Restrained", color: "text-orange-400" },
  stunned: { name: "Stunned", color: "text-yellow-400" },
  unconscious: { name: "Unconscious", color: "text-red-500" },
  exhaustion: { name: "Exhaustion", color: "text-amber-600" },
} as const

type ConditionKey = keyof typeof DND_CONDITIONS

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
        "w-12 h-12 rounded border transition-all flex items-center justify-center group",
        equipped 
          ? "border-[#4a7a9a]/60 bg-[#1a2a35]/60" 
          : "border-[#3d3428]/60 bg-[#1a1614]/80 hover:border-[#5d5448]",
        isSelected && "ring-2 ring-[#d4b15a]/60",
        className
      )}
      title={equipped ? equipped.name : slot.label}
    >
      {equipped ? (
        equipped.iconUrl ? (
          <img src={equipped.iconUrl} alt={equipped.name} className="w-10 h-10 object-cover rounded" />
        ) : (
          <BackpackIcon className="w-6 h-6 text-[#7aa8c8]" />
        )
      ) : (
        <img src={slot.icon} alt={slot.label} className="w-8 h-8 opacity-40 group-hover:opacity-60 transition-opacity" />
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
  { id: "ring_1", label: "Ring", icon: "/icons/equipment/ring.png", position: "left-low" },
  { id: "ring_2", label: "Ring", icon: "/icons/equipment/ring2.png", position: "bottom-right" },
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
  onUnequipItem
}: RightColumnProps) {
  const [showCharacterDropdown, setShowCharacterDropdown] = useState(false)
  
  // Floating window states
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [attacksOpen, setAttacksOpen] = useState(false)
  const [proficienciesOpen, setProficienciesOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  
  // Equipment slot selection for equipping items
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
    speed: (selectedCharacter as any).speed || 30,
    proficiencyBonus: selectedCharacter.proficiency_bonus,
    passivePerception: selectedCharacter.passive_perception,
    conditions: ((selectedCharacter as any).conditions || []) as ConditionKey[],
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
  }

  // Transform inventory
  const inventory = characterInventory.map(item => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    iconUrl: item.icon_url,
    preset_icon: item.preset_icon,
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
              <div className="flex items-center gap-2 relative">
                <Sparkles className="w-5 h-5 text-[#7aa8c8]" />
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
              {character.conditions.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {character.conditions.map((condition) => (
                    <span
                      key={condition}
                      className={cn(
                        "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border",
                        DND_CONDITIONS[condition]?.color || "text-stone-400",
                        "border-current/30 bg-current/10"
                      )}
                    >
                      {DND_CONDITIONS[condition]?.name || condition}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400/70">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>No conditions</span>
                </div>
              )}
            </div>
          </div>

          {/* Equipped Items - Paper Doll Layout */}
          <div className="p-3 border-b border-[#3d3428]/40">
            <div className="text-[9px] uppercase tracking-wider text-stone-500 mb-2">Equipped Items</div>
            <div className="relative h-[280px]">
              {/* Character Silhouette in Center */}
              <div className="absolute inset-0 flex items-center justify-center">
                <img 
                  src={character.gender === "female" 
                    ? "/icons/paperdoll/silhouette-female.jpg" 
                    : "/icons/paperdoll/silhouette-male.jpg"
                  }
                  alt="Character"
                  className="h-[220px] w-auto opacity-40 object-contain"
                />
              </div>
              
              {/* Equipment Slots positioned around silhouette */}
              {/* Head - Top Center */}
              <EquipmentSlotButton 
                slot={EQUIPMENT_SLOTS[0]} 
                equipped={getEquippedItem("head")}
                isSelected={selectedSlot === "head"}
                onClick={() => { setSelectedSlot("head"); setInventoryOpen(true); }}
                className="absolute top-0 left-1/2 -translate-x-1/2"
              />
              
              {/* Neck - Top Right of head */}
              <EquipmentSlotButton 
                slot={EQUIPMENT_SLOTS[1]} 
                equipped={getEquippedItem("neck")}
                isSelected={selectedSlot === "neck"}
                onClick={() => { setSelectedSlot("neck"); setInventoryOpen(true); }}
                className="absolute top-8 right-4"
              />
              
              {/* Main Hand - Left side */}
              <EquipmentSlotButton 
                slot={EQUIPMENT_SLOTS[3]} 
                equipped={getEquippedItem("main_hand")}
                isSelected={selectedSlot === "main_hand"}
                onClick={() => { setSelectedSlot("main_hand"); setInventoryOpen(true); }}
                className="absolute top-16 left-0"
              />
              
              {/* Torso - Right of center */}
              <EquipmentSlotButton 
                slot={EQUIPMENT_SLOTS[2]} 
                equipped={getEquippedItem("torso")}
                isSelected={selectedSlot === "torso"}
                onClick={() => { setSelectedSlot("torso"); setInventoryOpen(true); }}
                className="absolute top-20 right-0"
              />
              
              {/* Ring 1 - Left lower */}
              <EquipmentSlotButton 
                slot={EQUIPMENT_SLOTS[7]} 
                equipped={getEquippedItem("ring_1")}
                isSelected={selectedSlot === "ring_1"}
                onClick={() => { setSelectedSlot("ring_1"); setInventoryOpen(true); }}
                className="absolute top-32 left-0"
              />
              
              {/* Off Hand - Right lower */}
              <EquipmentSlotButton 
                slot={EQUIPMENT_SLOTS[4]} 
                equipped={getEquippedItem("off_hand")}
                isSelected={selectedSlot === "off_hand"}
                onClick={() => { setSelectedSlot("off_hand"); setInventoryOpen(true); }}
                className="absolute top-36 right-0"
              />
              
              {/* Legs - Bottom Left */}
              <EquipmentSlotButton 
                slot={EQUIPMENT_SLOTS[5]} 
                equipped={getEquippedItem("legs")}
                isSelected={selectedSlot === "legs"}
                onClick={() => { setSelectedSlot("legs"); setInventoryOpen(true); }}
                className="absolute bottom-12 left-4"
              />
              
              {/* Feet - Bottom Center */}
              <EquipmentSlotButton 
                slot={EQUIPMENT_SLOTS[6]} 
                equipped={getEquippedItem("feet")}
                isSelected={selectedSlot === "feet"}
                onClick={() => { setSelectedSlot("feet"); setInventoryOpen(true); }}
                className="absolute bottom-0 left-1/2 -translate-x-1/2"
              />
              
              {/* Ring 2 - Bottom Right */}
              <EquipmentSlotButton 
                slot={EQUIPMENT_SLOTS[8]} 
                equipped={getEquippedItem("ring_2")}
                isSelected={selectedSlot === "ring_2"}
                onClick={() => { setSelectedSlot("ring_2"); setInventoryOpen(true); }}
                className="absolute bottom-12 right-4"
              />
            </div>
          </div>

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
