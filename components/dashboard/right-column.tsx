"use client"

import { useState } from "react"
import { FantasyPanel, PanelDivider } from "@/components/ui/fantasy-panel"
import {
  HoodIcon,
  NecklaceIcon,
  RobeIcon,
  PantsIcon,
  BootsIcon,
  StaffIcon,
  OrbIcon,
  RingIcon,
  BackpackIcon,
  MagiRobeIcon,
  PotionIcon,
  ScrollIcon,
  PearlIcon,
  RopeIcon,
  TorchIcon,
  GoldIcon,
  IconFrame,
} from "@/components/ui/fantasy-icons"
import {
  Heart,
  Shield,
  Star,
  Scroll,
  Eye,
  Sparkles,
  ChevronDown,
  Weight,
} from "lucide-react"
import { cn } from "@/lib/utils"

import type { Character as DBCharacter, InventoryItem as DBInventoryItem, EquipmentItem as DBEquipmentItem } from "@/lib/types/database"

interface FallbackCharacter {
  name: string
  level: number
  class: string
  xp: number
  xpToNext: number
  abilities: {
    str: { score: number; modifier: number }
    dex: { score: number; modifier: number }
    con: { score: number; modifier: number }
    int: { score: number; modifier: number }
    wis: { score: number; modifier: number }
    cha: { score: number; modifier: number }
  }
  hp: { current: number; max: number }
  ac: number
  initiative: number
  proficiencyBonus: number
  passivePerception: number
  equipment: Record<string, { name: string; equipped: boolean }>
  weight: { current: number; max: number }
}

interface FallbackInventoryItem {
  id: string
  name: string
  quantity: number
  icon: string
}

interface RightColumnProps {
  characters: DBCharacter[]
  selectedCharacterId: string | null
  onCharacterSelect: (id: string) => void
  selectedCharacter?: DBCharacter
  characterInventory: DBInventoryItem[]
  characterEquipment: DBEquipmentItem[]
  fallbackCharacter: FallbackCharacter
  fallbackInventory: FallbackInventoryItem[]
  loading: boolean
}

const inventoryIconMap: Record<string, React.FC<{ className?: string }>> = {
  backpack: BackpackIcon,
  shirt: MagiRobeIcon,
  "flask-conical": PotionIcon,
  scroll: ScrollIcon,
  gem: PearlIcon,
  cable: RopeIcon,
  flame: TorchIcon,
  coins: GoldIcon,
}

const equipmentSlots = {
  left: [
    { id: "head", label: "Head", Icon: HoodIcon, defaultIconUrl: "/icons/equipment/head.png" },
    { id: "neck", label: "Neck", Icon: NecklaceIcon, defaultIconUrl: "/icons/equipment/neck.png" },
    { id: "torso", label: "Torso", Icon: RobeIcon, defaultIconUrl: "/icons/equipment/torso.png" },
    { id: "legs", label: "Legs", Icon: PantsIcon, defaultIconUrl: "/icons/equipment/legs.png" },
    { id: "feet", label: "Feet", Icon: BootsIcon, defaultIconUrl: "/icons/equipment/feet.png" },
  ],
  right: [
    { id: "mainHand", label: "Main Hand", Icon: StaffIcon, defaultIconUrl: "/icons/equipment/main-hand.png" },
    { id: "offHand", label: "Off Hand", Icon: OrbIcon, defaultIconUrl: "/icons/equipment/off-hand.png" },
    { id: "ring1", label: "Ring", Icon: RingIcon, defaultIconUrl: "/icons/equipment/ring.png" },
    { id: "ring2", label: "Ring", Icon: RingIcon, defaultIconUrl: "/icons/equipment/ring2.png" },
  ],
}

