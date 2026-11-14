"use client"

// Sends a player off an in-game page once their seat is gone — the DM ended the session or removed them
// (Sam, 2026-10-25: "a button that gets me to end the game and kicks everyone out"). Rules in
// lib/session-guard.ts. Mounted once in app/layout.tsx; renders nothing.

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { dmHeaders } from "@/lib/dm-key"
import { AFTER_RESET_PATH, AWAKEN_PATH, guardVerdict, isGuardedPath, needsWaking, wasReset } from "@/lib/session-guard"

const RECHECK_MS = 6000

export function SessionGuard() {
  const pathname = usePathname()
  const router = useRouter()
  useEffect(() => {
    if (!isGuardedPath(pathname)) return
    let live = true
    // The run this page loaded under. Kept per page, not per tab: the tab that pressed New Game walks on into
    // the new run and must not be thrown out of it for remembering the old one.
    let seenRun: string | null = null
    const check = async () => {
      let id = "", role = ""
      try { id = localStorage.getItem("aop_character_id") ?? ""; role = localStorage.getItem("aop_access_role") ?? "" } catch { /* storage blocked */ }
      try {
        const q = id ? `?characterId=${encodeURIComponent(id)}` : ""
        const r = await fetch(`/api/table${q}`, { cache: "no-store", headers: dmHeaders() })
        const j = await r.json()
        if (!live) return
        // A New Game happened under this screen: it closes, DM or not (Sam, 2026-11-10).
        if (wasReset(seenRun, j)) {
          try { window.close() } catch { /* not ours to close */ }
          router.replace(AFTER_RESET_PATH)
          return
        }
        if (!seenRun && typeof j?.run === "string") seenRun = j.run
        if (guardVerdict(j, role) === "leave") { router.replace("/table"); return }
        // Seated and live, but not yet through the awakening this session: that comes first (lib/session-guard.ts
        // needsWaking). /awaken is itself a guarded page, so it is skipped here or it would send to itself.
        if (pathname !== AWAKEN_PATH && needsWaking(j, role)) router.replace(AWAKEN_PATH)
      } catch { /* offline: stay */ }
    }
    check()
    const t = window.setInterval(check, RECHECK_MS)
    return () => { live = false; window.clearInterval(t) }
  }, [pathname, router])
  return null
}
