// SPLIT PARTY, part 4 (Sam, 2026-10-27: "lets make it so we can split across plates if needed"; the rules approved
// "yes; looks good", then "go"): Malachar hears where the SPEAKER is, not just where "the party" is.
//
// The walk keeps one shared record (walk_world) with every hero's plate in it (heroes[slug].plate, owner cid). The
// party's situation row (party_situation) is the party's: one place. While the party stands together the two agree
// and nothing here changes a turn. Once the party is split, the turn of a hero who is not where the row says is
// told the truth: where THEY stand, who is with them, who is elsewhere, and that only what they can see and hear
// may be narrated. No schema change: both tables already exist; the plate names come from the walk's own SPEC
// (lib/walk-plates.json, written by scripts/velkynvelve-walk/build_walk.py).
//
// Pure: no database. The chat route reads the two rows and calls in.

import PLATES from "./walk-plates.json"
import type { Situation } from "./situation"

export type PlateInfo = { id: string; slug: string; name: string }
export type HeroRecord = { plate?: string | number | null; cid?: string | null }

const PEN_SLUG = "node-11-slave-pen"

export function plateInfo(id: string | number | null | undefined): PlateInfo | null {
  if (id == null) return null
  const key = String(id).toLowerCase()
  const p = (PLATES as Record<string, { slug?: string | null; name?: string | null }>)[key]
  return p && p.slug ? { id: key, slug: p.slug, name: p.name || p.slug } : null
}

export type SplitView = {
  /** where the speaker stands */
  here: PlateInfo
  /** the speaker and the other heroes on the same plate, by name */
  withSpeaker: string[]
  /** the heroes on other plates */
  elsewhere: { name: string; plate: PlateInfo }[]
}

/**
 * The party as the speaker sees it, or null when there is nothing to say: the party is all on one plate, the
 * speaker has no hero on the map, or their plate is not one the walk knows.
 *   heroes  walk_world.heroes (slug -> record with plate and owner cid)
 *   names   characters.id -> display name (a hero with no owner is named by its slug)
 */
export function splitForSpeaker(heroes: Record<string, HeroRecord> | null | undefined, names: Record<string, string>, speakerId: string | null | undefined): SplitView | null {
  if (!heroes || !speakerId) return null
  const placed = Object.entries(heroes)
    .map(([slug, h]) => ({ slug, cid: h?.cid ?? null, plate: plateInfo(h?.plate ?? null) }))
    .filter((h): h is { slug: string; cid: string | null; plate: PlateInfo } => !!h.plate)
  if (new Set(placed.map((h) => h.plate.id)).size < 2) return null
  const me = placed.find((h) => h.cid === speakerId)
  if (!me) return null
  const nameOf = (h: { slug: string; cid: string | null }) => (h.cid && names[h.cid]) || h.slug.charAt(0).toUpperCase() + h.slug.slice(1)
  return {
    here: me.plate,
    withSpeaker: placed.filter((h) => h.plate.id === me.plate.id).map(nameOf),
    elsewhere: placed.filter((h) => h.plate.id !== me.plate.id).map((h) => ({ name: nameOf(h), plate: h.plate })),
  }
}

/**
 * The party's situation row, retold for the speaker: their plate, who is present with them, and the stance there.
 * A captive party's hero who has stepped out of the pen is escaping (the step-outside ruling, Sam 2026-10-24);
 * one standing in the pen stays captive only while the party's row is captive.
 */
export function situationForSpeaker(s: Situation, view: SplitView): Situation {
  const inPen = view.here.slug === PEN_SLUG
  const stance = s.stance === "captive" && !inPen ? "escaping" : s.stance
  return { ...s, sub_location: view.here.slug, sub_label: view.here.name, party_present: view.withSpeaker, stance }
}

/** The block Malachar reads under the situation: the party is split, and what that means for this turn. */
export function splitNote(view: SplitView, speakerName: string): string {
  const away = view.elsewhere.map((e) => `${e.name} (${e.plate.name})`).join(", ")
  return [
    "=== THE PARTY IS SPLIT (authoritative) ===",
    `${speakerName} is at ${view.here.name}${view.withSpeaker.length > 1 ? `, with ${view.withSpeaker.filter((n) => n !== speakerName).join(", ")}` : ", alone"}.`,
    `Elsewhere, out of sight and out of earshot: ${away}.`,
    `Narrate only what ${speakerName} can see and hear at ${view.here.name}. The heroes elsewhere are not present: they do not hear this, cannot answer, act or be addressed here, and NPCs here do not see them.`,
  ].join("\n")
}
