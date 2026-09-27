// Camp rites — the MEDICINE, PRAY and STUDY tiles at the fire.
//
// Sam, 2026-09-27:
//   "Medicine should give you the option to cure a disease, make healing
//    potions/elixirs, heal or cure team members, investigate illnesses (only
//    highlights if someone in the party is ill)."
//   "Pray should open options to perform holy rites (for clerics), commune or
//    ask favors from your patron, or pray to your god which has a chance of
//    being blessed/party being blessed (some buff). … Your god should pop up
//    as an option."
//
// Pure, like lib/camp and lib/alchemy: rows and rolls in, words and writes out.
// Every roll takes an `Rng` so the route can feed it the physical die.
//
// SOURCES, so nothing here passes for an improvisation:
//   SRD 5.2.1   Healer's Kit (stabilise without a check); Death Saves /
//               Stabilizing (Medicine DC 10); Healing Word (2d4 + mod);
//               Cure Wounds (2d8 + mod); Prayer of Healing (2d8 + mod, 10 min);
//               Spare the Dying; Lesser Restoration; Antitoxin (advantage on
//               saves vs Poisoned for 1 hour — it does NOT cure); Healer feat
//               (Battle Medic, Healing Rerolls); Lay on Hands; Rituals (a
//               prepared spell with the Ritual tag); Cleric/Paladin — change
//               prepared spells after a Long Rest; Heroic Inspiration.
//   DMG 2014 p.257  Sample diseases and their save DCs (Cackle Fever 13,
//               Sewer Plague 11, Sight Rot 15 — cured by Eyebright ointment).
//   XGE p.79/130  Brewing is lib/alchemy; this file only points there.
//   House rules The prayer-for-a-blessing roll and the diagnosis DCs are
//               PROPOSED and surface in `flags` until Sam says yes.
//
// The character's god is `sheet_personality.faith` (the Forge writes it).

import { MAX_ATTUNED } from "./camp"

export type Rng = () => number

const die = (rng: Rng, sides: number) => 1 + Math.floor(rng() * sides)
const roll = (rng: Rng, n: number, sides: number) => Array.from({ length: n }, () => die(rng, sides))
const mod = (score: number | null | undefined) => Math.floor(((score ?? 10) - 10) / 2)
const pb = (level: number | null | undefined) => {
  const l = level ?? 1
  return l >= 17 ? 6 : l >= 13 ? 5 : l >= 9 ? 4 : l >= 5 ? 3 : 2
}

// ============================================================================
// Rows
// ============================================================================

export interface RiteSheet {
  id: string
  name: string
  class?: string | null
  level?: number | null
  wis_score?: number | null
  cha_score?: number | null
  int_score?: number | null
  hp_current?: number | null
  hp_max?: number | null
  conditions?: string[] | null
  sheet_skill_proficiencies?: Record<string, string> | null
  sheet_spellcasting?: {
    ability?: string | null
    slots?: Record<string, { max: number; used: number }> | null
    cantrips?: string[] | null
    prepared?: string[] | null
    always_prepared?: string[] | null
  } | null
  sheet_personality?: { faith?: string | null } | null
  /** Feat names from sheet_features, e.g. ["Healer"]. */
  feats?: string[] | null
  sheet_heroic_inspiration?: boolean | null
  sheet_hit_dice?: string | null
  hit_dice_remaining?: number | null
}

/** What the tender has to hand. Every count comes from inventory_items. */
export interface Kit {
  healersKitUses?: number
  antitoxin?: number
  herbalismKit?: boolean
  eyebrightOintment?: number
  layOnHandsPool?: number
}

export interface Option {
  k: string
  title: string
  desc: string
  /** False shows the tile greyed with `reason`. */
  ok: boolean
  reason?: string
  /** Draws the eye: investigate only lights up when someone is ill. */
  highlight?: boolean
  source: string
}

// ============================================================================
// Illness
// ============================================================================

/** DMG 2014 p.257 sample diseases. The save DC doubles as the diagnosis DC (PROPOSED). */
export const DISEASES: Record<string, { dc: number; cure: string; source: string }> = {
  "cackle fever": { dc: 13, cure: "Three successful CON saves ends it; Lesser Restoration cures it.", source: "DMG 2014 p.257" },
  "sewer plague": { dc: 11, cure: "Two successful CON saves after long rests ends it; Lesser Restoration cures it.", source: "DMG 2014 p.257" },
  "sight rot": { dc: 15, cure: "Eyebright ointment (Herbalism Kit) or Lesser Restoration cures it.", source: "DMG 2014 p.257" },
}
/** A disease row that is not one of the samples above. */
const GENERIC_DISEASE = /disease|diseased|plague|fever|rot|pox|sick/i

