// ============================================================================
// SPELL VFX KIT — the baked-flipbook cast effects.
//
// A port of the standalone Faerzress kit. That kit was a global singleton with
// one shared quad pool, one caster position and 9 MB of base64 textures; none
// of that survives contact with this board, which spawns a fresh effect per
// cast, anchors it to the caster's hand BONE, and has a frame budget. So what
// is ported is the art direction, not the architecture:
//
//   • a school-specific rune disc spins up off the hand,
//   • the spell leaves by a route chosen by its damage type — a thrown ball, a
//     held beam, a radiating gust, a column from the sky,
//   • it blooms on arrival with that type's impact sheet,
//   • and an AREA spell lays that type's looping floor mark where it landed —
//     burning ground, rime, fog, holy light — that stays while the spell does.
//
// Everything is a baked sprite sheet under public/vfx/, fetched lazily and
// cached across casts, so a fireball costs one 176 KB sheet and a rune disc,
// not the whole 6.9 MB library.
//
// Honours the same VfxHandle contract as spell-vfx.ts — update(dt) until it
// returns false, then dispose() — so the board drives both identically.
// ============================================================================
import * as THREE from "three"
import type { VfxHandle } from "./spell-vfx"
import { ImpactBurst } from "./impact-burst"
import { spellEntry, type AreaSpec } from "@/lib/spellbook"
import { FEET_PER_SQUARE } from "@/lib/aoe"
import { MOTION, flightFrame, poseAt, screenRoll, stretchAt, type MotionKind } from "@/lib/projectile-motion"

export type DamageType =
  | "fire" | "cold" | "lightning" | "thunder" | "acid" | "poison"
  | "necrotic" | "radiant" | "force" | "psychic" | "physical"
  | "healing" | "eldritch"
  // Not a damage type in 5e and not pretending to be: the kit's name for a
  // conjured bank of fog, which harms nobody and still needs drawing.
  | "fog"

/** How the spell gets from the hand to the target. From the kit's DELIVERY. */
type Route = "ball" | "beam" | "radiate" | "sky" | "impact-only"

/**
 * What comes off the hit besides the type's own impact sheet: the white flash
 * (pxFlash), the floor shockwave (pxRing) and the thrown sparks (pxSpark),
 * all drawn white and tinted here so one set of sheets serves every type.
 */
interface BurstSpec {
  /** The colour the flash settles to, the ring wears and the sparks are. */
  tint: number
  /** How many sparks. 0 throws none. */
  sparks: number
  /** Whether the shockwave runs out across the floor — a blast does, a drip does not. */
  ring: boolean
  /** How far the sparks fly, 1 = a cantrip's worth. */
  power?: number
}

/**
 * Something that hangs around the target after the impact sheet is done.
 *
 *   glow     — a luminescence around the whole body, motes rising: healing.
 *              Sam: "Healing should cause a glowing luminescence around the
 *              target."
 *   mockery  — laughing ghosts circling the head: Vicious Mockery. Sam: "ghosts
 *              of people laughing around the target that fails, causing them
 *              distress."
 */
type Flourish = "glow" | "mockery"

interface TypeSpec {
  /**
   * Sprite sheet for the charge disc, or absent for effects that have no
   * windup.
   *
   * Optional because of `physical`: a sword swing does not spin up an arcane
   * sigil off the caster's palm first. Every SPELL has a charge — that is
   * what casting looks like — but a weapon hit is the one entry in this table
   * that is not a spell, and giving it a rune to justify a non-optional field
   * would put a glowing circle under every dagger in the game.
   */
  rune?: string
  route: Route
  /** Sheet that travels (ball) or stretches (beam). */
  travel?: string
  /** Sheet that plays at the destination. */
  impact?: string
  /** Impact size multiplier — some sheets are framed tighter than others. */
  impactScale?: number
  /** Seconds the disc spins before the spell leaves. From the kit's CHARGE. */
  charge: number
  /** Board units per second for a thrown ball. */
  speed?: number
  /**
   * How a thrown ball crosses the room — lobbed, weaving, straight, or
   * corkscrewing. See lib/projectile-motion. Absent means a straight lerp,
   * which is what every ball did before there was a choice.
   */
  motion?: MotionKind
  /** The flash, shockwave and sparks on arrival. Absent means the impact sheet alone. */
  burst?: BurstSpec
  /**
   * What a SINGLE-TARGET hit of this type leaves on the floor — rime after a
   * frost bolt — laid flat under the target and held for `hold` seconds.
   * An area spell lays `decal` instead; this is for the one square a bolt
   * struck. Sam: "ice on the ground after frost".
   */
  aftermath?: { sheet: string; hold: number; size: number }
  /** A lingering flourish around the target after the hit. See Flourish. */
  flourish?: Flourish
  /** Tint applied to the (grayscale-ish) baked art. */
  tint: number
  /**
   * Looping sheet laid flat on the floor where an AREA spell of this type
   * lands, the size of the area, for as long as the spell lasts. Absent for
   * types with no loop art yet; a single-target cast never lays one.
   */
  decal?: string
}

