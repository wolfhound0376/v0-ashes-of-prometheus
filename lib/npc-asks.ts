// ============================================================================
// NPC ASKS — a prisoner asks you for something you are carrying.
// ============================================================================
//
// Sam, 2026-11-10: "NPCs may from time to time based on their personality ask for items (food if they
// know you have it, weapons if they can use it, gold if they feel they've earned it, etc). This effects
// the players gravity to them accordingly. They should be limited to bubbles and not trigger a dialogue.
// If it is of something of great import then an exclamation on them will trigger a dialogue if parley is
// accepted. Bubbles should address the character 'Hey shorty, or hey fifi, or hey dwarf, or Bard, or
// Scott' depending on their gravity with us and their personality."
//
// This file is the rules of that, with no database in it (tests: lib/npc-asks.test.ts):
//
//   who asks for what      ASKERS: one row per prisoner, read off the project's own one-line summaries
//                          (lib/world-ai/campaigns.ts) and OotA ch.1. Shuushar is a pacifist and never
//                          asks for a weapon; Stool does not ask at all.
//   which ask wins         chooseAsk: the map offers what the hero carries that this NPC has SEEN; the
//                          rules drop what this NPC would never ask for, and gold unless they feel owed.
//   what they call you     addressFor: a name only once they know it AND are not sour on you; your trade
//                          once they think something of you; otherwise what they can see.
//   the bubble             askLine / replyLine: written lines by temper, never generated at runtime.
//   what it does           askOutcome: the gravity and the relationship deltas of giving, refusing or
//                          ignoring. Good deeds land at 65% (Sam's gravity design: "palliation is harder
//                          than aggravation, positive gravity lands at 60-70% weight").
//
// EVERY NUMBER HERE IS CLAUDE'S, not Sam's: the warmth thresholds, the debt needed before gold is asked
// for, the gravity of each outcome, the deltas. They are in one place so Sam can change them.

export type AskKind = "food" | "weapon" | "gold"
export type Temper = "bully" | "gruff" | "wheedling" | "unctuous" | "nervous" | "curt" | "courtly" | "serene"
export type Outcome = "gave" | "refused" | "ignored"

export interface Asker { temper: Temper; wants: AskKind[] }

/** Keyed by the first word of the name, lower case ("prince" is Derendil's title, so he is keyed twice). */
export const ASKERS: Record<string, Asker> = {
  ront:     { temper: "bully",     wants: ["food", "weapon", "gold"] },   // "a cowardly orc bully"
  eldeth:   { temper: "gruff",     wants: ["weapon", "food"] },           // "a shield dwarf scout; loyal"
  jimjar:   { temper: "wheedling", wants: ["gold", "food"] },             // "a deep gnome gambler"
  buppido:  { temper: "unctuous",  wants: ["weapon", "food"] },           // "a derro", smiling too much
  topsy:    { temper: "nervous",   wants: ["food"] },                     // "a deep gnome twin"
  turvy:    { temper: "nervous",   wants: ["food"] },
  sarith:   { temper: "curt",      wants: ["weapon", "food"] },           // "a drow prisoner", hollow-eyed and silent
  derendil: { temper: "courtly",   wants: ["food"] },                     // believes he is a cursed elf prince; fights with his claws
  prince:   { temper: "courtly",   wants: ["food"] },
  shuushar: { temper: "serene",    wants: ["food"] },                     // "a pacifist kuo-toa": never a weapon
}

export const askerFor = (npcName: string): Asker | null =>
  ASKERS[String(npcName || "").trim().split(/\s+/)[0]?.toLowerCase() ?? ""] ?? null

// ---------------------------------------------------------------------------
// The relationship, as one number for "how warm" and the debt on its own.

export interface Standing { trust: number; fear: number; respect: number; affection: number; debt: number; resentment: number }
export const NO_STANDING: Standing = { trust: 0, fear: 0, respect: 0, affection: 0, debt: 0, resentment: 0 }

