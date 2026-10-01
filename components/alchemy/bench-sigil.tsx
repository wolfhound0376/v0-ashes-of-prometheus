"use client"

// The rune sealing a brew, shown on the bench vessel. Sam, 2026-10-01: "Do we
// have sigil activation animations on the bench?" — the battle board did, the
// bench did not.
//
// NOTHING NEW IS DRAWN OR GENERATED. This reuses the board's own approved
// school art and motion:
//   * public/vfx/rune<School>.webp — the glyph sheet (4×4, 16 frames)
//   * public/vfx/sigil<School>Ring.webp — the band under the vessel (4×2, 8 frames)
//   * public/vfx/pxSigilBurst.webp / pxSigilShatter.webp — release / a natural 1
//   * lib/spell-school-vfx.ts glyphPose / releasePose / SCHOOL_VFX — the exact
//     colour and motion each school has on the board (evocation winds up and
//     flares, abjuration's two rings contract and lock, divination holds still
//     and reads, and so on). A rune on the bench moves the way the same school
//     moves around a caster's arm.
//
// Phases: "charge" while the brewing check rolls, "release" when the brew
// lands (the ring throws outward and the burst plays), "shatter" on a
// natural 1 (the rune is spent with the vessel).

import { useEffect, useRef } from "react"
import { SCHOOL_VFX, glyphPose, quadCount, releasePose } from "@/lib/spell-school-vfx"
import type { MagicSchool } from "@/lib/spell-school"

export type SigilPhase = "charge" | "release" | "shatter"

