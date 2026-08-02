"use client"

// Basic Inventory panel from the v3.0 design: carried weight against capacity,
// a row of item-type filters, a compact Item / Qty / Weight table, the coin
// purse, and a button through to the full inventory window.
//
// This is a read-and-filter view over the same `inventory_items` rows the rest
// of the dashboard uses — it does not write anything.

import { useMemo, useState } from "react"
import {
  Backpack,
  Coins,
  FlaskConical,
  Gem,
  Package,
  Scroll,
  Shield,
  Sparkles,
  Sword,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { FantasyPanel } from "@/components/ui/fantasy-panel"

export interface BasicInventoryItem {
  id: string
  name: string
  quantity: number
  weight?: number | null
  item_type?: string | null
  iconUrl?: string | null
}

interface BasicInventoryProps {
  items: BasicInventoryItem[]
  weightCurrent?: number | null
  weightMax?: number | null
  currency?: { gold?: number; silver?: number; copper?: number } | null
  onManage?: () => void
}

type TypeFilter = "all" | "weapon" | "armor" | "consumable" | "scroll" | "treasure" | "gear" | "misc"

const TYPE_FILTERS: { id: TypeFilter; label: string; icon: typeof Sword }[] = [
  { id: "all", label: "All", icon: Package },
  { id: "weapon", label: "Weapons", icon: Sword },
  { id: "armor", label: "Armor", icon: Shield },
  { id: "consumable", label: "Consumables", icon: FlaskConical },
  { id: "scroll", label: "Scrolls", icon: Scroll },
  { id: "treasure", label: "Treasure", icon: Gem },
  { id: "gear", label: "Gear", icon: Backpack },
  { id: "misc", label: "Other", icon: Sparkles },
]

// Map whatever free-text item_type the DB holds onto one of our filter buckets.
function bucketOf(item: BasicInventoryItem): TypeFilter {
  const t = (item.item_type || "").toLowerCase()
  const n = item.name.toLowerCase()
  if (/weapon|sword|axe|bow|dagger|mace|staff|spear/.test(t + n)) return "weapon"
  if (/armor|armour|shield|mail|plate|helm|cloak/.test(t + n)) return "armor"
  if (/potion|consumable|food|ration|elixir|oil/.test(t + n)) return "consumable"
  if (/scroll|tome|book|spell/.test(t + n)) return "scroll"
  if (/gem|treasure|coin|gold|jewel|ring|amulet/.test(t + n)) return "treasure"
  if (/gear|tool|kit|rope|torch|pack|backpack/.test(t + n)) return "gear"
  return "misc"
}

export function BasicInventory({
  items,
  weightCurrent,
  weightMax,
  currency,
  onManage,
}: BasicInventoryProps) {
  const [filter, setFilter] = useState<TypeFilter>("all")

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((i) => bucketOf(i) === filter)),
    [items, filter],
  )

  // Fall back to summing item weights when the character row has no total.
  const carried =
    typeof weightCurrent === "number"
      ? weightCurrent
      : items.reduce((sum, i) => sum + (Number(i.weight) || 0) * (i.quantity || 1), 0)

  const overloaded = typeof weightMax === "number" && weightMax > 0 && carried > weightMax

  return (
    <FantasyPanel
      title="Basic Inventory"
      className="flex min-h-0 flex-col"
      titleRight={
        <span className={cn("text-[11px]", overloaded ? "text-red-400" : "text-stone-400")}>
          {carried.toFixed(1)}
          {typeof weightMax === "number" && weightMax > 0 ? ` / ${weightMax}` : ""} lb
        </span>
      }
    >
      {/* Type filters */}
      <div className="flex flex-wrap gap-1 border-b border-[#7a5f33]/35 px-2 py-1.5">
        {TYPE_FILTERS.map((f) => {
          const Icon = f.icon
          const active = filter === f.id
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              title={f.label}
              aria-label={f.label}
              className={cn(
                "rounded-[3px] border px-1.5 py-1 transition-colors",
                active
                  ? "border-[#c9a868]/70 bg-[#241a10] text-[#e0cfa0]"
                  : "border-transparent text-stone-500 hover:text-stone-300",
              )}
            >
              {f.id === "all" ? <span className="px-0.5 text-[11px]">All</span> : <Icon className="h-3.5 w-3.5" />}
            </button>
          )
        })}
      </div>

      {/* Item table */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-[#100d09] text-[10px] uppercase tracking-wider text-stone-500">
            <tr>
              <th className="px-2 py-1 text-left font-normal">Item</th>
              <th className="w-12 px-1 py-1 text-right font-normal">Qty</th>
              <th className="w-16 px-2 py-1 text-right font-normal">Weight</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-2 py-6 text-center text-[12px] italic text-stone-600">
                  {items.length === 0 ? "Nothing carried" : "Nothing of that kind"}
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id} className="border-t border-[#7a5f33]/20 hover:bg-[#1a1410]/60">
                  <td className="px-2 py-1">
                    <span className="flex items-center gap-1.5">
                      {item.iconUrl ? (
                        <img src={item.iconUrl} alt="" className="h-4 w-4 flex-shrink-0 object-contain" />
                      ) : (
                        <Package className="h-3.5 w-3.5 flex-shrink-0 text-stone-600" />
                      )}
                      <span className="truncate text-stone-300">{item.name}</span>
                    </span>
                  </td>
                  <td className="px-1 py-1 text-right text-stone-400">{item.quantity}</td>
                  <td className="px-2 py-1 text-right text-stone-500">
                    {item.weight ? `${item.weight} lb.` : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Coin purse + manage */}
      <div className="flex items-center justify-between gap-2 border-t border-[#7a5f33]/35 px-2 py-1.5">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="flex items-center gap-1 text-[#d4b15a]">
            <Coins className="h-3 w-3" />
            {currency?.gold ?? 0}
          </span>
          <span className="flex items-center gap-1 text-stone-400">
            <Coins className="h-3 w-3" />
            {currency?.silver ?? 0}
          </span>
          <span className="flex items-center gap-1 text-[#b87333]">
            <Coins className="h-3 w-3" />
            {currency?.copper ?? 0}
          </span>
        </div>
        <button
          type="button"
          onClick={onManage}
          className="rounded-[3px] border border-[#7a5f33]/60 bg-gradient-to-b from-[#1d1710] to-[#120e0a] px-2 py-1 text-[11px] text-stone-300 transition-colors hover:border-[#c9a868] hover:text-[#e0cfa0]"
        >
          Manage Inventory
        </button>
      </div>
    </FantasyPanel>
  )
}
