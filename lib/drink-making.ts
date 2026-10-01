// Making a drink at the bench (claude_Alchemy_Minigame.md §7, Sam's ruling
// that alchemy also makes beer, wine and liquor).
//
//   Beer    any brewer
//   Liquor  any brewer, needs a still (alchemists-still in the pack)
//   Wine    cleric only — "fruit or fungal must, and the blessing"
//
// What a drink is made from is on its catalogue row, `properties.drink.made_from`.
// An ingredient in that list must be PREPARED (extraction applies to drink too:
// a mash is ground bluecap, not a whole cap). Another drink in the list
// (communion wine is made from mushroom wine) is used as it is.
//
// No roll: the spec gives the drink classes, who makes them and what they
// need, and no check. Nothing here invents one. The spec's "days" for beer is
// NOT modelled — a drink is ready when made. Flagged for Sam in the doc.
import { isCleric } from "@/lib/alchemy-cleric"
import type { DrinkData } from "@/lib/inebriation"

export const STILL_SLUG = "alchemists-still"

export function needsStill(d: DrinkData): boolean {
  return (d.class === "liquor" && /still/i.test(d.maker ?? "")) || /needs a still/i.test(d.maker ?? "")
}

export function clericOnly(d: DrinkData): boolean {
  return d.class === "wine" || /cleric only/i.test(d.maker ?? "")
}

export interface MakeContext {
  character: { name: string; class?: string | null }
  /** slug → how many usable (prepared, for ingredients; plain, for drinks) */
  have: Record<string, number>
  hasStill: boolean
}

export function canMake(drinkName: string, d: DrinkData, ctx: MakeContext): { ok: true } | { ok: false; reason: string } {
  if (clericOnly(d) && !isCleric(ctx.character)) return { ok: false, reason: `${drinkName} is a cleric's work: it needs the blessing.` }
  if (needsStill(d) && !ctx.hasStill) return { ok: false, reason: `${drinkName} needs a still.` }
  const missing = (d.made_from ?? []).filter((s) => (ctx.have[s] ?? 0) < 1)
  if (missing.length) return { ok: false, reason: `Needs ${missing.join(", ")}${missing.length ? " (prepared)" : ""}.` }
  if (!(d.made_from ?? []).length) return { ok: false, reason: `Nobody has written down what ${drinkName} is made from.` }
  return { ok: true }
}
