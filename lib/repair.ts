// Repair, Mend & Upgrade — what happens to a thing that is used.
//
// Decision of record: docs/claude_Repair_Mend_Upgrade.md (2026-10-01). Read it
// first; this file is the rules in that document and nothing the document does
// not say. Sam ruled §9 items 1–5 YES on 2026-10-01 — every one of them is
// marked at its rule below.
//
// Pure, like lib/camp and lib/game-context. Rows and rolls in, rows and words
// out. The route owns the database; this file owns the rule.
//
// THE DESIGN RULE THIS MODULE LIVES UNDER (doc §1, Sam 2026-10-01 ruling 2):
//   Degradation is event-driven. There is no per-swing durability counter.
//   `DEGRADE_CAUSES` below is a CLOSED list. Nothing outside it may move an
//   item down a rung, and this module never invents a cause.
//
// And from Layer 2B: the AI cannot invent items. Every upgrade consumes a
// catalog row and grants that row's own effect. There is no path here where a
// bonus is made up.
//
// SOURCES, so nothing here can be mistaken for an improvisation:
//   SRD 5.1        Mending (1 minute; a single break or tear no larger than
//                  1 foot in any dimension; "can physically repair a magic
//                  item … but can't restore magic to such an object").
//                  Objects (AC/HP) as the anchor for what `broken` means.
//   Two-Parts      Crafting Time table — already adopted by Sam 2026-09-27 and
//                  live in lib/camp as CRAFT_BY_RARITY / CRAFT_TOOL_ABILITIES.
//                  Repair reuses it rather than running a second economy.
//   Homebrew       The five rungs and their penalties, the materials
//                  fractions, the +3 on `broken`, the 7-long-rest neglect
//                  clock, free maintain, mastercraft, the slot caps, the
//                  rusted-weapon swap, and extending "magic stays dormant"
//                  from Mending to the forge. All five approved by Sam
//                  2026-10-01; each is labelled where it is implemented.

import { CRAFT_BY_RARITY, CRAFT_TOOL_ABILITIES, toolKey } from "./camp"
import type { Ability } from "./game-context"

// ---------------------------------------------------------------------------
// The ladder (doc §2 — Sam ruling 1: five rungs, `worn` carries no penalty)
// ---------------------------------------------------------------------------

export const CONDITIONS = ["pristine", "worn", "damaged", "broken", "destroyed"] as const
export type Condition = (typeof CONDITIONS)[number]

/** Rung number. Higher is worse. */
export function rung(c: Condition): number {
  return CONDITIONS.indexOf(c)
}

export function isCondition(v: unknown): v is Condition {
  return typeof v === "string" && (CONDITIONS as readonly string[]).includes(v)
}

/** The stored value, or `pristine` — which is what every item in play is today. */
export function conditionOf(row: { condition?: string | null } | null | undefined): Condition {
  const c = row?.condition
  return isCondition(c) ? c : "pristine"
}

export interface ConditionEffect {
  /** Added to attack rolls with this weapon. */
  attack: number
  /** Added to damage rolls with this weapon. */
  damage: number
  /** Added to the AC this armour or shield grants. */
  ac: number
  /** Checks made with this tool, instrument or focus are at disadvantage. */
  disadvantage: boolean
  /** The item cannot be used as itself at all. */
  unusable: boolean
  /** Multiplier on `items.value`. */
  valueMultiplier: number
  /** One line, for the sheet and for Malachar. */
  note: string
}

const WEAPONISH = new Set(["weapon", "ammunition"])
const ARMOURISH = new Set(["armor", "armour", "shield"])
const TOOLISH = new Set(["tool", "focus", "instrument"])

/**
 * What a rung does to an item. `worn` is deliberately empty of mechanics: it is
 * the warning light, not a tax (doc §2). The penalties at `damaged` are exactly
 * what the seven hand-written `rusted-*` catalog rows already say.
 */
