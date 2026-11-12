"use client"

// THE REHEARSAL DOOR — one clean way from the title screen into the sandbox.
//
// Sam, 2026-11-10: "How do I get into a sandbox from the intro page. We should have a clean way to do so."
// Until now the only way was Host a Game → the DM code → the host screen → a small grey button at the very
// bottom, under Continue and New Game. This page is the short road: the title screen's Rehearsal link comes
// here, and here there is exactly one question — the DM code — and then the sandbox map.
//
//   already signed in as the DM on this device   → straight through, no question at all
//   not signed in                                → the code once, then through
//
// THE MAP DOOR (Sam, 2026-11-12: "I can't get on the map. I need a way to do this administratively").
// /rehearsal?to=map is the same lock with a different room behind it: the travel map (/map), opened as the DM.
// A host who plays a hero is a player on that browser, so /map sends them to the table unless a game is live
// and they are seated (lib/session-guard.ts). This door signs the browser in as the DM instead. It always asks
// for the code unless this browser already holds the DM key, because the map's DM controls need the key itself,
// not only the cookie. The travel map has no sandbox: moving the party there moves it in the real game.
//
// What it does NOT do: open a table, name a host, pick a save or reset anything. A rehearsal touches none of
// that. The sandbox itself is unchanged (lib/dry-run.ts, /velkynvelve?sandbox=1): Malachar answers, nothing saves.
//
// The lock is the same one the host screen uses (POST /api/dm/login, which mints the httpOnly DM cookie), and
// signing in here does to this browser exactly what signing in there does, including letting go of a hero's
// seat on this device — so the two doors can never leave a browser in two different states.

import { useEffect, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { FlaskConical } from "lucide-react"
import { hasDmKey, setDmKey } from "@/lib/dm-key"
import { HomeButton } from "@/components/home-button"
import { ENTERED_KEY, mapHref } from "@/lib/map-entry"

const ROLE_LS_KEY = "aop_access_role"
const TOKEN_LS_KEY = "aop_claim_token"
const CHARACTER_LS_KEY = "aop_character_id"

export default function RehearsalPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<"checking" | "gate" | "entering">("checking")
  const [armed, setArmed] = useState(true)
  const [code, setCode] = useState("")
  const [status, setStatus] = useState<"idle" | "checking" | "no" | "limited" | "nogate">("idle")
  const [toMap, setToMap] = useState(false)
  const wantsMap = () => { try { return new URLSearchParams(window.location.search).get("to") === "map" } catch { return false } }

  // The same three marks the host screen's Rehearsal button leaves, then the sandbox map.
  const enter = () => {
    setPhase("entering")
    try {
      window.localStorage.setItem(ROLE_LS_KEY, "dm")
      window.sessionStorage.setItem("aop_intro_seen", "1")
      window.sessionStorage.setItem(ENTERED_KEY, "1")
    } catch { /* storage blocked */ }
    router.push(wantsMap() ? "/map" : mapHref(true))
  }

  useEffect(() => {
    fetch("/api/dm/session", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      setArmed(Boolean(j.gate))
      const map = wantsMap()
      setToMap(map)
      if (j.dm && (!map || hasDmKey())) enter()
      else setPhase("gate")
    }).catch(() => setPhase("gate"))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim() || status === "checking") return
    setStatus("checking")
    try {
      const r = await fetch("/api/dm/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) })
      if (r.status === 429) { setStatus("limited"); return }
      if (r.status === 503) { setStatus("nogate"); return }
      const j = await r.json()
      if (!j.ok) { setStatus("no"); return }
      setDmKey(code)
      try {
        window.localStorage.removeItem(TOKEN_LS_KEY)
        window.localStorage.removeItem(CHARACTER_LS_KEY)
      } catch { /* storage blocked */ }
      enter()
    } catch { setStatus("no") }
  }

  return (
    <div className="relative min-h-screen bg-[#0a0908] text-stone-200">
      <div className="pointer-events-none fixed inset-0 bg-[url('/images/intro-poster.webp')] bg-cover bg-center opacity-15" />
      <HomeButton className="right-4" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(0,0,0,0.3)_0%,rgba(0,0,0,0.85)_60%,#0a0908_100%)]" />
      <div className="relative mx-auto w-full max-w-5xl px-4 pb-20 pt-10 sm:px-6">
        <div className="mb-8 text-center">
          <div className="text-[10px] uppercase tracking-[0.5em] text-[#8a6a3a]">Ashes of Prometheus</div>
          <h1 className="mt-2 font-serif text-3xl tracking-[0.14em] text-[#e8c56a]">{toMap ? "The Travel Map" : "Rehearsal"}</h1>
          <p className="mt-2 text-sm text-stone-500">{toMap ? "The DM's way onto the map. This is the real map: moving the party moves it in the game." : "The sandbox. Malachar answers, and nothing is saved."}</p>
        </div>

        {phase === "checking" && <div className="py-24 text-center text-[11px] uppercase tracking-[0.4em] text-stone-600">Checking the lock…</div>}
        {phase === "entering" && <div className="py-24 text-center text-[11px] uppercase tracking-[0.4em] text-stone-500">{toMap ? "Opening the map…" : "Opening the sandbox…"}</div>}

        {phase === "gate" && (
          <form onSubmit={submit} className="mx-auto max-w-sm text-center">
            <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full border border-[#7a5f33]/70 bg-black/60 text-[#c9a868]"><FlaskConical className="h-7 w-7" /></div>
            <p className="text-sm text-stone-500">{armed ? "The DM code, once on this device." : "No DM code is set on the server, so the sandbox cannot open. Set DM_ACCESS_CODE in Vercel."}</p>
            <input
              value={code}
              onChange={(e) => { setCode(e.target.value); if (status !== "checking") setStatus("idle") }}
              type="password"
              autoFocus
              autoComplete="off"
              placeholder="the DM code"
              disabled={!armed || status === "checking"}
              className="mt-6 w-full rounded-sm border border-[#7a5f33]/70 bg-black/70 px-3 py-3 text-center font-mono text-[16px] tracking-widest text-stone-100 placeholder:text-stone-700 focus:border-[#c9a868] focus:outline-none disabled:opacity-50"
            />
            {status === "no" && <p role="alert" className="mt-3 text-sm text-red-400/90">No.</p>}
            {status === "limited" && <p role="alert" className="mt-3 text-sm text-red-400/90">Too many tries. Wait a few minutes.</p>}
            {status === "nogate" && <p role="alert" className="mt-3 text-sm text-red-400/90">The server has no DM code configured.</p>}
            <button type="submit" disabled={!armed || !code.trim() || status === "checking"} className="mt-5 w-full rounded-sm border border-[#c9a868]/70 bg-gradient-to-b from-[#1d1710] to-[#120e0a] py-3 font-serif text-[13px] uppercase tracking-[0.3em] text-[#d9bd7e] hover:border-[#c9a868] hover:text-[#f0dba8] disabled:opacity-40">
              {status === "checking" ? "…" : toMap ? "Open the map" : "Enter the sandbox"}
            </button>
            <a href="/intro" className="mt-6 inline-block text-[11px] uppercase tracking-[0.25em] text-stone-600 hover:text-stone-400">← The title</a>
          </form>
        )}
      </div>
    </div>
  )
}
