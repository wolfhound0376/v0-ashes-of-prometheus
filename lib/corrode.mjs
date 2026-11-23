// CORRODE METAL — the gray ooze eats metal (SRD 5.1, Monsters: Gray Ooze).
//
// Sam, 2026-11-23: "go corrode", on the ooze-in-the-pool plan (claude/Gray_Ooze_Pool_Module_2026-11-23.md), where he
// took "Corrode Metal exactly as the SRD writes it". The two rules, as printed:
//   Corrode Metal: "Any nonmagical weapon made of metal that hits the ooze corrodes. After dealing damage, the weapon takes
//     a permanent and cumulative -1 penalty to damage rolls. If its penalty drops to -5, the weapon is destroyed.
//     Nonmagical ammunition made of metal that hits the ooze is destroyed after dealing damage."
//   Pseudopod: "... and if the target is wearing nonmagical metal armor, its armor is partly corroded and takes a permanent
//     and cumulative -1 penalty to the AC it offers. The armor is destroyed if the penalty reduces its AC to 10."
//
// This file is pasted whole (minus `export`) into the painted map at its CORRODE placeholder
// (scripts/velkynvelve-walk/build_walk.py corrode_rules), and imported by app/api/walk-corrode and lib/corrode.test.ts,
// so all three read the same numbers.
//
// WHAT IS METAL is not in the catalogue (an `items` row carries no material: lib/repair.ts says the same of armour). The
// lists below are Claude's reading of the SRD weapon and armour tables, by what the striking part is made of:
//   not metal: club, greatclub, quarterstaff (wood); whip (leather); net (rope); obsidian, bone and wooden oddments; and
//     the launchers (bows, crossbows, slings, blowguns), which never touch the ooze: their AMMUNITION does.
//   metal: every other SRD weapon (blades, axes, maces, hammers, picks, and spears and javelins by their heads).
//   metal armour: ring mail, chain shirt, chain mail, scale mail, breastplate, half plate, splint, plate.
//   not metal: padded, leather, studded leather, hide, and a plain shield (wood) unless its name says steel or iron.

export const CORRODE_RULES = {
  weaponDestroyedAt: 5,          // a -5 damage penalty destroys the weapon
  armorDestroyedAtAc: 10,        // armour whose AC is corroded down to 10 is destroyed
  source: "SRD 5.1, Monsters: Gray Ooze (Corrode Metal; Pseudopod)",
}

/** Creatures whose touch corrodes metal, by bestiary slug. */
export const CORRODERS = new Set(["gray-ooze"])

const NOT_METAL_WEAPONS = new Set([
  "club", "greatclub", "quarterstaff", "whip", "net", "unarmed", "unarmed-strike",
  "shortbow", "longbow", "light-crossbow", "heavy-crossbow", "hand-crossbow", "sling", "blowgun",
  "obsidian-shard", "totem-club",
])
const LAUNCHERS = new Set(["shortbow", "longbow", "light-crossbow", "heavy-crossbow", "hand-crossbow", "sling", "blowgun"])
const METAL_ARMOR = /\b(ring-?mail|chain-?shirt|chain-?mail|scale-?mail|breastplate|half-?plate|splint|plate(-armou?r)?)\b/
const NOT_METAL_ARMOR = /\b(padded|leather|studded|hide)\b/

export function slugOfName(name) {
  return String(name || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

/** Is the part of this weapon that strikes made of metal? `base` is the SRD weapon it is (e.g. "dagger"), or its name. */
export function weaponIsMetal(base) {
  const s = slugOfName(base)
  if (!s) return false
  if (NOT_METAL_WEAPONS.has(s)) return false
  if (/(^|-)(wood|wooden|bone|stone|obsidian|club|staff|wand|rod|orb|totem|fist|punch|unarmed)(-|$)/.test(s)) return false
  return true
}

/** A launcher never touches the ooze; its ammunition does. */
export function isLauncher(base) {
  return LAUNCHERS.has(slugOfName(base))
}

/** Is this worn armour metal? `name` is the item's name, `category` its armor_category (light/medium/heavy/shield). */
export function armorIsMetal(name, category) {
  const s = slugOfName(name)
  if (String(category || "").toLowerCase() === "shield") return /\b(steel|iron|metal)\b/.test(s.replace(/-/g, " "))
  if (NOT_METAL_ARMOR.test(s.replace(/-/g, " "))) return false
  return METAL_ARMOR.test(s.replace(/-/g, "-"))
}

/** One more hit on a weapon: its new total penalty, and whether that destroys it. */
export function corrodeWeapon(total) {
  const t = Math.max(0, Math.floor(Number(total) || 0)) + 1
  return { total: t, destroyed: t >= CORRODE_RULES.weaponDestroyedAt }
}

/** One more pseudopod hit on armour that offers `baseAc`: its new penalty, the AC it now offers, and whether it is destroyed. */
export function corrodeArmor(baseAc, total) {
  const t = Math.max(0, Math.floor(Number(total) || 0)) + 1
  const ac = Number(baseAc) - t
  return { total: t, ac, destroyed: ac <= CORRODE_RULES.armorDestroyedAtAc }
}

/** The line a sheet or the bag shows for a corroded thing. */
export function corrosionNote(part, total, destroyed) {
  if (destroyed) return part === "armor" ? "Eaten through by an ooze's acid: destroyed." : "Eaten away by an ooze's acid: destroyed."
  return part === "armor" ? `Corroded by an ooze's acid: ${-total} AC.` : `Corroded by an ooze's acid: ${-total} to damage.`
}

/**
 * Does this blow corrode something, and what? Pure: it says what the rules call for; the caller applies it.
 *   attacker / target: {id, hero}   attack: {item, magic, ammo, thrown, base}   armor: the target's worn body armour or null
 * Returns null, or {part: "weapon"|"ammo"|"armor", ...}.
 */
/** @param {{attacker?: any, target?: any, attack?: any, armor?: any}} [blow] */
export function corrosionFor({ attacker, target, attack, armor } = {}) {
  if (!attacker || !target) return null
  // a hero's metal weapon (or its ammunition) hits the ooze
  if (attacker.hero && CORRODERS.has(target.id) && attack && attack.item && !attack.magic) {
    if (attack.ammo) return weaponIsMetal("bolt") ? { part: "ammo" } : null   // arrows, bolts and bullets carry metal heads or are metal
    if (isLauncher(attack.base)) return null
    return weaponIsMetal(attack.base || attack.name) ? { part: "weapon" } : null
  }
  // the ooze's pseudopod hits a hero in nonmagical metal armour
  if (CORRODERS.has(attacker.id) && target.hero && armor && !armor.magic && armorIsMetal(armor.name, armor.category)) {
    return { part: "armor" }
  }
  return null
}