export function conditionEffect(condition: Condition, itemType: string | null | undefined): ConditionEffect {
  const t = (itemType ?? "").trim().toLowerCase()
  const none: ConditionEffect = {
    attack: 0, damage: 0, ac: 0, disadvantage: false, unusable: false,
    valueMultiplier: 1, note: "",
  }
  switch (condition) {
    case "pristine":
      return none
    case "worn":
      return { ...none, valueMultiplier: 0.75, note: "Worn — no penalty yet. A few minutes of care would set it right." }
    case "damaged": {
      const e: ConditionEffect = { ...none, valueMultiplier: 0.5 }
      if (WEAPONISH.has(t)) { e.attack = -1; e.damage = -1; e.note = "Damaged — −1 to attack and damage rolls." }
      else if (ARMOURISH.has(t)) { e.ac = -1; e.note = "Damaged — −1 AC." }
      else if (TOOLISH.has(t)) { e.disadvantage = true; e.note = "Damaged — checks made with it are at disadvantage." }
      else { e.note = "Damaged." }
      return e
    }
    case "broken": {
      const e: ConditionEffect = { ...none, unusable: true, valueMultiplier: 0.1 }
      if (WEAPONISH.has(t)) e.note = "Broken — it can only be swung as an improvised weapon (1d4, no proficiency)."
      else if (ARMOURISH.has(t)) e.note = "Broken — it grants no AC; the wearer is 10 + Dex."
      else if (TOOLISH.has(t)) e.note = "Broken — it cannot be used at all."
      else e.note = "Broken."
      return e
    }
    case "destroyed":
      return { ...none, unusable: true, valueMultiplier: 0, note: "Destroyed — only the materials are left." }
  }
}

// ---------------------------------------------------------------------------
// Degradation (doc §3 — Sam ruling 2: this list is closed)
// ---------------------------------------------------------------------------

export const DEGRADE_CAUSES = ["nat1", "hazard", "sunder", "neglect", "captivity"] as const
export type DegradeCause = (typeof DEGRADE_CAUSES)[number]

export const DEGRADE_CAUSE_RULES: Record<DegradeCause, { rule: string; source: string }> = {
  nat1: {
    rule: "A natural 1 on an attack with a weapon that is already damaged, or whose catalog row carries breaks_on_nat_1.",
    source: "Generalises the live rusted-* rule (items.properties.rusted_rule)",
  },
  hazard: {
    rule: "A named monster or hazard effect says so — rust monster, ooze and acid, fire, the Darklake. The effect's own text carries it.",
    source: "Homebrew — Sam 2026-10-01",
  },
  sunder: {
    rule: "A deliberate sunder by an NPC. A Layer 1 directive, gravity-scored.",
    source: "Homebrew — Sam 2026-10-01",
  },
  neglect: {
    rule: "An equipped weapon or armour that goes 7 long rests with no maintain. Never past `damaged`.",
    source: "Homebrew — Sam 2026-10-01",
  },
  captivity: {
    rule: "Confiscation and captivity, DM-set and scripted (inventory_items.confiscated_from).",
    source: "Homebrew — Sam 2026-10-01",
  },
}

export function isDegradeCause(v: unknown): v is DegradeCause {
  return typeof v === "string" && (DEGRADE_CAUSES as readonly string[]).includes(v)
}

export interface DegradeOutcome {
  ok: boolean
  from: Condition
  to: Condition
  cause: DegradeCause | null
  /** Why nothing happened. Null when it did. */
  reason: string | null
  note: string
}

/**
 * One rung down, for a cause on the closed list. Neglect stops at `damaged`
 * (doc §3.4): a blade left dull gets dull, it does not shatter in the scabbard.
 */
