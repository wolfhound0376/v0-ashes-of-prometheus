// COATINGS AND THROWN VIALS — what a hero can dip a weapon or ammunition in, and which vials can be thrown.
//
// Sam, 2026-11-25: "I should be able to dip my weapon or bolt/arrow in poison or other special additive you have per
// DND 5E rules. You should also be able to throw the vials. Bonus on attack should be reflected in damage."
// (2026-10-24 before it: "items need a way to apply poisons/oils BG3-style".) Until now only drow poison could be
// applied, only to a blade or hand-crossbow bolts.
//
// This file is pasted whole (minus `export`) into the painted map at its COATINGS placeholder
// (scripts/velkynvelve-walk/build_walk.py coating_rules) and imported by lib/coatings.test.ts, so the map and the
// tests read the same table. NOTHING HERE IS INVENTED: every row is a catalogue item (`items.slug`) with the rule it
// is printed with, or Sam's own ruling. A vial with no row here keeps going through the DM.
//
// THE RULES, as printed (SRD 5.1):
//   Poison, Basic (Equipment: Adventuring Gear): "You can use the poison in this vial to coat one slashing or piercing
//     weapon or up to three pieces of ammunition. Applying the poison takes an action. A creature hit by the poisoned
//     weapon or ammunition must make a DC 10 Constitution saving throw or take 1d4 poison damage. Once applied, the
//     poison retains potency for 1 minute before drying."
//   Injury poison (Gamemastering: Poisons): "can be applied to weapons, ammunition, trap components, and other objects
//     that deal piercing or slashing damage and remains potent until delivered through a wound or washed off."
//     So one dose is spent by the hit that delivers it (one hit on a weapon; one per piece of ammunition).
//   Drow Poison (Injury): DC 13 CON or poisoned 1 hour; unconscious too on a fail by 5 or more.
//   Serpent Venom (Injury): DC 11 CON, 3d6 poison, half on a success.
//   Wyvern Poison (Injury): DC 15 CON, 7d6 poison, half on a success.
//   Purple Worm Poison (Injury): DC 19 CON, 12d6 poison, half on a success.
//   Contact poison: "A creature that touches contact poison with exposed skin suffers its effects."
//   Crawler Mucus (Contact): DC 13 CON or poisoned 1 minute and paralyzed; the save repeats each turn.
//   Inhaled poison: "releasing the gas subjects creatures in a 5-foot cube to its effect."
//   Essence of Ether (Inhaled): DC 15 CON or poisoned 8 hours and unconscious; wakes if hurt or shaken awake.
//   Oil (Adventuring Gear): "throw it up to 20 feet, shattering it on impact ... On a hit, the target is covered in
//     oil. If the target takes any fire damage before the oil dries (after 1 minute), the target takes an additional
//     5 fire damage from the burning oil."
// AND SAM'S RULING (2026-10-27, homebrew): gray ooze residue "is applied like a poison to a weapon or arrow for one
//   combat: +1d6 acid on every hit".
//
// CLAUDE'S CALLS, flagged (the books are silent or Sam has not ruled):
//   - three pieces of ammunition per dose for every injury poison (the SRD says it of Basic Poison only);
//   - the residue coats a weapon OR the ammunition, whichever the hero picks, and lasts until the fight ends;
//   - a weapon coated outside a fight keeps its coat into the next fight (the minute is counted in fight rounds);
//   - a thrown vial of contact or inhaled poison uses the SRD's flask throw (improvised, 20 ft) and works on a hit;
//   - INJURY POISONS ARE NOT THROWN: by the rule above they do nothing without a wound, so the map offers no throw.

export const COAT_RULES = {
  ammoPerDose: 3,          // "up to three pieces of ammunition"
  basicDriesRounds: 10,    // "retains potency for 1 minute"
  oilBurn: 5,              // "an additional 5 fire damage from the burning oil"
  throwFt: 20,
}

/** What can be put on a weapon or ammunition, by catalogue slug. */
export const COATINGS = {
  "drow-poison":        { key: "drow", label: "drow poison", kind: "drow", dc: 13, source: "SRD 5.1 Poisons: Drow Poison (Injury)" },
  "basic-poison-vial":  { key: "basic", label: "basic poison", kind: "save", dc: 10, dice: "1d4", type: "poison", half: false, dries: true, source: "SRD 5.1 Equipment: Poison, Basic" },
  "serpent-venom":      { key: "serpent", label: "serpent venom", kind: "save", dc: 11, dice: "3d6", type: "poison", half: true, source: "SRD 5.1 Poisons: Serpent Venom (Injury)" },
  "wyvern-poison":      { key: "wyvern", label: "wyvern poison", kind: "save", dc: 15, dice: "7d6", type: "poison", half: true, source: "SRD 5.1 Poisons: Wyvern Poison (Injury)" },
  "purple-worm-poison": { key: "worm", label: "purple worm poison", kind: "save", dc: 19, dice: "12d6", type: "poison", half: true, source: "SRD 5.1 Poisons: Purple Worm Poison (Injury)" },
  "gray-ooze-residue":  { key: "residue", label: "gray ooze residue", kind: "bonus", dice: "1d6", type: "acid", anyDamage: true, wholeFight: true, source: "homebrew: Sam's ruling, 2026-10-27" },
}