export interface Ailment { who: string; name: string; kind: "disease" | "poison"; dc: number; known: boolean }

/** What ails a character, read off their conditions. Poisoned counts; so does any disease. */
export function ailmentsOf(c: RiteSheet): Ailment[] {
  const out: Ailment[] = []
  for (const raw of c.conditions ?? []) {
    const n = String(raw).trim().toLowerCase()
    if (n === "poisoned") out.push({ who: c.name, name: "Poisoned", kind: "poison", dc: 10, known: true })
    else if (DISEASES[n]) out.push({ who: c.name, name: raw, kind: "disease", dc: DISEASES[n].dc, known: true })
    else if (GENERIC_DISEASE.test(n)) out.push({ who: c.name, name: raw, kind: "disease", dc: 15, known: false })
  }
  return out
}

export const isIll = (c: RiteSheet) => ailmentsOf(c).length > 0
export const isDown = (c: RiteSheet) => (c.hp_current ?? 1) <= 0
export const isHurt = (c: RiteSheet) => (c.hp_current ?? 0) < (c.hp_max ?? 0)

// ============================================================================
// Spells the rites care about
// ============================================================================

/** SRD 5.2.1 values. Only the spells the camp tiles offer. */
export const HEAL_SPELLS: Record<string, { level: number; dice: [number, number]; note: string }> = {
  "Healing Word": { level: 1, dice: [2, 4], note: "a Bonus Action; range 60 ft" },
  "Cure Wounds": { level: 1, dice: [2, 8], note: "a touch" },
  "Prayer of Healing": { level: 2, dice: [2, 8], note: "10 minutes, up to five of the party" },
}
export const CURE_SPELLS: Record<string, { level: number; ends: string[] }> = {
  "Lesser Restoration": { level: 2, ends: ["disease", "poisoned", "blinded", "deafened", "paralyzed"] },
}
/** Cleric and paladin spells with the Ritual tag (SRD 5.2.1 + XGE Ceremony). */
export const RITUAL_SPELLS: Record<string, { level: number; what: string }> = {
  "Ceremony": { level: 1, what: "a sacred rite — atonement, blessing of water, coming of age, dedication, funeral, wedding (XGE)" },
  "Detect Magic": { level: 1, what: "sense magic within 30 ft for 10 minutes" },
  "Detect Poison and Disease": { level: 1, what: "sense poisons, poisonous creatures and diseases within 30 ft" },
  "Purify Food and Drink": { level: 1, what: "make the camp's food and water safe — no poison, no disease" },
  "Augury": { level: 2, what: "ask whether a course of action within 30 minutes brings weal or woe" },
  "Gentle Repose": { level: 2, what: "keep a body from decay for 10 days" },
}

function knowsSpell(c: RiteSheet, spell: string): boolean {
  const s = c.sheet_spellcasting
  if (!s) return false
  const all = [...(s.prepared ?? []), ...(s.always_prepared ?? []), ...(s.cantrips ?? [])]
  return all.some((x) => x.toLowerCase() === spell.toLowerCase())
}

/** The lowest free slot at or above `level`, or null. */
export function freeSlot(c: RiteSheet, level: number): number | null {
  const slots = c.sheet_spellcasting?.slots ?? {}
  const levels = Object.keys(slots).map(Number).filter((l) => l >= level).sort((a, b) => a - b)
  for (const l of levels) if ((slots[String(l)]?.max ?? 0) - (slots[String(l)]?.used ?? 0) > 0) return l
  return null
}

function castMod(c: RiteSheet): number {
  const a = (c.sheet_spellcasting?.ability ?? "").toLowerCase()
  if (a.startsWith("cha")) return mod(c.cha_score)
  if (a.startsWith("int")) return mod(c.int_score)
  return mod(c.wis_score)
}

function skillProf(c: RiteSheet, skill: string): 0 | 1 | 2 {
  for (const [k, v] of Object.entries(c.sheet_skill_proficiencies ?? {})) {
    if (k.toLowerCase().replace(/[^a-z]/g, "") !== skill) continue
    const val = String(v).toLowerCase()
    if (val === "expertise") return 2
    if (val === "proficient" || val === "true" || val === "yes") return 1
  }
  return 0
}

