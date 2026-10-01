// The alchemy bench's look: where its approved art lives, and the colour,
// glow and motion of each of the 22 effects.
//
// THE ART IS SUPERVISED, NOT GENERATED. Every image and clip referenced here
// was made at build time and approved by Sam on the review page
// (https://claude.ai/artifact/NTGFNBz6TxBkyqEVFVrGVS, 2026-10-01) before it
// was cut out and uploaded. Nothing in this file, or anything that reads it,
// creates art at runtime (AGENTS.md, item-art rule).
//
// THE EFFECT COLOURS ARE NOT ART EITHER. They are painted over the approved
// brewed-potion flask in CSS, so 22 effects cost zero images. Table from the
// Alchemy Bench brief, "Effect colours" — approved by Sam 2026-10-01 ("Yes").
// Where two colours sit close (the greens, the two reds) the MOTION is what
// tells them apart; never rely on hue alone.

const STORE = "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/alchemy"

/** A transparent cut-out (512×512 PNG) of an approved bench object. */
export function cutout(slug: string): string {
  return `${STORE}/cut/${slug}.png`
}

/** Full-size painted scenes (2752×1536). */
export const BENCH_SCENE = {
  plate: `${STORE}/scene/bench-plate.jpg`,
  aftermath: `${STORE}/scene/crit-fail-aftermath.jpg`,
} as const

/** Reaction clips (Runway image-to-video, 5 s, from approved start frames).
 *  A key that is missing simply means "no film yet"; every caller must
 *  degrade to the still. */
export const BENCH_CLIPS: Partial<Record<BenchClip, string>> = {
  // All six approved by Sam on the review page, 2026-10-01.
  idle: `${STORE}/clip/idle.mp4`,
  mixing: `${STORE}/clip/mixing.mp4`,
  success: `${STORE}/clip/success.mp4`,
  inert: `${STORE}/clip/inert.mp4`,
  smoke: `${STORE}/clip/smoke.mp4`,
  purify: `${STORE}/clip/purify.mp4`,
}
/** The alchemy module's opening film (Runway, 5 s). Approved by Sam for the
 *  camp scene on 9/29 and kept when the bench moved into the game (2026-10-01).
 *  The MP4 plays where H.264 does; the WebM is the fallback. */
export const BENCH_INTRO = {
  mp4: `${STORE}/clip/alchemy-intro.mp4`,
  webm: `${STORE}/clip/alchemy-intro.webm`,
}
/** The critical-failure film Sam supplied (Alchemy_Failure.mp4, 2026-10-01),
 *  played by the bench itself on a natural 1. It used to be cued by a window
 *  event only the full dashboard listened for, so on the bench page it never
 *  played. */
export const BENCH_CRIT_FILM = {
  mp4: "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/cinematics/Alchemy_CriticalFailure.mp4",
}
export type BenchClip = "idle" | "mixing" | "success" | "inert" | "smoke" | "purify"

/** The flask a finished brew is shown in, by impurity (0 clean … 3 corrupt). */
export function flaskFor(impurity: number): string {
  const i = Math.max(0, Math.min(3, Math.trunc(Number(impurity) || 0)))
  return cutout(`brewed-potion-${i}`)
}

export const VESSEL = {
  empty: cutout("vessel-empty"),
  full: cutout("vessel-ingredients"),
  inert: cutout("vessel-inert"),
  sealed: cutout("vessel-rune-band"),
} as const

export type Motion =
  | "pulse" | "rise" | "still" | "swirl" | "sink" | "mirror" | "flicker"
  | "rim" | "swell" | "vapour" | "orbit" | "ripple" | "fog" | "inward"
  | "outward" | "sparks" | "chase" | "hiss" | "frost" | "flecks" | "crack" | "churn"

export interface EffectLook {
  /** Liquid colour. */
  liquid: string
  /** Glow colour, or null for none. */
  glow: string | null
  motion: Motion
  /** One plain line, as written in the brief. */
  describe: string
}

/** One entry per row of `alchemy_effects`. A slug that is not here (a new
 *  effect added later) falls back to NEUTRAL rather than to a wrong colour. */
