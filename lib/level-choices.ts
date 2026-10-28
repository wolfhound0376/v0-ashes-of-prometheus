// ============================================================================
// LEVEL CHOICES — what is left to CHOOSE after the Level Up ceremony writes the level.
//
// The ceremony (/api/walk-level-up, lib/camp.ts levelUp()) fixes hit points, proficiency, Hit Dice and slots, and
// banks a "Level N — choices to make" marker on sheet_features. This module answers what those choices are for a
// level, checks a player's picks against the rules and the class list, and builds the one patch that settles them.
//
// Scope (Sam, 2026-10-28, the approved prototype https://claude.ai/artifact/5jSrEofrWEXGH5pmwvMf5M): the SORCERER and
// the ROGUE (Sam, 2026-10-28: "go" on the rogues first, SRD subclass open, everyone on the 2024 rules) and the CLERIC
// (Sam, 2026-10-28: Samson's pack, "for 2024 rules"), levels 2 and 3. Level 4 and up wait on the class trial (lib/level-trial.ts, TRIAL_GATE_FROM_LEVEL = 4), so the
// improvement / feat step is not wired here yet. Other classes keep the ceremony's "on your sheet" note.
//
// Rules source: the sheet's own (Kenta: sheet_spellcasting.rules_source "SRD 5.2.1"), i.e. the 2024 Sorcerer table:
// prepared 2/4/6/7, cantrips 4/4/4/5, sorcery points 0/2/3/4, Metamagic ×2 at level 2, subclass at 3 (Sam,
// 2026-09-27: 2024 timing for every class), one spell swapped per Sorcerer level ("level_up_one").
// Spells come only from lib/data/spells.json. The Metamagic one-liners and the non-SRD origins were written from
// memory and are marked `verify`; the non-SRD origins are closed until Sam opens them.
// ============================================================================

import spellsData from "@/lib/data/spells.json"
import { PENDING_LEVEL_SOURCE, type SheetFeature } from "@/lib/camp"

export interface ClassSpell {
  name: string
  level: number
  school: string
  cast: string
  range: string
  dur: string
  conc: boolean
  comp: string
  effect: string
  attack: boolean
  save: string | null
  review: boolean
}

export interface MetaOption { name: string; cost: number; desc: string; verify: true }
export interface OriginOption {
  name: string; open: boolean; source: string; desc: string; verify: boolean
  /** features the subclass brings at its first level, written with it (Life Domain); without them the DM applies its features */
  features?: Gain[]
  /** spells it keeps always prepared from that level (they do not count against the prepared number) */
  alwaysPrepared?: string[]
}

/** A feature the level brings with nothing to choose (Cunning Action, Font of Magic); it is written with the choices. */
export interface Gain { name: string; desc: string; source: string; icon: string }

export interface LevelPlan {
  cls: "sorcerer" | "rogue" | "cleric"
  caster: boolean
  level: number
  /** what the class calls its level-3 pick ("Sorcerous Origin", "Rogue Subclass") */
  subclassLabel: string
  gains: Gain[]
  /** rogue Sneak Attack dice, before → after (null for other classes) */
  sneakAttack: { from: string; to: string } | null
  newSpells: number
  newCantrips: number
  maxSpellLevel: number
  swaps: number
  metamagic: number
  origin: boolean
  prepared: { from: number; to: number }
  cantrips: { from: number; to: number }
  sorceryPoints: { from: number; to: number }
  /** cleric Channel Divinity uses, before → after (0 → 0 for other classes) */
  channelDivinity: { from: number; to: number }
}

/** SRD 5.2.1 Sorcerer table, levels 1–4 (what this module serves). */
export const SORCERER_2024 = {
  prepared: { 1: 2, 2: 4, 3: 6, 4: 7 } as Record<number, number>,
  cantrips: { 1: 4, 2: 4, 3: 4, 4: 5 } as Record<number, number>,
  sorceryPoints: { 1: 0, 2: 2, 3: 3, 4: 4 } as Record<number, number>,
  maxSpellLevel: { 1: 1, 2: 1, 3: 2, 4: 2 } as Record<number, number>,
}

