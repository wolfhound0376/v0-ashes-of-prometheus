"use client"

/**
 * Rolling a scene cinematic, extracted so a second dashboard can do it without
 * copying the rules.
 *
 * The server owns everything that matters — which clip, whether this character
 * has already seen it, solo versus party. This hook only asks and plays. A null
 * answer is the ORDINARY outcome (already seen, or nothing filmed here) and
 * must stay completely silent: the player asked to look around, Malachar is
 * already answering in words, and a failed camera cue is not an error they
 * should ever perceive.
 *
 * NOTE: v4-dashboard still carries its own copy of this logic. They agree
 * today; they should be consolidated so they cannot stop agreeing.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { dmHeaders, ensureDmKey, hasDmKey } from "@/lib/dm-key"
import { onCinematicCue } from "@/lib/cinematic-cue"

export function useSceneCinematic(opts: { locationName: string; seatId: string | null; dmMode?: boolean }) {
  const [src, setSrc] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const play = useCallback(
    async (cue?: { state: string }) => {
      if (busy) return
      setBusy(true)
      try {
        let asDm = !!opts.dmMode
        if (asDm && !hasDmKey()) asDm = ensureDmKey("replay cinematics in DM Mode") !== null
        const params = new URLSearchParams({
          location: opts.locationName,
          kind: cue ? "action" : "environment",
          scope: cue ? "solo" : "party",
          trigger_type: asDm ? "dm_override" : cue ? "event_driven" : "player_initiated",
        })
        if (cue) params.set("state", cue.state)
        if (opts.seatId) params.set("character_id", opts.seatId)

        const res = await fetch(`/api/cinematics?${params.toString()}`, { headers: dmHeaders() })
        if (!res.ok) return
        const body = await res.json()
        const clip = body?.clip as { video_url?: string; scope?: string } | null
        if (!clip?.video_url) return
        setSrc(clip.video_url)
        if (clip.scope === "party") {
          await createClient()
            .channel("cinematic-broadcast")
            .subscribe()
            .send({ type: "broadcast", event: "play", payload: { video_url: clip.video_url } })
        }
      } catch {
        /* a failed cinematic must never interrupt play */
      } finally {
        setBusy(false)
      }
    },
    [busy, opts.dmMode, opts.locationName, opts.seatId],
  )

  // Party clips arriving from another seat.
  useEffect(() => {
    const channel = createClient()
      .channel("cinematic-broadcast")
      .on("broadcast", { event: "play" }, (message) => {
        const url = (message?.payload as { video_url?: string })?.video_url
        if (url) setSrc(url)
      })
      .subscribe()
    return () => { void createClient().removeChannel(channel) }
  }, [])

  // Cues Malachar emitted mid-narration.
  const playRef = useRef(play)
  playRef.current = play
  useEffect(() => onCinematicCue((cue) => void playRef.current(cue)), [])

  return { src, clear: () => setSrc(null), play, busy }
}