export const EFFECT_LOOK: Record<string, EffectLook> = {
  "restore-health": { liquid: "#9b1b30", glow: "#ff5a6e", motion: "pulse", describe: "deep ruby red, pulsing like a heartbeat" },
  "purge-disease": { liquid: "#d6e6f2", glow: "#ffffff", motion: "rise", describe: "nearly clear, fine white bubbles rising" },
  "resist-poison": { liquid: "#1f8a55", glow: "#e2c46a", motion: "still", describe: "emerald, a thin gold rim at the surface" },
  "iron-stomach": { liquid: "#c46a1c", glow: null, motion: "swirl", describe: "ochre orange, a thick lazy swirl" },
  "long-march": { liquid: "#d99a2b", glow: "#ffc861", motion: "sink", describe: "honey amber, gold flecks drifting down" },
  "steady-nerve": { liquid: "#1f3f9e", glow: "#7f9cff", motion: "mirror", describe: "deep cobalt, a perfectly still surface" },
  wakefulness: { liquid: "#f2e03a", glow: "#fff59a", motion: "flicker", describe: "bright lemon, flickering like a candle" },
  darksight: { liquid: "#1d1030", glow: "#9a5cff", motion: "rim", describe: "ink violet-black, sparks only at the rim" },
  "inner-light": { liquid: "#f4f1e8", glow: "#bfe4ff", motion: "swell", describe: "milk white, a strong glow that lights the bench" },
  "keen-scent": { liquid: "#5f6b25", glow: null, motion: "vapour", describe: "moss olive, wisps of vapour from the neck" },
  "mind-link": { liquid: "#c8b3e8", glow: "#efe4ff", motion: "orbit", describe: "pearl lilac, two swirls orbiting each other" },
  "silver-tongue": { liquid: "#c9ced6", glow: "#ffffff", motion: "ripple", describe: "liquid silver, a glossy mercury ripple" },
  "soft-step": { liquid: "#6f7f92", glow: null, motion: "fog", describe: "smoke grey-blue, fog hiding the liquid line" },
  shrink: { liquid: "#178a8a", glow: "#6fe3e3", motion: "inward", describe: "teal, ripples running inward" },
  swell: { liquid: "#c2306f", glow: "#ff7fb4", motion: "outward", describe: "rose magenta, ripples running outward" },
  "burning-blood": { liquid: "#d9441a", glow: "#ff9a3c", motion: "sparks", describe: "orange-red, sparks rising out of it" },
  confuse: { liquid: "#7a4fd0", glow: "#5fe0c8", motion: "chase", describe: "oil-slick rainbow, colours chasing" },
  corrode: { liquid: "#b8d42a", glow: "#e8ff6a", motion: "hiss", describe: "acid chartreuse, hissing bubbles" },
  "numbing-venom": { liquid: "#7d8a78", glow: null, motion: "frost", describe: "dead grey-green, frost on the glass" },
  rot: { liquid: "#2e2a1a", glow: null, motion: "flecks", describe: "brown-black, sludge and floating flecks" },
  seize: { liquid: "#a9d8f2", glow: "#e6f7ff", motion: "crack", describe: "ice blue, sets like ice then cracks" },
  sicken: { liquid: "#9a7a2a", glow: null, motion: "churn", describe: "bile yellow-brown, a slow heavy churn" },
}

export const NEUTRAL_LOOK: EffectLook = {
  liquid: "#6b6455", glow: null, motion: "still", describe: "murky and unremarkable",
}

export function lookOf(effect: string): EffectLook {
  return EFFECT_LOOK[effect] ?? NEUTRAL_LOOK
}

/** Glow strength by potency: tier I faint, II steady, III spills past the glass. */
export function glowRadiusPx(potency: number): number {
  return potency >= 3 ? 28 : potency === 2 ? 14 : 6
}

/** Bands, bottom to top, in the order the effects were listed. A potion with
 *  more than one effect never mixes them (brief, "More than one effect"). */
export function bandsOf(effects: readonly string[]): Array<{ effect: string; look: EffectLook; from: number; to: number }> {
  const n = Math.max(1, effects.length)
  return effects.map((effect, i) => ({ effect, look: lookOf(effect), from: i / n, to: (i + 1) / n }))
}

/** Prepared-form art (extraction). Only APPROVED pictures are listed; an
 *  ingredient missing here shows its raw cut-out. */
const PREPARED_ART: Record<string, string> = {
  bluecap: cutout("bluecap-flour"),
  // Approved by Sam on the review page, 2026-10-01. Nightlight's first try was
  // sent back ("blurry"); redo B was approved the same night.
  "nightlight-fungus": `${STORE}/prep/nightlight-fungus-b.png`,
  "barrelstalk": `${STORE}/prep/barrelstalk.png`,
  "bigwig": `${STORE}/prep/bigwig.png`,
  "blind-cave-fish": `${STORE}/prep/blind-cave-fish.png`,
  "bonecap": `${STORE}/prep/bonecap.png`,
  "carrion-crawler-mucus": `${STORE}/prep/carrion-crawler-mucus.png`,
  "cave-cricket-skewer": `${STORE}/prep/cave-cricket-skewer.png`,
  "cavern-lizard-meat": `${STORE}/prep/cavern-lizard-meat.png`,
  "deep-rothe-jerky": `${STORE}/prep/deep-rothe-jerky.png`,
  "deep-rothe-milk": `${STORE}/prep/deep-rothe-milk.png`,
  "edible-mushrooms": `${STORE}/prep/edible-mushrooms.png`,
  "fire-lichen": `${STORE}/prep/fire-lichen.png`,
  "fried-grubs": `${STORE}/prep/fried-grubs.png`,
  "glowcap": `${STORE}/prep/glowcap.png`,
  "gray-ooze-residue": `${STORE}/prep/gray-ooze-residue.png`,
  "nilhoggs-nose": `${STORE}/prep/nilhoggs-nose.png`,
  "nimergan": `${STORE}/prep/nimergan.png`,
  "ormu-ink-vial": `${STORE}/prep/ormu-ink-vial.png`,
  "ormu-moss": `${STORE}/prep/ormu-moss.png`,
  "pygmywort": `${STORE}/prep/pygmywort.png`,
  "ripplebark": `${STORE}/prep/ripplebark.png`,
  "sporebread-loaf": `${STORE}/prep/sporebread-loaf.png`,
  "tainted-spores-pouch": `${STORE}/prep/tainted-spores-pouch.png`,
  "tessadyle": `${STORE}/prep/tessadyle.png`,
  "timmask": `${STORE}/prep/timmask.png`,
  "tongue-of-madness": `${STORE}/prep/tongue-of-madness.png`,
  "torchstalk": `${STORE}/prep/torchstalk.png`,
  "trillimac": `${STORE}/prep/trillimac.png`,
  "vial-of-rapport-spores": `${STORE}/prep/vial-of-rapport-spores.png`,
  "waterorb": `${STORE}/prep/waterorb.png`,
  "wind-spores": `${STORE}/prep/wind-spores.png`,
  "zurkhwood": `${STORE}/prep/zurkhwood.png`,
}

export function preparedArt(slug: string): string | null {
  return PREPARED_ART[slug] ?? null
}