const RING_SHEET: Partial<Record<MagicSchool, string>> = {
  abjuration: "sigilAbjurationRing",
  conjuration: "sigilConjurationRing",
  enchantment: "sigilEnchantmentRing",
  evocation: "sigilEvocationRing",
  illusion: "sigilIllusionRing",
  necromancy: "sigilNecroticRing",
  transmutation: "sigilTransmutationRing",
  // divination has no ring sheet; it is the school that holds still and reads,
  // so its glyphs alone carry it.
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`

interface Sheet { cols: number; rows: number; frames: number; fps: number; loop?: boolean; peak?: number }

// The board's sheet manifest is the one source of every sheet's layout.
let manifest: Promise<Record<string, Sheet>> | null = null
function sheets(): Promise<Record<string, Sheet>> {
  manifest ??= fetch("/vfx/manifest.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
  return manifest
}

/** The frame to show `t` seconds in: loops loop; one-shots climb to their
 *  peak (or last frame) and hold there while the rune charges. */
function frameAt(sh: Sheet | undefined, t: number): number {
  if (!sh) return 0
  const f = Math.floor(t * sh.fps)
  if (sh.loop) return f % sh.frames
  return Math.min(f, sh.peak ?? sh.frames - 1)
}

function load(src: string): HTMLImageElement {
  const im = new Image()
  im.src = src
  return im
}

/** One frame of a cols×rows sheet. */
function frame(ctx: CanvasRenderingContext2D, im: HTMLImageElement, sh: Sheet | undefined, f: number, x: number, y: number, w: number, h: number) {
  if (!sh || !im.complete || !im.naturalWidth) return
  const { cols, rows } = sh
  const cw = im.naturalWidth / cols, ch = im.naturalHeight / rows
  const i = Math.max(0, Math.min(sh.frames - 1, f))
  ctx.drawImage(im, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch, x, y, w, h)
}

export function BenchSigil({ school, phase }: { school: MagicSchool; phase: SigilPhase }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const phaseRef = useRef(phase)
  const releasedAt = useRef<number | null>(null)
  phaseRef.current = phase

  useEffect(() => {
    if (phase !== "charge" && releasedAt.current === null) releasedAt.current = performance.now()
    if (phase === "charge") releasedAt.current = null
  }, [phase])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const glyphs = load(`/vfx/rune${cap(school)}.webp`)
    const ringName = RING_SHEET[school]
    const ring = ringName ? load(`/vfx/${ringName}.webp`) : null
    const burst = load("/vfx/pxSigilBurst.webp")
    const shatter = load("/vfx/pxSigilShatter.webp")
    // Tinting a sheet frame needs its own scratch canvas: draw, then colour
    // only the glyph's own pixels (source-atop), then composite.
    const scratch = document.createElement("canvas")
    scratch.width = scratch.height = 96
    const sx = scratch.getContext("2d")!
    // The burst and shatter are drawn WHITE and tinted per school, exactly as
    // the board does (lib/target-sigil.ts) — untinted they read as bare white
    // wedges. They are pixel art, so they stay unsmoothed.
    const bscratch = document.createElement("canvas")
    bscratch.width = bscratch.height = 128
    const bx = bscratch.getContext("2d")!
    bx.imageSmoothingEnabled = false
    const vfx = SCHOOL_VFX[school]
    const tint = hex(vfx.tint), flash = hex(vfx.release)
    const n = quadCount(school)
    const CHARGE = 2.4
    const start = performance.now()
    let raf = 0
    let man: Record<string, Sheet> = {}
    void sheets().then((m) => { man = m })

    const draw = (now: number) => {
      const W = canvas.width, H = canvas.height
      ctx.clearRect(0, 0, W, H)
      const t = (now - start) / 1000
      const rel = releasedAt.current !== null ? (now - releasedAt.current) / 1000 : null
      const rp = rel !== null ? releasePose(school, rel) : { scale: 1, opacity: 1 }
      const cx = W / 2, cy = H * 0.62
      const R = W * 0.36 * rp.scale
      ctx.globalAlpha = rp.opacity

      // The band the rune sits in, under the vessel, seen from slightly above.
      if (ring) {
        ctx.save()
        ctx.globalCompositeOperation = "lighter"
        const rw = W * 0.92 * rp.scale, rh = rw / 2
        frame(ctx, ring, man[ringName!], frameAt(man[ringName!], t), cx - rw / 2, cy - rh / 2 + H * 0.1, rw, rh)
        ctx.restore()
      }

      // The glyphs, posed by the board's own motion, flattened onto an ellipse
      // around the vessel (a ring around a forearm becomes a ring around a neck).
      const charge = rel === null ? Math.min(t, CHARGE) : CHARGE
      for (let i = 0; i < n; i++) {
        const pose = glyphPose(school, i, reduce ? CHARGE : charge + (rel === null ? 0 : rel), CHARGE, 7)
        const r = (pose.radius / vfx.radius) * R
        const x = cx + Math.cos(pose.angle) * r
        const y = cy + Math.sin(pose.angle) * r * 0.32 - pose.along * H
        const depth = 0.65 + 0.35 * ((Math.sin(pose.angle) + 1) / 2) // nearer glyphs larger, brighter
        const size = W * 0.16 * depth * Math.abs(pose.scale)
        sx.clearRect(0, 0, 96, 96)
        sx.globalCompositeOperation = "source-over"
        sx.save()
        if (pose.scale < 0) { sx.translate(0, 96); sx.scale(1, -1) }
        const gs = man[`rune${cap(school)}`]
        frame(sx, glyphs, gs, gs ? Math.floor((t + i * 0.07) * gs.fps) % gs.frames : 0, 0, 0, 96, 96)
        sx.restore()
        sx.globalCompositeOperation = "source-atop"
        sx.fillStyle = rel !== null && rel < 0.12 ? flash : tint
        sx.fillRect(0, 0, 96, 96)
        ctx.save()
        ctx.globalAlpha = rp.opacity * pose.opacity * depth
        ctx.globalCompositeOperation = "lighter"
        ctx.drawImage(scratch, x - size / 2, y - size / 2, size, size)
        ctx.restore()
      }

      // Release: the burst. A natural 1: the rune shatters with the vessel.
      if (rel !== null) {
        const key = phaseRef.current === "shatter" ? "pxSigilShatter" : "pxSigilBurst"
        const sheet = phaseRef.current === "shatter" ? shatter : burst
        const sh = man[key]
        const f = sh ? Math.floor(rel * sh.fps) : 99
        if (sh && f < sh.frames) {
          const s = W * 0.7
          bx.clearRect(0, 0, 128, 128)
          bx.globalCompositeOperation = "source-over"
          frame(bx, sheet, sh, f, 0, 0, 128, 128)
          bx.globalCompositeOperation = "source-atop"
          bx.fillStyle = tint
          bx.fillRect(0, 0, 128, 128)
          ctx.globalAlpha = 1
          ctx.save()
          ctx.imageSmoothingEnabled = false
          ctx.globalCompositeOperation = "lighter"
          ctx.drawImage(bscratch, cx - s / 2, cy - s / 2, s, s)
          ctx.restore()
        }
        if (rel > 1.2) return // done; leave the canvas clear
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [school])

  return (
    <canvas
      ref={ref}
      width={420}
      height={420}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ imageRendering: "auto" }}
    />
  )
}
