// ============================================================================
// THE SOUND BANK — Sam's 93 effects, playable from the board.
//
// Converted from his WAV originals to 64k mono Opus: 30 MB became 3.3 MB, and
// nothing at this table is stereo-critical because the board positions its own
// sounds by moving the camera, not the mix.
//
// Structure of the bank is the structure of a spell:
//
//     <school>_windup   the ramp, while the caster is choosing a target
//     <school>_release  the moment it leaves the hand
//     impact_<type>     the moment it lands, played at the TARGET
//     <school>_tail     the decay
//
// which is exactly the two-phase cast Sam asked for, so the audio drives the
// pacing rather than being sprinkled on afterwards.
//
// WHY AudioContext AND NOT `new Audio()`: an <audio> element per effect leaks
// elements, cannot overlap cleanly with itself (a second dagger stab restarts
// the first), and on iOS refuses to play at all until a user gesture touches
// that specific element. One context, decoded buffers, a fresh source node per
// play — overlapping is free and the gesture unlock happens once.
// ============================================================================

const BASE = "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/sfx"

export type SfxName =
  // magic — one set per school
  | `magic/${"arcane" | "cold" | "eldritch" | "fire" | "holy" | "nature" | "necrotic" | "psychic"}_${"windup" | "release" | "tail"}`
  | `magic/impact_${"acid" | "cold" | "fire" | "force" | "lightning" | "necrotic" | "poison" | "psychic" | "radiant" | "thunder"}`
  | "magic/counterspell" | "magic/spell_fizzle" | "magic/concentration_broken" | "magic/heal_tail"
  // combat
  | `combat/${string}`
  | `creature/${string}`
  | `movement/${string}`
  | `ui/${string}`
  // Pack 01: cues that belong to a particular SPELL rather than to its
  // school. A prefix of their own so they cannot be confused with the
  // school chain in `magic/`, which answers a different question — what
  // KIND of magic this is, rather than which spell it is.
  | `spells/${string}`

let ctx: AudioContext | null = null
const buffers = new Map<string, AudioBuffer>()
const inflight = new Map<string, Promise<AudioBuffer | null>>()

/** Master volume, 0–1. Persisted so the table's setting survives a reload. */
let masterVolume = 0.8
let muted = false

const KEY = "aop:sfx"
if (typeof window !== "undefined") {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as { volume?: number; muted?: boolean }
      if (typeof p.volume === "number") masterVolume = Math.max(0, Math.min(1, p.volume))
      if (typeof p.muted === "boolean") muted = p.muted
    }
  } catch {
    /* a corrupt pref must never stop the sound */
  }
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ volume: masterVolume, muted }))
  } catch {
    /* private mode; the setting is just not remembered */
  }
}

export function setSfxVolume(v: number) {
  masterVolume = Math.max(0, Math.min(1, v))
  persist()
}
export function setSfxMuted(m: boolean) {
  muted = m
  persist()
}
export const sfxVolume = () => masterVolume
export const sfxMuted = () => muted

function context(): AudioContext | null {
  if (typeof window === "undefined") return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  // Browsers suspend the context until a gesture. Every play attempts a
  // resume; the first one after a click is the one that takes.
  if (ctx.state === "suspended") void ctx.resume().catch(() => {})
  return ctx
}

async function load(name: string): Promise<AudioBuffer | null> {
  const hit = buffers.get(name)
  if (hit) return hit
  const pending = inflight.get(name)
  if (pending) return pending

  const p = (async () => {
    const c = context()
    if (!c) return null
    try {
      const res = await fetch(`${BASE}/${name}.ogg`, { cache: "force-cache" })
      if (!res.ok) {
        console.warn(`[sfx] ${name} → HTTP ${res.status}`)
        return null
      }
      const buf = await c.decodeAudioData(await res.arrayBuffer())
      buffers.set(name, buf)
      return buf
    } catch (e) {
      // A missing or undecodable effect must never break a turn.
      console.warn(`[sfx] ${name} failed to load`, e)
      return null
    } finally {
      inflight.delete(name)
    }
  })()
  inflight.set(name, p)
  return p
}

/** Pull sounds into memory before they are needed, so the first cast is not late. */
export function preloadSfx(names: SfxName[]) {
  for (const n of names) void load(n)
}

export interface PlayHandle {
  /** Fade out and stop — used when a windup is cancelled. */
  stop: (fadeSeconds?: number) => void
}