export const METAMAGIC: MetaOption[] = [
  { name: "Careful Spell", cost: 1, desc: "Creatures you choose (up to your Charisma modifier) succeed on the save and take no damage.", verify: true },
  { name: "Distant Spell", cost: 1, desc: "Double the range, or a touch spell reaches 30 feet.", verify: true },
  { name: "Empowered Spell", cost: 1, desc: "Reroll damage dice up to your Charisma modifier; keep the new rolls.", verify: true },
  { name: "Extended Spell", cost: 1, desc: "Double the duration (24 hours at most); advantage on saves to keep concentration.", verify: true },
  { name: "Heightened Spell", cost: 2, desc: "One creature has disadvantage on its saves against the spell.", verify: true },
  { name: "Quickened Spell", cost: 2, desc: "A spell that takes an action is cast as a bonus action.", verify: true },
  { name: "Seeking Spell", cost: 1, desc: "Reroll a spell attack that misses; the new roll stands.", verify: true },
  { name: "Subtle Spell", cost: 1, desc: "No verbal, somatic or material components, unless one is consumed or has a cost.", verify: true },
  { name: "Transmuted Spell", cost: 1, desc: "Acid, cold, fire, lightning, poison or thunder damage becomes another of those.", verify: true },
  { name: "Twinned Spell", cost: 1, desc: "A spell that upcasts to add a target gets it for 1 sorcery point instead of a higher slot.", verify: true },
]

export const ORIGINS: OriginOption[] = [
  { name: "Draconic Sorcery", open: true, source: "SRD 5.2.1", desc: "Draconic Resilience: more hit points each level, a scaled hide instead of armour. Draconic spells always prepared.", verify: true },
  { name: "Aberrant Sorcery", open: false, source: "PHB 2024 — not in the SRD", desc: "Psionic sorcery and telepathic speech. Needs the DM's say.", verify: true },
  { name: "Clockwork Sorcery", open: false, source: "PHB 2024 — not in the SRD", desc: "Order over chaos: cancel advantage or disadvantage. Needs the DM's say.", verify: true },
  { name: "Wild Magic Sorcery", open: false, source: "PHB 2024 — not in the SRD", desc: "Wild magic surges and Tides of Chaos. Needs the DM's say.", verify: true },
]

// SRD 5.2.1 Rogue: 2nd Cunning Action, 3rd Rogue Subclass + Steady Aim, Sneak Attack 1d6 → 2d6 at 3rd. The SRD carries
// one subclass (Thief); the other three are the Player's Handbook's and stay closed until Sam opens them. Feature text
// is a short paraphrase from memory, marked verify.
export const ROGUE_SUBCLASSES: OriginOption[] = [
  { name: "Thief", open: true, source: "SRD 5.2.1", desc: "Fast Hands and Second-Story Work: Cunning Action also uses objects and Sleight of Hand; climbing costs no extra movement.", verify: true },
  { name: "Assassin", open: false, source: "PHB 2024 — not in the SRD", desc: "Assassinate: advantage and extra damage against foes who have not acted. Needs the DM's say.", verify: true },
  { name: "Soulknife", open: false, source: "PHB 2024 — not in the SRD", desc: "Psychic blades from the mind. Needs the DM's say.", verify: true },
  { name: "Arcane Trickster", open: false, source: "PHB 2024 — not in the SRD", desc: "Wizard spells and an invisible Mage Hand. Needs the DM's say.", verify: true },
]
const ROGUE_GAINS: Record<number, Gain[]> = {
  2: [{ name: "Cunning Action", desc: "A bonus action each turn to Dash, Disengage or Hide.", source: "Rogue 2 · SRD 5.2.1", icon: "cunning-action" }],
  3: [
    { name: "Steady Aim", desc: "Bonus action: advantage on your next attack this turn if you have not moved; your speed is 0 until the turn ends.", source: "Rogue 3 · SRD 5.2.1 · verify", icon: "steady-aim" },
    { name: "Sneak Attack 2d6", desc: "Sneak Attack rises from 1d6 to 2d6.", source: "Rogue 3 · SRD 5.2.1", icon: "sneak-attack" },
  ],
}

