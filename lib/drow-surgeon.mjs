// THE DROW SURGEON — the rules, pure, in one copy.
//
// Homebrew encounter for the Velkynvelve slave pen (Sam, 2026-10-25). Design of record: project doc
// claude/The_Drow_Surgeon_2026-10-25.md. When a prisoner ignores the guards' "step back" at the pen gate the guards
// do not start a fight: they shoot. One bolt kills a prisoner (Malachar's d8), then volleys at the one at the gate
// until they step away or drop; two prisoners drag them to a corner; Liana, a sullen drow surgeon, heals them and can
// be talked round for one of four favours.
//
// Plain JavaScript for the same reason as lib/rage.mjs: build_walk.py pastes this file into the painted map at its
// DROW_SURGEON placeholder (minus `export`), so the map, the server route (app/api/drow-surgeon) and
// lib/drow-surgeon.test.ts all read the SAME functions. Every name here starts with SURGEON_ or surgeon so the paste
// cannot collide with the page's own names.
//
// SOURCES
//   [SOURCED] the bolt: the live bestiary row `drow` (SRD 5.1 Drow) — Hand Crossbow, +4 to hit, 1d6+2 piercing, and
//             "the target must succeed on a DC 13 Constitution saving throw or be poisoned for 1 hour. If the saving
//             throw fails by 5 or more, the target is also unconscious while poisoned in this way."
//   [SOURCED] the potion: catalog `potion-of-healing`, SRD 5.1 — 2d4 + 2.
//   [SOURCED] Jorlan's grudge: OotA escape route "Traitor" — Jorlan is angry Ilvara cast him aside and offers to unlock
//             the door to embarrass her. Liana's word only hastens a book escape.
//   [SOURCED] Topsy and Turvy are off the victim table: wererats, immune to nonmagical piercing (SRD 5.1 lycanthrope).
//   [SAM]     the trigger, the instant kill, volleys until they step away or drop, the drag, Liana and her heal, the
//             one persuasion, the hidden d4 and its four favours; no formal combat at any point.
//   [SAM 2026-10-25, answering the doc] the d8 table as drawn; at 0 HP the prisoner is stable, no death saves; Lolth's
//             Tooth glows brighter the nearer the spiders; its venom puts the target to sleep and does no damage.
//   [CLAUDE]  Persuasion DC 15; one attempt; through a translator at disadvantage; Arcana DC 15; spider-sense 60 ft;
//             3 doses; who receives each favour; the Elvish words (an invented tongue — no canon drow-Elvish is used).

export const SURGEON_RULES = {
  bolt: { name: "Hand Crossbow", hit: 4, dmg: "1d6+2", type: "piercing", poisonDc: 13 },   // bestiary `drow`
  potion: { slug: "potion-of-healing", heal: "2d4+2" },                                     // SRD 5.1
  persuadeDc: 15,
  volleyMs: 4000,                                                                           // the map's pause between volleys (a round, shortened for the table)
}

// Malachar's d8: the eight prisoners a plain bolt can kill. `id` is the map's sprite id; `name` is the
// npc_encounters / characters name (canon identity is by name, AGENTS.md §8).
export const SURGEON_VICTIMS = [
  { d8: 1, id: "buppido", name: "Buppido" },
  { d8: 2, id: "eldeth", name: "Eldeth Feldrun" },
  { d8: 3, id: "jimjar", name: "Jimjar" },
  { d8: 4, id: "derendil", name: "Prince Derendil" },
  { d8: 5, id: "ront", name: "Ront" },
  { d8: 6, id: "sarith", name: "Sarith Kzekarit" },
  { d8: 7, id: "shuushar", name: "Shuushar the Awakened" },
  { d8: 8, id: "stool", name: "Stool" },
]

/** The rolled victim; if that one is already dead or gone, the next on the table, round the end. null when none is left. */
export function surgeonVictim(roll, goneIds = []) {
  const start = Math.min(8, Math.max(1, Math.floor(roll))) - 1
  for (let k = 0; k < SURGEON_VICTIMS.length; k++) {
    const v = SURGEON_VICTIMS[(start + k) % SURGEON_VICTIMS.length]
    if (!goneIds.includes(v.id)) return v
  }
  return null
}

/** The gate: Liana is understood by anyone who speaks Elvish. A blank language list is not a guess — it is "no". */
export function surgeonSpeaksElvish(languages) {
  const s = Array.isArray(languages) ? languages.join(", ") : String(languages ?? "")
  return /\belv(?:ish|en)\b/i.test(s)
}

