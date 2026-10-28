// ITEM LORE — what a hero can learn about a piece of loot, and how. The rule, pure, in one copy.
//
// Sam, 2026-10-27, on the loot hover card (canvas "Loot Hover Card Concepts", the Final artboard): "a high end
// version ... that removes the canon, has the buttons, and buttons that pop up (out of combat) if available with
// accompanying rolls that use the stats of the character". Then: "looks good implement it".
//
// So a card over a piece of loot offers CHECKS, and each one:
//   - appears only when the item has something for it to find (an Arcana check on a plain dagger finds nothing,
//     so it is never offered), and some only after an earlier success (the residue is tested once the reservoir is
//     found);
//   - is rolled by the hero holding the card: d20 + that hero's own bonus, from their sheet, against a DC;
//   - is rolled ONCE per hero per item. 5e has no free retries: a second try needs something new. Another hero
//     may try;
//   - on a success, adds lines to what the party knows about the item. Every line is built from the item's own
//     catalogue row (`items`), never written here: nothing is invented (AGENTS.md: "Never invent game data").
//
// A magic item is UNIDENTIFIED until someone studies it through a short rest while holding it (PHB, "Identifying
// a Magic Item": focus on it during a short rest while in physical contact). Until then the card shows what the
// eye can see: the name, the base damage, the weapon's properties, its weight. Its bonus, its description and
// its attunement stay hidden unless a check found them. A CURSE IS NEVER SHOWN, not by a check, not by study
// (the DMG's cursed items are hidden from identification; Lolth's Tooth is a beacon the party must not see).
//
// THE DCs. An item row may carry its own (`properties.arcana_dc`: Lolth's Tooth has 15, Sam's ruling). Every
// other DC here is a HOUSE NUMBER, Claude's, not Sam's: the DMG difficulty ladder (easy 10, medium 15, hard 20,
// very hard 25, nearly impossible 30) read against the item's rarity. The card says which is which.
//
// Plain JavaScript for the same reason as lib/gate-watch.mjs: build_walk.py pastes this file into the painted map
// at its ITEM_LORE placeholder (minus `export`), so the map and lib/item-lore.test.ts read the SAME rules. Every
// name here starts with LORE_ or lore so the paste cannot collide with the page's own names.

export const LORE_RARITIES = ["common", "uncommon", "rare", "very_rare", "legendary", "artifact"]

/** HOUSE (Claude's, pending Sam): the DMG difficulty ladder against rarity, and medium/easy for the rest. */
export const LORE_HOUSE_DC = {
  arcana: { common: 10, uncommon: 10, rare: 15, very_rare: 20, legendary: 25, artifact: 30 },
  examine: 15,
  residue: 15,
  ingredient: 10,
  deity: 10,
}

/** The tools the card knows, as the rows spell them in sheet_proficiencies.tools. */
export const LORE_TOOLS = {
  alchemist: "Alchemist's Supplies",
  poisoner: "Poisoner's Kit",
  herbalism: "Herbalism Kit",
}

const loreProps = (item) => (item && item.properties && typeof item.properties === "object" ? item.properties : {})
const loreNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

/** "Very Rare" / "very rare" / "very_rare" → "very_rare". Anything unknown is common. */
export function loreRarity(item) {
  const r = String((item && item.rarity) || "common").toLowerCase().trim().replace(/\s+/g, "_")
  return LORE_RARITIES.includes(r) ? r : "common"
}

/** Is it magic: rarer than common, or the row says it carries magic (a bonus, attunement, a curse). */
export function loreIsMagic(item) {
  if (!item) return false
  const p = loreProps(item)
  return loreRarity(item) !== "common" || p.magic === true || p.magical === true || loreNum(p.bonus) > 0 ||
    loreNum(p.attack_bonus) > 0 || loreNum(p.damage_bonus) > 0 || item.attunement === true || item.cursed === true
}

const loreEffects = (item) => (Array.isArray(item && item.alchemy_effects) ? item.alchemy_effects.filter((e) => typeof e === "string" && e.trim()) : [])
const loreReservoir = (item) => { const r = loreProps(item).reservoir; return r && typeof r === "object" ? r : null }

/**
 * The checks this item offers, in the order the card lists them. `known` is what the party already knows
 * ({f: {examine: true}}): a check whose `needs` is not yet known is left out. Each check:
 *   {key, label, skill?, tools?, dc, house}   house = true when the DC is Claude's house number
 */
export function loreChecks(item, known) {
  if (!item) return []
  const p = loreProps(item), f = (known && known.f) || {}, out = []
  const res = loreReservoir(item)
  if (res) out.push({ key: "examine", label: "Examine it closely", skill: "investigation", dc: LORE_HOUSE_DC.examine, house: true })
  if (typeof p.deity === "string" && p.deity.trim()) out.push({ key: "deity", label: "Read its marks", skill: "religion", dc: LORE_HOUSE_DC.deity, house: true })
  if (loreIsMagic(item)) {
    const own = loreNum(p.arcana_dc)
    out.push({ key: "arcana", label: "Sense its magic", skill: "arcana", dc: own || LORE_HOUSE_DC.arcana[loreRarity(item)], house: !own })
  }
  if (res && res.poison && f.examine) out.push({ key: "residue", label: "Test the residue", tools: ["alchemist", "poisoner"], dc: LORE_HOUSE_DC.residue, house: true })
  if (loreEffects(item).length) out.push({ key: "ingredient", label: "Work out its use", tools: ["alchemist", "herbalism"], skill: "nature", dc: LORE_HOUSE_DC.ingredient, house: true })
  return out
}