export interface Check { d20: number; total: number; dc: number; success: boolean; label: string }
function check(c: RiteSheet, skill: "medicine" | "religion", dc: number, rng: Rng): Check {
  const d = die(rng, 20)
  const ability = skill === "medicine" ? mod(c.wis_score) : mod(c.int_score)
  const total = d + ability + skillProf(c, skill) * pb(c.level)
  const Sk = skill[0].toUpperCase() + skill.slice(1)
  const Ab = skill === "medicine" ? "Wisdom" : "Intelligence"
  return { d20: d, total, dc, success: total >= dc, label: `${Ab} (${Sk}) ${d} → ${total} vs DC ${dc}` }
}

// ============================================================================
// MEDICINE
// ============================================================================

/**
 * The four Medicine tiles. Investigate only lights up when someone is ill,
 * and cannot be chosen when nobody is.
 */
export function medicineMenu(me: RiteSheet, party: RiteSheet[], kit: Kit = {}): Option[] {
  const ill = party.filter(isIll)
  const wounded = party.filter((p) => isHurt(p) || isDown(p))
  const canTend = party.some((p) => tendOptions(me, p, kit).some((o) => o.ok))
  const tiles: Option[] = [
    {
      k: "tend",
      title: "HEAL OR CURE A COMPANION",
      desc: wounded.length ? `Tend ${wounded.map((p) => p.name).join(", ")}.` : "Everyone is whole tonight.",
      ok: canTend,
      reason: canTend ? undefined : wounded.length ? `${me.name} has no way to heal them tonight — no spell slot, no Healer's Kit.` : "No one is hurt.",
      source: "SRD 5.2.1 — healing spells, Healer's Kit, Stabilizing",
    },
    {
      k: "investigate",
      title: "INVESTIGATE ILLNESS",
      desc: ill.length ? `${ill.map((p) => p.name).join(", ")} ${ill.length === 1 ? "is" : "are"} unwell. Find out what it is.` : "No one in the party is ill.",
      ok: ill.length > 0,
      highlight: ill.length > 0,
      reason: ill.length ? undefined : "No one in the party is ill.",
      source: "SRD 5.2.1 Medicine — diagnose an illness",
    },
    {
      k: "cure",
      title: "CURE A DISEASE",
      desc: ill.length ? "Treat what you have found." : "Nothing to cure tonight.",
      ok: ill.some((p) => cureOptions(me, p, kit).some((o) => o.ok)),
      reason: ill.length ? `${me.name} has nothing that cures it — Lesser Restoration, Lay on Hands, or the disease's own remedy.` : "No one in the party is ill.",
      source: "SRD 5.2.1 Lesser Restoration / Lay on Hands; DMG 2014 p.257",
    },
    {
      k: "brew",
      title: "BREW REMEDIES",
      desc: "Healing potions and antitoxin at the alchemy bench.",
      ok: true,
      source: "XGE p.79 / p.130 — lib/alchemy",
    },
  ]
  return (tiles as Option[]).map((o) => (o.ok ? { ...o, reason: undefined } : o))
}

/** What `me` can do for `target` tonight. Every option names its rule. */
export function tendOptions(me: RiteSheet, target: RiteSheet, kit: Kit = {}): Option[] {
  const out: Option[] = []
  const down = isDown(target)
  const hurt = isHurt(target) || down
  if (!hurt && !isIll(target)) return out
  if (hurt) {
    for (const [spell, s] of Object.entries(HEAL_SPELLS)) {
      if (!knowsSpell(me, spell)) continue
      const slot = freeSlot(me, s.level)
      out.push({
        k: `spell:${spell}`,
        title: spell.toUpperCase(),
        desc: `${s.dice[0]}d${s.dice[1]} + ${castMod(me)} — ${s.note}.`,
        ok: slot != null,
        reason: slot == null ? `No level ${s.level}+ spell slot left.` : undefined,
        source: `SRD 5.2.1 ${spell}`,
      })
    }
  }
  if (down) {
    if (knowsSpell(me, "Spare the Dying")) out.push({ k: "spare", title: "SPARE THE DYING", desc: `${target.name} stops dying.`, ok: true, source: "SRD 5.2.1 Spare the Dying" })
    const uses = kit.healersKitUses ?? 0
    out.push({ k: "kit-stabilize", title: "HEALER'S KIT", desc: `Stabilise ${target.name} — no check.`, ok: uses > 0, reason: uses > 0 ? undefined : "No Healer's Kit uses.", source: "SRD 5.2.1 Healer's Kit" })
    out.push({ k: "stabilize", title: "STABILISE BY HAND", desc: `Wisdom (Medicine), DC 10.`, ok: true, source: "SRD 5.2.1 Stabilizing a Character" })
  }
  if (hurt && (me.feats ?? []).some((f) => /healer/i.test(f))) {
    const uses = kit.healersKitUses ?? 0
    out.push({ k: "battle-medic", title: "BATTLE MEDIC", desc: `${target.name} spends a Hit Die; you roll it and add ${pb(me.level)}.`, ok: uses > 0 && (target.hit_dice_remaining ?? 1) > 0, reason: uses > 0 ? "They have no Hit Dice left." : "No Healer's Kit uses.", source: "SRD 5.2.1 Healer feat" })
  }
  return out
}