export function degrade(
  item: { name: string; item_type?: string | null },
  from: Condition,
  cause: DegradeCause,
): DegradeOutcome {
  const base = { from, to: from, cause, note: "" }
  if (!isDegradeCause(cause)) {
    return { ...base, ok: false, cause: null, reason: `"${cause}" is not a cause on the closed list; nothing degrades an item off-list.` }
  }
  if (from === "destroyed") {
    return { ...base, ok: false, reason: `${item.name} is already destroyed.` }
  }
  if (cause === "neglect" && rung(from) >= rung("damaged")) {
    return { ...base, ok: false, reason: `Neglect never takes ${item.name} past damaged — it is already there.` }
  }
  const to = CONDITIONS[Math.min(rung(from) + 1, rung("destroyed"))]
  return {
    ...base, ok: true, to, reason: null,
    note: `${item.name}: ${from} → ${to}. ${conditionEffect(to, item.item_type).note}`.trim(),
  }
}

/** Does this weapon's natural 1 break it? The live catalog flag, plus the rung. */
export function breaksOnNat1(
  item: { properties?: { breaks_on_nat_1?: unknown } | null },
  condition: Condition,
): boolean {
  const flagged = item.properties?.breaks_on_nat_1 === true
  return flagged || rung(condition) >= rung("damaged")
}

// ---------------------------------------------------------------------------
// Maintain — free, every long rest (doc §4)
// ---------------------------------------------------------------------------

export const NEGLECT_LONG_RESTS = 7

/**
 * Is the neglect slide due? Only for equipped weapons and armour, only up to
 * `damaged`, and never for a mastercraft item — that is mastercraft's whole
 * benefit (doc §5.3, Sam ruling 4).
 */
export function neglectDue(input: {
  longRestsSinceMaintained: number | null | undefined
  condition: Condition
  equipped: boolean
  mastercraft?: boolean
}): boolean {
  if (!input.equipped) return false
  if (input.mastercraft) return false
  if (rung(input.condition) >= rung("damaged")) return false
  return Math.max(0, Math.trunc(input.longRestsSinceMaintained ?? 0)) >= NEGLECT_LONG_RESTS
}

export interface MaintainOutcome {
  ok: boolean
  from: Condition
  to: Condition
  /** Why it did nothing. Null when it worked. */
  reason: string | null
  /** Maintain always resets the neglect clock, even when the rung does not move. */
  clockReset: boolean
  note: string
}

/**
 * Five minutes at the whetstone. No roll, no materials, no camp action — this
 * is what the `sharpen` camp animation already does (claude_Camp_Scene.md §4).
 * Once per character per long rest; the route enforces the once.
 */
