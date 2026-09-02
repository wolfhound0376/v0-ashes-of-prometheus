// ============================================================================
// CLASS FRAMES — the box a character wears is decided by their CLASS.
//
// It used to be decided by nothing at all. The ornate surround was painted
// into each character's medallion image, fused with their face, so the frame
// was a property of the PNG rather than of the character. Kenta is a Sorcerer
// and was wearing a bard's lyre and lute; Scott is a Bard and was wearing a
// warlock's tentacled eye. Nothing in code could have fixed that, because
// nothing in code knew a frame existed.
//
// So the layers come apart:
//
//   1. the FACE       portraits/face-{slug}.webp   — who they are
//   2. the CLASS BOX  ui-frames/class/{key}.webp   — what they are
//   3. the CARD       ui-frames/card-{tone}.webp   — the chrome around both
//
// Change a character's class in Supabase and their box changes with them. No
// re-render, no new art, no hand-assignment. That is the whole point.
// ============================================================================

const VTT = "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets"

/** THE CANONICAL MEDALLION GEOMETRY. Every class frame is authored on a
 *  396x420 canvas with its portrait window punched as an ellipse at exactly
 *  these proportions, and every face is cut to exactly that ellipse. That is
 *  what makes any face droppable into any frame — which is the entire point,
 *  and the reason these numbers must not be edited casually. Change them and
 *  every frame and every face has to be regenerated together. */
export const MEDALLION = {
  /** Aspect of the frame canvas, as a CSS aspect-ratio. */
  aspect: 396 / 420,
  /** The portrait window, as percentages of that canvas. */
  faceLeft: 27.5,
  faceTop: 10.5,
  faceWidth: 45,
  faceHeight: 65,
} as const

/** The twelve PHB classes, plus the fallback every NPC and monster lands on. */
export type ClassKey =
  | "barbarian" | "bard" | "cleric" | "druid" | "fighter" | "monk"
  | "paladin" | "ranger" | "rogue" | "sorcerer" | "warlock" | "wizard"
  | "unaligned"

export interface ClassFrame {
  key: ClassKey
  /** Display name, for tooltips and the admin picker. */
  label: string
  /** The transparent-centre surround, or null when the art does not exist yet.
   *  `frameForClass` never hands back a null one — it substitutes the
   *  unaligned ring — so a class awaiting art looks deliberate rather than
   *  broken, and never borrows another class's iconography. */
  frameUrl: string | null
  /**
   * The whole CARD the character's plate is painted on - the baroque surround
   * with the portrait arch, the stat plaques and the five resource chambers.
   *
   * Unlike `frameUrl` this is never null. It is one painting recut thirteen
   * ways by `scripts/recut-card-frames.py`, which rotates the violet magework
   * onto each class's accent and leaves the gold ironwork and the resource
   * gems exactly as painted. So a class awaiting medallion art still gets a
   * card in its own colour.
   *
   * These ship from `public/`, not the VTT bucket, because the card is chrome
   * the app cannot render without - a frame that 404s is a blank rectangle
   * where a character used to be.
   */
  cardFrameUrl: string
  /** The class's colour, used for the sigil, the active glow, and anywhere
   *  else the HUD wants to say "this one" without spelling it out. */
  accent: string
  /** The glyph in the card's small top-left socket. */
  sigil: string
}

/** Every card frame lives at the same shape of path, so the table below says
 *  it once instead of thirteen times. */
const CARD = (key: ClassKey) => `/ui-frames/card-frame-${key}.webp`

