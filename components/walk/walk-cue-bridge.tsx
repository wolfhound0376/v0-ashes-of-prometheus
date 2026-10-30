"use client"

// components/walk/walk-cue-bridge.tsx — film the painted map asks for.
//
// The map lives in an iframe (public/velkynvelve-walk). When a moment on it has film — the pen gate's Look closer →
// "Look around" / "Count the guards" (Sam, 2026-10-27: played "at least once for each player") — it posts
// {type: "aop:walk-film", cue, total}. This asks /api/cinematics as the seated character (lib/walk-film.ts) and plays
// what comes back on the stage. Everything that decides WHICH film plays stays on the server: which clip (Fifi's own
// count-guards on her seat, the general one for everyone else), and once per character. A null clip is the ordinary
// outcome — seen already, or not filmed yet — and stays silent.
//
// The one thing decided HERE is whether the look was good enough to ask at all (Sam, 2026-10-30): filmEarned() holds
// the roll against the cue's DC, and a short roll returns before the fetch. That matters for more than a wasted
// request — no fetch means no cinematic_views row, so a hero who looked badly can come back to the bars and earn it.
//
// The film plays in THIS browser only (share: false): one player studying the gate does not stop everyone else's
// map. Each player gets it when they look themselves.

import { useEffect, type RefObject } from "react"
import { useStage } from "@/components/stage/stage-provider"
import { readPlayed, rememberPlayed, shouldPlay } from "@/lib/cinematic-replay"
import { filmEarned, parseWalkFilm, walkFilmParams } from "@/lib/walk-film"

export function WalkCueBridge({ frameRef }: { frameRef: RefObject<HTMLIFrameElement | null> }) {
  const stage = useStage()
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const frame = frameRef.current?.contentWindow
      if (!frame || e.source !== frame) return
      const look = parseWalkFilm(e.data)
      if (!look) return
      const { cue } = look
      if (!filmEarned(cue, look.total)) return       // a poor look earns Malachar's answer, not the film
      void (async () => {
        let seat: string | null = null
        try { seat = localStorage.getItem("aop_character_id") } catch { /* storage blocked */ }
        try {
          const res = await fetch(`/api/cinematics?${walkFilmParams(cue, seat).toString()}`)
          if (!res.ok) return
          const body = await res.json()
          const clip = body?.clip as { id?: string; video_url?: string } | null
          if (!clip?.video_url) return
          const clipId = clip.id ?? clip.video_url
          if (!shouldPlay({ clipId, characterId: seat, trigger: "player_initiated", playedHere: readPlayed() })) return
          if (!seat) rememberPlayed(clipId)
          await stage.film({ url: clip.video_url, scope: "solo", share: false, cue })
        } catch {
          /* the look stands; the film was never promised */
        }
      })()
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [frameRef, stage])
  return null
}