/** How well disposed the NPC is. Fear is left out: a frightened NPC is not a friendly one. */
export const warmth = (s: Standing): number => s.affection + s.trust + s.respect - s.resentment

/** positive debt = "you owe me" (the table's own convention). This much before they ask for coin. */
export const GOLD_DEBT = 10
export const WARM = 15      // first-name terms, even from a bully
export const REGARD = 5     // enough regard to call you by your trade
export const SOUR = -10     // they have stopped using your name

// ---------------------------------------------------------------------------
// What they call you.

export interface Hero { name: string; species?: string | null; cls?: string | null }

const SMALL = /halfling|gnome|svirfneblin|kobold|goblin/i
const firstName = (name: string) => name.trim().split(/\s+/)[0] || "you"
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** What the NPC can see: "shorty" for the small folk from a rude mouth, otherwise the species. */
function byLooks(hero: Hero, rude: boolean): string {
  const sp = String(hero.species || "").trim().toLowerCase()
  if (rude && SMALL.test(sp)) return "shorty"
  return sp || "you"
}

/**
 * "Hey shorty / hey Fifi / hey dwarf / Bard / Scott."
 *
 *   soured on you            what they can see, name or no name
 *   knows your name          the name, unless they are a bully who is not yet warm to you
 *   thinks something of you  your trade ("Bard")
 *   a stranger               what they can see ("dwarf"; "shorty" from a bully to the small folk)
 */
export function addressFor(a: { temper: Temper; knowsName: boolean; standing: Standing; hero: Hero }): string {
  const w = warmth(a.standing), rude = a.temper === "bully"
  if (w <= SOUR) return byLooks(a.hero, true)
  if (a.knowsName && (!rude || w >= WARM)) return firstName(a.hero.name)
  if (w >= REGARD && a.hero.cls) return cap(String(a.hero.cls).trim().toLowerCase())
  return byLooks(a.hero, rude)
}

// ---------------------------------------------------------------------------
// Which ask, if any.

export interface Offer { kind: AskKind; itemName: string; rarity?: string | null; opens?: boolean }

const IMPORTANT_RARITY = new Set(["rare", "very_rare", "legendary", "artifact"])

/** "Something of great import": a rare thing or better, or a thing that opens something (the pen key). */
export const isImportant = (o: Offer): boolean => !!o.opens || IMPORTANT_RARITY.has(String(o.rarity || "").toLowerCase())

/**
 * The first thing on the map's list this NPC would actually ask for. The list arrives in the NPC's own
 * order of wanting only by accident, so it is re-sorted by `wants`. Gold needs a debt: "if they feel
 * they've earned it".
 */
export function chooseAsk(asker: Asker, standing: Standing, offers: Offer[]): Offer | null {
  const ok = offers.filter((o) => o && o.itemName && asker.wants.includes(o.kind) && (o.kind !== "gold" || standing.debt >= GOLD_DEBT))
  if (!ok.length) return null
  // a soured NPC does not ask favours of you; they still demand what they are owed
  if (warmth(standing) <= SOUR) return ok.find((o) => o.kind === "gold") ?? null
  return ok.sort((a, b) => asker.wants.indexOf(a.kind) - asker.wants.indexOf(b.kind))[0]
}

// ---------------------------------------------------------------------------
// The bubble. Written, not generated: {a} = the address, {i} = the item, lower case.