// Every damage type is now covered.
//
// LIGHTNING needed no new art. thunderImpact is already a painted branching
// bolt striking downward and runeStorm is already the storm sigil — the two
// types were only ever separated by 5e's damage table, not by how they look.
// What differs is the DELIVERY: thunder is a concussion that radiates from
// where it lands, lightning is a line that travels. So lightning takes the
// same sheets on a beam route, cooled to blue by its tint, and thunder keeps
// the white radiate. Adding a second, near-identical set of storm art would
// have cost ~800 KB to say the same thing twice.
//
// PHYSICAL is the one that genuinely had nothing, and the only entry here
// that is not a spell. It gets an impact and no charge disc.
//
// FIRE no longer lands as its own projectile. The travelling ball doubled as
// the impact, so a Fireball arrived as the same orange sphere that flew in,
// held still and scaled up. fireImpact is cut from footage like the frost:
// a white flash, the burst, and the smoke it leaves. Its scale is larger
// than the ball's was because the burst fills about 40% of its letterboxed
// cell where the ball filled 72% — 4.6 keeps the visible footprint where
// 2.6 had it.
//
// THE FOUR THROWN TYPES NOW FLY DRAWN PIXEL ART (public/vfx/px*, from
// scripts/vfx/draw_pixel_vfx.py): a sprite with a head at +X and a tail
// behind, so the kit can turn it to face its own travel. The old sheets were
// paintings shrunk into blocks — radially symmetric blobs with no front, so
// there was nothing to point. Each has a MOTION to match its weight: a
// Fireball is lobbed, a Magic Missile weaves, a psychic bolt corkscrews.
const TYPES: Partial<Record<DamageType, TypeSpec>> = {
  fire:     { rune: "runeFire",     route: "ball",        travel: "pxFireball",    impact: "fireImpact",     impactScale: 4.6, charge: 0.80, speed: 13, motion: "lob",   tint: 0xffffff, decal: "aoeFire",  burst: { tint: 0xffa030, sparks: 28, ring: true, power: 1.4 } },
  cold:     { rune: "runeFrost",    route: "beam",        travel: "frostBeam",     impact: "frostImpact",    charge: 0.70, tint: 0xffffff, decal: "aoeFrost", burst: { tint: 0xa8e6ff, sparks: 22, ring: true }, aftermath: { sheet: "pxIce", hold: 8, size: 1.35 } },
  necrotic: { rune: "runeNecrotic", route: "beam",        travel: "necroBeam",     impact: "necroImpact",    charge: 0.75, tint: 0xffffff, burst: { tint: 0x9c6bff, sparks: 12, ring: false } },
  eldritch: { rune: "runeEldritch", route: "beam",        travel: "eldBeam",       impact: "eldImpact",      charge: 0.70, tint: 0xffffff, burst: { tint: 0xc678ff, sparks: 18, ring: true } },
  poison:   { rune: "runeAcid",     route: "ball",        travel: "pxPoison",      impact: "poisonCloud",    charge: 0.65, speed: 10, motion: "lob",   tint: 0xffffff, burst: { tint: 0x7ee23f, sparks: 16, ring: false, power: 0.8 } },
  // A missile SEEKS: each dart of a volley swings out on its own side and
  // homes in, so three darts leave as a fan and arrive together.
  force:    { rune: "runeForce",    route: "ball",        travel: "pxMissile",     impact: "forceHit",       charge: 0.65, speed: 16, motion: "seek",  tint: 0xffffff, burst: { tint: 0xa78bff, sparks: 18, ring: true } },
  psychic:  { rune: "runePsychic",  route: "ball",        travel: "pxPsychic",     impact: "psychicImpact",  charge: 0.70, speed: 12, motion: "drift", tint: 0xffffff, burst: { tint: 0xff8cf0, sparks: 14, ring: true, power: 0.9 } },
  thunder:  { rune: "runeStorm",    route: "radiate",     travel: "thunderGust",   impact: "thunderImpact",  charge: 0.60, tint: 0xffffff, burst: { tint: 0xffffff, sparks: 24, ring: true, power: 1.5 } },
  // Lightning got its own art in the end.
  //
  // The first pass reused thunder's sheets tinted cold, on the argument that
  // thunderImpact is already a painted bolt and the two types differ only in
  // 5e's damage table. That was true of the ART and false of the EVENT: a
  // thunderclap is a concussion that pushes outward from where it lands, and
  // a lightning strike comes DOWN and then runs away across the floor. The
  // borrowed sheet had no descent and no ground crawl, so every Lightning
  // Bolt read as a small thunderclap. Same sheet, wrong verb.
  lightning:{ rune: "runeStorm",    route: "beam",        travel: "thunderGust",   impact: "lightningStrike", impactScale: 1.5, charge: 0.45, tint: 0xffffff, burst: { tint: 0xbfe8ff, sparks: 26, ring: true, power: 1.3 } },
  radiant:  { rune: "runeRadiant",  route: "sky",         impact: "radiantColumn",  impactScale: 1.0, charge: 0.85, tint: 0xffffff, decal: "aoeHoly", burst: { tint: 0xffe9a8, sparks: 18, ring: true } },
  healing:  { rune: "runeHealing",  route: "sky",         impact: "healingShimmer", impactScale: 1.2, charge: 0.80, tint: 0xffffff, decal: "aoeHoly", burst: { tint: 0xbfffd8, sparks: 10, ring: false, power: 0.6 }, flourish: "glow" },
  acid:     { rune: "runeAcid",     route: "impact-only", impact: "acidImpact",     charge: 0.60, tint: 0xffffff, burst: { tint: 0xb8ff3a, sparks: 16, ring: false, power: 0.8 } },
  // No rune, and a charge short enough to read as a swing rather than a cast.
  // A weapon hit has no windup to show: the animation IS the windup. Steel
  // still throws sparks, though — fewer, and no shockwave.
  physical: {                       route: "impact-only", impact: "physicalImpact", impactScale: 1.3, charge: 0.12, tint: 0xffffff, burst: { tint: 0xffe6b0, sparks: 12, ring: false, power: 0.7 } },
  // Nothing flies and nothing blooms: the fog IS the arrival. The storm sigil
  // is the closest rune to a weather conjuration, and a spell still needs a
  // charge — that is what casting looks like.
  fog:      { rune: "runeStorm",    route: "impact-only",                                             charge: 0.60, tint: 0xffffff, decal: "aoeFog" },
}

/**
 * Spells the kit draws by NAME rather than by damage type.
 *
 * Fog Cloud deals no damage and heals nobody, so by type it was nothing and
 * fell through to the old sparks — which, for a spell whose entire effect is
 * a bank of fog on the floor, drew a cast and no fog. Consulted before the
 * damage type, so it holds whatever the spellbook says the spell is made of.
 */
const BY_SPELL: Record<string, DamageType> = {
  "fog cloud": "fog",
}

/**
 * Flourishes that belong to one spell rather than to its damage type.
 * Vicious Mockery is psychic, and every other psychic spell is not a joke.
 */
const FLOURISH_BY_SPELL: Record<string, Flourish> = {
  "vicious mockery": "mockery",
}

/**
 * Sheets and colours the flourishes are built from.
 *
 * The glow is white art tinted GOLD here — Sam: "golden, luminescent, and
 * have rays of light streaking outwards." The ghost is a drawn sprite
 * (PixelLab, to Sam's reference: mint green, laughing, pointing, trailing
 * wisps) and carries its own colour, so its tint is white; the swirl over
 * the mocked head is drawn in its own violet and blue.
 */
const FLOURISH_SHEETS: Record<Flourish, { sheet: string; tint: number; life: number; extra?: string }> = {
  glow:    { sheet: "pxGlow",  tint: 0xffd36a, life: 2.6 },
  mockery: { sheet: "pxGhost", tint: 0xffffff, life: 2.6, extra: "pxSwirl" },
}

export function hasKitEffect(type: DamageType): boolean {
  return type in TYPES
}

/**
 * The route a particular spell takes, which is not always its type's default.
 *
 * A damage type describes what the magic *is*; it does not describe how it
 * crosses the room. Radiant is the clear case: Sacred Flame is a save-based
 * column of light that falls on the target from above, while Guiding Bolt is
 * a ranged spell **attack** — a bolt that leaves the hand and flies. Both are
 * radiant, and drawing them the same way makes one of them wrong.
 *
 * The spellbook already records the difference in `resolve`, so read it: a
 * spell resolved by an attack roll is a thrown thing, whatever it is made of.
 */
