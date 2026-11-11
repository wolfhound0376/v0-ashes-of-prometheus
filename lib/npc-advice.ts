/**
 * WHERE TO GO: the prisoners' advice (Sam, 2026-11-10): "offering advice on where to go in the underdark. In fact, any
 * underdark creature NPCs may offer advice if they are inclined based on their personality and gravity/motives."
 *
 * WHAT each of them knows is not invented here: it is the book's own table, already in lib/travel/march.ts (GUIDES,
 * "Out of the Abyss, ch.2 p.22, Where to Go?"). Someone the book says "can't offer any useful directions" offers none.
 * WHETHER they speak up is this file: how they stand with the hero (character_relationships, as the NPC asks use)
 * bent by their own motive. Pure functions, tested in lib/npc-advice.test.ts; /api/npc-advice applies them.
 *
 * NOBODY LIES ABOUT THE ROAD. Buppido's direction is true; what he wants at the end of it is the book's and is not
 * said. Sarith is "the most deceptive" in the book, which here only makes him slow to speak.
 */
import { GUIDES, type Guide } from "@/lib/travel/march"
import { warmth, WARM, REGARD, SOUR, type Standing } from "@/lib/npc-asks"

export interface Adviser {
  key: string
  /** added to the chance their standing gives: a motive of their own to be heard (or to keep quiet) */
  lean: number
  /** speaks even to a hero they have soured on (the motive outweighs the grudge) */
  regardless?: boolean
  lines: string[]
}

/** Drafts in each one's voice, not book text: Sam's to rewrite. `{you}` is how they address the hero. */
export const ADVISERS: readonly Adviser[] = [
  { key: "jimjar", lean: 0, lines: [
    "North, {you}. Blingdenstone. I know that road, and my people pay their debts.",
    "Ten gold says the north tunnel gets us to Blingdenstone alive, {you}. I know the way.",
  ] },
  { key: "buppido", lean: 0.4, regardless: true, lines: [
    "Gracklstugh, friend {you}! The duergar city. Buppido knows the way, oh yes. Very safe with Buppido.",
    "Come to Gracklstugh, {you}. Such forges! Buppido will walk in front. Or behind. As you like.",
  ] },
  { key: "shuushar", lean: 0.1, lines: [
    "The Darklake is near, {you}. Bring me within sight of its water and I can find any shore of it.",
    "All water here runs to the Darklake, {you}. Once we reach it, I will not lose the way.",
  ] },
  { key: "sarith", lean: -0.25, lines: [
    "I know every road on this side of the Darklake, {you}. Pick one. I will keep us on it.",
    "You will be lost in a day without someone who knows these tunnels, {you}. I do.",
  ] },
  { key: "eldeth", lean: 0.1, lines: [
    "I don't know these tunnels, {you}, and I won't pretend to. But I can read stone. Let me walk beside whoever leads.",
    "No dwarf I know has mapped this far down, {you}. I'll help your pathfinder, not replace them.",
  ] },
]

const first = (npcName: string) => String(npcName || "").trim().split(/\s+/)[0]?.toLowerCase() ?? ""
export const adviserFor = (npcName: string): Adviser | null => ADVISERS.find((a) => a.key === first(npcName)) ?? null
export const guideFor = (npcName: string): Guide | null => GUIDES.find((g) => g.key === first(npcName)) ?? null

/** What the book says they bring to the march, for the log beside their line. */
export function adviceNote(g: Guide | null): string | null {
  if (!g) return null
  if (g.familiarWith === "any") return "knows the way to any region on the map"
  if (g.familiarWith !== "none") return `knows the way: ${g.familiarWith}`
  if (g.survivalBonus) return `cannot navigate here, but helps the navigator (+${g.survivalBonus} Survival)`
  return null
}

/** How likely they are to speak up to this hero. Never certain. */
export function adviceChance(a: Adviser, standing: Standing): number {
  const w = warmth(standing)
  if (w <= SOUR && !a.regardless) return 0
  const base = w >= WARM ? 0.8 : w >= REGARD ? 0.55 : w <= SOUR ? 0.2 : 0.3
  return Math.max(0, Math.min(0.95, base + a.lean))
}

export function adviceLine(a: Adviser, address: string, pick = 0): string {
  return a.lines[Math.min(a.lines.length - 1, Math.floor(Math.max(0, pick) * a.lines.length))].replace("{you}", address)
}

/** At most this many voices at once: a crossroads, not a committee. */
export const MAX_ADVICE = 2
