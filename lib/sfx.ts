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

/** A weapon swing that connected, chosen by what it hit. */
export function meleeHit(crit: boolean): SfxName {
  return crit ? "combat/crit_hit" : "combat/melee_hit_flesh"
}