export interface TendResult {
  ok: boolean
  healed: number
  hp: number | null
  stabilized: boolean
  slotSpent: number | null
  kitUsed: boolean
  rolls: number[]
  check: Check | null
  note: string
}

export function tend(me: RiteSheet, target: RiteSheet, k: string, kit: Kit, rng: Rng): TendResult {
  const opt = tendOptions(me, target, kit).find((o) => o.k === k)
  const base: TendResult = { ok: false, healed: 0, hp: target.hp_current ?? null, stabilized: false, slotSpent: null, kitUsed: false, rolls: [], check: null, note: "" }
  if (!opt) return { ...base, note: `${me.name} cannot do that for ${target.name}.` }
  if (!opt.ok) return { ...base, note: opt.reason ?? "Not tonight." }
  const cur = Math.max(0, target.hp_current ?? 0)
  const max = target.hp_max ?? cur
  if (k.startsWith("spell:")) {
    const spell = k.slice(6)
    const s = HEAL_SPELLS[spell]
    const slot = freeSlot(me, s.level)!
    const extra = slot - s.level // upcast adds the base dice again per level
    const rolls = roll(rng, s.dice[0] * (1 + extra), s.dice[1])
    const amount = rolls.reduce((a, b) => a + b, 0) + castMod(me)
    const healed = Math.min(Math.max(0, amount), max - cur)
    return { ...base, ok: true, healed, hp: cur + healed, slotSpent: slot, rolls, note: `${me.name} casts ${spell} (level ${slot} slot) on ${target.name}: ${rolls.join("+")}${castMod(me) >= 0 ? "+" : ""}${castMod(me)} — ${healed} hp (${cur + healed}/${max}).` }
  }
  if (k === "spare") return { ...base, ok: true, stabilized: true, note: `${me.name} speaks a word over ${target.name}; the dying stops. Stable at 0 hp.` }
  if (k === "kit-stabilize") return { ...base, ok: true, stabilized: true, kitUsed: true, note: `${me.name} binds ${target.name}'s wounds with the Healer's Kit. Stable at 0 hp; one use spent.` }
  if (k === "stabilize") {
    const c = check(me, "medicine", 10, rng)
    return { ...base, ok: true, stabilized: c.success, check: c, note: c.success ? `${me.name} stops the bleeding — ${c.label}. ${target.name} is stable.` : `${me.name} cannot stop it — ${c.label}. ${target.name} is still dying.` }
  }
  if (k === "battle-medic") {
    const face = Number((target.sheet_hit_dice ?? "d8").match(/d(\d+)/)?.[1] ?? 8)
    let r = die(rng, face)
    if (r === 1) r = die(rng, face) // Healing Rerolls
    const healed = Math.min(r + pb(me.level), max - cur)
    return { ...base, ok: true, healed, hp: cur + healed, kitUsed: true, rolls: [r], note: `${me.name} works on ${target.name} with the Healer's Kit: Hit Die ${r} + ${pb(me.level)} — ${healed} hp (${cur + healed}/${max}).` }
  }
  return { ...base, note: "Not tonight." }
}

export interface Diagnosis { ok: boolean; check: Check | null; found: Ailment[]; note: string; flags: string[] }

