"use client"

// Collapsible "Equipped Items" panel that sits directly beneath Basic Inventory
// (see reference image 3). Collapsed it is a single bar showing the equipped
// count; expanded it shows a compact paper-doll (equip slots flanking the
// character portrait) plus an "Eligible from Inventory" list. Items can be
// equipped by dragging onto a matching slot or by clicking a slot then an
// eligible item / the Equip button. All mutations funnel through `onEquip`,
// so equipping a filled slot replaces whatever was there.

import { useState } from "react"
import { Backpack as BackpackIcon, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { ItemIcon } from "@/lib/item-icons"

export interface EquipSlotDef {
  id: string
  label: string
  icon: string
}

export interface EquippedItem {
  id: string
  name: string
  slot: string
  iconUrl?: string | null
  itemType?: string | null
}

export interface EligibleItem {
  id: string
  name: string
  iconUrl?: string | null
  equippable_slot?: string | null
}

interface EquippedItemsPanelProps {
  slots: readonly EquipSlotDef[]
  equipped: EquippedItem[]
  eligible: EligibleItem[]
  portraitUrl?: string | null
  characterName?: string
  onEquip: (itemId: string, slotId: string) => void
  onUnequip?: (slotId: string) => void
}

// Which columns of the paper doll a slot sits in. Two columns of three,
// flanking the portrait, matching the reference layout.
const LEFT_SLOTS = ["head", "neck", "main_hand"]
const RIGHT_SLOTS = ["torso", "off_hand", "feet"]

export function EquippedItemsPanel({
  slots,
  equipped,
  eligible,
  portraitUrl,
  characterName,
  onEquip,
  onUnequip,
}: EquippedItemsPanelProps) {
  const [open, setOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [dragValidSlot, setDragValidSlot] = useState<string | null>(null)
  const [dragRejectSlot, setDragRejectSlot] = useState<string | null>(null)

  const slotOf = (id: string) => slots.find((s) => s.id === id)
  const equippedIn = (slotId: string) => equipped.find((e) => e.slot === slotId)
  const dropState = (slotId: string): "idle" | "valid" | "reject" =>
    dragRejectSlot === slotId ? "reject" : dragValidSlot === slotId ? "valid" : "idle"

  const onDragOver = (slotId: string) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    if (dragValidSlot !== slotId) setDragValidSlot(slotId)
  }
  const onDragLeave = (slotId: string) => () =>
    setDragValidSlot((cur) => (cur === slotId ? null : cur))
  const onDrop = (slotId: string) => (e: React.DragEvent) => {
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
      /* malformed — rejected below */
    }
    if (itemId && itemSlot === slotId) {
      onEquip(itemId, slotId)
      setSelectedSlot(null)
    } else {
      setDragRejectSlot(slotId)
      setTimeout(() => setDragRejectSlot((cur) => (cur === slotId ? null : cur)), 600)
    }
  }
  const makeDragStart = (item: EligibleItem) => (e: React.DragEvent) => {
    const payload = JSON.stringify({ id: item.id, equippableSlot: item.equippable_slot ?? null })
    e.dataTransfer.setData("application/x-aop-item", payload)
    e.dataTransfer.setData("text/plain", payload)
    e.dataTransfer.effectAllowed = "move"
  }

  // When a slot is selected, only items for that slot are "actionable"; otherwise
  // every equippable item shows its own Equip button targeting its native slot.
  const isEquipped = (item: EligibleItem) => equipped.some((e) => e.id === item.id)

  const SlotButton = ({ slotId }: { slotId: string }) => {
    const slot = slotOf(slotId)
    if (!slot) return null
    const eq = equippedIn(slotId)
    const ds = dropState(slotId)
    return (
      <button
        onClick={() => {
          if (eq && onUnequip) onUnequip(slotId)
          else setSelectedSlot((cur) => (cur === slotId ? null : slotId))
        }}
        onDragOver={onDragOver(slotId)}
        onDragLeave={onDragLeave(slotId)}
        onDrop={onDrop(slotId)}
        title={eq ? `${eq.name} (click to unequip)` : slot.label}
        className={cn(
          "group flex h-12 w-12 items-center justify-center rounded border transition-all",
          eq
            ? "border-[#4a7a9a]/60 bg-[#1a2a35]/60 shadow-[0_0_10px_rgba(100,150,200,0.3)]"
            : "border-dashed border-[#3d3428]/70 bg-[#1a1614]/90 hover:border-[#5d5448] hover:bg-[#2a2420]/80",
          selectedSlot === slotId && "ring-2 ring-[#d4b15a]/60 border-[#d4b15a]/40",
          ds === "valid" && "ring-2 ring-emerald-400/80 border-emerald-400/60 bg-emerald-500/10",
          ds === "reject" && "ring-2 ring-red-500/80 border-red-500/70 bg-red-500/15 animate-pulse",
        )}
      >
        {eq ? (
          <ItemIcon iconUrl={eq.iconUrl} name={eq.name} itemType={eq.itemType} className="h-[85%] w-[85%] rounded" />
        ) : (
          <img
            src={slot.icon || "/placeholder.svg"}
            alt={slot.label}
            className="h-[65%] w-[65%] opacity-40 transition-opacity group-hover:opacity-70"
          />
        )}
      </button>
    )
  }

  return (
    <div className="overflow-hidden rounded-[4px] border border-[#7a5f33]/45 bg-[#0d0a08]">
      {/* Collapsed header bar */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between border-b border-[#7a5f33]/35 bg-gradient-to-b from-[#1d1710] to-[#140f0a] px-3 py-2 transition-colors hover:from-[#241a10]"
        aria-expanded={open}
      >
        <span className="font-serif text-[13px] uppercase tracking-[0.14em] text-[#d9bd7e]">Equipped Items</span>
        <span className="flex items-center gap-2 text-[11px] text-stone-400">
          {equipped.length} equipped
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 p-3">
          {/* Paper doll: slots flanking the portrait */}
          <div className="flex flex-shrink-0 items-center justify-center gap-2">
            <div className="flex flex-col gap-1.5">
              {LEFT_SLOTS.map((id) => (
                <SlotButton key={id} slotId={id} />
              ))}
            </div>
            <div className="relative h-[140px] w-[96px] flex-shrink-0 overflow-hidden rounded border border-[#3d3428]/60 bg-[#0a0908]">
              {portraitUrl ? (
                <img src={portraitUrl || "/placeholder.svg"} alt={characterName || "Character"} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <BackpackIcon className="h-8 w-8 text-stone-700" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              {RIGHT_SLOTS.map((id) => (
                <SlotButton key={id} slotId={id} />
              ))}
            </div>
          </div>

          {/* Eligible from inventory */}
          <div className="min-w-0">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#c9a868]">
              Eligible from Inventory
            </div>
            {eligible.length > 0 ? (
              <ul className="space-y-1">
                {eligible.map((item) => {
                  const equipped = isEquipped(item)
                  const targetSlot = selectedSlot ?? item.equippable_slot ?? null
                  const canEquipHere = !!targetSlot && (selectedSlot ? item.equippable_slot === selectedSlot : true)
                  return (
                    <li
                      key={item.id}
                      draggable
                      onDragStart={makeDragStart(item)}
                      className="flex items-center gap-2 rounded border border-[#3d3428]/50 bg-[#12100c] px-2 py-1.5"
                    >
                      {item.iconUrl ? (
                        <img src={item.iconUrl || "/placeholder.svg"} alt="" className="h-5 w-5 flex-shrink-0 object-contain" />
                      ) : (
                        <BackpackIcon className="h-4 w-4 flex-shrink-0 text-stone-600" />
                      )}
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="truncate text-[12px] text-stone-200">{item.name}</div>
                        <div className="text-[10px] text-stone-500">
                          {slotOf(item.equippable_slot ?? "")?.label ?? "Equippable"}
                        </div>
                      </div>
                      {equipped ? (
                        <span className="flex-shrink-0 rounded bg-emerald-700/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
                          Equipped
                        </span>
                      ) : (
                        <button
                          onClick={() => canEquipHere && targetSlot && onEquip(item.id, targetSlot)}
                          disabled={!canEquipHere}
                          className={cn(
                            "flex-shrink-0 rounded border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors",
                            canEquipHere
                              ? "border-[#7a5f33]/60 bg-[#1d1710] text-[#e0cfa0] hover:border-[#c9a868]"
                              : "border-[#3d3428]/40 text-stone-600",
                          )}
                        >
                          Equip
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-[11px] italic text-stone-500">No equippable items — find some.</p>
            )}
            <p className="mt-2 text-[10px] italic text-stone-600">
              {selectedSlot
                ? `Selecting for ${slotOf(selectedSlot)?.label}. Click an Equip button or drag an item here.`
                : "Drag an item onto a slot to equip or replace."}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
