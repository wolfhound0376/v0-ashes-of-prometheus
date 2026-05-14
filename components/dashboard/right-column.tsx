"use client"

import { useState } from "react"
import { FantasyPanel } from "@/components/ui/fantasy-panel"
import { BackpackIcon, IconFrame } from "@/components/ui/fantasy-icons"
import { Sparkles, ChevronDown, ChevronRight, Package, Swords, BookOpen, User2 } from "lucide-react"
import { cn } from "@/lib/utils"

// Import new panels
import { CharacterStatus } from "./panels/character-status"
import { EquipmentSlots } from "./panels/equipment-slots"
import { ProficienciesPanel } from "./panels/proficiencies-panel"
import { AttacksSpellcasting } from "./panels/attacks-spellcasting"
import { DetailedStats } from "./panels/detailed-stats"

import type { Character as DBCharacter, InventoryItem as DBInventoryItem, EquipmentItem as DBEquipmentItem } from "@/lib/types/database"

type ConditionKey = "blinded" | "charmed" | "deafened" | "frightened" | "grappled" | "incapacitated" | "invisible" | "paralyzed" | "petrified" | "poisoned" | "prone" | "restrained" | "stunned" | "unconscious" | "exhaustion"

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

// Inventory icon mapping
const inventoryIconMap: Record<string, React.FC<{ className?: string }>> = {
  backpack: BackpackIcon,
}

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
  const [activePanel, setActivePanel] = useState<"inventory" | "attacks" | "proficiencies" | "stats" | null>(null)
  const [selectedItem, setSelectedItem] = useState<string | null>(null)

  // Transform character data for display
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
    deathSaves: {
      successes: (selectedCharacter as any).death_saves_success || 0,
      failures: (selectedCharacter as any).death_saves_failure || 0
    },
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
    // Fallback default character
    name: "Unknown",
    race: "Human",
    class: "Fighter",
    level: 1,
    background: "Unknown",
    alignment: "Neutral",
    hp: { current: 10, max: 10, temp: 0 },
    ac: 10,
    initiative: 0,
    speed: 30,
    proficiencyBonus: 2,
    passivePerception: 10,
    deathSaves: { successes: 0, failures: 0 },
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
    avatarUrl: null,
  }

  // Transform inventory for display
  const inventory = characterInventory.map(item => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    iconUrl: item.icon_url,
    presetIcon: item.preset_icon,
    equippableSlot: (item as any).equippable_slot,
  }))

  // Transform equipped items
  const equippedItems = characterEquipment.map(item => ({
    id: item.id,
    name: item.name,
    slot: item.slot,
    icon_url: item.icon_url,
    preset_icon: item.preset_icon,
  }))

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

  const handleEquip = (itemId: string, slot: string) => {
    onEquipItem?.(itemId, slot)
  }

  const handleUnequip = (slot: string) => {
    onUnequipItem?.(slot)
  }

  const togglePanel = (panel: "inventory" | "attacks" | "proficiencies" | "stats") => {
    setActivePanel(activePanel === panel ? null : panel)
  }

  return (
    <div className="flex flex-col gap-2 h-full overflow-hidden">
      {/* Main Character Panel */}
      <FantasyPanel title="Character" className="flex-1 min-h-0 flex flex-col">
        {/* Character Header with Dropdown */}
        <div className="p-3 border-b border-[#3d3428]/40">
          <div className="flex items-start justify-between mb-2">
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

          {/* Character Status (HP, AC, etc.) */}
          <CharacterStatus
            hp={character.hp}
            ac={character.ac}
            initiative={character.initiative}
            speed={character.speed}
            proficiencyBonus={character.proficiencyBonus}
            passivePerception={character.passivePerception}
            conditions={character.conditions}
            deathSaves={character.deathSaves}
          />
        </div>

        {/* Equipment Slots */}
        <div className="p-3 border-b border-[#3d3428]/40">
          <EquipmentSlots
            equippedItems={equippedItems}
            inventory={inventory}
            onEquip={handleEquip}
            onUnequip={handleUnequip}
          />
        </div>

        {/* Expandable Panel Buttons */}
        <div className="flex-1 overflow-y-auto">
          {/* Equipment & Inventory */}
          <PanelButton
            icon={Package}
            label="Equipment & Inventory"
            count={inventory.length}
            isActive={activePanel === "inventory"}
            onClick={() => togglePanel("inventory")}
          />
          {activePanel === "inventory" && (
            <div className="px-3 pb-3 border-b border-[#3d3428]/40">
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {inventory.length === 0 ? (
                  <div className="text-center py-4 text-stone-500 text-sm italic">No items</div>
                ) : (
                  inventory.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItem(item.id === selectedItem ? null : item.id)}
                      className={cn(
                        "w-full flex items-center gap-2 p-1.5 rounded-sm transition-all text-left",
                        "hover:bg-[#2a2420]/60",
                        selectedItem === item.id && "bg-[#1a2a35]/60 border border-[#4a7a9a]/30"
                      )}
                    >
                      <IconFrame className="w-8 h-8 flex-shrink-0" selected={selectedItem === item.id}>
                        <div className="w-full h-full bg-[#1a1614] p-0.5 overflow-hidden">
                          {item.iconUrl ? (
                            <img src={item.iconUrl} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <BackpackIcon className="w-full h-full" />
                          )}
                        </div>
                      </IconFrame>
                      <span className="flex-1 text-sm text-stone-300 truncate">{item.name}</span>
                      {item.quantity > 1 && (
                        <span className="text-xs text-stone-500 tabular-nums">x{item.quantity}</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Attacks & Spellcasting */}
          <PanelButton
            icon={Swords}
            label="Attacks & Spellcasting"
            isActive={activePanel === "attacks"}
            onClick={() => togglePanel("attacks")}
          />
          {activePanel === "attacks" && (
            <div className="h-64 border-b border-[#3d3428]/40">
              <AttacksSpellcasting
                attacks={attacks}
                canCastSpells={canCastSpells}
                spellcastingAbility={character.spellcastingAbility}
                spellSaveDC={character.spellSaveDC}
                spellAttackBonus={character.spellAttackBonus}
              />
            </div>
          )}

          {/* Proficiencies & Languages */}
          <PanelButton
            icon={BookOpen}
            label="Proficiencies & Features"
            isActive={activePanel === "proficiencies"}
            onClick={() => togglePanel("proficiencies")}
          />
          {activePanel === "proficiencies" && (
            <div className="px-3 pb-3 border-b border-[#3d3428]/40">
              <ProficienciesPanel
                languages={character.languages}
                armorProficiencies={character.armorProficiencies}
                weaponProficiencies={character.weaponProficiencies}
                toolProficiencies={character.toolProficiencies}
                features={character.features}
              />
            </div>
          )}

          {/* Detailed Stats */}
          <PanelButton
            icon={User2}
            label="Detailed Character Stats"
            isActive={activePanel === "stats"}
            onClick={() => togglePanel("stats")}
          />
          {activePanel === "stats" && (
            <div className="h-96 border-b border-[#3d3428]/40">
              <DetailedStats
                character={{
                  name: character.name,
                  race: character.race,
                  class: character.class,
                  subclass: character.subclass,
                  level: character.level,
                  background: character.background,
                  alignment: character.alignment,
                  age: character.age,
                  height: character.height,
                  weight: character.weight,
                  abilities: character.abilities,
                  savingThrowProficiencies: character.savingThrowProficiencies,
                  skillProficiencies: character.skillProficiencies,
                  skillExpertises: character.skillExpertises,
                  proficiencyBonus: character.proficiencyBonus,
                }}
              />
            </div>
          )}
        </div>
      </FantasyPanel>
    </div>
  )
}

// Panel toggle button component
function PanelButton({ 
  icon: Icon, 
  label, 
  count, 
  isActive, 
  onClick 
}: { 
  icon: any
  label: string
  count?: number
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#2a2420]/40 transition-colors border-b border-[#3d3428]/40"
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("w-4 h-4", isActive ? "text-[#7aa8c8]" : "text-stone-500")} />
        <span className={cn("text-xs uppercase tracking-wider", isActive ? "text-[#7aa8c8]" : "text-[#c9b896]")}>
          {label}
        </span>
        {count !== undefined && (
          <span className="text-xs text-stone-500">({count})</span>
        )}
      </div>
      <ChevronRight className={cn("w-4 h-4 text-stone-500 transition-transform", isActive && "rotate-90")} />
    </button>
  )
}