function routeFor(type: DamageType, spellName?: string): TypeSpec | undefined {
  const spec = TYPES[type]
  if (!spec || !spellName) return spec
  const entry = spellEntry(spellName)
  if (entry?.resolve !== "attack") return spec
  if (spec.route === "ball" || spec.route === "beam") return spec // already thrown
  return {
    ...spec,
    route: "ball",
    // Sky and impact-only routes carry no travelling sheet, so borrow the
    // impact art for the bolt itself and let it bloom again on arrival.
    travel: spec.travel ?? spec.impact,
    speed: spec.speed ?? 18,
    // A ray or a bolt resolved by an attack roll is a straight, fast shot.
    motion: spec.motion ?? "dart",
    impactScale: (spec.impactScale ?? 1.6) * 0.8,
  }
}

/** The three white sheets every burst is built from. */
const BURST_SHEETS = { flash: "pxFlash", ring: "pxRing", spark: "pxSpark" } as const

// ── flag + resolver ─────────────────────────────────────────────────────────
// One entry point for the board: given a spell name, either a type the kit can
// draw, or null meaning "use the old effect". Keeping the flag and the lookup
// here is what lets combat-board-3d.tsx take a six-line diff.

const FLAG_KEY = "ashes.vfxKit"

/**
 * On by default — these are the spell effects now.
 *
 * The escape hatch is kept deliberately: if a cast ever looks wrong or costs
 * too much mid-session, `localStorage.setItem("ashes.vfxKit","0")` and a
 * reload puts the old sparks back instantly, without waiting for a deploy.
 * Anything other than "0" (including nothing at all) means on.
 */
export function kitEnabled(): boolean {
  if (typeof window === "undefined") return true
  try {
    return window.localStorage.getItem(FLAG_KEY) !== "0"
  } catch {
    return true // private mode, blocked storage — still show the effects
  }
}

/**
 * Which kit effect a spell should use, or null to fall back.
 *
 * The spellbook is the authority on damage type, so this reads it rather than
 * carrying a second copy of that mapping. Two spellbook facts do not map
 * straight across: Eldritch Blast is typed `force` but has always had its own
 * violet look, and healing spells carry no damage type at all.
 */
export function kitVfxTypeFor(spellName: string): DamageType | null {
  if (!kitEnabled()) return null
  const named = BY_SPELL[spellName.trim().toLowerCase()]
  if (named) return hasKitEffect(named) ? named : null
  const e = spellEntry(spellName)
  if (!e) return null
  const type: DamageType | null =
    e.school === "eldritch" ? "eldritch"
    : e.heals ? "healing"
    : ((e.damage as DamageType | undefined) ?? null)
  return type && hasKitEffect(type) ? type : null
}

// ── asset loading ───────────────────────────────────────────────────────────
// Lazy and cached. The manifest is fetched once; each sheet at most once, no
// matter how many casts ask for it.

export interface SheetMeta {
  file: string
  cols: number
  rows: number
  frames: number
  fps: number
  /**
   * The sheet was cut to cycle — its last frame runs back into its first —
   * so a Flip driven past the end wraps instead of holding the last frame.
   * Written by `scripts/vfx/bake_video_sheet.py --loop`; absent is one-shot.
   */
  loop?: boolean
}
export interface Sheet extends SheetMeta { tex: THREE.Texture }

const VFX_BASE = "/vfx"
let manifestPromise: Promise<Record<string, SheetMeta>> | null = null
const sheets = new Map<string, Promise<Sheet>>()
const ready = new Map<string, Sheet>()

