// lib/alchemy.ts — the Alchemy logic engine (Layer 1, pure).
//
// Rules are 5E as written. Three sources, each named on the row that uses it:
//   SRD 5.1  — Crafting (5 gp of progress per day, materials = half value, tool
//              proficiency required); Herbalism Kit ("required to create antitoxin
//              and potions of healing"); item prices.
//   XGE      — Xanathar's Guide to Everything. Alchemist's Supplies, "Alchemical
//              Crafting" (p.79): raw materials bought by the gp, 1 lb per 50 gp;
//              as part of a LONG REST make ONE dose of acid, alchemist's fire,
//              antitoxin, oil, perfume or soap, subtracting half its value from
//              the raw materials carried; no check is required by the rule (the DM
//              may allow one, with advantage). "Brewing Potions of Healing"
//              (p.130): herbalism kit; common 25 gp / 1 day, greater 100 gp /
//              1 workweek, superior 1,000 gp / 3 workweeks, supreme 10,000 gp /
//              4 workweeks. A workweek is 5 days (p.123).
//   DMG p.258 — Crafting and Harvesting Poison: poisons are crafted with the
//              downtime crafting rules and need poisoner's kit proficiency;
//              harvesting from a creature is a DC 20 Nature (or poisoner's kit)
//              check, and failing by 5 or more exposes the harvester.
// XGE and the DMG are NOT in `campaign_chunks`; those passages are quoted from the
// books and every function that relies on one says so in `flags`.
//
// What the engine invents: nothing. Where a rule is silent it refuses with a
// reason or returns a flag for the DM. The only house rule is HOUSE_RULES below,
// off by default, and it is Sam's to switch on.
//
// Reagents — Sam's ruling, 2026-09-27: EACH RECIPE NAMES ITS REAGENTS, and having
// them is enough. No gold changes hands; exactly those reagents are consumed.
// (In 5e these fungi are food worth copper, and items.value is whole gp, so a
// price bridge would have read 0 anyway.) The lists below are Claude's, for Sam
// to adjust — every slug is a catalog row. A recipe with NO list falls back to
// XGE as written: raw materials bought with coin, half the item's value.

export type AlchemyTool = "Alchemist's Supplies" | "Herbalism Kit" | "Poisoner's Kit"
export type AlchemyKind = "potion" | "poison" | "utility"
export type AlchemyMethod = "long_rest" | "downtime"

export interface AlchemyRecipe {
  /** Catalog slug of the product. */
  out: string
  name: string
  kind: AlchemyKind
  /** Any one of these proficiencies qualifies. */
  tools: AlchemyTool[]
  /** long_rest = XGE one-dose-per-rest; downtime = SRD 5 gp/day (or an XGE fixed time). */
  method: AlchemyMethod
  /** Market value, gp (SRD/XGE). Materials cost is half. */
  value: number
  /** Days of work when the method is downtime and the book fixes the time (XGE healing table). */
  days?: number
  /** The reagents this recipe consumes (Sam's ruling: having them is enough). Omit to use XGE coin instead. */
  reagents?: { slug: string; qty: number }[]
  /** Which book the row comes from. */
  source: string
  /** Whether the party can attempt it before the recipe is "learned" — a UI lock, not a rule; DM's call. */
  locked?: boolean
}

export const WORKWEEK_DAYS = 5 // XGE p.123
export const RAW_MATERIAL_LB_PER_GP = 1 / 50 // XGE p.79
export const MATERIALS_FRACTION = 0.5 // SRD Crafting; XGE Alchemical Crafting
export const CRAFT_GP_PER_DAY = 5 // SRD Crafting
export const HARVEST_POISON_DC = 20 // DMG p.258
export const HARVEST_POISON_EXPOSED_MARGIN = 5 // DMG p.258

/** House rules — all OFF. Sam switches them on; the engine never assumes. */
export const HOUSE_RULES = {
  /** XGE long-rest brewing has no check. If Sam wants a roll, this adds a tool check at `brewDc`. */
  brewCheck: false,
  brewDc: 10,
}

