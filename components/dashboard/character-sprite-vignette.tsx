"use client"

import { useEffect, useRef } from "react"
import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"
import { isSpriteManifestUrl, type SpriteAnimation, type SpriteManifest } from "@/lib/sprite-token"

interface SpriteAction {
  name: string
  anim: SpriteAnimation
  sheetUrl: string
  durationMs: number
}

interface ResolvedSprite {
  manifest: SpriteManifest
  actions: SpriteAction[]
}

const ACTION_ORDER = ["idle", "walk", "attack", "cast", "hurt", "dead"]
const LOOP_SHOWCASE_MS = 2400
const ONE_SHOT_HOLD_MS = 500
const DEAD_HOLD_MS = 1400

function buildActions(manifest: SpriteManifest, base: string): SpriteAction[] {
  const names = Object.keys(manifest.animations).sort((a, b) => {
    const ia = ACTION_ORDER.indexOf(a)
    const ib = ACTION_ORDER.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
  return names.flatMap((name) => {
    const anim = (manifest.animations as Record<string, SpriteAction["anim"] | undefined>)[name]
    if (!anim) return []
    const playMs = (anim.frames / Math.max(anim.fps, 1)) * 1000
    const durationMs = anim.loop
      ? Math.max(LOOP_SHOWCASE_MS, playMs)
      : playMs + (name === "dead" ? DEAD_HOLD_MS : ONE_SHOT_HOLD_MS)
    return { name, anim, durationMs, sheetUrl: new URL(anim.sheet, base).href }
  })
}

const slugOf = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

async function fetchManifest(url: string): Promise<{ manifest: SpriteManifest; base: string } | null> {
  const base = new URL(url, window.location.href).href
  const res = await fetch(base)
  if (!res.ok) return null
  const manifest = (await res.json()) as SpriteManifest
  if (manifest.variants?.length) return fetchManifest(new URL(manifest.variants[0], base).href)
  return { manifest, base }
}

/**
 * The board is the source of truth for which figure a character wears
 * (vtt_tokens.model_url). A character not yet placed on a board falls back to
 * public/sprites/<slug>/ by full name, then by first name.
 */
async function resolveSprite([, characterId, name]: [string, string, string]): Promise<ResolvedSprite | null> {
  const candidates: string[] = []
  try {
    const { data } = await createClient()
      .from("vtt_tokens")
      .select("model_url")
      .eq("character_id", characterId)
      .not("model_url", "is", null)
      .limit(5)
    for (const row of (data ?? []) as Array<{ model_url: string | null }>) {
      if (isSpriteManifestUrl(row.model_url)) candidates.push(row.model_url)
    }
  } catch {
    // No token row reachable; the name fallbacks below still apply.
  }
  const full = slugOf(name)
  const first = slugOf(name.split(/\s+/)[0] ?? "")
  for (const slug of new Set([full, first].filter(Boolean))) candidates.push(`/sprites/${slug}/sprite.json`)

  for (const url of candidates) {
    const found = await fetchManifest(url).catch(() => null)
    if (!found) continue
    const actions = buildActions(found.manifest, found.base)
    if (!actions.length) continue
    return { manifest: found.manifest, actions }
  }
  return null
}

export function CharacterSpriteVignette({ characterId, name }: { characterId?: string | null; name?: string | null }) {
  const { data: sprite } = useSWR(
    characterId && name ? ["character-sprite", characterId, name] : null,
    resolveSprite,
    { revalidateOnFocus: false },
  )
  const figureRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = figureRef.current
    if (!sprite || !el) return
    const { actions } = sprite
    for (const a of actions) {
      const img = new Image()
      img.src = a.sheetUrl
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let raf = 0
    let index = -1
    let actionStart = 0
    const show = (i: number, now: number) => {
      index = i
      actionStart = now
      const { anim, sheetUrl, name: actionName } = actions[i]
      el.style.backgroundImage = `url(${sheetUrl})`
      el.style.backgroundSize = `${anim.frames * 100}% 800%`
      if (labelRef.current) labelRef.current.textContent = actionName
    }
    const tick = (now: number) => {
      if (index === -1) show(0, now)
      let action = actions[index]
      if (now - actionStart >= action.durationMs) {
        show((index + 1) % actions.length, now)
        action = actions[index]
      }
      const { anim } = action
      const raw = Math.floor(((now - actionStart) / 1000) * anim.fps)
      const frame = anim.loop ? raw % anim.frames : Math.min(raw, anim.frames - 1)
      el.style.backgroundPositionX = anim.frames > 1 ? `${(frame / (anim.frames - 1)) * 100}%` : "0%"
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [sprite])

  if (!sprite) return null
  const { anim, sheetUrl, name: firstAction } = sprite.actions[0]

  return (
    <figure className="relative flex min-h-[150px] flex-1 items-end justify-center overflow-hidden rounded border border-[#4b3a19] bg-[radial-gradient(ellipse_at_50%_85%,#2a1f10,#0a0806_70%)]">
      <span aria-hidden className="absolute bottom-[14%] left-1/2 h-3 w-24 -translate-x-1/2 rounded-[50%] bg-black/70 blur-[3px]" />
      <div
        ref={figureRef}
        role="img"
        aria-label={`${name} pixel sprite`}
        className="relative z-10 mb-[6%] aspect-square h-[88%] max-h-[220px] bg-no-repeat [image-rendering:pixelated]"
        style={{
          backgroundImage: `url(${sheetUrl})`,
          backgroundSize: `${anim.frames * 100}% 800%`,
          backgroundPositionX: "0%",
          backgroundPositionY: "0%",
        }}
      />
      <figcaption className="absolute inset-x-2 top-1.5 flex items-center justify-between font-serif text-[9px] uppercase tracking-[.16em] text-[#8f8061]">
        <span>{name}</span>
        <span ref={labelRef} aria-live="off" className="text-[#c9a24a]">
          {firstAction}
        </span>
      </figcaption>
    </figure>
  )
}
