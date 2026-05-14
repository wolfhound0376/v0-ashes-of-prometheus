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
  ChevronRight,
  Weight,
  AlertTriangle,
  Package,
  User,
} from "lucide-react"
import { cn } from "@/lib/utils"

// D&D 5E Conditions with their effects
const DND_CONDITIONS = {
  blinded: { name: "Blinded", color: "text-stone-400", description: "Can't see, auto-fail sight checks, attacks have disadvantage" },
  charmed: { name: "Charmed", color: "text-pink-400", description: "Can't attack charmer, charmer has advantage on social checks" },
  deafened: { name: "Deafened", color: "text-stone-400", description: "Can't hear, auto-fail hearing checks" },
  frightened: { name: "Frightened", color: "text-purple-400", description: "Disadvantage while source visible, can't move closer" },
  grappled: { name: "Grappled", color: "text-orange-400", description: "Speed is 0, ends if grappler incapacitated" },
  incapacitated: { name: "Incapacitated", color: "text-red-400", description: "Can't take actions or reactions" },
  invisible: { name: "Invisible", color: "text-cyan-400", description: "Impossible to see, advantage on attacks, attacks against have disadvantage" },
  paralyzed: { name: "Paralyzed", color: "text-yellow-400", description: "Incapacitated, auto-fail STR/DEX saves, attacks have advantage, melee crits" },
  petrified: { name: "Petrified", color: "text-stone-500", description: "Transformed to stone, incapacitated, unaware" },
  poisoned: { name: "Poisoned", color: "text-green-400", description: "Disadvantage on attacks and ability checks" },
  prone: { name: "Prone", color: "text-amber-400", description: "Disadvantage on attacks, melee attacks have advantage, ranged disadvantage" },
  restrained: { name: "Restrained", color: "text-orange-400", description: "Speed 0, disadvantage on attacks and DEX saves" },
  stunned: { name: "Stunned", color: "text-yellow-400", description: "Incapacitated, auto-fail STR/DEX saves, attacks have advantage" },
  unconscious: { name: "Unconscious", color: "text-red-500", description: "Incapacitated, unaware, drop items, prone, auto-fail STR/DEX, attacks have advantage, melee crits" },
  exhaustion: { name: "Exhaustion", color: "text-amber-600", description: "Cumulative levels with increasing penalties" },
} as const

type ConditionKey = keyof typeof DND_CONDITIONS

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
  
  // Collapsible sections
  const [showStats, setShowStats] = useState(false)
  const [showInventory, setShowInventory] = useState(false)
  
  // Mock conditions for now - would come from character data
  const activeConditions: ConditionKey[] = [] // e.g., ["poisoned", "exhaustion"]

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
      <FantasyPanel title="Character" className="flex-1 min-h-0 flex flex-col">
        {/* Character Header - Always visible */}
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

          {/* Core Stats Row - HP, AC, Initiative */}
          <div className="mt-3 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Heart className="w-4 h-4 text-red-400" />
              <span className="text-sm font-medium text-stone-300">{character.hp.current}/{character.hp.max}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-stone-300">{character.ac}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Star className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-medium text-stone-300">+{character.initiative}</span>
            </div>
          </div>
          
          {/* Conditions - D&D 5E status effects */}
          <div className="mt-2">
            {activeConditions.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {activeConditions.map((condition) => {
                  const conditionData = DND_CONDITIONS[condition]
                  return (
                    <span
                      key={condition}
                      className={cn(
                        "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border",
                        conditionData.color,
                        "border-current/30 bg-current/10"
                      )}
                      title={conditionData.description}
                    >
                      {conditionData.name}
                    </span>
                  )
                })}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400/70">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>No conditions</span>
              </div>
            )}
          </div>
        </div>

        {/* Collapsible Sections */}
        <div className="flex-1 overflow-y-auto">
          {/* Stats & Equipment - Collapsible */}
          <button
            onClick={() => setShowStats(!showStats)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#2a2420]/40 transition-colors border-b border-[#3d3428]/40"
          >
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-[#7aa8c8]" />
              <span className="text-xs font-semibold tracking-[0.15em] uppercase text-[#c9b896]">
                Stats & Equipment
              </span>
            </div>
            <ChevronRight className={cn("w-4 h-4 text-stone-500 transition-transform", showStats && "rotate-90")} />
          </button>
          
          {showStats && (
            <div className="border-b border-[#3d3428]/40">
              {/* Ability Scores */}
              <div className="p-3 border-b border-[#3d3428]/20">
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

              {/* Other Stats */}
              <div className="p-3 border-b border-[#3d3428]/20">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <StatRow icon={Scroll} label="Proficiency" value={`+${character.proficiencyBonus}`} />
                  <StatRow icon={Eye} label="Passive Perception" value={character.passivePerception.toString()} />
                </div>
              </div>

              {/* Equipment Paper Doll */}
              <div className="flex py-2">
                <div className="w-20 px-2 flex flex-col justify-center">
                  <div className="space-y-1.5">
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

                <div className="flex-1 flex items-center justify-center px-2">
                  <div className="relative w-32 h-48 flex items-center justify-center">
                    {(character as any).avatarUrl ? (
                      <img 
                        src={(character as any).avatarUrl} 
                        alt={character.name}
                        className="max-w-full max-h-full object-contain drop-shadow-[0_0_15px_rgba(100,150,200,0.3)]"
                      />
                    ) : (
                      <div className="w-24 h-40 bg-gradient-to-b from-[#2a3a4a]/40 to-[#1a2a35]/40 rounded-t-full border border-[#4a5a6a]/20" />
                    )}
                  </div>
                </div>

                <div className="w-20 px-2 flex flex-col justify-center">
                  <div className="space-y-1.5">
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
            </div>
          )}

          {/* Inventory - Collapsible */}
          <button
            onClick={() => setShowInventory(!showInventory)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#2a2420]/40 transition-colors border-b border-[#3d3428]/40"
          >
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-[#c9a868]" />
              <span className="text-xs font-semibold tracking-[0.15em] uppercase text-[#c9b896]">
                Inventory
              </span>
              <span className="text-xs text-stone-500">({inventory.length})</span>
            </div>
            <ChevronRight className={cn("w-4 h-4 text-stone-500 transition-transform", showInventory && "rotate-90")} />
          </button>
          
          {showInventory && (
            <div className="px-3 py-2">
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
                        <IconFrame className="w-8 h-8 flex-shrink-0" selected={isSelected}>
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
          )}
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