const LINES: Record<Temper, Record<AskKind, string[]>> = {
  bully: {
    food:   ["Hey {a}. That {i}. Hand it over.", "Oi, {a}. You're not eating all that {i} yourself."],
    weapon: ["Hey {a}. Give me the {i}. I hit harder than you.", "{A}. That {i} is wasted on you."],
    gold:   ["Hey {a}. I bled for you. Pay up.", "{A}. You owe me. Coin."],
  },
  gruff: {
    food:   ["{A}. If that {i} is going spare, I'd not say no.", "Hey {a}, split that {i} with me?"],
    weapon: ["{A}. Put that {i} in my hand and I'll put it to use.", "Hey {a}. I fight better armed. The {i}?"],
    gold:   ["{A}. I've earned a share. You know I have.", "Hey {a}. A fair cut, that's all I ask."],
  },
  wheedling: {
    food:   ["Hey {a}! Bet you that {i} I can guess your next move. No? Just the {i}, then?", "{A}, friend! A bite of that {i} for old Jimjar?"],
    weapon: ["{A}! Lend us the {i}?", "Hey {a}, I'd take good care of that {i}."],
    gold:   ["Hey {a}! About what you owe me. I'm keeping count, you know.", "{A}! Settle up? Double or nothing if you'd rather."],
  },
  unctuous: {
    food:   ["{A}, dear friend. A little of that {i}, for Buppido?", "Hey {a}. Such a nice {i}. Share?"],
    weapon: ["{A}, friend. That {i} would be so much safer with me.", "Hey {a}. Let Buppido hold the {i}. Just hold it."],
    gold:   ["{A}, friend. A small token, for all my help?", "Hey {a}. Buppido has been so useful. Yes?"],
  },
  nervous: {
    food:   ["H-hey, {a}. Could we have some of that {i}?", "{A}? The {i}. Just a little. Please."],
    weapon: ["{A}? Could I carry the {i}?", "Hey {a}. I'd feel safer with that {i}."],
    gold:   ["{A}? You said you'd pay us back.", "Hey {a}. We did help. A coin?"],
  },
  curt: {
    food:   ["{A}. The {i}. Give me some.", "Hey {a}. Food."],
    weapon: ["{A}. The {i}. I know how to use it.", "Hey {a}. I need a blade. That {i}."],
    gold:   ["{A}. You owe me.", "Hey {a}. My share."],
  },
  courtly: {
    food:   ["{A}, might I trouble you for a little of that {i}?", "Good {a}, a prince does not beg. But that {i}?"],
    weapon: ["{A}, I would bear that {i} in your defence.", "Good {a}, entrust me with the {i}."],
    gold:   ["{A}, I believe a debt stands between us.", "Good {a}, honour asks that we settle accounts."],
  },
  serene: {
    food:   ["{A}. If the {i} can be spared, I would be grateful.", "Friend {a}. A little of the {i}, if you will."],
    weapon: ["{A}. No. I will not ask for that.", "{A}."],   // never reached: Shuushar does not want weapons
    gold:   ["{A}. I ask only what is fair.", "Friend {a}. What was promised."],
  },
}

const REPLIES: Record<Temper, Record<Outcome, string>> = {
  bully:     { gave: "Hm. Good.", refused: "I'll remember that.", ignored: "(Ront spits and turns away)" },
  gruff:     { gave: "I'll not forget it.", refused: "Suit yourself.", ignored: "(a short, unimpressed grunt)" },
  wheedling: { gave: "Ha! Knew you were good for it.", refused: "Worth a try!", ignored: "(shrugs, already working out new odds)" },
  unctuous:  { gave: "So kind. So very kind.", refused: "Of course. Of course.", ignored: "(the smile stays; the eyes do not)" },
  nervous:   { gave: "Th-thank you.", refused: "Sorry. Sorry.", ignored: "(looks at the floor)" },
  curt:      { gave: "…Good.", refused: "As I thought.", ignored: "(looks away)" },
  courtly:   { gave: "You have a prince's gratitude.", refused: "As you wish.", ignored: "(draws himself up, wounded)" },
  serene:    { gave: "Thank you, friend.", refused: "Then it is not needed.", ignored: "(returns, untroubled, to his stillness)" },
}

const fill = (t: string, address: string, item: string) =>
  t.replace(/\{A\}/g, cap(address)).replace(/\{a\}/g, address).replace(/\{i\}/g, item.toLowerCase())