const loreCap = (s) => String(s).replace(/^./, (c) => c.toUpperCase())
const loreSlugWords = (s) => String(s).replace(/[-_]+/g, " ").trim()
const LORE_SAVES = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" }

/** The lines a success on `key` adds. Built from the row; [] when the row has nothing for that check. */
export function loreReveal(item, key) {
  const p = loreProps(item), res = loreReservoir(item)
  if (key === "deity") return typeof p.deity === "string" && p.deity.trim() ? [`It is consecrated to ${p.deity.trim()}.`] : []
  if (key === "examine") {
    if (!res) return []
    const n = loreNum(res.doses)
    return [n ? `A hidden reservoir in it holds ${n} ${n === 1 ? "dose" : "doses"}.` : "It has a hidden reservoir."]
  }
  if (key === "residue") {
    if (!res || !res.poison) return []
    const save = LORE_SAVES[String(res.save || "").toLowerCase().slice(0, 3)] || ""
    const lines = []
    if (res.dc && save && res.on_fail) lines.push(`Its venom: a DC ${loreNum(res.dc)} ${save} save, or ${String(res.on_fail).trim()}.`)
    else lines.push(`It carries ${loreSlugWords(res.poison)}.`)
    if (typeof res.damage === "string" && /^none/i.test(res.damage)) lines.push("It does no damage of its own.")
    return lines
  }
  if (key === "arcana") {
    if (!loreIsMagic(item)) return []
    const lines = ["It is magic."]
    const atk = loreNum(p.attack_bonus ?? p.bonus), dmg = loreNum(p.damage_bonus ?? p.bonus)
    if (atk && atk === dmg) lines.push(`+${atk} to attack and damage rolls.`)
    else { if (atk) lines.push(`+${atk} to attack rolls.`); if (dmg) lines.push(`+${dmg} to damage rolls.`) }
    if (item.attunement === true) lines.push("It needs attunement.")
    return lines
  }
  if (key === "ingredient") {
    const fx = loreEffects(item)
    return fx.length ? [`Used for: ${fx.map(loreSlugWords).join(", ")}.`] : []
  }
  return []
}

/**
 * What the card may show. `known` = {f: {key: true}, s: true when studied}. Returns
 *   {magic, identified, bonusKnown, facts: [lines], description}
 * identified: not magic, or studied. facts: every line the known checks reveal, plus on study all of them.
 * The curse is never in it.
 */
export function loreView(item, known) {
  const k = known || {}, f = k.f || {}, magic = loreIsMagic(item), identified = !magic || !!k.s
  const keys = ["examine", "deity", "arcana", "residue", "ingredient"]
  const facts = []
  for (const key of keys) if (identified && magic ? true : f[key]) for (const line of loreReveal(item, key)) if (!facts.includes(line)) facts.push(line)
  const desc = item && typeof item.description === "string" && item.description.trim() ? item.description.trim() : ""
  return { magic, identified, bonusKnown: identified || !!f.arcana, facts, description: identified ? desc : "" }
}

/**
 * The hero's bonus on a check, from their walk sheet: {mod, level} or null when they cannot make it (a tool
 * check with no tool and no skill to fall back on). level: "Expertise" | "Proficient" | "Tool" | "".
 * The sheet carries `lore` ({arcana: {mod, level}, ...}) and `tools` ({alchemist: mod | null, ...}).
 */
export function loreMod(sheet, check) {
  if (!sheet || !check) return null
  const tools = sheet.tools || {}
  if (check.tools) {
    const best = check.tools.map((t) => tools[t]).filter((m) => typeof m === "number").sort((a, b) => b - a)[0]
    if (typeof best === "number") return { mod: best, level: "Tool" }
    if (!check.skill) return null
  }
  const e = (sheet.lore || {})[check.skill]
  if (e && typeof e.mod === "number") return { mod: e.mod, level: e.level === "expertise" ? "Expertise" : e.level === "proficient" ? "Proficient" : "" }
  return null
}

/** One roll's verdict. `d` the d20 face, `mod` the bonus. */
export function loreRoll(d, mod, dc) {
  const total = d + mod
  return { d, mod, total, ok: total >= dc }
}

/** The average of a damage expression ("1d4+1" → 3.5, "2d6" → 7, "1" → 1). */
export function loreAvg(expr) {
  const s = String(expr || "").replace(/\s+/g, "")
  let total = 0, any = false
  for (const m of s.matchAll(/([+-]?)(\d+)(?:d(\d+))?/g)) {
    const sign = m[1] === "-" ? -1 : 1, n = Number(m[2])
    total += sign * (m[3] ? n * (Number(m[3]) + 1) / 2 : n); any = true
  }
  return any ? total : 0
}