// SRD 5.2.1 Cleric (p.36 onward, fetched 2026-10-28): prepared 4/5/6/7, cantrips 3/3/3/4, Channel Divinity at 2nd (two
// uses: Divine Spark, Turn Undead), subclass at 3rd. The SRD's one subclass is the Life Domain, quoted here; Light,
// Trickery and War are the Player's Handbook's and stay closed until Sam opens them. Clerics change their prepared
// list on any long rest, so the level-up only adds the new spells (a swap is still allowed).
export const CLERIC_2024 = {
  prepared: { 1: 4, 2: 5, 3: 6, 4: 7 } as Record<number, number>,
  cantrips: { 1: 3, 2: 3, 3: 3, 4: 4 } as Record<number, number>,
  channelDivinity: { 1: 0, 2: 2, 3: 2, 4: 2 } as Record<number, number>,
  maxSpellLevel: { 1: 1, 2: 1, 3: 2, 4: 2 } as Record<number, number>,
}
const CLERIC_GAINS: Record<number, Gain[]> = {
  2: [
    { name: "Channel Divinity", desc: "Two uses; one returns on a short rest, all on a long rest.", source: "Cleric 2 · SRD 5.2.1", icon: "channel-divinity" },
    { name: "Divine Spark", desc: "Magic action, one creature within 30 ft: roll 1d8 + Wisdom modifier and heal it that much, or it makes a Constitution save, taking that much Necrotic or Radiant damage on a failure (half on a success).", source: "Cleric 2 · Channel Divinity · SRD 5.2.1", icon: "divine-spark" },
    { name: "Turn Undead", desc: "Magic action: each Undead of your choice within 30 ft makes a Wisdom save or is Frightened and Incapacitated for 1 minute, moving away from you. It ends if it takes damage, or you are Incapacitated or die.", source: "Cleric 2 · Channel Divinity · SRD 5.2.1", icon: "turn-undead" },
  ],
  3: [],
}
export const CLERIC_SUBCLASSES: OriginOption[] = [
  { name: "Life Domain", open: true, source: "SRD 5.2.1", verify: false,
    desc: "Disciple of Life, Preserve Life, and Aid, Bless, Cure Wounds and Lesser Restoration always prepared.",
    alwaysPrepared: ["Aid", "Bless", "Cure Wounds", "Lesser Restoration"],
    features: [
      { name: "Disciple of Life", desc: "When a spell you cast with a spell slot restores Hit Points to a creature, it regains extra Hit Points equal to 2 plus the slot's level.", source: "Cleric 3 · Life Domain · SRD 5.2.1", icon: "disciple-of-life" },
      { name: "Preserve Life", desc: "Channel Divinity, Magic action: restore Hit Points equal to five times your Cleric level, divided among Bloodied creatures within 30 ft (you included), none above half its Hit Point maximum.", source: "Cleric 3 · Life Domain · SRD 5.2.1", icon: "preserve-life" },
    ] },
  { name: "Light Domain", open: false, source: "PHB 2024 — not in the SRD", verify: true, desc: "Radiance and Warding Flare. Needs the DM's say." },
  { name: "Trickery Domain", open: false, source: "PHB 2024 — not in the SRD", verify: true, desc: "Blessing of the Trickster and illusory duplicates. Needs the DM's say." },
  { name: "War Domain", open: false, source: "PHB 2024 — not in the SRD", verify: true, desc: "Guided Strike and War Priest attacks. Needs the DM's say." },
]

