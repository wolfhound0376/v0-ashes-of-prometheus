"use client"

// Keeps this browser's hero and the server's copy of it in step (rules: lib/player-pass.ts). Mounted once in
// app/layout.tsx; renders nothing. Nothing that writes or clears aop_character_id / aop_claim_token had to
// change: this watches the keys and follows them.
//
// On load it asks the server once. If this browser has lost its hero (Safari's seven-day wipe, a cleared
// cache) and the server still knows it, the hero is put back and the page reloads once, so every screen
// starts with it. After that it checks the keys every few seconds and when the page is hidden or left, and
// tells the server when a hero is chosen, switched or left on purpose.

import { useEffect } from "react"
import {
  CHARACTER_LS_KEY,
  MIRROR_KEY,
  RESTORED_KEY,
  ROLE_LS_KEY,
  TOKEN_LS_KEY,
  cleanPass,
  mirrorValue,
  passStep,
  readMirror,
  readPass,
  type Pass,
} from "@/lib/player-pass"

const RECHECK_MS = 4000
const ROUTE = "/api/player-pass"

export function PlayerPass() {
  useEffect(() => {
    // Framed pages share this window's storage and follow the top page; only the top page keeps the pass.
    try { if (window.top !== window) return } catch { return }
    let store: Storage
    try { store = window.localStorage; store.getItem(MIRROR_KEY) } catch { return } // storage blocked: nothing to keep in step

    const get = (k: string) => { try { return store.getItem(k) } catch { return null } }
    const setMirror = (p: Pass | null) => {
      try { if (p) store.setItem(MIRROR_KEY, mirrorValue(p)); else store.removeItem(MIRROR_KEY) } catch { /* storage blocked */ }
    }
    const tell = (p: Pass | null) => {
      const init: RequestInit = p
        ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p), keepalive: true }
        : { method: "DELETE", keepalive: true }
      fetch(ROUTE, init).catch(() => { /* offline: the next check tries again */ })
    }

    const reconcile = (server: Pass | null | undefined) => {
      const local = readPass(get)
      const step = passStep(local, readMirror(get(MIRROR_KEY)), server)
      if (step === "save" && local) { setMirror(local); tell(local) }
      else if (step === "forget") { setMirror(null); tell(null) }
      else if (step === "restore" && server) {
        // Once per tab per hero: a browser that cannot hold storage at all would otherwise reload forever.
        try { if (window.sessionStorage.getItem(RESTORED_KEY) === server.characterId) return } catch { return }
        try {
          store.setItem(CHARACTER_LS_KEY, server.characterId)
          store.setItem(TOKEN_LS_KEY, server.claimToken)
          if (!store.getItem(ROLE_LS_KEY)) store.setItem(ROLE_LS_KEY, "player")
          setMirror(server)
          window.sessionStorage.setItem(RESTORED_KEY, server.characterId)
        } catch { return }
        window.location.reload()
      }
    }

    let live = true
    fetch(ROUTE, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { pass?: unknown }) => { if (live) reconcile(cleanPass(j?.pass)) })
      .catch(() => { if (live) reconcile(undefined) }) // no answer: keep local changes moving, never restore

    const tick = () => reconcile(undefined)
    const timer = window.setInterval(tick, RECHECK_MS)
    const onHide = () => { if (document.visibilityState === "hidden") tick() }
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("pagehide", tick)
    return () => {
      live = false
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onHide)
      window.removeEventListener("pagehide", tick)
    }
  }, [])
  return null
}
