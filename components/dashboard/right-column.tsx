"use client"

import { useState } from "react"
import { FantasyPanel, PanelDivider } from "@/components/ui/fantasy-panel"
import {
  Heart,
  Shield,
  Star,
  Scroll,
  Eye,
  Sparkles,
  ChevronDown,
  Backpack,
  Shirt,
  FlaskConical,
  Gem,
  Cable,
  Flame,
  Coins,
  Weight,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Character {
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

interface InventoryItem {
  id: string
  name: string
  quantity: number
  icon: string
}

interface RightColumnProps {
  character: Character
  inventory: InventoryItem[]
}

const iconMap: Record<string, any> = {
  backpack: Backpack,
  shirt: Shirt,
  "flask-conical": FlaskConical,
  scroll: Scroll,
  gem: Gem,
  cable: Cable,
  flame: Flame,
  coins: Coins,
}

export function RightColumn({ character, inventory }: RightColumnProps) {
  const [selectedItem, setSelectedItem] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-2 h-full overflow-hidden">
      <FantasyPanel title="Character Info & Inventory" className="flex-1 min-h-0 flex flex-col">
        {/* Character Header */}
        <div className="p-3 border-b border-[#3d3428]/40">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#7aa8c8]" />
              <div>
                <h2 className="font-serif text-lg text-[#e8dcc8]">{character.name}</h2>
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
          <div className="flex">
            {/* Equipment Slots */}
            <div className="w-32 p-2 border-r border-[#3d3428]/40">
              <div className="space-y-1">
                <EquipmentSlot label="Head" />
                <EquipmentSlot label="Neck" />
                <EquipmentSlot label="Torso" />
                <EquipmentSlot label="Legs" />
                <EquipmentSlot label="Feet" />
              </div>
            </div>

            {/* Character Silhouette */}
            <div className="w-24 p-2 flex items-center justify-center">
              <div className="w-16 h-32 bg-gradient-to-b from-[#2a3a4a] to-[#1a2a35] rounded-t-full opacity-60 border border-[#4a5a6a]/30" />
            </div>

            {/* Right Equipment Slots */}
            <div className="w-24 p-2 border-l border-[#3d3428]/40">
              <div className="space-y-1">
                <EquipmentSlot label="Main Hand" compact />
                <EquipmentSlot label="Off Hand" compact />
                <EquipmentSlot label="Ring" compact />
                <EquipmentSlot label="Ring" compact />
              </div>
            </div>
          </div>

          <PanelDivider />

          {/* Inventory */}
          <div className="px-3 pb-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold tracking-[0.15em] uppercase text-[#c9b896]">Inventory</h4>
              <button className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-200 transition-colors">
                All Items
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-1">
              {inventory.map((item) => {
                const Icon = iconMap[item.icon] || Backpack
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
                    <div className="w-7 h-7 rounded-sm bg-[#1a1614] border border-[#3d3428]/60 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-[#8b7355]" />
                    </div>
                    <span className="flex-1 text-sm text-stone-300 truncate">{item.name}</span>
                    {item.quantity > 1 && (
                      <span className="text-xs text-stone-500">x{item.quantity}</span>
                    )}
                  </button>
                )
              })}
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

function EquipmentSlot({ label, compact }: { label: string; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2 group">
      <div
        className={cn(
          "rounded-sm bg-[#1a1614] border border-[#3d3428]/60 flex items-center justify-center",
          "hover:border-[#5a4a3a]/80 transition-colors cursor-pointer",
          compact ? "w-8 h-8" : "w-10 h-10"
        )}
      >
        <div className="w-2 h-2 rounded-full bg-[#3d3428]/60" />
      </div>
      <span className="text-[10px] text-stone-500 group-hover:text-stone-400 transition-colors">{label}</span>
    </div>
  )
}