const NOOP: PlayHandle = { stop: () => {} }

/**
 * Play one effect. Returns a handle so a looping windup can be cut short when
 * the caster picks a target (or changes their mind).
 */
export function playSfx(
  name: SfxName,
  opts: { volume?: number; loop?: boolean; rate?: number; fadeIn?: number } = {},
): PlayHandle {
  if (muted) return NOOP
  const c = context()
  if (!c) return NOOP

  let stopped = false
  let node: AudioBufferSourceNode | null = null
  let gain: GainNode | null = null

  void load(name).then((buf) => {
    if (!buf || stopped) return
    const src = c.createBufferSource()
    src.buffer = buf
    src.loop = Boolean(opts.loop)
    if (opts.rate) src.playbackRate.value = opts.rate
    const g = c.createGain()
    const target = masterVolume * (opts.volume ?? 1)
    if (opts.fadeIn) {
      g.gain.setValueAtTime(0.0001, c.currentTime)
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, target), c.currentTime + opts.fadeIn)
    } else {
      g.gain.value = target
    }
    src.connect(g).connect(c.destination)
    src.start()
    node = src
    gain = g
  })

  return {
    stop(fadeSeconds = 0.12) {
      stopped = true
      if (!node || !gain) return
      const n = node
      const g = gain
      try {
        g.gain.cancelScheduledValues(c.currentTime)
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), c.currentTime)
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + fadeSeconds)
        n.stop(c.currentTime + fadeSeconds + 0.02)
      } catch {
        try { n.stop() } catch { /* already ended */ }
      }
      node = null
      gain = null
    },
  }
}

// ---------------------------------------------------------------- helpers --

import type { School, DamageType } from "./spellbook"

export const windupFor = (s: School) => `magic/${s}_windup` as SfxName
export const releaseFor = (s: School) => `magic/${s}_release` as SfxName
export const tailFor = (s: School) => `magic/${s}_tail` as SfxName
export const impactFor = (d: DamageType) => `magic/impact_${d}` as SfxName

/**
 * What a blow SOUNDS like when it lands, chosen by what it landed on.
 *
 * This returned one of two clips — crit, or `melee_hit_flesh` for absolutely
 * everything else. Meanwhile the bucket has held `melee_hit_bludgeon`,
 * `melee_hit_chainmail`, `melee_hit_plate`, `arrow_hit_flesh` and
 * `arrow_hit_stone` since the day the sound pack was recorded, and not one of
 * them was ever played. Five clips, paid for, silent.
 *
 * So the choice is made from the fiction rather than at random:
 *
 *   an ARROW sounds like an arrow, and a MISSED arrow hits the wall behind
 *   a MACE thuds whatever it hits
 *   a BLADE rings off armour and does not ring off a robe
 *
 * Reading the target's AC for its armour is a proxy, and an honest one: in
 * this campaign a 17+ is plate or scale, 14-16 is mail or a shield, and
 * anything under is cloth and skin. It is also the only armour signal the
 * board actually has — nothing stores what a creature is wearing.
 */
export function meleeHit(
  crit: boolean,
  opts: { ranged?: boolean; damageType?: string | null; targetAc?: number | null; hit?: boolean } = {},
): SfxName {
  // Every return goes through pickVariant, so a second take of any of these
  // starts playing the moment it is uploaded - see the variants section.
  const pick = (n: SfxName) => pickVariant(n)
  // A miss by an arrow is the shaft hitting stone somewhere past the target.
  if (opts.ranged && opts.hit === false) return pick("combat/arrow_hit_stone")
  if (opts.ranged) return pick("combat/arrow_hit_flesh")
  // The crit is its own sound and outranks the surface it landed on.
  if (crit) return pick("combat/crit_hit")
  if ((opts.damageType ?? "").toLowerCase() === "bludgeoning") return pick("combat/melee_hit_bludgeon")
  const ac = opts.targetAc ?? 0
  if (ac >= 17) return pick("combat/melee_hit_plate")
  if (ac >= 14) return pick("combat/melee_hit_chainmail")
  return pick("combat/melee_hit_flesh")
}

/**
 * A small, random detune, so the same clip is not the same SOUND twice.
 *
 * Sam asked for a variety of melee sounds. Half of that is the clip, above.
 * The other half is that even four clips repeat inside one round, and the ear
 * catches an identical waveform far faster than it catches a repeated sample.
 * A few percent of pitch is what stops a rack of six attacks sounding like a
 * loop, and it costs no recording.
 *
 * Deliberately narrow. Past about 8% a weapon starts changing size.
 */