/** The subclass options a plan offers. */
export function subclassesFor(plan: LevelPlan | null): OriginOption[] { return !plan ? [] : plan.cls === "rogue" ? ROGUE_SUBCLASSES : plan.cls === "cleric" ? CLERIC_SUBCLASSES : ORIGINS }

export const CHOICES_SOURCE = "Level up — chosen"
const pendingName = (level: number) => `Level ${level} — choices to make`

export function classKey(cls: string | null | undefined): string {
  return String(cls ?? "").trim().split(/[\s/]+/)[0].toLowerCase()
}

/** What level `level` asks the class to choose, or null when this module does not serve it. */
export function planFor(cls: string | null | undefined, level: number): LevelPlan | null {
  const k = classKey(cls)
  if (!(level === 2 || level === 3)) return null
  if (k === "rogue") {
    const none = { from: 0, to: 0 }
    return { cls: "rogue", caster: false, level, subclassLabel: "Rogue Subclass", gains: ROGUE_GAINS[level] ?? [],
      sneakAttack: { from: "1d6", to: level === 3 ? "2d6" : "1d6" },
      newSpells: 0, newCantrips: 0, maxSpellLevel: 0, swaps: 0, metamagic: 0, origin: level === 3,
      prepared: none, cantrips: none, sorceryPoints: none, channelDivinity: none }
  }
  if (k === "cleric") {
    const t = CLERIC_2024
    return { cls: "cleric", caster: true, level, subclassLabel: "Divine Domain", gains: CLERIC_GAINS[level] ?? [], sneakAttack: null,
      newSpells: t.prepared[level] - t.prepared[level - 1], newCantrips: t.cantrips[level] - t.cantrips[level - 1],
      maxSpellLevel: t.maxSpellLevel[level], swaps: 1, metamagic: 0, origin: level === 3,
      prepared: { from: t.prepared[level - 1], to: t.prepared[level] }, cantrips: { from: t.cantrips[level - 1], to: t.cantrips[level] },
      sorceryPoints: { from: 0, to: 0 }, channelDivinity: { from: t.channelDivinity[level - 1], to: t.channelDivinity[level] } }
  }
  if (k !== "sorcerer") return null
  const t = SORCERER_2024
  return {
    cls: "sorcerer",
    caster: true,
    subclassLabel: "Sorcerous Origin",
    gains: level === 2 ? [{ name: "Font of Magic", desc: `${t.sorceryPoints[2]} sorcery points, regained on a long rest.`, source: "Sorcerer 2", icon: "sorcery-points" }] : [],
    sneakAttack: null,
    level,
    newSpells: t.prepared[level] - t.prepared[level - 1],
    newCantrips: t.cantrips[level] - t.cantrips[level - 1],
    maxSpellLevel: t.maxSpellLevel[level],
    swaps: 1,
    metamagic: level === 2 ? 2 : 0,
    origin: level === 3,
    prepared: { from: t.prepared[level - 1], to: t.prepared[level] },
    cantrips: { from: t.cantrips[level - 1], to: t.cantrips[level] },
    sorceryPoints: { from: t.sorceryPoints[level - 1], to: t.sorceryPoints[level] },
    channelDivinity: { from: 0, to: 0 },
  }
}

type RawSpell = { name: string; level: number; school?: string; classes?: string[]; cast_time?: string; range?: string; duration?: string; concentration?: boolean; components?: string; effect?: string; attack_roll?: boolean; save?: { ability?: string } | null; needs_review?: boolean; source?: string }

