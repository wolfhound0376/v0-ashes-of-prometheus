"use client"

// /t/<code> — the link the host shares (lib/room-code.ts; Sam, 2026-11-23: "PR2").
//
// Whoever follows it:
//   - with a hero in this browser   → straight to the table, where the code opens their seat
//   - without one                   → their three words (/join) or a new hero (/choose); the code rides along in
//                                     this browser and opens their seat when they reach the table
//   - with a stale code             → told the link changed or the table is closed

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { PENDING_CODE_KEY, normalizeRoomCode, pendingCodeValue } from "@/lib/room-code"
import { CHARACTER_LS_KEY, TOKEN_LS_KEY } from "@/lib/player-pass"

type Check = { open: boolean; status: "lobby" | "live" | "closed" | "changed"; host: string | null }

export default function RoomLinkPage() {
  const params = useParams<{ code: string }>()
  const router = useRouter()
  const code = normalizeRoomCode(params?.code)
  const [check, setCheck] = useState<Check | null>(null)
  const [hasHero, setHasHero] = useState(false)

  useEffect(() => {
    let hero = false
    try { hero = Boolean(localStorage.getItem(CHARACTER_LS_KEY) && localStorage.getItem(TOKEN_LS_KEY)) } catch { /* storage blocked */ }
    setHasHero(hero)
    if (!code) { setCheck({ open: false, status: "changed", host: null }); return }
    fetch(`/api/table/code?c=${code}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Check) => {
        setCheck(j)
        if (!j.open) return
        try { localStorage.setItem(PENDING_CODE_KEY, pendingCodeValue(code)) } catch { /* storage blocked */ }
        if (hero) window.setTimeout(() => router.replace("/table"), 1200)
      })
      .catch(() => setCheck({ open: false, status: "changed", host: null }))
  }, [code, router])

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#070605] px-5 text-stone-200">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,rgba(201,140,60,0.18)_0%,rgba(0,0,0,0.85)_55%,#050403_100%)]" />
      <div className="relative z-10 w-full max-w-md text-center">
        <div className="text-[10px] uppercase tracking-[0.5em] text-[#8a6a3a]">Ashes of Prometheus</div>
        <h1 className="mt-2 font-serif text-3xl tracking-[0.14em] text-[#e8c56a]">The Table</h1>
        {code && <div className="mt-4 font-serif text-2xl tracking-[0.6em] text-stone-300">{code}</div>}

        {!check && <p className="mt-8 text-[11px] uppercase tracking-[0.4em] text-stone-600">Finding the table…</p>}

        {check?.open && (
          <div className="mt-8 space-y-4">
            <p className="text-base text-stone-300">
              {check.host ? <><span className="text-[#e8d9ae]">{check.host}</span> has a table open.</> : "A table is open."}
              {check.status === "live" ? " The session has begun; only those already seated may return." : " Your seat is waiting."}
            </p>
            {hasHero ? (
              <p className="text-[11px] uppercase tracking-[0.4em] text-stone-500">Taking you to your seat…</p>
            ) : (
              <div className="space-y-3">
                <a href="/join" className="block rounded-sm border-2 border-[#8a6a3a] bg-gradient-to-b from-[#2a2015] to-[#120e0a] py-4 font-serif text-lg uppercase tracking-[0.3em] text-[#e8c56a] hover:border-[#f4e0a8]">I have my words</a>
                <a href="/choose" className="block rounded-sm border border-[#3d3428] py-3 text-[12px] uppercase tracking-[0.3em] text-stone-400 hover:border-[#c9a868] hover:text-[#e8c56a]">I am new — choose a hero</a>
              </div>
            )}
          </div>
        )}

        {check && !check.open && (
          <div className="mt-8 space-y-4">
            <p className="text-base text-stone-400">
              {check.status === "closed" ? "That table is closed. The host will send a new link when it opens again." : "That link has changed. Ask the host for the new one."}
            </p>
            <a href="/intro" className="inline-block text-[12px] uppercase tracking-[0.3em] text-[#e8c56a] underline-offset-4 hover:underline">To the title screen</a>
          </div>
        )}
      </div>
    </main>
  )
}