/** Medicine check to name what ails `patient`. The DC is the disease's own save DC — PROPOSED. */
export function investigate(me: RiteSheet, patient: RiteSheet, rng: Rng): Diagnosis {
  const ail = ailmentsOf(patient)
  const flags = ["Diagnosis DC = the disease's save DC (DMG p.257); poison DC 10 — PROPOSED, needs Sam's yes"]
  if (!ail.length) return { ok: false, check: null, found: [], note: `${patient.name} is not ill.`, flags }
  const dc = Math.max(...ail.map((a) => a.dc))
  const c = check(me, "medicine", dc, rng)
  if (!c.success) return { ok: true, check: c, found: [], note: `${me.name} examines ${patient.name} — ${c.label}. Something is wrong; ${me.name} cannot say what.`, flags }
  const lines = ail.map((a) => {
    const d = DISEASES[a.name.toLowerCase()]
    return a.kind === "poison" ? `${a.name}: poison. Antitoxin gives advantage on the save; Lesser Restoration or Lay on Hands ends it.` : d ? `${a.name}: ${d.cure}` : `${a.name}: not in the book's list — the DM rules the cure.`
  })
  return { ok: true, check: c, found: ail, note: `${me.name} examines ${patient.name} — ${c.label}.\n${lines.join("\n")}`, flags }
}

export function cureOptions(me: RiteSheet, patient: RiteSheet, kit: Kit = {}): Option[] {
  const ail = ailmentsOf(patient)
  if (!ail.length) return []
  const out: Option[] = []
  for (const [spell, s] of Object.entries(CURE_SPELLS)) {
    const known = knowsSpell(me, spell)
    const slot = known ? freeSlot(me, s.level) : null
    out.push({ k: `spell:${spell}`, title: spell.toUpperCase(), desc: "Ends one disease or the Poisoned condition.", ok: known && slot != null, reason: !known ? `${me.name} does not have ${spell} prepared (a level ${s.level} spell).` : `No level ${s.level}+ slot left.`, source: `SRD 5.2.1 ${spell}` })
  }
  if (/paladin/i.test(me.class ?? "")) {
    const pool = kit.layOnHandsPool ?? 0
    out.push({ k: "lay-on-hands", title: "LAY ON HANDS", desc: "Spend 5 from the pool to end the Poisoned condition.", ok: pool >= 5 && ail.some((a) => a.kind === "poison"), reason: pool < 5 ? "Fewer than 5 points left in the pool." : "Lay on Hands ends Poisoned, not disease.", source: "SRD 5.2.1 Lay on Hands" })
  }
  if (ail.some((a) => a.name.toLowerCase() === "sight rot")) {
    const n = kit.eyebrightOintment ?? 0
    out.push({ k: "eyebright", title: "EYEBRIGHT OINTMENT", desc: "Cures Sight Rot.", ok: n > 0, reason: kit.herbalismKit ? "No ointment made — brew it at the bench (Herbalism Kit)." : "No ointment, and no Herbalism Kit to make it.", source: "DMG 2014 p.257" })
  }
  if (ail.some((a) => a.kind === "poison")) {
    const n = kit.antitoxin ?? 0
    out.push({ k: "antitoxin", title: "ANTITOXIN", desc: "Advantage on the save to end Poisoned for 1 hour. It does not cure.", ok: n > 0, reason: "No antitoxin in the pack.", source: "SRD 5.2.1 Antitoxin" })
  }
  return out.map((o) => (o.ok ? { ...o, reason: undefined } : o))
}

export interface CureResult { ok: boolean; cured: string | null; slotSpent: number | null; used: string | null; note: string }

export function cure(me: RiteSheet, patient: RiteSheet, k: string, kit: Kit): CureResult {
  const opt = cureOptions(me, patient, kit).find((o) => o.k === k)
  if (!opt || !opt.ok) return { ok: false, cured: null, slotSpent: null, used: null, note: opt?.reason ?? "Not tonight." }
  const ail = ailmentsOf(patient)
  if (k.startsWith("spell:")) {
    const spell = k.slice(6)
    const target = ail.find((a) => a.kind === "disease") ?? ail[0]
    const slot = freeSlot(me, CURE_SPELLS[spell].level)
    return { ok: true, cured: target.name, slotSpent: slot, used: null, note: `${me.name} casts ${spell} on ${patient.name}. ${target.name} is gone.` }
  }
  if (k === "lay-on-hands") return { ok: true, cured: "Poisoned", slotSpent: null, used: "lay-on-hands:5", note: `${me.name} lays hands on ${patient.name}. The poison is gone.` }
  if (k === "eyebright") return { ok: true, cured: "Sight Rot", slotSpent: null, used: "eyebright-ointment", note: `${me.name} works the ointment into ${patient.name}'s eyes. The rot clears.` }
  if (k === "antitoxin") return { ok: true, cured: null, slotSpent: null, used: "antitoxin", note: `${patient.name} drinks the antitoxin: advantage on saves against being Poisoned for the next hour. It has not cured anything.` }
  return { ok: false, cured: null, slotSpent: null, used: null, note: "Not tonight." }
}