/** The class list up to a spell level, from the owned dataset; Unearthed Arcana left out. */
export function classSpells(cls: string, maxLevel: number): ClassSpell[] {
  const want = classKey(cls)
  return (spellsData as RawSpell[])
    .filter((s) => (s.classes ?? []).some((c) => c.toLowerCase() === want) && s.level <= maxLevel && !/\((UA|HB)\)/.test(s.name) && !/\bUA\b/.test(String(s.source ?? "")))
    .map((s) => ({
      name: s.name, level: s.level, school: String(s.school ?? "").toLowerCase(), cast: s.cast_time ?? "", range: s.range ?? "",
      dur: s.duration ?? "", conc: !!s.concentration, comp: s.components ?? "", effect: s.effect ?? "",
      attack: !!s.attack_roll, save: s.save?.ability ?? null, review: !!s.needs_review,
    }))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
}

export function choicesOwed(features: unknown, level: number): boolean {
  return Array.isArray(features) && features.some((f) => f && typeof f === "object" && (f as SheetFeature).source === PENDING_LEVEL_SOURCE && (f as SheetFeature).name === pendingName(level))
}

export interface Picks {
  metamagic?: string[]
  origin?: string | null
  spells?: string[]
  cantrips?: string[]
  swapOut?: string | null
  swapOutCantrip?: string | null
}

export interface CastingSheet {
  cantrips?: string[] | null
  prepared?: string[] | null
  always_prepared?: string[] | null
  [k: string]: unknown
}

export type ChoiceResult =
  | { ok: true; spellcasting: CastingSheet | null; features: SheetFeature[]; summary: string[] }
  | { ok: false; error: string }

