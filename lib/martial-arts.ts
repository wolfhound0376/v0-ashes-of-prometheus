// The School of Martial Arts — typed face of lib/martial-arts-rules.mjs.
//
// The rules live in ONE plain-JavaScript file, lib/martial-arts-rules.mjs, because the painted map
// (scripts/velkynvelve-walk/template.html) is built on Sam's machine with Python and no Node, and
// build_walk.py pastes that file into the page whole — the same pattern as lib/rage.mjs. This file
// only gives the board's TypeScript (components/tactical/spell-vfx-kit.ts) the types it had before.
// Read lib/martial-arts-rules.mjs for what each strike is and why.

import * as M from "./martial-arts-rules.mjs"

/**
 * The strikes. Named for what a player would call them, not for a stat.
 *
 * Sam, 2026-10-22, supplied drawn hit sparks for six moves. The four originals took four of them
 * and the other two became strikes of their own: an uppercut for the launchers (Stunning Strike)
 * and a sweep for the moves that put someone on the floor.
 */
export type MartialArt = "punch" | "kick" | "sneak" | "special" | "uppercut" | "sweep"

/** Impact sheet key in public/vfx/manifest.json, one per strike. */
export const MARTIAL_IMPACT: Record<MartialArt, string> = M.MARTIAL_IMPACT

/** How hard each one hits the screen, against `physical`'s own 1.3. */
export const MARTIAL_SCALE: Record<MartialArt, number> = M.MARTIAL_SCALE

/** The strikes whose spark is an arc (mirrored when the attacker faces left on screen). */
export const MARTIAL_DIRECTIONAL: ReadonlySet<MartialArt> = M.MARTIAL_DIRECTIONAL as ReadonlySet<MartialArt>

/** Whether a strike from (fromX, fromZ) at (toX, toZ) travels toward the screen's left. */
export const strikeFacesLeft: (
  fromX: number, fromZ: number, toX: number, toZ: number,
  camRightX: number, camRightZ: number,
) => boolean = M.strikeFacesLeft

/** Which strike this attack is, or null for an ordinary weapon swing. */
export const martialArtFor: (move: string | null | undefined) => MartialArt | null = M.martialArtFor

/** The impact sheet for an attack, or null to leave the kit's `physical` alone. */
export const martialImpactFor: (move: string | null | undefined) => string | null = M.martialImpactFor

/** Every impact key this module can ask for — the art checklist. */
export const ALL_MARTIAL_IMPACTS: string[] = M.ALL_MARTIAL_IMPACTS

/** A plain Unarmed Strike on the painted map: fist and foot alternate, a crit is the uppercut. */
export const unarmedBlow: (nth: number, crit: boolean) => MartialArt = M.unarmedBlow

/** The spark the painted map plays for a melee hit, or null for its ordinary physical impact. */
export const walkStrike: (
  name: string, o?: { sneak?: boolean; crit?: boolean; nth?: number },
) => MartialArt | null = M.walkStrike

/** An Unarmed Strike that names no move — the one whose limb the painted map varies. */
export const isPlainUnarmed: (name: string | null | undefined) => boolean = M.isPlainUnarmed