// ============================================================================
// PRAY
// ============================================================================

export type DevotionPath = "cleric" | "paladin" | "warlock" | "devout"

/** Which animation plays, and which tiles show. */
export function devotionPath(c: RiteSheet): DevotionPath {
  const cls = (c.class ?? "").toLowerCase()
  if (cls.includes("cleric")) return "cleric"
  if (cls.includes("paladin")) return "paladin"
  if (cls.includes("warlock")) return "warlock"
  return "devout"
}

/** The god on the sheet, or null. */
export function deityOf(c: RiteSheet): string | null {
  const f = (c.sheet_personality?.faith ?? "").trim()
  return f || null
}

export function prayMenu(me: RiteSheet): Option[] {
  const path = devotionPath(me)
  const god = deityOf(me)
  const out: Option[] = []
  if (path === "cleric" || path === "paladin") {
    out.push({ k: "rites", title: "HOLY RITES", desc: `Tend the altar of ${god ?? "your god"}: a ritual, tomorrow's prayers, the vigil.`, ok: true, source: "SRD 5.2.1 Rituals; Cleric/Paladin prepared spells" })
  }
  if (path === "warlock") {
    out.push({ k: "patron", title: "COMMUNE WITH YOUR PATRON", desc: "Speak to the power that holds your pact. Ask it for something, if you dare.", ok: true, source: "DM scene — the patron answers through Malachar" })
  }
  out.push({
    k: "god",
    title: god ? `PRAY TO ${god.toUpperCase()}` : "PRAY",
    desc: god ? `Kneel and pray to ${god}. Sometimes a god listens.` : "No god is written on your sheet — pray to whoever listens, or set one in the Forge.",
    ok: true,
    source: "Heroic Inspiration, SRD 5.2.1 — the roll is PROPOSED",
  })
  return out
}

export function riteOptions(me: RiteSheet): Option[] {
  const out: Option[] = []
  const rituals = Object.entries(RITUAL_SPELLS).filter(([n]) => knowsSpell(me, n))
  if (rituals.length) {
    for (const [n, r] of rituals) out.push({ k: `ritual:${n}`, title: n.toUpperCase(), desc: `As a ritual — no slot spent, 10 minutes longer. ${r.what[0].toUpperCase()}${r.what.slice(1)}.`, ok: true, source: "SRD 5.2.1 Rituals" })
  } else {
    out.push({ k: "ritual", title: "PERFORM A RITUAL", desc: "Cast a prepared ritual spell without spending a slot.", ok: false, reason: `${me.name} has no ritual spell prepared. ${Object.keys(RITUAL_SPELLS).filter((n) => RITUAL_SPELLS[n].level === 1).join(", ")} are the level 1 choices.`, source: "SRD 5.2.1 Rituals" })
  }
  out.push({ k: "prepare", title: "CHOOSE TOMORROW'S PRAYERS", desc: "Change your prepared spells; they take hold when the long rest ends.", ok: true, source: "SRD 5.2.1 Cleric / Paladin — Changing Your Prepared Spells" })
  out.push({ k: "vigil", title: "KEEP THE VIGIL", desc: `Lead the camp in worship of ${deityOf(me) ?? "your god"}. The DM plays the scene.`, ok: true, source: "DM scene" })
  return out
}

/** PROPOSED house rule for "pray to your god": Wisdom (Religion) — see `prayToGod`. */
export const PRAYER_DC = 15

export interface PrayerResult {
  ok: boolean
  check: Check | null
  blessedSelf: boolean
  /** Ids granted Heroic Inspiration (write sheet_heroic_inspiration = true). */
  inspired: string[]
  animation: DevotionPath
  note: string
  flags: string[]
}

/**
 * Pray to the god on the sheet. PROPOSED (needs Sam's yes):
 *   Wisdom (Religion) vs DC 15 — the DMG's "medium" (p.238). Religion is an
 *   Intelligence skill in the book; praying is Wisdom here on purpose, so the
 *   devout do better than the learned. A success grants the prayer Heroic
 *   Inspiration (SRD 5.2.1). A natural 20 grants it to the whole party.
 *   Once per character per long rest.
 */