function getManifest(): Promise<Record<string, SheetMeta>> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${VFX_BASE}/manifest.json`).then((r) => {
      if (!r.ok) throw new Error(`vfx manifest ${r.status}`)
      return r.json()
    })
  }
  return manifestPromise
}

/**
 * Fetch a sheet by manifest key, at most once per key per page.
 *
 * Exported for the ground-decal renderer (aoe-decal.ts), which needs the same
 * cache: a Fireball's blast mark and its impact bloom are two effects reading
 * the same manifest, and giving the decal its own loader would download and
 * decode every sheet a second time.
 */
export function loadSheet(key: string): Promise<Sheet> {
  let p = sheets.get(key)
  if (p) return p
  p = getManifest().then(async (man) => {
    const meta = man[key]
    if (!meta) throw new Error(`no vfx sheet "${key}"`)
    const tex = await new THREE.TextureLoader().loadAsync(`${VFX_BASE}/${meta.file}`)
    tex.colorSpace = (THREE as any).SRGBColorSpace ?? tex.colorSpace
    // The sheets are pixel art now (4x4 blocks, hard alpha - Sam: the magic
    // should look like the sprites). Nearest keeps the blocks square instead
    // of smearing them back into a blur.
    tex.minFilter = THREE.NearestFilter
    tex.magFilter = THREE.NearestFilter
    tex.generateMipmaps = false
    tex.generateMipmaps = false
    const sheet: Sheet = { ...meta, tex }
    ready.set(key, sheet)
    return sheet
  })
  sheets.set(key, p)
  return p
}

/**
 * Warm the sheets a spell will need. Call this when the cast is *pressed*, so
 * the textures have arrived by the release frame and the first cast of a type
 * looks like every later one.
 */
export function prewarmKit(type: DamageType): void {
  const spec = TYPES[type]
  if (!spec) return
  if (spec.rune) void loadSheet(spec.rune).catch(() => {})
  if (spec.travel) void loadSheet(spec.travel).catch(() => {})
  if (spec.impact) void loadSheet(spec.impact).catch(() => {})
  if (spec.decal) void loadSheet(spec.decal).catch(() => {})
  if (spec.burst) {
    for (const key of Object.values(BURST_SHEETS)) void loadSheet(key).catch(() => {})
  }
  if (spec.aftermath) void loadSheet(spec.aftermath.sheet).catch(() => {})
  if (spec.flourish) {
    const f = FLOURISH_SHEETS[spec.flourish]
    void loadSheet(f.sheet).catch(() => {})
    if (f.extra) void loadSheet(f.extra).catch(() => {})
  }
}

// ── one animated quad ───────────────────────────────────────────────────────

/**
 * Exported for death-vfx.ts, which plays the killing type's sheet over the
 * body — burning, frost, sparks — through the same loader and cache as a
 * cast, so a death never downloads a sheet the cast already has.
 */
export class Flip {
  readonly mesh: THREE.Mesh
  private readonly mat: THREE.MeshBasicMaterial
  private readonly geo: THREE.PlaneGeometry
  private readonly tex: THREE.Texture
  private readonly sheet: Sheet

  constructor(sheet: Sheet, tint: number, w: number, h: number) {
    this.sheet = sheet
    // Clone so this cast owns its UV window; the image itself is shared.
    this.tex = sheet.tex.clone()
    this.tex.needsUpdate = true
    this.tex.repeat.set(1 / sheet.cols, 1 / sheet.rows)
    this.geo = new THREE.PlaneGeometry(w, h)
    this.mat = new THREE.MeshBasicMaterial({
      map: this.tex,
      color: tint,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      // The board tone-maps the scene; these sheets were baked with their
      // final colour already in them, so opt them out or they go muddy.
      toneMapped: false,
    })
    this.mesh = new THREE.Mesh(this.geo, this.mat)
    this.mesh.frustumCulled = false
    this.setFrame(0)
  }

  /**
   * `p` is 0..1 through the sheet. Past 1 it holds the last frame — unless
   * the sheet was baked to loop, in which case it wraps and keeps cycling for
   * as long as it is driven. A one-shot sheet ends on a fade to nothing, so
   * holding its last frame is invisible; a looping sheet's last frame is a
   * full picture, and holding it would freeze the fire.
   */
  setProgress(p: number) {
    if (this.sheet.loop) { this.setLooping(p); return }
    this.setFrame(Math.min(this.sheet.frames - 1, Math.floor(p * this.sheet.frames)))
  }

  /** `p` is 0..1 and wraps — for effects that loop while they live. */
  setLooping(p: number) {
    this.setFrame(Math.floor(p * this.sheet.frames) % this.sheet.frames)
  }

  /**
   * Drive a looping sheet by the clock, at the frame rate it was drawn at.
   * `t` is seconds since it started. setLooping() takes a fraction of the
   * sheet, which made every sheet play at whatever rate the caller multiplied
   * by; the drawn pixel sheets carry their own fps and mean it.
   */
  clock(t: number) {
    this.setFrame(Math.floor(Math.max(0, t) * this.sheet.fps) % this.sheet.frames)
  }

  /** Recolour on the fly — the flash goes white to the type's colour as it cools. */
  set tint(v: number) { this.mat.color.setHex(v) }

  private setFrame(i: number) {
    const col = i % this.sheet.cols
    const row = Math.floor(i / this.sheet.cols)
    this.tex.offset.set(col / this.sheet.cols, 1 - (row + 1) / this.sheet.rows)
  }

  set opacity(v: number) { this.mat.opacity = v }
  get opacity() { return this.mat.opacity }

  dispose() {
    this.geo.dispose()
    this.mat.dispose()
    this.tex.dispose()
  }
}

// ── the floor mark ──────────────────────────────────────────────────────────
// An area spell's mark on the ground: one flat looping quad at the area's
// centre, the size of the area, that stays while the spell does.
//
// This is NOT the cell-accurate aftermath mark in aoe-decal.ts. That one draws
// exactly the squares areaCells() returned and needs the board to hand it the
// list; this one is spawned from inside the cast, which knows only where the
// spell landed and how big the spellbook says it is. They are meant to share
// the floor: this is the live effect — fire still burning, fog still hanging —
// and the other is what the stone remembers afterwards.

/**
 * A hair above the floor. The same slot aoe-decal.ts uses (its DECAL_Y), so
 * the two marks never z-fight, and under the movement bands at 0.035 so a
 * burning floor never hides the live answer to "where can I go".
 */
const DECAL_Y = 0.025
/** Seconds a one-shot mark stays lit before it fades. */
const DECAL_HOLD = 6
/** Seconds the mark takes to fade out. */
const DECAL_FADE = 1
/** Seconds it takes to arrive — short, so it reads as part of the impact. */
const DECAL_FADE_IN = 0.35
/**
 * Seconds a concentration mark may stay if nobody calls end().
 *
 * The honest duration of a concentration spell is "until concentration
 * drops", and nothing on either side of the wire tracks concentration as
 * such. What the board does know — the caster arming another area spell, or
 * going down — it passes on through end(), the same way it ends the
 * aftermath mark in aoe-decal.ts. This cap — ten minutes, the SRD's middle
 * duration for lingering areas — covers the breaks the board cannot see
 * (a Web dispelled, a caster who simply stopped): a leak guard rather than
 * a rule, so a Fog Cloud cannot survive a whole session in a browser that
 * never heard the caster drop it.
 */
const DECAL_CONCENTRATION_CAP = 600

/**
 * How wide the mark is, in squares — the unit aoe-decal.ts measures in (one
 * board unit per square; the board's SQ is 1.0).
 *
 * Follows the spellbook's per-shape meaning of sizeFt exactly: a sphere and a
 * cylinder give a RADIUS, so the mark is twice it; a cube's edge and a cone's
 * or a line's length are already the full span.
 */
function decalDiameter(area: AreaSpec): number {
  const s = area.sizeFt / FEET_PER_SQUARE
  switch (area.shape) {
    case "sphere":
    case "cylinder":
      return s * 2
    case "cube":
      return Math.max(1, Math.round(s))
    case "cone":
    case "line":
      return s
  }
}

/**
 * Where the mark is centred, on the floor.
 *
 * A point spell is centred where it was aimed. A self-origin one opens from
 * the caster, so its centre is out along the cast: halfway down a cone or a
 * line, the middle of the cube areaCells() lays in front of the caster
 * (axis-snapped, as the cells are), and the caster's own square for a sphere
 * on self (Spirit Guardians).
 *
 * `foot` is the caster's hand dropped to the floor. The kit is handed a hand
 * bone, not the token, and does not know the board's scene hierarchy well
 * enough to climb to the token safely — and a hand is within a third of a
 * square of the token's centre, which is inside the error of a soft-edged
 * disc.
 */
function decalCentre(area: AreaSpec, foot: THREE.Vector3, aim: THREE.Vector3): THREE.Vector3 {
  const c = new THREE.Vector3()
  if (area.origin === "point") return c.set(aim.x, DECAL_Y, aim.z)
  const size = area.sizeFt / FEET_PER_SQUARE
  const dir = new THREE.Vector3(aim.x - foot.x, 0, aim.z - foot.z)
  // No direction at all (aimed at your own square): areaCells defaults to
  // north, which is -y on the grid and -z on the board.
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1)
  else dir.normalize()
  switch (area.shape) {
    case "sphere":
    case "cylinder":
      return c.set(foot.x, DECAL_Y, foot.z)
    case "cube": {
      const edge = Math.max(1, Math.round(size))
      const horiz = Math.abs(dir.x) >= Math.abs(dir.z)
      const sx = horiz ? Math.sign(dir.x) || 1 : 0
      const sz = horiz ? 0 : Math.sign(dir.z) || 1
      const reach = (edge + 1) / 2
      return c.set(foot.x + sx * reach, DECAL_Y, foot.z + sz * reach)
    }
    case "cone":
    case "line":
      return c.set(foot.x + (dir.x * size) / 2, DECAL_Y, foot.z + (dir.z * size) / 2)
  }
}

/**
 * A cast's handle, plus the one thing an area cast needs that a bolt does
 * not: a way to be told the spell is over.
 *
 * Mirrors AreaDecalHandle in aoe-decal.ts, so whichever board code ends a
 * concentration can end both marks the same way.
 */
export interface CastHandle extends VfxHandle {
  /**
   * End a lingering floor mark early — concentration broke, the caster went
   * down. Starts its fade; update() keeps returning true until it finishes.
   * Safe to call twice, and a no-op on a cast that laid no mark.
   */
  end(): void
}

// ── the cast ────────────────────────────────────────────────────────────────

const UP = new THREE.Vector3(0, 1, 0)

export function castSpellKitVfx(opts: {
  parent: THREE.Object3D
  anchor: THREE.Object3D
  type: DamageType
  target?: THREE.Vector3 | null
  camera?: THREE.Camera | null
  /** Area spells draw bigger. 1 = a single square. */
  scale?: number
  /**
   * The spell's own name, so the route can follow the spell rather than only
   * its damage type. Optional: without it the type's default route is used.
   */
  spell?: string
  /**
   * Fired once, on the frame the effect actually reaches the target.
   *
   * Only the effect knows this moment: the charge time, the flight time and
   * the route all differ per damage type, so a bolt lands later than a beam
   * and a Fireball later than a dart. Anything that should coincide with the
   * hit — the target's flinch, the impact sound, a damage number — hangs off
   * this rather than off a guessed delay.
   */
  onImpact?: () => void
  /**
   * Picks the phase of a weave and the spread of the sparks, so a replay on
   * another seat throws the same sparks. Optional: without it the cast's
   * geometry stands in, which is the same on every seat for the same cast.
   */
  seed?: number
  /**
   * How the spell resolved, when the caller knows. A flourish is the spell
   * TAKING — the ghosts laugh at the one who failed the save, the glow
   * settles on the one who was healed — so on "miss" or "saved" it stays
   * home. The impact sheet still plays: the bolt still arrived. Optional
   * because the board does not pass it yet; absent means "assume it took".
   */
  outcome?: "hit" | "miss" | "saved"
}): CastHandle {
  const { parent, anchor, type } = opts
  const spec = routeFor(type, opts.spell)
  const target = opts.target ? opts.target.clone() : null
  const areaScale = opts.scale ?? 1
  const motion = spec?.motion ? MOTION[spec.motion] : null

  // The floor mark, for an area spell whose type has one. Read off the
  // spellbook: `area` is what makes a spell an area, and `concentration` is
  // what makes its mark linger rather than burn out.
  const entry = opts.spell ? spellEntry(opts.spell) : null
  // An area spell lays its type's floor loop over the whole area; a bolt
  // that struck one square lays the type's aftermath under that square.
  const mark: { sheet: string; area: AreaSpec | null; lingers: boolean; hold: number; size: number } | null =
    spec && spec.decal && entry?.area
      ? { sheet: spec.decal, area: entry.area, lingers: entry.concentration === true, hold: DECAL_HOLD, size: 0 }
      : spec && spec.aftermath && target
        ? { sheet: spec.aftermath.sheet, area: null, lingers: false, hold: spec.aftermath.hold, size: spec.aftermath.size }
        : null
  // The flourish follows the spell first, then the type — and only when the
  // spell took.
  const took = opts.outcome === undefined || opts.outcome === "hit"
  const flourish: Flourish | null = took
    ? (opts.spell ? FLOURISH_BY_SPELL[opts.spell.trim().toLowerCase()] : undefined) ?? spec?.flourish ?? null
    : null
  const flourishSpec = flourish ? FLOURISH_SHEETS[flourish] : null

  const group = new THREE.Group()
  parent.add(group)

  let disc: Flip | null = null
  let travel: Flip | null = null
  let impact: Flip | null = null
  let light: THREE.PointLight | null = null
  let decal: Flip | null = null
  let decalSheet: Sheet | null = null
  let decalFailed = false
  // The after-images behind a thrown ball, the flash and shockwave on
  // arrival, and the sparks. All optional: a sheet that never arrives costs
  // its piece and nothing else.
  const ghosts: Flip[] = []
  let flash: Flip | null = null
  let ring: Flip | null = null
  let sparks: ImpactBurst | null = null
  // The flourish's quads: one glow, or three laughing ghosts — plus, for
  // the ghosts, the swirl over the victim's head.
  const flourishQuads: Flip[] = []
  let swirl: Flip | null = null

  const hand = new THREE.Vector3()
  anchor.getWorldPosition(hand)
  const seed = opts.seed ?? (Math.floor(Math.abs(hand.x * 31 + hand.z * 17 + (target?.x ?? 0) * 7 + (target?.z ?? 0) * 3) * 10) & 0xffff)

  // Where the ball has been, for the after-images. A small ring buffer of
  // positions and rolls, filled once per frame while it flies.
  const HISTORY = 12
  const history: { p: THREE.Vector3; s: number }[] = []
  for (let i = 0; i < HISTORY; i++) history.push({ p: new THREE.Vector3(), s: 1 })
  let histLen = 0
  let histHead = 0
  // The last direction of travel, for the sparks to bounce back along.
  const lastVel = new THREE.Vector3()

  const charge = spec ? spec.charge : 0
  const flightTime =
    spec && spec.route === "ball" && target
      ? Math.max(0.12, hand.distanceTo(target) / (spec.speed ?? 15))
      : spec && (spec.route === "beam" || spec.route === "radiate")
        ? 0.55
        : 0.0
  const impactAt = charge + flightTime
  const impactLife = 0.9
  // A flourish outlives the impact sheet: the glow settles over the body
  // after the shimmer, the ghosts keep laughing after the blow.
  const lifetime = impactAt + Math.max(impactLife, flourishSpec?.life ?? 0)

  let t = 0
  let disposed = false
  let castGone = false
  let impacted = false
  let ended = false
  let endedAt = 0

  // Sheets may still be in flight. Each builder is a no-op until its sheet
  // lands, and the effect simply starts from wherever it has got to — a cast
  // never blocks on IO.
  if (spec) {
    if (spec.rune) {
      void loadSheet(spec.rune).then((s) => {
        if (disposed || castGone) return
        disc = new Flip(s, spec.tint, 1.1, 1.1)
        group.add(disc.mesh)
      }).catch(() => {})
    }

    if (spec.travel) {
      void loadSheet(spec.travel).then((s) => {
        if (disposed || castGone) return
        const isBeam = spec.route === "beam" || spec.route === "radiate"
        travel = new Flip(s, spec.tint, isBeam ? 1 : 0.9, isBeam ? 0.55 : 0.9)
        travel.opacity = 0
        group.add(travel.mesh)
        // After-images share the sheet and trail the ball, each fainter and
        // smaller than the last — the streak a fast thing leaves on the eye.
        if (spec.route === "ball" && motion && motion.trail > 0) {
          for (let i = 0; i < motion.trail; i++) {
            const g = new Flip(s, spec.tint, 0.9, 0.9)
            g.opacity = 0
            group.add(g.mesh)
            ghosts.push(g)
          }
        }
      }).catch(() => {})
    }

    if (spec.impact) {
      void loadSheet(spec.impact).then((s) => {
        if (disposed || castGone) return
        const k = (spec.impactScale ?? 1.6) * areaScale
        impact = new Flip(s, spec.tint, 2.0 * k, 2.0 * k)
        impact.opacity = 0
        group.add(impact.mesh)
      }).catch(() => {})
    }

    if (spec.burst) {
      const b = spec.burst
      const k = Math.sqrt(areaScale)
      void loadSheet(BURST_SHEETS.flash).then((s) => {
        if (disposed || castGone) return
        flash = new Flip(s, 0xffffff, 1.4 * k, 1.4 * k)
        flash.opacity = 0
        group.add(flash.mesh)
      }).catch(() => {})
      if (b.ring) {
        void loadSheet(BURST_SHEETS.ring).then((s) => {
          if (disposed || castGone) return
          ring = new Flip(s, b.tint, 2.6 * k, 2.6 * k)
          ring.mesh.rotation.x = -Math.PI / 2   // flat on the floor
          ring.opacity = 0
          group.add(ring.mesh)
        }).catch(() => {})
      }
      if (b.sparks > 0) {
        void loadSheet(BURST_SHEETS.spark).then((s) => {
          if (disposed || castGone) return
          sparks = new ImpactBurst(group, s, b.tint, Math.round(b.sparks * k))
        }).catch(() => {})
      }
    }

    if (flourish && flourishSpec) {
      void loadSheet(flourishSpec.sheet).then((s) => {
        if (disposed || castGone) return
        const k = Math.sqrt(areaScale)
        const count = flourish === "mockery" ? 3 : 1
        // A ghost is drawn 48x64: three quarters as wide as it is tall.
        const w = flourish === "mockery" ? 0.78 : 2.3 * k
        const h = flourish === "mockery" ? 1.04 : 2.3 * k
        for (let i = 0; i < count; i++) {
          const q = new Flip(s, flourishSpec.tint, w, h)
          q.opacity = 0
          group.add(q.mesh)
          flourishQuads.push(q)
        }
      }).catch(() => {})
      if (flourishSpec.extra) {
        void loadSheet(flourishSpec.extra).then((s) => {
          if (disposed || castGone) return
          swirl = new Flip(s, 0xffffff, 1.0, 1.0)
          swirl.mesh.rotation.x = -Math.PI * 0.32   // tilted toward the eye; re-aimed each frame
          swirl.opacity = 0
          group.add(swirl.mesh)
        }).catch(() => {})
      }
    }

    if (mark) {
      // Only the sheet is fetched here; the quad is built at impact, where
      // the landing point is known. A sheet that never arrives costs the
      // mark and nothing else — the cast ends on schedule without it.
      void loadSheet(mark.sheet).then((s) => {
        if (disposed) return
        decalSheet = s
      }).catch(() => { decalFailed = true })
    }

    // One non-shadowing light, matching the board's stated budget.
    light = new THREE.PointLight(spec.tint === 0xffffff ? 0xfff0d0 : spec.tint, 0, 9, 1.6)
    light.castShadow = false
    group.add(light)
  }

  /**
   * Tear down the cast — disc, delivery, bloom, light — and nothing else.
   *
   * Split from dispose() because a floor mark outlives the cast that laid it
   * by seconds or minutes, and keeping four invisible quads and a dead light
   * in the scene for a ten-minute Fog Cloud is four draw calls for nothing.
   */
  const disposeCast = () => {
    if (castGone) return
    castGone = true
    for (const f of [disc, travel, impact, flash, ring, swirl, ...ghosts, ...flourishQuads]) {
      if (!f) continue
      group.remove(f.mesh)
      f.dispose()
    }
    disc = travel = impact = flash = ring = swirl = null
    ghosts.length = 0
    flourishQuads.length = 0
    if (sparks) { sparks.dispose(); sparks = null }
    if (light) { group.remove(light); light = null }
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    disposeCast()
    if (decal) { group.remove(decal.mesh); decal.dispose(); decal = null }
    parent.remove(group)
  }

  /** Face the camera, or fall back to standing upright. */
  const billboard = (m: THREE.Object3D) => {
    if (opts.camera) m.quaternion.copy(opts.camera.quaternion)
  }

  const dest = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const foot = new THREE.Vector3()
  // Scratch for the flight maths — allocated once, reused every frame.
  const camRight = new THREE.Vector3()
  const camUp = new THREE.Vector3()
  const ahead = new THREE.Vector3()
  const vel = new THREE.Vector3()

  // The flight's frame — right and up of the line from hand to target — is
  // refreshed once per update (the hand bone moves) and read by ballAt.
  const fr = { right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), distance: 0 }
  const refreshFrame = () => {
    const f = flightFrame(hand, dest)
    fr.right.set(f.right.x, f.right.y, f.right.z)
    fr.up.set(f.up.x, f.up.y, f.up.z)
    fr.distance = f.distance
  }

  /** World position of a thrown ball at flight progress `p`. */
  const ballAt = (p: number, out: THREE.Vector3): THREE.Vector3 => {
    if (!motion) return out.lerpVectors(hand, dest, p)
    const pose = poseAt(motion, p, fr.distance, seed)
    return out
      .lerpVectors(hand, dest, pose.along)
      .addScaledVector(fr.right, pose.side)
      .addScaledVector(fr.up, pose.up)
  }

  /**
   * Face the camera, then roll so the sprite's +X points along `v` on
   * screen — the head leads and the tail streams behind, whatever the
   * camera is doing. Without a camera the sprite simply stands as drawn.
   */
  const aim = (m: THREE.Object3D, v: THREE.Vector3) => {
    billboard(m)
    if (!opts.camera || v.lengthSq() < 1e-8) return
    camRight.set(1, 0, 0).applyQuaternion(opts.camera.quaternion)
    camUp.set(0, 1, 0).applyQuaternion(opts.camera.quaternion)
    m.rotateZ(screenRoll(v, camRight, camUp))
  }

  return {
    update(dt: number) {
      if (disposed) return false
      if (!spec) { dispose(); return false }
      t += dt

      anchor.getWorldPosition(hand)
      dest.copy(target ?? hand)

      // The cast is over; only the floor mark, if any, is still going. Every
      // section below is guarded on the piece it draws, so once these are
      // null they fall through.
      if (t >= lifetime) disposeCast()

      // ── 1. the disc spins up off the hand ──────────────────────────────
      if (disc) {
        const p = Math.min(1, t / charge)
        if (t <= charge) {
          disc.mesh.position.copy(hand)
          // Vertical plane, facing along the cast, turning slowly — the disc
          // is meant to read as a sigil being drawn, not a spinning coin.
          if (target) {
            dir.subVectors(dest, hand).setY(0).normalize()
            disc.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
          } else {
            billboard(disc.mesh)
          }
          disc.mesh.rotateZ(t * 1.5)
          disc.setLooping(t * 1.6)
          disc.opacity = p < 0.25 ? p / 0.25 : 1
          disc.mesh.scale.setScalar(0.7 + 0.3 * p)
          if (light) light.intensity = 6 * p
        } else {
          // It does not vanish at launch; it fades as the spell leaves.
          const f = Math.max(0, 1 - (t - charge) / 0.35)
          disc.opacity = f
          disc.mesh.scale.setScalar(1 + (1 - f) * 0.6)
        }
      }

      // ── 2. delivery ────────────────────────────────────────────────────
      if (t >= charge && travel) {
        const ft = t - charge
        const p = flightTime > 0 ? Math.min(1, ft / flightTime) : 1

        if (spec.route === "ball") {
          // Where it is, and where it is about to be: the difference is the
          // heading, which the sprite is rolled to and the tail streams from.
          refreshFrame()
          ballAt(p, travel.mesh.position)
          ballAt(Math.min(1, p + 0.03), ahead)
          vel.subVectors(ahead, travel.mesh.position)
          if (vel.lengthSq() > 1e-8) lastVel.copy(vel)
          aim(travel.mesh, lastVel)
          // Stretched along its travel as it speeds up: motion smear, the
          // way a sprite artist draws speed. Thinner as it lengthens so the
          // area, and so the brightness, stays about the same.
          const st = motion ? stretchAt(motion, p) : 1
          travel.mesh.scale.set(st, 1 / Math.sqrt(st), 1)
          travel.clock(ft)
          travel.opacity = p < 0.08 ? p / 0.08 : 1
          if (light) {
            light.position.copy(travel.mesh.position).sub(group.position)
            light.intensity = 14
          }
          // After-images: remember this frame, and draw the ghosts at frames
          // gone by, each fainter and smaller than the one in front of it.
          const slot = history[histHead]
          slot.p.copy(travel.mesh.position); slot.s = st
          histHead = (histHead + 1) % HISTORY
          histLen = Math.min(HISTORY, histLen + 1)
          for (let i = 0; i < ghosts.length; i++) {
            const back = (i + 1) * 2
            const g = ghosts[i]
            if (back >= histLen || p >= 1) { g.opacity = 0; continue }
            const h = history[(histHead - 1 - back + HISTORY * 2) % HISTORY]
            g.mesh.position.copy(h.p)
            aim(g.mesh, lastVel)
            const shrink = Math.pow(0.82, i + 1)
            g.mesh.scale.set(h.s * shrink, shrink / Math.sqrt(h.s), 1)
            g.clock(ft)
            g.opacity = 0.42 * Math.pow(0.6, i)
          }
        } else {
          // Beam and radiate: a quad stretched from the hand outward. Thunder
          // is deliberately NOT a projectile — it is a focused ripple that
          // rolls toward the target.
          const len = hand.distanceTo(dest) || 1
          const reach = spec.route === "radiate" ? len * 0.78 : len
          travel.mesh.position.copy(hand).lerp(dest, 0.5)
          dir.subVectors(dest, hand).normalize()
          travel.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir)
          travel.mesh.scale.set(reach, 1 + (spec.route === "radiate" ? 1.4 : 0), 1)
          travel.setLooping(ft * 2.6)
          travel.opacity = p < 0.15 ? p / 0.15 : Math.max(0, 1 - (p - 0.6) / 0.4)
          if (light) { light.position.set(0, 0, 0); light.intensity = 10 }
        }
      }

      // ── 3. impact ──────────────────────────────────────────────────────
      if (t >= impactAt) {
        if (!impacted) {
          impacted = true
          // Announce the landing even when the impact sheet is still loading,
          // so a flinch is never skipped just because a texture was slow.
          opts.onImpact?.()
          // The ball is gone the instant it lands: it became the burst.
          if (travel && spec.route === "ball") travel.opacity = 0
          for (const g of ghosts) g.opacity = 0
          // The direction it arrived from, for the sparks to bounce off. A
          // beam or a column has no flight; they throw evenly.
          const incoming = spec.route === "ball" && lastVel.lengthSq() > 1e-8
            ? lastVel
            : spec.route === "sky" ? new THREE.Vector3(0, -1, 0) : null
          const power = (spec.burst?.power ?? 1) * Math.sqrt(areaScale)
          sparks?.fire(dest, incoming, power, seed)
        }
        if (impact && impact.mesh.position.lengthSq() === 0) {
          impact.mesh.position.copy(dest)
          if (spec.route === "sky") impact.mesh.position.y += 0.9
        }
      }
      if (t >= impactAt && impact) {
        const it = t - impactAt
        const p = Math.min(1, it / impactLife)
        if (spec.route === "sky") {
          // A column stands upright rather than facing the camera.
          impact.mesh.quaternion.identity()
          if (opts.camera) {
            dir.subVectors(opts.camera.position, impact.mesh.position).setY(0).normalize()
            impact.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
          }
        } else {
          billboard(impact.mesh)
        }
        impact.setProgress(p)
        impact.opacity = 1 - Math.max(0, (p - 0.7) / 0.3)
        // THE PUNCH. It lands big and settles in a tenth of a second — the
        // overshoot-and-settle every hit in a fighting game has, and the
        // single cheapest thing that makes an impact feel like it has mass.
        const punch = 1 + 0.35 * Math.max(0, 1 - it / 0.12)
        impact.mesh.scale.setScalar(punch)
        if (light) {
          light.position.copy(dest).sub(group.position)
          // A spike, not a ramp: bright for a few frames, then the decay.
          light.intensity = 18 * (1 - p) + 22 * Math.max(0, 1 - it / 0.1)
        }
      }
      // The flash, the shockwave, the sparks. Each on its own clock, all
      // starting on the impact frame, all shorter than the impact sheet.
      if (t >= impactAt && spec.burst) {
        const it = t - impactAt
        const b = spec.burst
        if (flash) {
          const FLASH_LIFE = 0.24
          const fp = Math.min(1, it / FLASH_LIFE)
          flash.mesh.position.copy(dest)
          if (spec.route === "sky") flash.mesh.position.y += 0.4
          billboard(flash.mesh)
          flash.setProgress(fp)
          // White at the instant of the hit, cooling to the type's colour.
          flash.tint = fp < 0.3 ? 0xffffff : b.tint
          flash.opacity = fp < 1 ? 1 : 0
        }
        if (ring) {
          const RING_LIFE = 0.45
          const rp = Math.min(1, it / RING_LIFE)
          ring.mesh.position.set(dest.x, 0.03, dest.z)   // a hair above the floor marks
          ring.setProgress(rp)
          ring.opacity = rp < 1 ? 1 - rp * 0.5 : 0
        }
        sparks?.update(dt, opts.camera)
      }

      // ── 3b. the flourish ───────────────────────────────────────────────
      if (t >= impactAt && flourish && flourishSpec && flourishQuads.length) {
        const ft = t - impactAt
        const life = flourishSpec.life
        // In over a fifth of a second, out over the last half second.
        const a = Math.min(1, ft / 0.2) * Math.min(1, Math.max(0, (life - ft) / 0.5))
        if (flourish === "glow") {
          // One halo around the body, breathing slowly, motes rising in
          // the sheet itself. Lit from within.
          const q = flourishQuads[0]
          q.mesh.position.copy(dest)
          q.mesh.position.y += 0.35
          billboard(q.mesh)
          q.mesh.scale.setScalar(1 + 0.06 * Math.sin(ft * 3.5))
          q.clock(ft)
          q.opacity = a
          if (light) {
            light.position.copy(dest).sub(group.position)
            light.intensity = Math.max(light.intensity, 9 * a)
          }
        } else {
          // Three ghosts circling the head, bobbing and swaying out of step.
          // The sprite points its finger to ITS left, so a ghost on the
          // victim's right is mirrored: every finger points at the victim.
          const n = flourishQuads.length
          if (opts.camera) camRight.set(1, 0, 0).applyQuaternion(opts.camera.quaternion)
          for (let i = 0; i < n; i++) {
            const q = flourishQuads[i]
            const ang = ft * 1.1 + (i / n) * Math.PI * 2 + seed
            const ox = Math.cos(ang) * 0.72
            const oz = Math.sin(ang) * 0.72
            q.mesh.position.set(dest.x + ox, dest.y + 0.5 + Math.sin(ft * 3.1 + i * 2.1) * 0.09, dest.z + oz)
            billboard(q.mesh)
            q.mesh.rotateZ(Math.sin(ft * 2.3 + i) * 0.08)
            const onRight = opts.camera ? ox * camRight.x + oz * camRight.z > 0 : false
            q.mesh.scale.x = onRight ? -1 : 1
            q.clock(ft + i * 0.31)
            q.opacity = a
          }
          if (swirl) {
            // The whorl over the head, a hand above it, turning with the
            // sheet. Tilted toward the camera rather than lying flat: flat,
            // a low camera sees it edge-on as a line; upright, it would hide
            // the face. This is the angle the reference draws it at.
            swirl.mesh.position.set(dest.x, dest.y + 1.02, dest.z)
            if (opts.camera) {
              dir.subVectors(opts.camera.position, swirl.mesh.position).setY(0)
              const yaw = dir.lengthSq() > 1e-6 ? Math.atan2(dir.x, dir.z) : 0
              swirl.mesh.rotation.set(-Math.PI * 0.32, yaw, 0, "YXZ")
            }
            swirl.mesh.scale.setScalar(1 + 0.05 * Math.sin(ft * 5))
            swirl.clock(ft)
            swirl.opacity = a
          }
        }
      }

      // ── 4. the floor mark ──────────────────────────────────────────────
      // Laid on the impact frame, flat on the floor at the area's centre and
      // the area's size; fades in with the bloom, loops while it lives, then
      // fades over a second. A lingering (concentration) mark lives until
      // end() — or the cap — and a one-shot one for DECAL_HOLD seconds.
      let markOver = true
      if (mark && t >= impactAt) {
        const mt = t - impactAt
        if (!decal && decalSheet) {
          const d = mark.area ? decalDiameter(mark.area) * areaScale : mark.size
          decal = new Flip(decalSheet, spec.tint, d, d)
          decal.mesh.rotation.x = -Math.PI / 2
          if (mark.area) decal.mesh.position.copy(decalCentre(mark.area, foot.set(hand.x, 0, hand.z), dest))
          else decal.mesh.position.set(dest.x, DECAL_Y, dest.z)   // under the one square struck
          decal.opacity = 0
          group.add(decal.mesh)
        }
        const hold = mark.lingers ? DECAL_CONCENTRATION_CAP : mark.hold
        const endAt = ended ? Math.min(endedAt, hold) : hold
        if (decal && decalSheet) {
          let a = Math.min(1, mt / DECAL_FADE_IN)
          if (mt > endAt) a *= Math.max(0, 1 - (mt - endAt) / DECAL_FADE)
          decal.opacity = a
          // A clock, not a 0..1 progress: the sheet loops (Flip.setProgress),
          // so this plays it at its own frame rate for as long as it lives.
          decal.setProgress((mt * decalSheet.fps) / decalSheet.frames)
        }
        markOver = decalFailed || mt >= endAt + DECAL_FADE
      } else if (mark) {
        markOver = false
      }

      if (t >= lifetime && markOver) { dispose(); return false }
      return true
    },
    end() {
      if (ended) return
      ended = true
      endedAt = Math.max(0, t - impactAt)
    },
    dispose,
  }
}

/**
 * What is left of a creature that was killed by this.
 *
 * SRD 5.1, Combat: "Most GMs have a monster die the instant it drops to 0 hit
 * points" — so a monster's death is a moment, not a process, and it should
 * look like whatever killed it. The type's own impact sheet is replayed over
 * the body: bigger, slower, and lower to the ground than the hit that caused
 * it, so it reads as consuming the creature rather than striking it again.
 *
 * The body is NOT removed. It holds its death pose on the square, which keeps
 * the battlefield readable and leaves the square occupied until someone moves
 * it.
 */
export function deathVfx(opts: {
  parent: THREE.Object3D
  position: THREE.Vector3
  type: DamageType
  camera?: THREE.Camera | null
  /** Bigger creature, bigger death. 1 = a single square. */
  scale?: number
}): VfxHandle {
  const spec = TYPES[opts.type]
  // Every type now has a CAST entry, so this reads straight off it.
  //
  // It used to special-case lightning and physical, which had none: a weapon
  // death borrowed forceHit and a lightning death borrowed thunderImpact.
  // Lightning still resolves to thunderImpact, by the entry rather than by
  // the exception — but a creature cut down by a sword now bursts as struck
  // steel instead of as arcane force, which is what it was always meant to
  // be and could not be while there was no sheet for it.
  const deathSheet = spec?.impact ?? null
  const tint = spec?.tint ?? 0xffffff
  const size = 2.6 * (opts.scale ?? 1)
  const life = 1.5

  const group = new THREE.Group()
  group.position.copy(opts.position)
  opts.parent.add(group)

  const light = new THREE.PointLight(0xfff0d0, 0, 10, 1.7)
  light.castShadow = false
  group.add(light)

  let sheet: Flip | null = null
  let t = 0
  let disposed = false

  if (deathSheet) {
    void loadSheet(deathSheet).then((s) => {
      if (disposed) return
      sheet = new Flip(s, tint, size, size)
      // Sits low: this is the body being consumed, not a burst in the air.
      sheet.mesh.position.y = size * 0.32
      group.add(sheet.mesh)
    }).catch(() => {})
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    sheet?.dispose()
    group.remove(light)
    opts.parent.remove(group)
  }

  return {
    update(dt: number) {
      if (disposed) return false
      t += dt
      const p = Math.min(1, t / life)
      if (sheet) {
        // Slower than a hit — the sheet is stretched across the whole life.
        sheet.setProgress(p)
        sheet.opacity = 1 - Math.max(0, (p - 0.55) / 0.45)
        sheet.mesh.scale.setScalar(1 + p * 0.5)
        if (opts.camera) sheet.mesh.quaternion.copy(opts.camera.quaternion)
      }
      light.intensity = 20 * (1 - p) * (1 - p)
      if (t >= life) { dispose(); return false }
      return true
    },
    dispose,
  }
}

/** Drop every cached sheet — used by tests and by dev hot-reload. */
export function _resetKitCache() {
  manifestPromise = null
  sheets.clear()
  ready.clear()
}