export function maintain(
  item: { name: string; item_type?: string | null },
  condition: Condition,
  holder: { name: string; tools?: string[] | null },
  tool: string | null,
): MaintainOutcome {
  const base = { from: condition, to: condition, clockReset: false, note: "" }
  if (rung(condition) >= rung("damaged")) {
    return {
      ...base, ok: false,
      reason: `${item.name} is ${condition} — past what care alone can fix. It needs a repair.`,
    }
  }
  if (condition === "worn") {
    if (!tool) return { ...base, ok: false, reason: `${holder.name} has no tool in hand for ${item.name}.` }
    if (!hasTool(holder.tools, tool)) {
      return { ...base, ok: false, reason: `${holder.name} is not proficient with ${tool}.` }
    }
    return {
      ok: true, from: condition, to: "pristine", reason: null, clockReset: true,
      note: `${holder.name} works over ${item.name} and it comes up clean.`,
    }
  }
  return {
    ok: true, from: condition, to: "pristine", reason: null, clockReset: true,
    note: `${holder.name} keeps ${item.name} in good order.`,
  }
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

/** Proficiency with a named tool, matched the way lib/camp matches them. */
export function hasTool(tools: string[] | null | undefined, tool: string): boolean {
  const want = toolKey(tool)
  return (tools ?? []).some((t) => toolKey(t) === want)
}

// ---------------------------------------------------------------------------
// Mend — the cantrip (doc §4, SRD 5.1)
// ---------------------------------------------------------------------------

export const MEND_MAX_WEIGHT_LB = 5
export const MEND_ITEM_TYPES = new Set(["accessory", "tool", "focus", "gear"])

export interface MendOutcome {
  ok: boolean
  from: Condition
  to: Condition
  reason: string | null
  flags: string[]
  note: string
}

/**
 * SRD: one break or tear no larger than a foot, and it cannot restore magic.
 * So Mending lifts `broken → damaged` only where a one-foot break is the whole
 * injury — never a suit of armour, never `destroyed`, never the enchantment.
 * One casting per break: it cannot be spammed up the ladder.
 */
export function canMend(
  item: { name: string; item_type?: string | null; weight?: number | null; properties?: { magic?: unknown } | null },
  condition: Condition,
): MendOutcome {
  const flags: string[] = []
  const base = { from: condition, to: condition, flags, note: "" }
  if (condition !== "broken") {
    return {
      ...base, ok: false,
      reason: condition === "destroyed"
        ? `${item.name} is destroyed — Mending repairs a break, not an absence.`
        : `Mending only closes a break. ${item.name} is ${condition}.`,
    }
  }
  const t = (item.item_type ?? "").trim().toLowerCase()
  if (ARMOURISH.has(t)) {
    return { ...base, ok: false, reason: `A suit of armour is not a one-foot tear. ${item.name} needs a repair at the forge.` }
  }
  const weight = item.weight == null ? null : Number(item.weight)
  const smallEnough = (weight != null && weight <= MEND_MAX_WEIGHT_LB) || MEND_ITEM_TYPES.has(t)
  if (!smallEnough) {
    return {
      ...base, ok: false,
      reason: `${item.name} is too large for a single break no bigger than a foot (SRD 5.1, Mending).`,
    }
  }
  if (weight == null) flags.push("No weight on the catalog row; judged by item_type alone.")
  flags.push("Mending restores the body, never the magic (SRD 5.1, Mending).")
  return {
    ok: true, from: "broken", to: "damaged", reason: null, flags,
    note: `The break in ${item.name} closes. It works again, poorly.`,
  }
}

// ---------------------------------------------------------------------------
// Repair — one camp action, the existing hour-check loop (doc §4)
// ---------------------------------------------------------------------------

/** Per rung climbed. Repair climbs exactly one rung per completed project. */
export const REPAIR_STEP = {
  damaged: { to: "worn" as Condition, materialsFraction: 0.25, dcBonus: 0, hoursFraction: 0.5 },
  broken: { to: "damaged" as Condition, materialsFraction: 0.5, dcBonus: 3, hoursFraction: 1 },
} as const

export type RepairableFrom = keyof typeof REPAIR_STEP

export function isRepairableFrom(c: Condition): c is RepairableFrom {
  return c === "damaged" || c === "broken"
}

/** The convention on `items.properties.repair`, mirroring `craft` exactly. */
export interface RepairRecipe {
  tools?: string | null
  requires?: string | null
  materials?: { slug: string; qty: number }[] | null
  dc?: number | null
  hours?: number | null
  cost_gp?: number | null
  source?: string | null
}

export interface RepairSpec {
  from: Condition
  to: Condition
  dc: number
  hours: number
  /** Successful checks to finish: one per hour, as crafting. */
  checks: number
  abilities: [Ability, Ability]
  tool: string
  requires: string | null
  materialsGp: number
  flags: string[]
}

export function repairRecipe(item: { properties?: { repair?: RepairRecipe | null } | null }): RepairRecipe {
  return item.properties?.repair ?? {}
}

/**
 * Which tool repairs this. Where the catalog says, the catalog wins. Where it
 * does not, infer ONLY where it is unambiguous and flag it; an armour row
 * carries no material, so padded, leather and plate are indistinguishable here
 * and the answer is a reason, not a guess (the house rule: a missing rule
 * returns a flag, never an improvisation).
 */
export function repairToolFor(
  item: { item_type?: string | null; properties?: { repair?: RepairRecipe | null } | null },
): { tool: string | null; reason: string | null; flags: string[] } {
  const named = repairRecipe(item).tools
  if (named) return { tool: named, reason: null, flags: [] }
  const t = (item.item_type ?? "").trim().toLowerCase()
  if (WEAPONISH.has(t)) {
    return {
      tool: "Smith's Tools", reason: null,
      flags: ["No properties.repair.tools on the catalog row; a weapon is assumed metal and repaired with Smith's Tools."],
    }
  }
  return {
    tool: null,
    reason: `No tool is listed for ${item.item_type ?? "this item"}. Add properties.repair.tools to the catalog row — the material cannot be read off it.`,
    flags: [],
  }
}

/** The materials: the recipe's printed cost, or the rung's fraction of market value. */
export function repairMaterialsGp(value: number | null | undefined, from: RepairableFrom, recipe: RepairRecipe = {}): number {
  if (recipe.cost_gp != null) return Math.max(0, Number(recipe.cost_gp))
  const v = Math.max(0, Number(value ?? 0))
  return Math.round(v * REPAIR_STEP[from].materialsFraction)
}

/**
 * What repairing this item one rung takes, or null with the reason. DC and
 * hours come from CRAFT_BY_RARITY — the same table crafting rolls against.
 */
export function repairSpec(
  item: { name: string; rarity?: string | null; item_type?: string | null; value?: number | null; properties?: { repair?: RepairRecipe | null } | null },
  from: Condition,
  opts: { tool?: string | null; facilities?: string[] | null } = {},
): { spec: RepairSpec | null; reason: string | null } {
  if (!isRepairableFrom(from)) {
    return {
      spec: null,
      reason: from === "destroyed"
        ? `${item.name} is destroyed. Only salvage is left.`
        : from === "worn"
          ? `${item.name} is only worn — that is maintenance, not a repair, and it costs nothing.`
          : `${item.name} is pristine.`,
    }
  }
  const flags: string[] = []
  const recipe = repairRecipe(item)

  const picked = opts.tool ?? repairToolFor(item).tool
  const inferred = repairToolFor(item)
  flags.push(...inferred.flags)
  if (!picked) return { spec: null, reason: inferred.reason }

  const abilities = CRAFT_TOOL_ABILITIES[toolKey(picked)]
  if (!abilities) return { spec: null, reason: `No crafting abilities are listed for ${picked}.` }

  const rarity = (item.rarity ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_")
  let row = CRAFT_BY_RARITY[rarity]
  if (!row) {
    row = CRAFT_BY_RARITY.common
    flags.push(`No rarity on the catalog row; repaired as common (DC ${row.dc}).`)
  }

  const step = REPAIR_STEP[from]
  const dc = Math.max(1, Math.trunc(recipe.dc ?? row.dc + step.dcBonus))
  const hours = Math.max(1, Math.ceil(Number(recipe.hours ?? row.hours * step.hoursFraction)))

  const requires = recipe.requires ?? null
  if (requires && !(opts.facilities ?? []).some((f) => norm(f) === norm(requires))) {
    return { spec: null, reason: `${item.name} needs a ${requires} and there is none here.` }
  }

  if (isMagic(item)) {
    flags.push("Mundane repair restores the body, never the enchantment — the magic stays dormant until an arcane step wakes it (Sam, 2026-10-01).")
  }

  return {
    spec: {
      from, to: step.to, dc, hours, checks: hours, abilities, tool: picked, requires,
      materialsGp: repairMaterialsGp(item.value, from, recipe), flags,
    },
    reason: null,
  }
}

function isMagic(item: { rarity?: string | null; properties?: Record<string, unknown> | null }): boolean {
  const r = (item.rarity ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_")
  return r !== "" && r !== "common"
}

/**
 * The whole climb, for the UI's "what will this cost me" line. Broken →
 * pristine lands at 75% of market value on its own: nobody repairs a 15 gp
 * longsword, everybody repairs the magic one.
 */
export function repairToPristineGp(value: number | null | undefined, from: Condition): number {
  let total = 0
  let c = from
  while (isRepairableFrom(c)) {
    total += repairMaterialsGp(value, c)
    c = REPAIR_STEP[c].to
  }
  return total
}

// ---------------------------------------------------------------------------
// The rusted weapons (doc §2 — Sam ruling 5)
// ---------------------------------------------------------------------------

/**
 * Repairing a rusted weapon past `damaged` swaps the instance to the clean
 * catalog row: `rusted-longsword` → `longsword`. Catalog-validated, nothing
 * invented, and the drow's cast-off junk becomes a real sword by someone's
 * labour. Returns null when the slug is not a rusted row.
 */
export function cleanSlugFor(slug: string | null | undefined): string | null {
  const s = (slug ?? "").trim().toLowerCase()
  return s.startsWith("rusted-") && s.length > "rusted-".length ? s.slice("rusted-".length) : null
}

/** The condition a fresh instance of this catalog row starts at. */
export function startingCondition(item: { slug?: string | null; properties?: { rusted?: unknown } | null }): Condition {
  if (item.properties?.rusted === true || cleanSlugFor(item.slug)) return "damaged"
  return "pristine"
}

// ---------------------------------------------------------------------------
// Upgrade (doc §5)
// ---------------------------------------------------------------------------

export const UPGRADE_KINDS = ["fitting", "rune", "mastercraft"] as const
export type UpgradeKind = (typeof UPGRADE_KINDS)[number]

/** Slots by rarity. A weapon cannot become a Christmas tree. */
export function upgradeSlots(rarity: string | null | undefined): number {
  const r = (rarity ?? "common").trim().toLowerCase().replace(/[\s-]+/g, "_")
  if (r === "very_rare" || r === "legendary" || r === "artifact") return 3
  if (r === "uncommon" || r === "rare") return 2
  return 1
}

export interface UpgradeRow {
  slug: string
  kind: UpgradeKind
  /** The granting catalog row's own effect text. Never composed here. */
  effect: string
  applied_at?: string
  by?: string | null
}

export const MASTERCRAFT_HISTORY_REQUIRED = 3
export const MASTERCRAFT_DC_BONUS = 5

export interface UpgradeOutcome {
  ok: boolean
  kind: UpgradeKind | null
  reason: string | null
  dc: number | null
  slotsUsed: number
  slotsTotal: number
  flags: string[]
  note: string
}

/**
 * Can this upgrade go on? The material must be a catalog row carrying the
 * property that makes it one — `fitting` or `rune_material`. An item with
 * neither is not an upgrade, and this module will not make it one.
 */
export function planUpgrade(input: {
  item: { name: string; rarity?: string | null; condition?: Condition }
  upgrades: UpgradeRow[]
  kind: UpgradeKind
  material?: { slug: string; name: string; properties?: Record<string, unknown> | null } | null
  /** Logged repair + maintain events by this character on this instance. */
  history?: number
  facilities?: string[] | null
}): UpgradeOutcome {
  const slotsTotal = upgradeSlots(input.item.rarity)
  const slotsUsed = input.upgrades.length
  const flags: string[] = []
  const base = { kind: input.kind, dc: null as number | null, slotsUsed, slotsTotal, flags, note: "" }

  const condition = input.item.condition ?? "pristine"
  if (rung(condition) >= rung("damaged")) {
    return { ...base, ok: false, reason: `${input.item.name} is ${condition}. Repair it before improving it.` }
  }
  if (slotsUsed >= slotsTotal) {
    return { ...base, ok: false, reason: `${input.item.name} already carries ${slotsUsed} of ${slotsTotal} upgrades.` }
  }

  const rarityRow = CRAFT_BY_RARITY[(input.item.rarity ?? "common").trim().toLowerCase().replace(/[\s-]+/g, "_")] ?? CRAFT_BY_RARITY.common

  if (input.kind === "mastercraft") {
    const history = Math.max(0, Math.trunc(input.history ?? 0))
    if (history < MASTERCRAFT_HISTORY_REQUIRED) {
      return {
        ...base, ok: false,
        reason: `Mastercraft is earned: ${history} of ${MASTERCRAFT_HISTORY_REQUIRED} logged repairs or maintains by the same hand.`,
      }
    }
    return {
      ...base, ok: true, reason: null, dc: rarityRow.dc + MASTERCRAFT_DC_BONUS,
      note: `${input.item.name} can be made mastercraft: it stops degrading from neglect, gains value, and earns a name. Not a combat bonus (Sam, 2026-10-01).`,
    }
  }

  const material = input.material
  if (!material) return { ...base, ok: false, reason: `A ${input.kind} needs a material from the catalog.` }
  const key = input.kind === "rune" ? "rune_material" : "fitting"
  const effect = material.properties?.[key]
  if (effect == null) {
    return {
      ...base, ok: false,
      reason: `${material.name} carries no properties.${key}, so it is not a ${input.kind}. The engine will not invent one.`,
    }
  }
  return {
    ...base, ok: true, reason: null, dc: rarityRow.dc + 3,
    note: `${material.name} can be worked into ${input.item.name}: ${String(effect)}`,
  }
}

// ---------------------------------------------------------------------------
// Salvage (doc §6)
// ---------------------------------------------------------------------------

export const SALVAGE_SCRAP_FRACTION = 0.1

export interface SalvageOutcome {
  ok: boolean
  reason: string | null
  materials: { slug: string; qty: number }[]
  scrapGp: number
  note: string
}

/**
 * A destroyed item is not deleted. It yields its materials back, and the
 * item_events row survives it: the sword is gone, the fact that it broke in
 * the slave pens is permanent.
 */
export function salvage(
  item: { name: string; value?: number | null; properties?: { craft?: { materials?: { slug: string; qty: number }[] } | null; repair?: RepairRecipe | null } | null },
  condition: Condition,
): SalvageOutcome {
  if (condition !== "destroyed") {
    return { ok: false, reason: `${item.name} is ${condition}, not destroyed — repair it instead of stripping it.`, materials: [], scrapGp: 0, note: "" }
  }
  const materials = item.properties?.craft?.materials ?? item.properties?.repair?.materials ?? []
  const scrapGp = materials.length ? 0 : Math.round(Math.max(0, Number(item.value ?? 0)) * SALVAGE_SCRAP_FRACTION)
  return {
    ok: true, reason: null, materials: materials.map((m) => ({ ...m })), scrapGp,
    note: materials.length
      ? `What is left of ${item.name} comes apart into its materials.`
      : `What is left of ${item.name} is worth ${scrapGp} gp as scrap.`,
  }
}

// ---------------------------------------------------------------------------
// Banked progress (doc §4 — one rung per project)
// ---------------------------------------------------------------------------

/**
 * Successful repair checks banked against the CURRENT rung: everything since
 * the most recent event that actually moved the condition. A finished repair
 * therefore starts the next rung's project at zero, which is what "one rung
 * per project" means.
 */
export function bankedSuccesses(
  history: { kind: string; detail: unknown; to_condition?: string | null }[],
): { successes: number; attempts: number } {
  let successes = 0
  let attempts = 0
  for (const e of history) {
    // history is newest-first; stop at the last event that moved the rung.
    if (e.kind !== "repair") break
    const d = (e.detail ?? {}) as { success?: unknown; done?: unknown }
    if (d.done === true) break
    attempts += 1
    if (d.success === true) successes += 1
  }
  return { successes, attempts }
}