export function prayToGod(me: RiteSheet, party: RiteSheet[], rng: Rng, opts: { prayedThisRest?: boolean } = {}): PrayerResult {
  const flags = ["Prayer roll (WIS + Religion vs DC 15, nat 20 blesses the party) is PROPOSED — needs Sam's yes"]
  const animation = devotionPath(me)
  const god = deityOf(me) ?? "whatever listens"
  if (opts.prayedThisRest) return { ok: false, check: null, blessedSelf: false, inspired: [], animation, note: `${me.name} has already prayed tonight.`, flags }
  const d = die(rng, 20)
  const total = d + mod(me.wis_score) + skillProf(me, "religion") * pb(me.level)
  const c: Check = { d20: d, total, dc: PRAYER_DC, success: total >= PRAYER_DC, label: `Wisdom (Religion) ${d} → ${total} vs DC ${PRAYER_DC}` }
  if (d === 20) {
    const ids = party.filter((p) => !p.sheet_heroic_inspiration).map((p) => p.id)
    return { ok: true, check: c, blessedSelf: true, inspired: ids, animation, note: `${me.name} prays to ${god} — ${c.label}. A natural 20. The fire burns white for a moment, and the whole party feels it: Heroic Inspiration for everyone.`, flags }
  }
  if (c.success) {
    const ids = me.sheet_heroic_inspiration ? [] : [me.id]
    return { ok: true, check: c, blessedSelf: true, inspired: ids, animation, note: `${me.name} prays to ${god} — ${c.label}. An answer, faint but real: Heroic Inspiration${ids.length ? "" : " (already held)"}.`, flags }
  }
  return { ok: true, check: c, blessedSelf: false, inspired: [], animation, note: `${me.name} prays to ${god} — ${c.label}. Silence. The fire crackles.`, flags }
}

// ============================================================================
// STUDY
// ============================================================================
//
// Sam, 2026-09-27: "Study gives you options to attune to magical items, check
// if something is magical, read an arcane scroll, learn a scroll (if that is
// an option — wizard only), decipher a book or passage."
//
// SOURCES (SRD 5.2.1): Attunement (a Short Rest focused on the item; three at
// most; class or other prerequisites); Identifying a Magic Item (a Short Rest
// in contact with it reveals its properties — no roll); Detect Magic and
// Identify (both Ritual); Spell Scroll (readable only if the spell is on your
// class list); Wizard — Copying a Spell into the Book (2 hours and 50 GP per
// spell level, a level you can prepare); Comprehend Languages (Ritual).
// Project rule (AGENTS.md): a cursed item reveals nothing — lib/camp enforces it.

export { MAX_ATTUNED }

/** One thing in the pack, as the study tiles see it. From items + inventory_items. */
export interface StudyItem {
  id: string
  name: string
  /** items.rarity: null or "mundane" when it is not magic. */
  rarity?: string | null
  /** items.attunement: true, or a prerequisite such as "by a cleric". */
  attunement?: boolean | string | null
  cursed?: boolean | null
  /** Has this character already learned what it is? */
  identified?: boolean | null
  /** Who is attuned to it, if anyone (needs a column — see note in `attune`). */
  attunedBy?: string | null
  kind?: "scroll" | "book" | "item" | null
  /** For a scroll: the spell on it. */
  spell?: { name: string; level: number; classes: string[] } | null
  /** For a book or passage: the language it is written in, and the subject. */
  language?: string | null
  subject?: "arcana" | "history" | "religion" | "nature" | null
}

export interface StudySheet extends RiteSheet {
  languages?: string[] | null
}

const isMagic = (it: StudyItem) => !!it.rarity && !/^(mundane|none|common item)$/i.test(it.rarity)
const needsAttunement = (it: StudyItem) => !!it.attunement && it.attunement !== "false"
const classIs = (c: RiteSheet, cls: string) => (c.class ?? "").toLowerCase().includes(cls)