/** Check the picks against the plan and the class list; build the new sheet_spellcasting and sheet_features. */
export function settleChoices(plan: LevelPlan, casting: CastingSheet | null, features: unknown, picks: Picks): ChoiceResult {
  const list = classSpells(plan.cls, plan.maxSpellLevel)
  const byName = new Map(list.map((s) => [s.name, s]))
  const cantrips = [...(casting?.cantrips ?? [])]
  const prepared = [...(casting?.prepared ?? [])]
  const always = [...(casting?.always_prepared ?? [])]
  const Cls = plan.cls[0].toUpperCase() + plan.cls.slice(1)
  const origin = plan.origin ? subclassesFor(plan).find((o) => o.name === picks.origin) : null
  const alwaysNext = uniq(always.concat(origin?.alwaysPrepared ?? []))
  const spells = uniq(picks.spells ?? []), newC = uniq(picks.cantrips ?? [])
  const swapOut = picks.swapOut ?? null, swapOutC = picks.swapOutCantrip ?? null
  if (swapOut && swapOutC) return { ok: false, error: "One swap per level." }
  if (swapOut && !prepared.includes(swapOut)) return { ok: false, error: `${swapOut} is not on the sheet to swap out.` }
  if (swapOutC && !cantrips.includes(swapOutC)) return { ok: false, error: `${swapOutC} is not on the sheet to swap out.` }
  const needS = plan.newSpells + (swapOut ? 1 : 0), needC = plan.newCantrips + (swapOutC ? 1 : 0)
  if (spells.length !== needS) return { ok: false, error: `Choose ${needS} spell${needS === 1 ? "" : "s"}.` }
  if (newC.length !== needC) return { ok: false, error: needC ? `Choose ${needC} cantrip${needC === 1 ? "" : "s"}.` : "No new cantrip at this level." }
  for (const n of spells) {
    const s = byName.get(n)
    if (!s || s.level < 1) return { ok: false, error: `${n} is not a ${plan.cls} spell this level can prepare.` }
    if (prepared.includes(n)) return { ok: false, error: `${n} is already prepared.` }
    if (alwaysNext.includes(n)) return { ok: false, error: `${n} is always prepared already.` }
  }
  for (const n of newC) {
    const s = byName.get(n)
    if (!s || s.level !== 0) return { ok: false, error: `${n} is not a ${plan.cls} cantrip.` }
    if (cantrips.includes(n)) return { ok: false, error: `${n} is already known.` }
  }
  const meta = uniq(picks.metamagic ?? [])
  if (meta.length !== plan.metamagic) return { ok: false, error: plan.metamagic ? `Choose ${plan.metamagic} Metamagic options.` : "No Metamagic at this level." }
  const metaOpts = meta.map((n) => METAMAGIC.find((m) => m.name === n))
  if (metaOpts.some((m) => !m)) return { ok: false, error: "Unknown Metamagic option." }
  if (plan.origin && !origin) return { ok: false, error: `Choose a ${plan.subclassLabel}.` }
  if (origin && !origin.open) return { ok: false, error: `${origin.name} is closed until the DM opens it.` }
  if (!plan.origin && picks.origin) return { ok: false, error: `The ${plan.subclassLabel.toLowerCase()} is chosen at level 3.` }

  // a spell the new domain keeps always prepared leaves the chosen list (it is on the sheet once, as always prepared);
  // the cleric fills the freed place on the next long rest (they re-prepare after any long rest)
  const nextPrepared = prepared.filter((n) => n !== swapOut && !(origin?.alwaysPrepared ?? []).includes(n)).concat(spells)
  const nextCantrips = cantrips.filter((n) => n !== swapOutC).concat(newC)
  const spellcasting: CastingSheet | null = !plan.caster ? null : {
    ...(casting ?? {}),
    prepared: nextPrepared,
    cantrips: nextCantrips,
    prepared_max: plan.prepared.to,
    cantrips_max: plan.cantrips.to,
    ...(plan.cls === "sorcerer" ? { sorcery_points: { max: plan.sorceryPoints.to, used: 0 } } : {}),
    ...(plan.channelDivinity.to ? { channel_divinity: { max: plan.channelDivinity.to, used: Math.min(Number((casting?.channel_divinity as { used?: number } | undefined)?.used ?? 0) || 0, plan.channelDivinity.to) } } : {}),
    ...(alwaysNext.length !== always.length ? { always_prepared: alwaysNext } : {}),
  }
  const src = `${Cls} ${plan.level}`
  const kept = (Array.isArray(features) ? features : []).filter(
    (f): f is SheetFeature => !!f && typeof f === "object" && typeof (f as SheetFeature).name === "string" && !((f as SheetFeature).source === PENDING_LEVEL_SOURCE && (f as SheetFeature).name === pendingName(plan.level)),
  ).map((f) => {
    // the level-1 "Sneak Attack" line on the sheet says "+1d6"; when the level raises the dice, that line follows
    // (SRD 5.2.1 Rogue table), so the sheet never carries two Sneak Attack numbers.
    const sa = plan.sneakAttack
    if (!sa || sa.from === sa.to || !/^sneak attack$/i.test(f.name.trim())) return f
    return { ...f, desc: String(f.desc ?? "").replace(new RegExp(`\\+?${sa.from}\\b`, "g"), `+${sa.to}`) }
  })
  const added: SheetFeature[] = []
  for (const g of plan.gains) added.push({ name: g.name, desc: g.desc, source: g.source })
  for (const m of metaOpts) added.push({ name: `Metamagic: ${m!.name}`, desc: `${m!.desc} (${m!.cost} SP)`, source: `${src} · verify against SRD 5.2.1` })
  if (origin) added.push({ name: origin.name, desc: origin.desc, source: `${src} · ${origin.source}${origin.features ? "" : " · the DM applies its features"}` })
  for (const g of origin?.features ?? []) added.push({ name: g.name, desc: g.desc, source: g.source })
  const summary = [
    ...plan.gains.map((g) => g.name),
    ...metaOpts.map((m) => m!.name),
    ...(origin ? [origin.name, ...(origin.features ?? []).map((g) => g.name)] : []),
    ...spells, ...newC,
    ...(swapOut ? [`swapped out ${swapOut}`] : []), ...(swapOutC ? [`swapped out ${swapOutC}`] : []),
  ]
  return { ok: true, spellcasting, features: [...kept, ...added], summary }
}

function uniq(a: string[]): string[] { return [...new Set(a.map((s) => String(s).trim()).filter(Boolean))] }