/** XGE p.79 — the six things alchemist's supplies make as part of a long rest. */
export const XGE_LONG_REST_ITEMS = ["acid-vial", "alchemists-fire", "antitoxin", "lamp-oil", "perfume", "soap"] as const

export const RECIPES: AlchemyRecipe[] = [
  // Potions — XGE p.130 Brewing Potions of Healing (herbalism kit; SRD says the kit is required).
  { out: "potion-of-healing", name: "Potion of Healing", kind: "potion", tools: ["Herbalism Kit"], method: "downtime", value: 25, days: 1, source: "XGE p.130; SRD Herbalism Kit", reagents: [{ slug: "waterorb", qty: 1 }, { slug: "ormu-moss", qty: 2 }, { slug: "nightlight-fungus", qty: 1 }, { slug: "fire-lichen", qty: 1 }] },
  { out: "potion-of-greater-healing", name: "Potion of Greater Healing", kind: "potion", tools: ["Herbalism Kit"], method: "downtime", value: 100, days: WORKWEEK_DAYS, source: "XGE p.130", locked: true, reagents: [{ slug: "waterorb", qty: 1 }, { slug: "ormu-moss", qty: 3 }, { slug: "nightlight-fungus", qty: 2 }, { slug: "fire-lichen", qty: 2 }] },
  { out: "potion-of-superior-healing", name: "Potion of Superior Healing", kind: "potion", tools: ["Herbalism Kit"], method: "downtime", value: 1000, days: 3 * WORKWEEK_DAYS, source: "XGE p.130", locked: true },
  { out: "potion-of-supreme-healing", name: "Potion of Supreme Healing", kind: "potion", tools: ["Herbalism Kit"], method: "downtime", value: 10000, days: 4 * WORKWEEK_DAYS, source: "XGE p.130", locked: true },
  // Utility / consumables — XGE p.79 long-rest brewing with alchemist's supplies. Antitoxin also via herbalism kit (SRD).
  { out: "antitoxin", name: "Antitoxin (vial)", kind: "utility", tools: ["Alchemist's Supplies", "Herbalism Kit"], method: "long_rest", value: 50, source: "XGE p.79; SRD Herbalism Kit", reagents: [{ slug: "waterorb", qty: 1 }, { slug: "ripplebark", qty: 1 }, { slug: "ormu-moss", qty: 1 }] },
  { out: "acid-vial", name: "Acid (vial)", kind: "utility", tools: ["Alchemist's Supplies"], method: "long_rest", value: 25, source: "XGE p.79", reagents: [{ slug: "gray-ooze-residue", qty: 1 }, { slug: "waterorb", qty: 1 }] },
  { out: "alchemists-fire", name: "Alchemist's Fire (flask)", kind: "utility", tools: ["Alchemist's Supplies"], method: "long_rest", value: 50, source: "XGE p.79", reagents: [{ slug: "fire-lichen", qty: 2 }, { slug: "lamp-oil", qty: 1 }] },
  { out: "lamp-oil", name: "Oil (flask)", kind: "utility", tools: ["Alchemist's Supplies"], method: "long_rest", value: 0.1, source: "XGE p.79; SRD price 1 sp" },
  { out: "perfume", name: "Perfume (vial)", kind: "utility", tools: ["Alchemist's Supplies"], method: "long_rest", value: 5, source: "XGE p.79; SRD price 5 gp" },
  { out: "soap", name: "Soap", kind: "utility", tools: ["Alchemist's Supplies"], method: "long_rest", value: 0.02, source: "XGE p.79; SRD price 2 cp" },
  // Poisons — DMG p.258: downtime crafting, poisoner's kit required. Prices DMG p.257 (basic poison SRD 100 gp).
  { out: "basic-poison-vial", name: "Basic Poison (vial)", kind: "poison", tools: ["Poisoner's Kit"], method: "downtime", value: 100, source: "DMG p.258; SRD price 100 gp", reagents: [{ slug: "spider-venom-gland", qty: 1 }, { slug: "waterorb", qty: 1 }] },
  { out: "drow-poison", name: "Drow Poison", kind: "poison", tools: ["Poisoner's Kit"], method: "downtime", value: 200, source: "DMG p.258; DMG p.257 price", locked: true, reagents: [{ slug: "spider-venom-gland", qty: 2 }, { slug: "timmask", qty: 1 }] },
  { out: "serpent-venom", name: "Serpent Venom", kind: "poison", tools: ["Poisoner's Kit"], method: "downtime", value: 200, source: "DMG p.258; DMG p.257 price", locked: true },
  { out: "truth-serum", name: "Truth Serum", kind: "poison", tools: ["Poisoner's Kit"], method: "downtime", value: 150, source: "DMG p.258; DMG p.257 price", locked: true, reagents: [{ slug: "tongue-of-madness", qty: 2 }, { slug: "waterorb", qty: 1 }] },
]

