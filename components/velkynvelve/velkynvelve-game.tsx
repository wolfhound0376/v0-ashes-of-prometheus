"use client"

/**
 * /velkynvelve — one node of Velkynvelve as a top-down pixel-art map.
 *
 * Phaser 4 is loaded from the CDN as a plain <script> rather than an npm
 * dependency: it is ~1.2 MB, only this page needs it, and keeping it out of
 * package.json keeps it out of every other page's bundle and out of the
 * lockfile. The script is fetched once per tab and reused on revisits.
 */
import { useEffect, useRef, useState } from "react"
import type { SpriteManifest } from "@/lib/sprite-token"
import { loadNode } from "@/lib/velkynvelve/node"
import { createVelkynvelveScene, type SceneFigure } from "./scene"

const PHASER_URL = "https://cdn.jsdelivr.net/npm/phaser@4.2.1/dist/phaser.min.js"

/* eslint-disable @typescript-eslint/no-explicit-any */
let phaserPromise: Promise<any> | null = null

function loadPhaser(): Promise<any> {
  const w = window as any
  if (w.Phaser) return Promise.resolve(w.Phaser)
  if (!phaserPromise) {
    phaserPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script")
      s.src = PHASER_URL
      s.async = true
      s.onload = () => (w.Phaser ? resolve(w.Phaser) : reject(new Error("Phaser did not load")))
      s.onerror = () => {
        phaserPromise = null
        reject(new Error("Could not reach the Phaser CDN"))
      }
      document.head.appendChild(s)
    })
  }
  return phaserPromise
}

function folderOf(url: string): string {
  return url.slice(0, url.lastIndexOf("/") + 1)
}

export default function VelkynvelveGame({ nodeSlug }: { nodeSlug: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [nodeName, setNodeName] = useState("")
  const [activeName, setActiveName] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let game: any = null
    let cancelled = false

    ;(async () => {
      try {
        const [Phaser, node] = await Promise.all([loadPhaser(), loadNode(nodeSlug)])
        const figures: SceneFigure[] = await Promise.all(
          node.spawns.map(async (s) => {
            const res = await fetch(s.sprite)
            if (!res.ok) throw new Error(`Sprite ${s.id} not found (${res.status})`)
            const manifest = (await res.json()) as SpriteManifest
            return { id: s.id, manifest, baseUrl: folderOf(s.sprite), x: s.x, y: s.y, facing: s.facing }
          }),
        )
        if (cancelled || !hostRef.current) return
        setNodeName(node.name)
        const Scene = createVelkynvelveScene(Phaser, node, figures, {
          onActiveChange: (_id, name) => setActiveName(name),
        })
        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: hostRef.current,
          backgroundColor: "#05040a",
          pixelArt: true,
          roundPixels: true,
          scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
          scene: Scene,
        })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()

    return () => {
      cancelled = true
      game?.destroy(true)
    }
  }, [nodeSlug])

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#05040a]">
      <div ref={hostRef} className="absolute inset-0 touch-none" />
      {/* Vignette: pulls the eye to the lit middle and hides the hard screen edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at center, transparent 45%, rgba(3,2,8,0.85) 100%)" }}
      />
      <div className="pointer-events-none absolute left-4 right-4 top-4 flex justify-center">
        <div className="max-w-md rounded-sm border border-amber-700/40 bg-[#0a0908]/80 px-4 py-2 text-center shadow-lg backdrop-blur-sm">
          <h1
            className="text-lg tracking-wide text-amber-200"
            style={{ fontFamily: "var(--font-display), var(--font-serif), serif" }}
          >
            {error ? "Velkynvelve" : nodeName || "Velkynvelve"}
          </h1>
          <p className="text-sm text-stone-300">
            {error ?? "Tap the floor to walk, tap a figure to switch, drag to look around."}
          </p>
          {activeName && !error && <p className="mt-0.5 text-xs text-amber-400/80">Moving: {activeName}</p>}
        </div>
      </div>
    </div>
  )
}
