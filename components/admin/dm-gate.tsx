"use client"

// Unlock screen for /admin.
//
// WHAT THIS IS AND IS NOT. This hides the admin panels from a player who
// wanders to /admin. It is NOT a security boundary: every panel writes to
// Supabase from the browser with the publishable key, and those tables still
// carry "Allow all access" policies, so anyone determined can reach the same
// data through the REST API without ever loading this page. Closing that hole
// means moving the panels' writes behind server routes and tightening RLS —
// deliberately not attempted here.
//
// FAIL-OPEN, like every other gate in this app. With DM_ACCESS_CODE unset the
// server reports the gate as disabled and /admin renders exactly as it always
// has. Sam cannot lock himself out by forgetting an env var.
//
// A STORED CODE IS TRUSTED WITHOUT RE-CHECKING. Verification goes through
// POST /api/claim-code, which rate-limits to 8 attempts per IP per 10 minutes —
// so re-verifying on every page load would lock the DM out of his own admin
// after nine reloads. The code is only checked when it is typed, which is the
// moment a wrong one should be rejected. A stale code costs nothing: the API
// routes re-check it server-side and return 403 regardless of this screen.

import { useEffect, useState } from "react"
import { KeyRound, Loader2 } from "lucide-react"
import { fetchDmGateEnabled, getDmKey, setDmKey } from "@/lib/dm-key"

type GateState = "checking" | "open" | "locked"

/** True only when the server confirms this is the DM code. */
async function verifyDmCode(code: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await fetch("/api/claim-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      cache: "no-store",
    })
    if (res.status === 429) return { ok: false, reason: "Too many attempts. Wait a few minutes." }
    const data = (await res.json()) as { ok?: boolean; role?: string }
    if (data?.ok && data.role === "dm") return { ok: true }
    if (data?.ok) return { ok: false, reason: "That code works, but it is not the DM code." }
    return { ok: false, reason: "That code was not recognised." }
  } catch {
    return { ok: false, reason: "Could not reach the server to check that code." }
  }
}

export function DmGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("checking")
  const [draft, setDraft] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const enabled = await fetchDmGateEnabled()
      if (cancelled) return
      // Gate disarmed server-side, or the code is already on this browser.
      if (!enabled || getDmKey()) setState("open")
      else setState("locked")
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function submit() {
    const code = draft.trim()
    if (!code || busy) return
    setBusy(true)
    setError("")
    const result = await verifyDmCode(code)
    setBusy(false)
    if (!result.ok) {
      setError(result.reason ?? "That code was not recognised.")
      return
    }
    setDmKey(code) // shared with every other DM control in the app
    setDraft("")
    setState("open")
  }

  if (state === "open") return <>{children}</>

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f0d0b] px-4">
      <div className="w-full max-w-sm rounded-sm border border-[#3d3428] bg-[#15120f] p-6">
        <div className="flex items-center gap-2 text-[#c4a777]">
          <KeyRound className="h-4 w-4" />
          <h1 className="text-sm uppercase tracking-wider">DM access</h1>
        </div>

        {state === "checking" ? (
          <p className="mt-4 flex items-center gap-2 text-xs text-stone-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Checking…
          </p>
        ) : (
          <>
            <p className="mt-3 text-xs leading-relaxed text-stone-500">
              These panels edit the live campaign — characters, inventory, environments.
              Enter the DM code to continue. It is remembered on this browser afterwards.
            </p>
            <input
              type="password"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit()
              }}
              placeholder="DM access code"
              className="mt-4 w-full rounded-sm border border-[#3d3428] bg-[#0f0d0b] px-3 py-2 text-sm text-[#e8dcc4] placeholder:text-stone-600 focus:border-[#c4a777]/60 focus:outline-none"
            />
            {error && <p className="mt-2 text-[11px] text-red-400/90">{error}</p>}
            <button
              onClick={submit}
              disabled={busy || !draft.trim()}
              className="mt-3 w-full rounded-sm border border-[#c9a868] bg-[#c4a777]/12 px-3 py-2 text-xs uppercase tracking-wider text-[#f0dcae] hover:bg-[#c4a777]/20 disabled:opacity-40"
            >
              {busy ? "Checking…" : "Unlock"}
            </button>
            <a href="/" className="mt-4 block text-center text-[11px] text-stone-600 underline hover:text-stone-400">
              back to the dashboard
            </a>
          </>
        )}
      </div>
    </div>
  )
}
