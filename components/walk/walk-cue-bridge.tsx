"use client"

// components/walk/walk-cue-bridge.tsx — film the painted map asks for.
//
// The map lives in an iframe (public/velkynvelve-walk). When a moment on it has film — looking closer at the pen
// gate (Sam, 2026-10-27: "should trigger cinematic at least once for each player") — it posts
// {type: "aop:check-cue", state, scope, location} to this page, and this hands it to the stage exactly like any
// other check cue (lib/check-cue.ts → components/stage/stage-provider.tsx → /api/cinematics). Whether there is film,
// and whether this seat has already seen it, stays on the server.

import { useEffect, type RefObject } from "react"
import { emitCheckCue, parseWalkCheckCue } from "@/lib/check-cue"

export function WalkCueBridge({ frameRef }: { frameRef: RefObject<HTMLIFrameElement | null> }) {
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const frame = frameRef.current?.contentWindow
      if (!frame || e.source !== frame) return
      const cue = parseWalkCheckCue(e.data)
      if (cue) emitCheckCue(cue)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [frameRef])
  return null
}