/** Vials that are thrown but are not a coating (acid, alchemist's fire and holy water were already on the map). */
export const THROWN_VIALS = {
  "lamp-oil":              { kind: "oil", type: "fire", blurb: "covers them in oil: the next fire damage burns for 5 more", source: "SRD 5.1 Equipment: Oil" },
  "essence-of-ether":      { kind: "ether", type: "poison", dc: 15, blurb: "DC 15 Con or poisoned and out cold", source: "SRD 5.1 Poisons: Essence of Ether (Inhaled)" },
  "carrion-crawler-mucus": { kind: "mucus", type: "poison", dc: 13, blurb: "DC 13 Con or poisoned and paralyzed", source: "SRD 5.1 Poisons: Crawler Mucus (Contact)" },
}

const COAT_NAME_TO_SLUG = [
  [/^drow poison$/, "drow-poison"], [/^basic poison\b|^poison, basic/, "basic-poison-vial"], [/^serpent venom\b/, "serpent-venom"],
  [/^wyvern poison\b/, "wyvern-poison"], [/^purple worm poison\b/, "purple-worm-poison"], [/^gray ooze residue\b/, "gray-ooze-residue"],
  [/^flask of lamp oil$|^oil \(flask\)$|^lamp oil$/, "lamp-oil"], [/^essence of ether\b/, "essence-of-ether"], [/^(carrion )?crawler mucus\b/, "carrion-crawler-mucus"],
]
function coatSlugOf(item) {
  if (!item) return ""
  const slug = String(item.slug || "").toLowerCase()
  if (COATINGS[slug] || THROWN_VIALS[slug]) return slug
  const n = String(item.name || "").toLowerCase().trim()
  for (const [re, s] of COAT_NAME_TO_SLUG) if (re.test(n)) return s
  return ""
}

/** The coating this bag item is, or null. */
export function coatingOf(item) { return COATINGS[coatSlugOf(item)] || null }
/** The thrown vial this bag item is (oil, ether, mucus), or null. */
export function thrownVialOf(item) { return THROWN_VIALS[coatSlugOf(item)] || null }

/** What a launcher shoots: "bolts", "arrows", "needles", or null (a sling's bullets bludgeon: no injury poison). */
export function ammoWord(weaponName) {
  const n = String(weaponName || "").toLowerCase()
  if (/\b(bolts?|arrows?|needles?|bullets?)\b/.test(n)) return null   // the ammunition itself is not a launcher
  return /crossbow/.test(n) ? "bolts" : /bow/.test(n) ? "arrows" : /blowgun/.test(n) ? "needles" : null
}

/**
 * A fresh coat for a hero. `where` is "weapon" (a blade or point in the hand) or "ammo" (pieces of ammunition).
 * `pieces` overrides the count (the Scavenged Possessions' single poisoned bolt is 1).
 */
export function newCoat(coating, where, pieces) {
  const c = { ...coating, where }
  if (coating.wholeFight) c.uses = Infinity
  else if (where === "ammo") c.uses = pieces || COAT_RULES.ammoPerDose
  else c.uses = coating.dries ? Infinity : 1          // Basic Poison: every hit for its minute; an injury dose: the one wound
  if (coating.dries) c.rounds = COAT_RULES.basicDriesRounds
  return c
}

/**
 * Does this attack carry that coat? attack = {name, type, ammo, flask, rock, unarmed}
 * A weapon coat rides a weapon in the hand (swung or thrown) that pierces or slashes; an ammunition coat rides a shot
 * from a bow, crossbow or blowgun. The residue (anyDamage) rides any weapon or shot.
 */
export function coatFits(coat, attack) {
  if (!coat || !attack || attack.flask || attack.rock) return false
  const name = String(attack.name || ""), shot = !!attack.ammo || !!ammoWord(name) || /sling/i.test(name)
  if (/unarmed|fist|bite|claw/i.test(name) || attack.unarmed) return false
  if (coat.where === "ammo") { if (!shot) return false; return coat.anyDamage || !/sling/i.test(name) }
  if (shot) return false
  return coat.anyDamage || /piercing|slashing/.test(String(attack.type || ""))
}

/** Has a drying coat dried? `startRound` is the round it was first live in a fight. */
export function coatDried(coat, round) {
  return !!(coat && coat.rounds && coat.startRound != null && round - coat.startRound >= coat.rounds)
}

/** The short rule a coat adds to a hit, for the attack line and the item card: "+1d6 acid", "DC 10 Con or 1d4 poison". */
export function coatLine(coat) {
  if (!coat) return ""
  if (coat.kind === "bonus") return `+${coat.dice} ${coat.type}`
  if (coat.kind === "drow") return `DC ${coat.dc} Con or poisoned`
  return `DC ${coat.dc} Con or ${coat.dice} ${coat.type}${coat.half ? " (half on a save)" : ""}`
}

/** How long it lasts, in words. */
export function coatLasts(coat) {
  if (!coat) return ""
  if (coat.wholeFight) return "every hit until the fight ends"
  if (coat.where === "ammo") return `${coat.uses} ${coat.uses === 1 ? "shot" : "shots"}`
  return coat.rounds ? "every hit for a minute" : "the next hit"
}

/**
 * The damage a save-or-damage coat deals. rolled = the dice total, saved = the CON save succeeded.
 * Half on a save only where the poison says so; Basic Poison is all or nothing.
 */
export function coatSaveDamage(coat, rolled, saved) {
  if (!saved) return rolled
  return coat.half ? Math.floor(rolled / 2) : 0
}
