import type { Character, EquipmentItem } from "@/lib/types/database"

/**
 * Apply the table's current AC ruling without pretending the schema contains
 * enough information to model 5e armour. Unarmoured characters use 10 + Dex;
 * once an armour item is equipped, the stored AC remains authoritative.
 */
export function getDisplayedArmorClass(
  character: Character | undefined,
  equipment: EquipmentItem[],
): number {
  if (!character) return 10

  const armourIsWorn = equipment.some((item) => {
    const slot = String(item.slot ?? "").toLowerCase()
    if (slot !== "armor" && slot !== "torso") return false
    // Prison rags occupy the torso paper-doll slot, but are clothing rather
    // than armour and must not switch off unarmoured defence.
    return Number(item.stats_bonus?.ac ?? 0) !== 0 || item.name.toLowerCase() !== "rags"
  })

  if (armourIsWorn) {
    const equipmentBonus = equipment.reduce(
      (total, item) => total + Number(item.stats_bonus?.ac ?? 0),
      0,
    )
    return Number(character.ac ?? 10) + equipmentBonus
  }

  return 10 + Number(character.dex_modifier ?? 0)
}