export interface Brewer {
  name: string
  /** Tool proficiencies from the sheet (`sheet_proficiencies.tools`). */
  tools: string[]
  /** Proficiency bonus, only used when HOUSE_RULES.brewCheck is on. */
  proficiencyBonus?: number
  /** Which tools they physically have with them. Undefined = assume they carry what they are proficient with. */
  carrying?: string[]
}

export interface ReagentRow {
  slug: string
  qty: number
  /** Catalog value per unit, gp. Counts toward XGE raw-material gp (PROPOSED bridge). */
  value: number
}

export interface BrewContext {
  /** Is this brew happening as part of a long rest? XGE one-dose items need it. */
  longRest: boolean
  /** Has this brewer already made their XGE dose this rest? */
  doseUsedThisRest?: boolean
  /** Coin set aside for raw materials (XGE) — only used by recipes that name no reagents. */
  rawMaterialsGp?: number
  /** OotA-Enc ch.2: improvising tools doubles crafting time. */
  improvisedTools?: boolean
}

export interface BrewCheck {
  ok: boolean
  reason: string | null
  /** Materials cost in gp (half value). */
  materialsGp: number
  /** gp of raw materials available (coin); 0 is fine when the recipe names its reagents. */
  availableGp: number
  /** Time it takes, in days; 0 = "as part of this long rest". */
  days: number
  /** The ability/tool check the rule calls for, if any. XGE long-rest brewing: none. */
  check: { dc: number; tool: string; rule: string } | null
  flags: string[]
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[’']/g, "'")

export function recipeFor(slug: string): AlchemyRecipe | null {
  return RECIPES.find((r) => r.out === slug) ?? null
}

export function materialsGp(r: AlchemyRecipe): number {
  return roundGp(r.value * MATERIALS_FRACTION)
}

export function reagentGp(pack: ReagentRow[]): number {
  return roundGp(pack.reduce((n, p) => n + Math.max(0, p.qty) * Math.max(0, p.value), 0))
}

function roundGp(n: number): number {
  return Math.round(n * 100) / 100
}

function hasTool(b: Brewer, tools: AlchemyTool[]): AlchemyTool | null {
  const prof = (b.tools ?? []).map(norm)
  const carry = b.carrying ? b.carrying.map(norm) : null
  for (const t of tools) {
    if (!prof.includes(norm(t))) continue
    if (carry && !carry.includes(norm(t))) continue
    return t
  }
  return null
}

/** Can this brewer make this recipe now? Never rolls; says why not. */
export function canBrew(r: AlchemyRecipe, b: Brewer, pack: ReagentRow[], ctx: BrewContext): BrewCheck {
  const flags: string[] = []
  const cost = materialsGp(r)
  const available = roundGp(Math.max(0, ctx.rawMaterialsGp ?? 0))
  const named = (r.reagents?.length ?? 0) > 0
  const base = (reason: string | null, ok: boolean, days: number): BrewCheck => ({
    ok, reason, materialsGp: cost, availableGp: available, days, check: null, flags,
  })
  if (r.source.includes("XGE") || r.source.includes("DMG")) flags.push(`source ${r.source} — quoted from the book, not in campaign_chunks`)

  const tool = hasTool(b, r.tools)
  if (!tool) {
    const need = r.tools.join(" or ")
    const profOnly = r.tools.find((t) => (b.tools ?? []).map(norm).includes(norm(t)))
    return base(profOnly ? `${b.name} is proficient with ${profOnly} but is not carrying it.` : `${b.name} is not proficient with ${need}.`, false, 0)
  }

  for (const m of r.reagents ?? []) {
    const have = pack.filter((p) => p.slug === m.slug).reduce((n, p) => n + Math.max(0, p.qty), 0)
    if (have < m.qty) return base(`short of ${m.slug} — ${have}/${m.qty}.`, false, 0)
  }

  // Named reagents ARE the materials (Sam's ruling). Only an unlisted recipe costs coin (XGE).
  if (!named && available < cost) return base(`no reagent list for ${r.name}, so it takes ${cost} gp of raw materials in coin (half of ${r.value} gp, XGE); ${available} gp set aside.`, false, 0)
  if (!named) flags.push("no reagent list — raw materials bought with coin (XGE as written)")

  let days: number
  if (r.method === "long_rest") {
    if (!ctx.longRest) return base(`${r.name} is brewed as part of a long rest (XGE p.79); the party is not resting.`, false, 0)
    if (ctx.doseUsedThisRest) return base(`${b.name} has already made their one dose this rest (XGE p.79: one dose per long rest).`, false, 0)
    days = 0
  } else {
    days = r.days ?? Math.ceil(r.value / CRAFT_GP_PER_DAY)
    if (r.days === undefined) flags.push(`no fixed time in the book — SRD Crafting pace, ${CRAFT_GP_PER_DAY} gp/day`)
  }
  if (ctx.improvisedTools && days > 0) {
    days *= 2
    flags.push("improvised tools double the crafting time (OotA-Enc ch.2)")
  }

  const out = base(null, true, days)
  if (HOUSE_RULES.brewCheck) {
    out.check = { dc: HOUSE_RULES.brewDc, tool, rule: "HOUSE RULE (off by default): tool check to brew" }
    flags.push("house-rule brew check is on")
  } else {
    flags.push(r.method === "long_rest" ? "no check — XGE p.79 makes the dose automatically; the DM may allow one with advantage" : "no check — downtime crafting succeeds with time and materials (SRD)")
  }
  return out
}

export interface BrewResult extends BrewCheck {
  /** Reagents consumed, cheapest first, until the materials cost is met. */
  spent: ReagentRow[]
  /** Loose raw-material gp consumed after reagents. */
  spentGp: number
  /** Pack after spending. */
  pack: ReagentRow[]
  /** Product added on success. */
  produced: { slug: string; qty: number } | null
  /** The house-rule roll, if one was made. */
  roll: { d20: number; bonus: number; total: number; success: boolean } | null
  note: string
}

export type Rng = () => number

/**
 * Spend the materials and make the thing. Pure: returns the new pack; the route
 * writes it. The rng is only consulted when HOUSE_RULES.brewCheck is on, so the
 * route can pass the dice roller's physical result.
 */
export function brew(r: AlchemyRecipe, b: Brewer, pack: ReagentRow[], ctx: BrewContext, rng: Rng = Math.random): BrewResult {
  const check = canBrew(r, b, pack, ctx)
  const fail = (note: string): BrewResult => ({ ...check, spent: [], spentGp: 0, pack, produced: null, roll: null, note })
  if (!check.ok) return fail(`${r.name}: ${check.reason}`)

  // Named reagents: exactly those are consumed, nothing else. No list: coin (XGE).
  const remaining = pack.map((p) => ({ ...p }))
  const spent: ReagentRow[] = []
  for (const m of r.reagents ?? []) {
    let need = m.qty
    for (const row of remaining) {
      if (row.slug !== m.slug || row.qty <= 0 || need <= 0) continue
      const n = Math.min(need, row.qty)
      row.qty -= n
      need -= n
      const s2 = spent.find((p) => p.slug === m.slug)
      if (s2) s2.qty += n
      else spent.push({ slug: m.slug, qty: n, value: row.value })
    }
  }
  const spentGp = (r.reagents?.length ?? 0) > 0 ? 0 : check.materialsGp

  let roll: BrewResult["roll"] = null
  let success = true
  if (check.check) {
    const d20 = 1 + Math.floor(rng() * 20)
    const bonus = b.proficiencyBonus ?? 0
    const total = d20 + bonus
    success = total >= check.check.dc
    roll = { d20, bonus, total, success }
  }

  const packAfter = remaining.filter((p) => p.qty > 0)
  const produced = success ? { slug: r.out, qty: 1 } : null
  const when = check.days === 0 ? "as part of the long rest" : `${check.days} day${check.days === 1 ? "" : "s"} of work`
  const mats = spent.map((s) => `${s.slug} ×${s.qty}`).join(", ") + (spentGp ? `${spent.length ? " + " : ""}${spentGp} gp of raw materials` : "")
  const note = success
    ? `${b.name} makes 1 ${r.name} ${when}, spending ${mats || "nothing"}${roll ? ` (d20 ${roll.d20} + ${roll.bonus} = ${roll.total} vs DC ${check.check!.dc})` : ""}.`
    : `${b.name} fails to make ${r.name}: d20 ${roll!.d20} + ${roll!.bonus} = ${roll!.total} vs DC ${check.check!.dc}; ${mats} spent.`
  return { ...check, spent, spentGp, pack: packAfter, produced, roll, note }
}

/** Weight of raw materials, XGE p.79: 1 lb per 50 gp. */
export function rawMaterialWeightLb(gp: number): number {
  return roundGp(Math.max(0, gp) * RAW_MATERIAL_LB_PER_GP)
}

export interface HarvestResult {
  success: boolean
  exposed: boolean
  d20: number
  total: number
  dc: number
  note: string
  flags: string[]
}

/**
 * DMG p.258 — harvest poison from a dead or incapacitated poisonous creature.
 * DC 20 Nature check, or a poisoner's kit check if proficient. Failing by 5 or
 * more exposes the harvester to the creature's poison. The product is the
 * creature's own venom — whatever catalog row the bestiary names — never invented.
 */
export function harvestPoison(b: Brewer & { natureBonus: number }, creatureName: string, rng: Rng = Math.random): HarvestResult {
  const flags = ["DMG p.258 — quoted from the book, not in campaign_chunks"]
  const kit = (b.tools ?? []).map(norm).includes(norm("Poisoner's Kit"))
  const bonus = kit ? Math.max(b.natureBonus, b.proficiencyBonus ?? 0) : b.natureBonus
  const d20 = 1 + Math.floor(rng() * 20)
  const total = d20 + bonus
  const success = total >= HARVEST_POISON_DC
  const exposed = !success && total <= HARVEST_POISON_DC - HARVEST_POISON_EXPOSED_MARGIN
  const note = success
    ? `${b.name} harvests poison from the ${creatureName} (d20 ${d20} + ${bonus} = ${total} vs DC ${HARVEST_POISON_DC}).`
    : exposed
      ? `${b.name} botches the harvest (${total} vs DC ${HARVEST_POISON_DC}, failed by ${HARVEST_POISON_DC - total}) and is exposed to the ${creatureName}'s poison.`
      : `${b.name} fails to harvest poison from the ${creatureName} (${total} vs DC ${HARVEST_POISON_DC}); nothing gained.`
  return { success, exposed, d20, total, dc: HARVEST_POISON_DC, note, flags }
}

/** "Experiment" — combining reagents with no recipe. The rules have none; the DM rules it. */
export function experiment(b: Brewer, reagents: ReagentRow[]): { ok: false; reason: string; handoff: string } {
  const list = reagents.map((r) => `${r.slug} ×${r.qty}`).join(", ") || "nothing"
  return {
    ok: false,
    reason: "no rule covers combining reagents without a recipe.",
    handoff: `${b.name} experiments with ${list}. DM rules the result; the engine invents nothing.`,
  }
}