export function RightColumn({ 
  characters,
  selectedCharacterId,
  onCharacterSelect,
  selectedCharacter,
  characterInventory,
  characterEquipment,
  fallbackCharacter,
  fallbackInventory,
  loading
}: RightColumnProps) {
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [selectedEquipmentSlot, setSelectedEquipmentSlot] = useState<string | null>(null)
  const [showCharacterDropdown, setShowCharacterDropdown] = useState(false)

  // Transform DB character to display format, or use fallback
  const character = selectedCharacter ? {
    name: selectedCharacter.name,
    level: selectedCharacter.level,
    class: selectedCharacter.class,
    xp: selectedCharacter.xp,
    xpToNext: selectedCharacter.xp_to_next,
    abilities: {
      str: { score: selectedCharacter.str_score, modifier: selectedCharacter.str_modifier },
      dex: { score: selectedCharacter.dex_score, modifier: selectedCharacter.dex_modifier },
      con: { score: selectedCharacter.con_score, modifier: selectedCharacter.con_modifier },
      int: { score: selectedCharacter.int_score, modifier: selectedCharacter.int_modifier },
      wis: { score: selectedCharacter.wis_score, modifier: selectedCharacter.wis_modifier },
      cha: { score: selectedCharacter.cha_score, modifier: selectedCharacter.cha_modifier },
    },
    hp: { current: selectedCharacter.hp_current, max: selectedCharacter.hp_max },
    ac: selectedCharacter.ac,
    initiative: selectedCharacter.initiative,
    proficiencyBonus: selectedCharacter.proficiency_bonus,
    passivePerception: selectedCharacter.passive_perception,
    equipment: {},
    weight: { current: Number(selectedCharacter.weight_current), max: Number(selectedCharacter.weight_max) },
    avatarUrl: selectedCharacter.avatar_image_url,
  } : fallbackCharacter

// Transform inventory - only show items from database, no fallback placeholder items
  const inventory = characterInventory.map(item => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    icon: item.preset_icon || 'backpack',
    iconUrl: item.icon_url, // Custom generated icon
  }))

  return (
    <div className="flex flex-col gap-2 h-full overflow-hidden">
      <FantasyPanel title="Character Info & Inventory" className="flex-1 min-h-0 flex flex-col">
        {/* Character Header */}
        <div className="p-3 border-b border-[#3d3428]/40">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 relative">
              <Sparkles className="w-5 h-5 text-[#7aa8c8]" />
              <div>
                {/* Character name with dropdown */}
                <button
                  onClick={() => setShowCharacterDropdown(!showCharacterDropdown)}
                  className="flex items-center gap-1.5 font-serif text-lg text-[#e8dcc8] hover:text-[#7aa8c8] transition-colors"
                  disabled={loading || characters.length === 0}
                >
                  {loading ? 'Loading...' : character.name}
                  {characters.length > 0 && (
                    <ChevronDown className={cn(
                      "w-4 h-4 transition-transform",
                      showCharacterDropdown && "rotate-180"
                    )} />
                  )}
                </button>
                
                {/* Character dropdown */}
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
                        {/* Character avatar thumbnail */}
                        <div className="w-8 h-8 rounded-full bg-[#0a0908] border border-[#3d3428]/60 overflow-hidden flex items-center justify-center flex-shrink-0">
                          {char.avatar_image_url ? (
                            <img src={char.avatar_image_url} alt={char.name} className="w-full h-full object-cover" />
                          ) : (
                            <Sparkles className="w-4 h-4 text-[#4a5a6a]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm font-serif truncate",
                            char.id === selectedCharacterId ? "text-[#7aa8c8]" : "text-stone-300"
                          )}>
                            {char.name}
                          </p>
                          <p className="text-xs text-stone-500">
                            Level {char.level} {char.class}
                          </p>
                        </div>
                        {char.is_player && (
                          <span className="text-[8px] uppercase tracking-wider text-[#c9a868] border border-[#c9a868]/30 px-1.5 py-0.5 rounded">
                            Player
                          </span>
                        )}
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

          {/* XP Bar */}
          <div className="mt-2">
            <div className="flex justify-between text-xs text-stone-500 mb-1">
              <span>XP: {character.xp.toLocaleString()} / {character.xpToNext.toLocaleString()}</span>
              <span>Next Level: {(character.xpToNext - character.xp).toLocaleString()} XP</span>
            </div>
            <div className="h-1.5 bg-[#1a1614] rounded-full overflow-hidden border border-[#3d3428]/40">
              <div
                className="h-full bg-gradient-to-r from-[#4a7a9a] to-[#7aa8c8] shadow-[0_0_8px_rgba(100,150,200,0.5)]"
                style={{ width: `${(character.xp / character.xpToNext) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Ability Scores */}
        <div className="p-3 border-b border-[#3d3428]/40">
          <div className="grid grid-cols-6 gap-2">
            {Object.entries(character.abilities).map(([key, value]) => (
              <AbilityScore
                key={key}
                name={key.toUpperCase()}
                score={value.score}
                modifier={value.modifier}
                highlight={key === "int"}
              />
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="p-3 border-b border-[#3d3428]/40">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <StatRow icon={Heart} label="Hit Points" value={`${character.hp.current} / ${character.hp.max}`} color="red" />
            <StatRow icon={Scroll} label="Proficiency Bonus" value={`+${character.proficiencyBonus}`} />
            <StatRow icon={Shield} label="Armor Class" value={character.ac.toString()} color="bronze" />
            <StatRow icon={Scroll} label="Saving Throws" value="" />
            <StatRow icon={Star} label="Initiative" value={`+${character.initiative}`} color="gold" />
            <StatRow icon={Eye} label="Passive Perception" value={character.passivePerception.toString()} />
          </div>
        </div>

        {/* Equipment Paper Doll & Inventory */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex py-2">
            {/* Left Equipment Slots */}
            <div className="w-24 px-2 flex flex-col justify-center">
              <div className="space-y-2">
                {equipmentSlots.left.map((slot) => (
                  <EquipmentSlot 
                    key={slot.id} 
                    id={slot.id}
                    label={slot.label} 
                    Icon={slot.Icon}
                    defaultIconUrl={(slot as any).defaultIconUrl}
                    selected={selectedEquipmentSlot === slot.id}
                    onClick={() => setSelectedEquipmentSlot(slot.id === selectedEquipmentSlot ? null : slot.id)}
                    equippedItem={characterEquipment.find(e => e.slot === slot.id)}
                  />
                ))}
              </div>
            </div>

            {/* Character Avatar in Center - Twice as large */}
            <div className="flex-1 flex items-center justify-center px-2 min-h-[320px]">
              <div className="relative w-56 h-80 flex items-center justify-center">
                {(character as any).avatarUrl ? (
                  <>
                    <img 
                      src={(character as any).avatarUrl} 
                      alt={character.name}
                      className="max-w-full max-h-full object-contain drop-shadow-[0_0_20px_rgba(100,150,200,0.4)]"
                    />
                    {/* Subtle glow effect */}
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-12 bg-[#6aa0c0]/20 rounded-full blur-xl" />
                  </>
                ) : (
                  /* Fallback silhouette */
                  <div className="relative w-48 h-72">
                    <div className="absolute inset-0 bg-gradient-to-b from-[#2a3a4a]/60 to-[#1a2a35]/60 rounded-t-full border border-[#4a5a6a]/30">
                      <div className="absolute top-4 left-1/2 -translate-x-1/2 w-16 h-20 rounded-full bg-[#3a4a5a]/60" />
                      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-24 h-32 bg-[#2a3a4a]/60 rounded-t-lg" />
                      <div className="absolute top-24 left-1/2 -translate-x-1/2 w-32 h-40 border-x border-[#4a6a8a]/30" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Equipment Slots */}
            <div className="w-24 px-2 flex flex-col justify-center">
              <div className="space-y-2">
                {equipmentSlots.right.map((slot, index) => (
                  <EquipmentSlot 
                    key={`${slot.id}-${index}`} 
                    id={slot.id}
                    label={slot.label} 
                    Icon={slot.Icon}
                    defaultIconUrl={(slot as any).defaultIconUrl}
                    alignRight
                    selected={selectedEquipmentSlot === slot.id}
                    onClick={() => setSelectedEquipmentSlot(slot.id === selectedEquipmentSlot ? null : slot.id)}
                    equippedItem={characterEquipment.find(e => e.slot === slot.id)}
                  />
                ))}
              </div>
            </div>
          </div>

          <PanelDivider />

          {/* Inventory */}
          <div className="px-3 pb-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold tracking-[0.15em] uppercase text-[#c9b896]">Inventory</h4>
              <button className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-200 transition-colors px-2 py-1 rounded border border-[#3d3428]/60 bg-[#1a1614]/60">
                All Items
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-1">
              {inventory.length === 0 ? (
                <div className="text-center py-4 text-stone-500 text-sm italic">
                  No possessions
                </div>
              ) : (
                inventory.map((item) => {
                  const IconComponent = inventoryIconMap[item.icon] || BackpackIcon
                  const isSelected = selectedItem === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItem(item.id === selectedItem ? null : item.id)}
                      className={cn(
                        "w-full flex items-center gap-2 p-1.5 rounded-sm transition-all text-left",
                        "hover:bg-[#2a2420]/60",
                        isSelected && "bg-[#1a2a35]/60 border border-[#4a7a9a]/30"
                      )}
                    >
                      <IconFrame className="w-9 h-9 flex-shrink-0" selected={isSelected}>
                        <div className="w-full h-full bg-[#1a1614] p-0.5 overflow-hidden">
                          {item.iconUrl ? (
                            <img 
                              src={item.iconUrl} 
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <IconComponent className="w-full h-full" />
                          )}
                        </div>
                      </IconFrame>
                      <span className="flex-1 text-sm text-stone-300 truncate">{item.name}</span>
                      {item.quantity > 1 && (
                        <span className="text-xs text-stone-500 tabular-nums">x{item.quantity}</span>
                      )}
                    </button>
                  )
                })
              )}
            </div>

            {/* Weight */}
            <div className="mt-3 flex items-center gap-2 text-xs text-stone-500">
              <Weight className="w-3 h-3" />
              <span>{character.weight.current} / {character.weight.max} lbs</span>
            </div>
          </div>
        </div>

        {/* View Item Button */}
        <div className="p-3 border-t border-[#3d3428]/40">
          <button
            disabled={!selectedItem}
            className={cn(
              "w-full py-2 rounded-sm text-sm font-medium tracking-wider uppercase transition-all",
              "border",
              selectedItem
                ? "bg-gradient-to-b from-[#2a2420] to-[#1a1614] border-[#5a4a3a] text-[#c9b896] hover:from-[#3a3430] hover:border-[#6a5a4a]"
                : "bg-[#1a1614] border-[#3d3428]/40 text-stone-600 cursor-not-allowed"
            )}
          >
            View Item
          </button>
          <p className="text-center text-[10px] text-stone-600 mt-1">
            {selectedItem ? "Click to view item details" : "Select an item to view details"}
          </p>
        </div>
      </FantasyPanel>
    </div>
  )
}

function AbilityScore({
  name,
  score,
  modifier,
  highlight,
}: {
  name: string
  score: number
  modifier: number
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        "text-center p-1.5 rounded-sm border transition-all",
        highlight
          ? "bg-[#1a2a35]/60 border-[#4a7a9a]/40 shadow-[0_0_8px_rgba(100,150,200,0.2)]"
          : "bg-[#1a1614]/60 border-[#3d3428]/40"
      )}
    >
      <p className="text-[10px] text-stone-500 mb-0.5">{name}</p>
      <p className={cn("text-lg font-serif font-bold", highlight ? "text-[#7aa8c8]" : "text-stone-200")}>
        {score}
      </p>
      <p className={cn("text-xs", modifier >= 0 ? "text-stone-400" : "text-red-400")}>
        {modifier >= 0 ? `+${modifier}` : modifier}
      </p>
    </div>
  )
}

function StatRow({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any
  label: string
  value: string
  color?: "red" | "bronze" | "gold"
}) {
  const iconColors = {
    red: "text-red-400",
    bronze: "text-[#b8956a]",
    gold: "text-yellow-500",
  }

  return (
    <div className="flex items-center gap-2">
      <Icon className={cn("w-4 h-4", color ? iconColors[color] : "text-[#8b7355]")} />
      <span className="text-stone-400 text-xs">{label}</span>
      <span className="ml-auto text-stone-200 font-medium text-sm">{value}</span>
    </div>
  )
}

function EquipmentSlot({ 
  id,
  label, 
  Icon,
  defaultIconUrl,
  alignRight,
  selected,
  onClick,
  equippedItem,
}: { 
  id: string
  label: string
  Icon: React.FC<{ className?: string }>
  defaultIconUrl?: string
  alignRight?: boolean
  selected?: boolean
  onClick?: () => void
  equippedItem?: DBEquipmentItem
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 group w-full",
        alignRight && "flex-row-reverse"
      )}
    >
      <IconFrame className={cn(
        "w-12 h-12 flex-shrink-0 transition-all",
        selected && "ring-2 ring-[#7aa8c8] ring-offset-1 ring-offset-[#0a0908]"
      )}>
        <div className={cn(
          "w-full h-full transition-colors cursor-pointer p-0.5 overflow-hidden",
          selected ? "bg-[#1a2a35]" : "bg-[#1a1614] hover:bg-[#2a2420]"
        )}>
          {equippedItem?.icon_url ? (
            <img 
              src={equippedItem.icon_url} 
              alt={equippedItem.name} 
              className="w-full h-full object-contain"
            />
          ) : defaultIconUrl ? (
            <img 
              src={defaultIconUrl} 
              alt={label} 
              className={cn(
                "w-full h-full object-contain transition-opacity",
                selected ? "opacity-100" : "opacity-80 group-hover:opacity-100"
              )}
            />
          ) : (
            <Icon className={cn(
              "w-full h-full transition-opacity",
              selected ? "opacity-100" : "opacity-70 group-hover:opacity-100"
            )} />
          )}
        </div>
      </IconFrame>
      <span className={cn(
        "text-[10px] transition-colors",
        alignRight && "text-right",
        selected ? "text-[#7aa8c8]" : "text-stone-500 group-hover:text-stone-400"
      )}>
        {equippedItem?.name || label}
      </span>
    </button>
  )
}