/** Dice: "2d4+2", "1d6+2". `rng` returns [0,1). `crit` doubles the dice, not the modifier (SRD). */
export function surgeonRoll(expr, rng = Math.random, crit = false) {
  let total = 0
  const rolls = []
  for (const term of String(expr).replace(/\s+/g, "").match(/[+-]?[^+-]+/g) || []) {
    const sign = term[0] === "-" ? -1 : 1
    const t = term.replace(/^[+-]/, "")
    const m = t.match(/^(\d*)d(\d+)$/)
    if (m) {
      const n = (Number(m[1]) || 1) * (crit ? 2 : 1)
      for (let i = 0; i < n; i++) { const r = 1 + Math.floor(rng() * Number(m[2])); rolls.push(r); total += sign * r }
    } else total += sign * (Number(t) || 0)
  }
  return { total: Math.max(0, total), rolls }
}
export const surgeonD = (sides, rng = Math.random) => 1 + Math.floor(rng() * sides)

/**
 * One bolt at the prisoner. `t` = {ac, hp, conSave}. Returns what happened and the HP after.
 * A natural 20 hits and doubles the dice; a natural 1 misses (SRD). The poison save is only on a hit.
 * `down`: dropped to 0 HP or knocked out by the poison. Either way the prisoner is stable (Sam: no death saves).
 */
export function surgeonBolt(t, rng = Math.random) {
  const B = SURGEON_RULES.bolt
  const d20 = surgeonD(20, rng)
  const total = d20 + B.hit
  const hit = d20 === 20 || (d20 !== 1 && total >= t.ac)
  const out = { d20, total, hit, crit: d20 === 20, dmg: 0, save: null, poisoned: false, ko: false, hpAfter: t.hp, down: false }
  if (!hit) return out
  out.dmg = surgeonRoll(B.dmg, rng, out.crit).total
  out.hpAfter = Math.max(0, t.hp - out.dmg)
  const s = surgeonD(20, rng)
  const sTotal = s + (t.conSave || 0)
  out.save = { d20: s, total: sTotal, dc: B.poisonDc, ok: sTotal >= B.poisonDc }
  out.poisoned = !out.save.ok
  out.ko = !out.save.ok && B.poisonDc - sTotal >= 5
  out.down = out.hpAfter <= 0 || out.ko
  return out
}

/** A volley: one bolt per guard on post. The bolts stop the moment the prisoner drops — the drow are shooting property. */
export function surgeonVolley(t, guards, rng = Math.random) {
  const bolts = []
  let hp = t.hp, poisoned = false, ko = false
  for (let g = 0; g < Math.max(1, guards); g++) {
    const b = surgeonBolt({ ...t, hp }, rng)
    bolts.push(b)
    hp = b.hpAfter; poisoned = poisoned || b.poisoned; ko = ko || b.ko
    if (b.down) break
  }
  return { bolts, hpAfter: hp, poisoned, ko, down: hp <= 0 || ko }
}

/** Liana's potion: 2d4+2 from where they lie, never past their maximum. */
export function surgeonHeal(hp, hpMax, rng = Math.random) {
  const r = surgeonRoll(SURGEON_RULES.potion.heal, rng)
  const after = Math.min(hpMax, Math.max(0, hp) + r.total)
  return { rolls: r.rolls, amount: after - Math.max(0, hp), hpAfter: after }
}

/** The one try at talking her round: d20 + Persuasion, at disadvantage through a translator. */
export function surgeonPersuade(bonus, viaTranslator, rng = Math.random) {
  const a = surgeonD(20, rng)
  const b = viaTranslator ? surgeonD(20, rng) : null
  const d20 = b === null ? a : Math.min(a, b)
  const total = d20 + bonus
  return { rolls: b === null ? [a] : [a, b], d20, bonus, total, dc: SURGEON_RULES.persuadeDc, success: total >= SURGEON_RULES.persuadeDc }
}

// Malachar's hidden d4 on a success. `to`: who receives it — the one who talked her round, or the one she stitched
// (the diluted poison is for the downed prisoner to drink). `shown`: the name the inventory row carries, so a cursed
// blade reveals nothing until an Arcana check reads its sigils.
export const SURGEON_BOONS = {
  1: { kind: "item", slug: "drow-lockpick", to: "speaker", shown: "Drow lockpick",
       desc: "A thin pick of black steel, filed for drow locks. Counts as thieves' tools for picking a lock; snaps on a natural 1." },
  2: { kind: "item", slug: "diluted-drow-poison", to: "downed", shown: "Diluted drow poison",
       desc: "A stoppered vial, watered down. Drunk, it brings a sleep so deep the pulse cannot be found, for up to an hour. Taking damage wakes the drinker." },
  3: { kind: "jorlan" },
  4: { kind: "item", slug: "lolths-tooth", to: "speaker", shown: "Drow ritual dagger",
       desc: "A drow ritual dagger, its blade cut with spider sigils, a reservoir in the hilt. Liana says that if it is ever drawn, the priestess will know." },
}
export function surgeonBoon(d4) { return SURGEON_BOONS[Math.min(4, Math.max(1, Math.floor(d4)))] }