/** Ordered so the admin picker reads like the Player's Handbook. */
export const CLASS_FRAMES: Record<ClassKey, ClassFrame> = {
  barbarian: { key: "barbarian", label: "Barbarian", frameUrl: null, cardFrameUrl: CARD("barbarian"), accent: "#b4432a", sigil: "⚒" },
  bard:      { key: "bard",      label: "Bard",      frameUrl: `${VTT}/ui-frames/class/bard.webp`,      cardFrameUrl: CARD("bard"),      accent: "#5c7ce0", sigil: "♪" },
  cleric:    { key: "cleric",    label: "Cleric",    frameUrl: `${VTT}/ui-frames/class/cleric.webp`,    cardFrameUrl: CARD("cleric"),    accent: "#e0b53c", sigil: "✝" },
  druid:     { key: "druid",     label: "Druid",     frameUrl: null,     cardFrameUrl: CARD("druid"),     accent: "#4f9a5c", sigil: "❋" },
  fighter:   { key: "fighter",   label: "Fighter",   frameUrl: `${VTT}/ui-frames/class/fighter.webp`,   cardFrameUrl: CARD("fighter"),   accent: "#9aa4b0", sigil: "⚔" },
  monk:      { key: "monk",      label: "Monk",      frameUrl: null,      cardFrameUrl: CARD("monk"),      accent: "#d8cfae", sigil: "☯" },
  paladin:   { key: "paladin",   label: "Paladin",   frameUrl: null,   cardFrameUrl: CARD("paladin"),   accent: "#f0dc8a", sigil: "✚" },
  ranger:    { key: "ranger",    label: "Ranger",    frameUrl: null,    cardFrameUrl: CARD("ranger"),    accent: "#4e8a52", sigil: "➶" },
  rogue:     { key: "rogue",     label: "Rogue",     frameUrl: `${VTT}/ui-frames/class/rogue.webp`,     cardFrameUrl: CARD("rogue"),     accent: "#3f7a4e", sigil: "🗡" },
  // Sorcerer and warlock share the original painting, uncut. It was made for
  // Kenta, who is the sorcerer, and it came from a card labelled warlock -
  // recutting either would be recolouring a thing to look like itself.
  sorcerer:  { key: "sorcerer",  label: "Sorcerer",  frameUrl: `${VTT}/ui-frames/class/sorcerer.webp`, cardFrameUrl: CARD("sorcerer"),  accent: "#e0553c", sigil: "✦" },
  warlock:   { key: "warlock",   label: "Warlock",   frameUrl: `${VTT}/ui-frames/class/warlock.webp`,   cardFrameUrl: CARD("warlock"),   accent: "#9a4fd0", sigil: "◈" },
  wizard:    { key: "wizard",    label: "Wizard",    frameUrl: null,    cardFrameUrl: CARD("wizard"),    accent: "#4fa8d8", sigil: "✧" },
  unaligned: { key: "unaligned", label: "Unaligned", frameUrl: `${VTT}/ui-frames/class/unaligned.webp`, cardFrameUrl: CARD("unaligned"), accent: "#a89468", sigil: "✧" },
}

/** Every alias the campaign has actually used, lower-cased. `characters.class`
 *  is free text, so "Rogue", "rogue", and a multiclass string like
 *  "Bard / Warlock" all have to land somewhere sensible. First class named
 *  wins — a Bard 3 / Warlock 1 reads as a bard at the table. */
const ALIASES: Record<string, ClassKey> = {
  barbarian: "barbarian", berserker: "barbarian",
  bard: "bard", minstrel: "bard", skald: "bard",
  cleric: "cleric", priest: "cleric", acolyte: "cleric",
  druid: "druid",
  fighter: "fighter", warrior: "fighter", knight: "fighter", soldier: "fighter",
  monk: "monk",
  paladin: "paladin",
  ranger: "ranger", hunter: "ranger", scout: "ranger",
  rogue: "rogue", thief: "rogue", assassin: "rogue",
  sorcerer: "sorcerer", sorceress: "sorcerer",
  warlock: "warlock",
  wizard: "wizard", mage: "wizard", magician: "wizard", "magic-user": "wizard",
}

/** Resolve free-text class to a frame. Never throws, never returns undefined —
 *  an unrecognised class gets the unaligned frame rather than a broken card. */
export function frameForClass(cls: string | null | undefined): ClassFrame {
  const resolved = resolve(cls)
  // Keep the class's own accent and sigil; borrow only the ring it lacks.
  if (!resolved.frameUrl) return { ...resolved, frameUrl: CLASS_FRAMES.unaligned.frameUrl }
  return resolved
}

function resolve(cls: string | null | undefined): ClassFrame {
  if (!cls) return CLASS_FRAMES.unaligned
  // Take the first word-run before any multiclass separator.
  const head = cls.split(/[\/,|]|\bof\b/i)[0].trim().toLowerCase()
  if (ALIASES[head]) return CLASS_FRAMES[ALIASES[head]]
  // Otherwise look for any known class name anywhere in the string, so
  // "Circle of the Moon Druid" still finds its frame.
  for (const [alias, key] of Object.entries(ALIASES)) {
    if (head.includes(alias) || cls.toLowerCase().includes(alias)) return CLASS_FRAMES[key]
  }
  return CLASS_FRAMES.unaligned
}

/** Which classes still need art commissioned. Six of thirteen are real today:
 *  four lifted from the party's own medallions, plus fighter and unaligned
 *  from NPC art. Filling a gap is one URL in the table above — no code. */
export const CLASSES_AWAITING_ART = (Object.values(CLASS_FRAMES)
  .filter((f) => f.frameUrl === null)
  .map((f) => f.key)) as ClassKey[]

/** The sigil alone, for callers that want the glyph without the frame. */
export function sigilForClass(cls: string | null | undefined): string {
  return frameForClass(cls).sigil
}