/** The five study tiles. "Learn a scroll" only exists for a wizard. */
export function studyMenu(me: StudySheet, pack: StudyItem[]): Option[] {
  const mine = pack.filter((it) => it.attunedBy === me.id).length
  const attunable = pack.filter((it) => isMagic(it) && needsAttunement(it) && it.attunedBy !== me.id)
  const unknown = pack.filter((it) => !it.identified)
  const scrolls = pack.filter((it) => it.kind === "scroll")
  const books = pack.filter((it) => it.kind === "book")
  const out: Option[] = [
    { k: "attune", title: "ATTUNE", desc: `Spend the evening bonded to a magic item. ${mine}/${MAX_ATTUNED} attuned.`, ok: attunable.length > 0 && mine < MAX_ATTUNED, reason: mine >= MAX_ATTUNED ? `${me.name} is already attuned to ${MAX_ATTUNED} items.` : "Nothing in the pack needs attunement.", source: "SRD 5.2.1 Attunement" },
    { k: "identify", title: "IS IT MAGIC?", desc: "Handle something through the evening and learn what it is.", ok: unknown.length > 0, reason: "Everything in the pack is already known.", source: "SRD 5.2.1 Identifying a Magic Item" },
    { k: "read-scroll", title: "READ A SCROLL", desc: "Find out what spell a scroll holds, and whether you could cast it.", ok: scrolls.length > 0, reason: "No scrolls in the pack.", source: "SRD 5.2.1 Spell Scroll" },
  ]
  if (classIs(me, "wizard")) {
    out.push({ k: "learn-scroll", title: "COPY INTO YOUR SPELLBOOK", desc: "2 hours and 50 gp of ink per spell level.", ok: scrolls.some((s) => s.spell?.classes.some((c) => /wizard/i.test(c))), reason: "No wizard spell on any scroll you carry.", source: "SRD 5.2.1 Wizard — Copying a Spell into the Book" })
  }
  out.push({ k: "decipher", title: "DECIPHER", desc: "Work through a book, a letter, an inscription.", ok: books.length > 0, reason: "Nothing to read in the pack. The DM can hand you a passage.", source: "SRD 5.2.1 Comprehend Languages / Intelligence checks" })
  return out.map((o) => (o.ok ? { ...o, reason: undefined } : o))
}

export interface StudyResult { ok: boolean; note: string; write?: Record<string, unknown>; check?: Check | null; flags?: string[] }

// Attune, identify and decipher already live in lib/camp (attune: one per rest,
// three at most; identifyItem: never reveals a curse; decipher: INT (Arcana)).
// The Study tiles call those directly — they are not repeated here.
export { attune, identifyItem, decipher } from "./camp"

/** SRD 5.2.1 Spell Scroll: readable only if the spell is on your class list. */
export function readScroll(me: StudySheet, item: StudyItem): StudyResult {
  if (item.kind !== "scroll" || !item.spell) return { ok: false, note: `${item.name} is not a spell scroll.` }
  const s = item.spell
  const mine = s.classes.some((c) => classIs(me, c.toLowerCase()))
  if (!mine) return { ok: true, note: `${me.name} unrolls ${item.name}. The script crawls and will not settle — not a spell of ${me.class ?? "their"} kind. Unintelligible.` }
  const top = Math.max(0, ...Object.keys(me.sheet_spellcasting?.slots ?? {}).map(Number))
  const hard = s.level > top
  return { ok: true, note: `${me.name} reads ${item.name}: ${s.name}, level ${s.level}. ${hard ? `Above anything ${me.name} can cast yet — reading it aloud takes a ${me.sheet_spellcasting?.ability ?? "spellcasting"} check, DC ${10 + s.level}.` : `${me.name} could cast it from the scroll.`}` }
}

/** SRD 5.2.1 Wizard: copy a wizard spell of a level you can prepare — 2 h and 50 gp per level. */
export function copyScroll(me: StudySheet, item: StudyItem, gp: number): StudyResult {
  if (!classIs(me, "wizard")) return { ok: false, note: "Only a wizard keeps a spellbook." }
  if (item.kind !== "scroll" || !item.spell) return { ok: false, note: `${item.name} is not a spell scroll.` }
  const s = item.spell
  if (!s.classes.some((c) => /wizard/i.test(c))) return { ok: false, note: `${s.name} is not a wizard spell.` }
  const top = Math.max(0, ...Object.keys(me.sheet_spellcasting?.slots ?? {}).map(Number))
  if (s.level > top) return { ok: false, note: `${s.name} is level ${s.level}; ${me.name} can prepare up to level ${top}.` }
  const cost = 50 * s.level
  if (gp < cost) return { ok: false, note: `Copying ${s.name} takes ${cost} gp of inks; ${me.name} has ${gp}.` }
  return { ok: true, note: `${me.name} copies ${s.name} into the spellbook: ${2 * s.level} hours, ${cost} gp of ink. The scroll is spent.`, write: { spellbook_add: s.name, gp_spent: cost, consume: item.id } }
}
