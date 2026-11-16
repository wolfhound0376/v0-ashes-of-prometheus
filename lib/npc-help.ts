/**
 * NPC HELP ON CHECKS (Sam, 2026-11-10): "Jimjar MAY (depending on his disposition and gravity with the characters)
 * during certain skill checks on the map offer to help (like picking a lock, may participate in identifying traps
 * and addressing them if the team has trap disarm kits)."
 *
 * The rule, pure, so it can be tested without the network (lib/npc-help.test.ts). /api/npc-help applies it with the
 * pair's row in character_relationships (the same standing the NPC asks use, lib/npc-asks.ts).
 *
 * WHAT HELP IS. SRD 5.1, "Working Together" / the Help action: the helper lends a hand and the one making the check
 * has advantage. The map rolls the hero's check with advantage; nothing else changes, and the DC stays with the DM.
 * A helper can only help with a task they could attempt alone, which is why the list is per NPC.
 *
 * WHO. Jimjar first (Sam named him: the deep gnome gambler is the one prisoner with a thief's hands). Then the company
 * (Sam, 2026-11-15, "go" on the camp draft, claude/Camp_Company_Agendas_Hunger_2026-11-15.md): each helps with what
 * the campaign notes say they are good at (our OotA guide p.5 stat sheet):
 *   eyes  (Perception)          Eldeth: a scout, advantage on Perception. Sarith: Perception, knows the Underdark well.
 *                               Topsy, Turvy: a keen sense of smell. Shuushar: senses any creature within 30 ft.
 *   might (Athletics, Strength) Ront, Derendil (Derendil climbs, too).
 *   words (Persuasion, Insight) Stool: rapport spores carry meaning across any language.
 * Agendas set the limits: Shuushar, the pacifist, helps with nothing violent; Buppido is no helper at all (his "help"
 * on a ledge is lib/buppido-rises.mjs). The lines are drafts in each voice, Sam's to rewrite.
 */
import { warmth, WARM, REGARD, SOUR, type Standing } from "@/lib/npc-asks"

export type HelpKind = "lock" | "trap-find" | "trap-disarm" | "eyes" | "might" | "words"
export const HELP_KINDS: HelpKind[] = ["lock", "trap-find", "trap-disarm", "eyes", "might", "words"]

export interface Helper { kinds: HelpKind[] }
export const HELPERS: Record<string, Helper> = {
  jimjar: { kinds: ["lock", "trap-find", "trap-disarm"] },
  eldeth: { kinds: ["eyes"] },
  sarith: { kinds: ["eyes"] },
  topsy: { kinds: ["eyes"] },
  turvy: { kinds: ["eyes"] },
  shuushar: { kinds: ["eyes"] },
  ront: { kinds: ["might"] },
  derendil: { kinds: ["might"] },
  stool: { kinds: ["words"] },
}
/** The helper's key from any of their names ("Prince Derendil", "Shuushar the Awakened", "Eldeth Feldrun"). */
export const helperKey = (npcName: string): string | null =>
  String(npcName || "").toLowerCase().split(/[^a-z]+/).find((w) => w in HELPERS) ?? null
export const helperFor = (npcName: string): Helper | null => {
  const k = helperKey(npcName)
  return k ? HELPERS[k] : null
}

/**
 * How likely he is to step in, from how he stands with this hero. "MAY": never certain, and never once he has
 * soured on you. A stranger still gets the odd offer (he is a gambler and a lock is a wager).
 */
export function helpChance(standing: Standing): number {
  const w = warmth(standing)
  if (w <= SOUR) return 0
  if (w >= WARM) return 0.85
  if (w >= REGARD) return 0.6
  return 0.25
}

/** Does this helper step in for this kind of check? `roll` is 0..1 (Math.random() in the route). */
export function offersHelp(helper: Helper | null, kind: HelpKind, standing: Standing, roll: number): boolean {
  if (!helper || !helper.kinds.includes(kind)) return false
  return roll < helpChance(standing)
}

const LINES: Partial<Record<HelpKind, string[]>> & Record<"lock" | "trap-find" | "trap-disarm", string[]> = {
  "lock": ["Budge up, {you}. Two picks beat one, and I'll take that bet.", "Hold the tension, {you}. I'll feel for the pins.", "Five gold says we have it open in ten breaths, {you}."],
  "trap-find": ["Wait, {you}. Let me look first. I've lost fingers to less.", "Easy, {you}. Somebody clever built this. Let's see how clever."],
  "trap-disarm": ["Steady hands, {you}. I'll hold the spring, you work the tools.", "Don't breathe on it, {you}. I'll wedge it. Go."],
}

/** Each companion's own words for the help they give. Drafts, not book text: Sam's to rewrite. */
const NPC_LINES: Record<string, Partial<Record<HelpKind, string[]>>> = {
  eldeth: { eyes: ["Let me look, {you}. Dwarven eyes, and I've stood watch on worse walls.", "Wait, {you}. There. See it?"] },
  sarith: { eyes: ["I know this kind of dark, {you}. Look where I look.", "Down there. Left of the stone. Do you see it, {you}?"] },
  topsy: { eyes: ["Something down there, {you}. Don't ask how I know.", "Hush, {you}. Let me… get a sense of it."] },
  turvy: { eyes: ["Mm. There. {you}. There.", "Smell that, {you}? No? Huh."] },
  shuushar: { eyes: ["Be still, {you}. The water tells me what moves near us.", "There is something there, {you}. I feel it, as the deep feels a stone."] },
  ront: { might: ["Out of the way, {you}. Ront does it.", "Weak arms, {you}. Watch Ront."] },
  derendil: { might: ["Allow me, {you}. A prince does not shirk a burden.", "Together, {you}. On my word. Now!"] },
  stool: { words: ["(A soft haze of spores. You feel Stool's meaning arrive before the words, {you}.)"] },
}

/** Their words: Jimjar's wager voice for his three, each companion's own for theirs. */
export function helpLine(kind: HelpKind, address: string, pick = 0, npcName = "jimjar"): string {
  const own = NPC_LINES[helperKey(npcName) ?? ""]?.[kind]
  const pool = own ?? LINES[kind] ?? LINES.lock
  const line = pool[Math.min(pool.length - 1, Math.floor(Math.max(0, pick) * pool.length))]
  return line.replace("{you}", address)
}