/** `pick` chooses between the written variants (0..1, the caller's random number). */
export function askLine(temper: Temper, kind: AskKind, address: string, itemName: string, pick = 0): string {
  const set = LINES[temper][kind]
  return fill(set[Math.min(set.length - 1, Math.floor(Math.max(0, pick) * set.length))], address, itemName)
}
export const replyLine = (temper: Temper, outcome: Outcome): string => REPLIES[temper][outcome]

// ---------------------------------------------------------------------------
// What it does to how they feel about you.

export const PALLIATION = 0.65

type Deltas = Partial<Record<keyof Standing, number>>

const RAW: Record<AskKind, Record<Outcome, { gravity: number; deltas: Deltas }>> = {
  food: {
    gave:    { gravity: 10, deltas: { affection: 4, trust: 3, debt: -3 } },
    refused: { gravity: 5,  deltas: { resentment: 2, affection: -1 } },
    ignored: { gravity: 3,  deltas: { resentment: 1 } },
  },
  weapon: {
    gave:    { gravity: 25, deltas: { trust: 8, respect: 5, debt: -8 } },
    refused: { gravity: 8,  deltas: { resentment: 3, trust: -2 } },
    ignored: { gravity: 4,  deltas: { resentment: 2 } },
  },
  gold: {   // they felt owed: paying settles it, not paying is a debt dodged
    gave:    { gravity: 15, deltas: { trust: 4, affection: 2, debt: -10 } },
    refused: { gravity: 12, deltas: { resentment: 5, trust: -3 } },
    ignored: { gravity: 8,  deltas: { resentment: 3, trust: -1 } },
  },
}

/** A good thing is one that makes them warmer or shrinks what you owe. Those land at PALLIATION. */
const isGood = (dim: keyof Standing, v: number) => (dim === "resentment" || dim === "fear" || dim === "debt" ? v < 0 : v > 0)

/** The gravity and the deltas AFTER weighting — what the ledger records and the row is moved by. */
export function askOutcome(kind: AskKind, outcome: Outcome): { gravity: number; deltas: Deltas } {
  const raw = RAW[kind][outcome], deltas: Deltas = {}
  for (const [dim, v] of Object.entries(raw.deltas) as [keyof Standing, number][]) {
    const w = isGood(dim, v) ? Math.sign(v) * Math.max(1, Math.round(Math.abs(v) * PALLIATION)) : v
    deltas[dim] = w
  }
  return { gravity: raw.gravity, deltas }
}

/** Fighting beside the party: the NPC feels the party owes them. This is what makes a gold ask possible. */
export const FOUGHT_BESIDE = { gravity: 20, deltas: { debt: 6, respect: 1 } as Deltas }

const clamp = (n: number) => Math.max(-100, Math.min(100, Math.round(n)))

export function applyDeltas(s: Standing, d: Deltas): Standing {
  const out = { ...s }
  for (const [dim, v] of Object.entries(d) as [keyof Standing, number][]) out[dim] = clamp((out[dim] ?? 0) + v)
  return out
}

/** One line for the ledger, in the fiction's own words. */
export function askNote(npc: string, hero: string, kind: AskKind, outcome: Outcome, itemName: string): string {
  const thing = kind === "gold" ? "coin they felt owed" : `the ${itemName.toLowerCase()}`
  if (outcome === "gave") return `${npc} asked ${hero} for ${thing} and was given it.`
  if (outcome === "refused") return `${npc} asked ${hero} for ${thing} and was told no.`
  return `${npc} asked ${hero} for ${thing} and was ignored.`
}

/** What the opener is told when the ask is too big for a bubble and becomes a word at the "!". */
export function importantSituation(npc: string, hero: string, kind: AskKind, itemName: string): string {
  return `${npc} has seen that ${hero} carries the ${itemName} and wants it badly enough to ask for it outright${kind === "weapon" ? ", to use" : ""}. ${npc} opens by asking for it.`
}
