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
 * WHO. Only Jimjar so far: Sam named him, and the deep gnome gambler is the one prisoner with a thief's hands. The
 * table is the place to add another.
 */
import { warmth, WARM, REGARD, SOUR, type Standing } from "@/lib/npc-asks"

export type HelpKind = "lock" | "trap-find" | "trap-disarm"
export const HELP_KINDS: HelpKind[] = ["lock", "trap-find", "trap-disarm"]

export interface Helper { kinds: HelpKind[] }
export const HELPERS: Record<string, Helper> = {
  jimjar: { kinds: ["lock", "trap-find", "trap-disarm"] },
}
export const helperFor = (npcName: string): Helper | null =>
  HELPERS[String(npcName || "").trim().split(/\s+/)[0]?.toLowerCase() ?? ""] ?? null

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

const LINES: Record<HelpKind, string[]> = {
  "lock": ["Budge up, {you}. Two picks beat one, and I'll take that bet.", "Hold the tension, {you}. I'll feel for the pins.", "Five gold says we have it open in ten breaths, {you}."],
  "trap-find": ["Wait, {you}. Let me look first. I've lost fingers to less.", "Easy, {you}. Somebody clever built this. Let's see how clever."],
  "trap-disarm": ["Steady hands, {you}. I'll hold the spring, you work the tools.", "Don't breathe on it, {you}. I'll wedge it. Go."],
}

/** His words. Drafts in Jimjar's voice (the wagering deep gnome), not book text: Sam's to rewrite. */
export function helpLine(kind: HelpKind, address: string, pick = 0): string {
  const pool = LINES[kind]
  const line = pool[Math.min(pool.length - 1, Math.floor(Math.max(0, pick) * pool.length))]
  return line.replace("{you}", address)
}