export function variedRate(spread = 0.06): number {
  return 1 + (Math.random() * 2 - 1) * spread
}

/**
 * The sounds a weapon makes, by name.
 *
 * Steel does not hum: routing a mace through the arcane windup was the first
 * thing that gave away that weapons had been bolted onto the spell path.
 * A bow is drawn and released; a blade is swung. Anything unrecognised gets
 * the light swing, which is wrong for nothing in particular.
 */
export function weaponSounds(name: string): { windup: SfxName | null; release: SfxName } {
  const n = name.toLowerCase()
  // Swings go through the variant pool too, so an extra take of any of these
  // joins the rotation on upload.
  const pick = (s: SfxName) => ({ windup: null, release: pickVariant(s) })
  if (/bow|sling/.test(n)) {
    return pick(/cross/.test(n) ? "combat/crossbow_release" : "combat/bow_release")
  }
  if (/dagger|knife|shortsword|rapier|scimitar/.test(n)) {
    return pick("combat/dagger_stab")
  }
  if (/mace|hammer|maul|club|staff|greatsword|axe|halberd/.test(n)) {
    return pick("combat/melee_swing_heavy")
  }
  // Checked BEFORE the light-swing fallback, and it has to be: an unarmed
  // strike has no blade to whistle, so the fallback was giving a punch the
  // sound of a sword being swung.
  // This is the one Sam asked for a second take of. Drop
  // `combat/unarmed_hit_2.ogg` in the bucket and it starts alternating.
  if (/unarmed|fist|punch|claw|bite|slam|kick/.test(n)) {
    return pick("combat/unarmed_hit")
  }
  return pick("combat/melee_swing_light")
}

/** The rogue's one moment, played when the server says the feature fired. */
export const SNEAK_ATTACK: SfxName = "combat/sneak_attack"

// ------------------------------------------------------------- variants ----
//
// A SECOND TAKE OF A CLIP PLAYS THE MOMENT IT EXISTS, WITH NO CODE CHANGE.
//
// Sam asked for two unarmed sounds. One is recorded. Wiring a name for a file
// that is not there would make three quarters of the punches silent, and
// waiting for the recording means the wiring never gets done — so instead the
// pool ASKS.
//
// Upload `combat/unarmed_hit_2.ogg` to the bucket and the next punch may use
// it. Upload a `_3` and it joins too. Nothing here needs editing, no manifest
// needs updating, and a variant that does not exist is asked about exactly
// once and then forgotten.
//
// The probe is the same `load()` every play already goes through, so a variant
// that IS there is warm by the time it is first chosen rather than arriving a
// beat late.

/** How many extra takes to look for. `_2` through `_4`. */
const MAX_VARIANTS = 4

/** base slug -> the takes confirmed to exist, base included. Built once. */
const pools = new Map<string, SfxName[]>()
/** base slug -> the last one played, so a pool of two never repeats. */
const lastPick = new Map<string, SfxName>()

function ensurePool(base: SfxName): SfxName[] {
  const known = pools.get(base)
  if (known) return known
  // The base is in from the start, so the very first call has something to
  // play. Variants join asynchronously as their probes come back.
  const pool: SfxName[] = [base]
  pools.set(base, pool)
  for (let n = 2; n <= MAX_VARIANTS; n++) {
    const name = `${base}_${n}` as SfxName
    void load(name).then((buf) => {
      if (buf) pool.push(name)
    })
  }
  return pool
}

/**
 * One take of `base`, avoiding the one played last.
 *
 * Avoiding the repeat matters more than the randomness: with two clips, a
 * fair coin plays the same one twice in a row half the time, and a player
 * hears "it did not change" rather than "there are two".
 */
export function pickVariant(base: SfxName): SfxName {
  const pool = ensurePool(base)
  if (pool.length === 1) return pool[0]
  const previous = lastPick.get(base)
  const fresh = pool.filter((n) => n !== previous)
  const chosen = fresh[Math.floor(Math.random() * fresh.length)] ?? pool[0]
  lastPick.set(base, chosen)
  return chosen
}

/** Testing seam: forget every probe. Not used by the app. */
export function _resetVariantPools() {
  pools.clear()
  lastPick.clear()
}
