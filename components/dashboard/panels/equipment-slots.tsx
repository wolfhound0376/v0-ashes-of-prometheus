"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { X, Check } from "lucide-react"
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
  IconFrame,
} from "@/components/ui/fantasy-icons"

// Equipment slot definitions
const EQUIPMENT_SLOTS = [
  { id: "head", label: "Head", Icon: HoodIcon, row: 0, col: 1 },
  { id: "neck", label: "Neck", Icon: NecklaceIcon, row: 1, col: 0 },
  { id: "chest", label: "Chest", Icon: RobeIcon, row: 1, col: 1 },
  { id: "main_hand", label: "Main", Icon: StaffIcon, row: 1, col: 2 },
  { id: "hands", label: "Hands", Icon: OrbIcon, row: 2, col: 0 },
  { id: "legs", label: "Legs", Icon: PantsIcon, row: 2, col: 1 },
  { id: "off_hand", label: "Off", Icon: OrbIcon, row: 2, col: 2 },
  { id: "ring_1", label: "Ring", Icon: RingIcon, row: 3, col: 0 },
  { id: "feet", label: "Feet", Icon: BootsIcon, row: 3, col: 1 },
  { id: "ring_2", label: "Ring", Icon: RingIcon, row: 3, col: 2 },
] as const

interface EquippedItem {
  id: string
  name: string
  slot: string
  icon_url?: string
  preset_icon?: string
}

interface InventoryItem {
  id: string
  name: string
  equippable_slot?: string
  icon_url?: string
  preset_icon?: string
}

interface EquipmentSlotsProps {
  equippedItems: EquippedItem[]
  inventory: InventoryItem[]
  onEquip: (itemId: string, slot: string) => void
  onUnequip: (slot: string) => void
}

export function EquipmentSlots({
  equippedItems,
  inventory,
  onEquip,
  onUnequip
}: EquipmentSlotsProps) {
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)

  // Get equipped item for a slot
  const getEquippedItem = (slotId: string) => 
    equippedItems.find(item => item.slot === slotId)

  // Get available items that can be equipped in the selected slot
  const getAvailableItems = (slotId: string) =>
    inventory.filter(item => item.equippable_slot === slotId)

  const handleSlotClick = (slotId: string) => {
    if (selectedSlot === slotId) {
      setSelectedSlot(null)
    } else {
      setSelectedSlot(slotId)
    }
  }

  const handleEquipItem = (itemId: string) => {
    if (selectedSlot) {
      onEquip(itemId, selectedSlot)
      setSelectedSlot(null)
    }
  }

  const handleUnequipItem = (slot: string) => {
    onUnequip(slot)
    setSelectedSlot(null)
  }

  const availableItems = selectedSlot ? getAvailableItems(selectedSlot) : []
  const currentEquipped = selectedSlot ? getEquippedItem(selectedSlot) : null

  return (
    <div className="space-y-3">
      {/* Equipment Grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {EQUIPMENT_SLOTS.map((slot) => {
          const equippedItem = getEquippedItem(slot.id)
          const isSelected = selectedSlot === slot.id
          const SlotIcon = slot.Icon

          return (
            <button
              key={slot.id}
              onClick={() => handleSlotClick(slot.id)}
              className={cn(
                "relative aspect-square rounded border transition-all",
                "hover:border-[#7aa8c8]/50 hover:bg-[#1a2a35]/30",
                isSelected
                  ? "border-[#7aa8c8] bg-[#1a2a35]/50 shadow-[0_0_10px_rgba(122,168,200,0.2)]"
                  : "border-[#3d3428]/60 bg-[#1a1614]/60"
              )}
            >
              <IconFrame className="w-full h-full p-1" selected={isSelected}>
                <div className="w-full h-full bg-[#0a0908] rounded-sm flex items-center justify-center overflow-hidden">
                  {equippedItem?.icon_url ? (
                    <img 
                      src={equippedItem.icon_url} 
                      alt={equippedItem.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <SlotIcon className="w-3/4 h-3/4 text-stone-600" />
                  )}
                </div>
              </IconFrame>
              <span className="absolute bottom-0 left-0 right-0 text-[8px] uppercase tracking-wider text-center text-stone-500 bg-[#1a1614]/80 py-0.5">
                {slot.label}
              </span>
              {equippedItem && (
                <div className="absolute top-0 right-0 w-2 h-2 bg-emerald-400 rounded-full m-0.5" />
              )}
            </button>
          )
        })}
      </div>

      {/* Item Selection Panel - Shows when a slot is selected */}
      {selectedSlot && (
        <div className="border border-[#3d3428] rounded bg-[#1a1614]/80 p-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wider text-[#c9b896]">
              {EQUIPMENT_SLOTS.find(s => s.id === selectedSlot)?.label} Slot
            </span>
            <button
              onClick={() => setSelectedSlot(null)}
              className="text-stone-500 hover:text-stone-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Currently equipped */}
          {currentEquipped && (
            <div className="mb-2 p-1.5 bg-[#2a3a2a]/40 border border-emerald-500/30 rounded flex items-center gap-2">
              <div className="w-8 h-8 rounded border border-emerald-500/30 overflow-hidden flex-shrink-0">
                {currentEquipped.icon_url ? (
                  <img src={currentEquipped.icon_url} alt={currentEquipped.name} className="w-full h-full object-cover" />
                ) : (
                  <BackpackIcon className="w-full h-full text-stone-500 p-1" />
                )}
              </div>
              <span className="flex-1 text-sm text-emerald-300 truncate">{currentEquipped.name}</span>
              <button
                onClick={() => handleUnequipItem(selectedSlot)}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 border border-red-400/30 rounded"
              >
                Unequip
              </button>
            </div>
          )}

          {/* Available items */}
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {availableItems.length > 0 ? (
              availableItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => handleEquipItem(item.id)}
                  className="w-full flex items-center gap-2 p-1.5 rounded hover:bg-[#2a2420]/60 transition-colors"
                >
                  <div className="w-7 h-7 rounded border border-[#3d3428] overflow-hidden flex-shrink-0">
                    {item.icon_url ? (
                      <img src={item.icon_url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <BackpackIcon className="w-full h-full text-stone-500 p-0.5" />
                    )}
                  </div>
                  <span className="flex-1 text-sm text-stone-300 truncate text-left">{item.name}</span>
                  <Check className="w-4 h-4 text-stone-500" />
                </button>
              ))
            ) : (
              <div className="text-center py-3 text-stone-500 text-xs italic">
                No items available for this slot
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
