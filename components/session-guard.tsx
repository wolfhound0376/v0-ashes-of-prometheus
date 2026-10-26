"use client"

// Sends a player off an in-game page once their seat is gone — the DM ended the session or removed them
// (Sam, 2026-10-25: "a button that gets me to end the game and kicks everyone out"). Rules in
// lib/session-guard.ts. Mounted once in app/layout.tsx; renders nothing.

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { dmHeaders } from "@/lib/dm-key"
import { guardVerdict, isGuardedPath } from "@/lib/session-guard"

const RECHECK_MS = 6000

export function SessionGuard() {
  const pathname = usePathname()
  const router = useRouter()
  useEffect(() => {
    if (!isGuardedPath(pathname)) return
    let live = true
    const check = async () => {
      let id = "", role = ""
      try { id = localStorage.getItem("aop_character_id") ?? ""; role = localStorage.getItem("aop_access_role") ?? "" } catch { /* storage blocked */ }
      try {
        const q = id ? `?characterId=${encodeURIComponent(id)}` : ""
        const r = await fetch(`/api/table${q}`, { cache: "no-store", headers: dmHeaders() })
        const j = await r.json()
        if (live && guardVerdict(j, role) === "leave") router.replace("/table")
      } catch { /* offline: stay */ }
    }
    check()
    const t = window.setInterval(check, RECHECK_MS)
    return () => { live = false; window.clearInterval(t) }
  }, [pathname, router])
  return null
}
