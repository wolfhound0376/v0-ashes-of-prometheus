"use client"

import { useEffect, useRef } from "react"
import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"
import { isSpriteManifestUrl, type SpriteAnimation, type SpriteManifest } from "@/lib/sprite-token"

interface ResolvedSprite {
  manifest: SpriteManifest
  sheetUrl: string
  anim: SpriteAnimation
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
    const anim = found.manifest.animations.idle ?? found.manifest.animations.walk
    if (!anim) continue
    return { manifest: found.manifest, anim, sheetUrl: new URL(anim.sheet, found.base).href }
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

  useEffect(() => {
    const el = figureRef.current
    if (!sprite || !el) return
    const { anim } = sprite
    if (anim.frames <= 1) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const frame = Math.floor(((now - start) / 1000) * anim.fps) % anim.frames
      el.style.backgroundPositionX = `${(frame / (anim.frames - 1)) * 100}%`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [sprite])

  if (!sprite) return null
  const { anim, sheetUrl } = sprite

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
      <figcaption className="absolute left-2 top-1.5 font-serif text-[9px] uppercase tracking-[.16em] text-[#8f8061]">{name}</figcaption>
    </figure>
  )
}