// LIANA'S LINES. She speaks only Elvish to slaves. `en` is shown to whoever understands it (and to the DM); the audio
// is ALWAYS `elv`, spoken in her ElevenLabs voice, so the table hears a foreign tongue. The words are invented for
// this game — not Tolkien's, not any published drow lexicon — and fixed per line so a replay sounds the same.
export const SURGEON_LINES = {
  arrive:   { en: "Move. Let me see it.", elv: "Vaeth. Shan'ri vel osse." },
  dead:     { en: "That one won't need me. Lucky. I hate stitching the ones who keep screaming.", elv: "Ilsa nae'threm dossa. Velun. Iss khaal surrith nae ulvreth kaessa." },
  working:  { en: "Hold still. The bolt went in clean. Clean is a kindness down here. Don't waste it.", elv: "Thal'veri. Ressa illun sorrath. Illun ve maeloth draeth. Nae shuvra." },
  guards:   { en: "Take that one over the bridge. Into the falls. And scrub the stones before the Mistress sees what you did to her property.", elv: "Thesra ilsa vel'kauth. Orra shael'ven. Ul draethi ossan, ilvae Maethra shan dessa." },
  brushOff: { en: "I mend what she breaks. I don't listen to it.", elv: "Iss vaelun ka'vessar. Nae iss vethra." },
  refuse:   { en: "No. I was never here.", elv: "Nae. Iss zhessa nae'thal." },
  offer1:   { en: "Here. Black steel, filed thin. It knows our locks. Break it and you are on your own.", elv: "Vaen. Durrath ossk, shiv'ri. Ka draethel nae'sorr. Vessa, ul eth valun." },
  offer2:   { en: "Drink this when you're ready to die. You won't. Not quite. They'll throw you over the falls, and the webs will catch you.", elv: "Shael ilsa, dossa'reth. Nae. Nae vaen. Ka thesra vel'shael, ul ressath ka vurren." },
  offer3:   { en: "Jorlan hates her more than you do. I will tell him there are slaves who could embarrass her.", elv: "Jorlan khaal Maethra osse ul'ka. Iss vethrel ka draeth sorrun Maethra'ss." },
  offer4:   { en: "Ilvara's. Don't draw it. If you ever do, she will know where you are.", elv: "Ilvara'ss. Nae shuvren. Ka'ul vessa, Maethra shan ul'vel." },
}

// ---------------------------------------------------------------------------------------------------------------
// LOLTH'S TOOTH on the map (catalog `lolths-tooth`; Sam's rulings 2026-10-25). The blade itself is a +1 dagger and
// rides the map's ordinary weapon code (attackFromItem reads `bonus`); what is HERE is what only the Tooth does.
//   [SAM]    venom: puts the target to sleep, no damage of its own · glows brighter the nearer the spiders, and the
//            wielder's player says so in their own voice · drawing it calls to Ilvara until a Remove Curse
//   [CLAUDE] DC 13 CON (the catalog's drow-poison DC); 3 doses; spider-sense 60 ft; the three glow steps below;
//            the venom is released automatically on a hit while "armed", and can be held back from the pack
export const SURGEON_TOOTH = { doses: 3, dc: 13, senseFt: 60, steps: [0.001, 0.45, 0.8] }

/** How hard it glows, 0..1, for the nearest spider `ft` away. Nothing past the range; brightest at arm's length. */
export function surgeonToothGlow(ft) {
  if (!Number.isFinite(ft) || ft >= SURGEON_TOOTH.senseFt) return 0
  return Math.min(1, Math.max(0.08, 1 - Math.max(0, ft - 5) / (SURGEON_TOOTH.senseFt - 5)))
}
/** 0 dark · 1 a faint glow · 2 burning brighter · 3 blazing — the steps the wielder's player is prompted to say aloud. */
export function surgeonToothStep(glow) {
  const s = SURGEON_TOOTH.steps
  return glow >= s[2] ? 3 : glow >= s[1] ? 2 : glow >= s[0] ? 1 : 0
}
/** The venom on a hit: DC 13 CON or asleep (unconscious) for an hour, waking if hurt or shaken. No damage. */
export function surgeonToothVenom(conSave, immune, rng = Math.random) {
  if (immune) return { immune: true, asleep: false }
  const d20 = surgeonD(20, rng), total = d20 + (conSave || 0)
  return { immune: false, d20, total, dc: SURGEON_TOOTH.dc, asleep: total < SURGEON_TOOTH.dc }
}
