"use client"

import { useEffect, useState } from "react"

const ROLE_KEY = "aop_access_role"

export function DmGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "open" | "locked">("checking")

  useEffect(() => {
    let active = true
    fetch("/api/claim-code", { cache: "no-store" })
      .then((response) => response.json())
      .then((gates: { dmGate?: boolean }) => {
        if (!active) return
        const isDm = window.localStorage.getItem(ROLE_KEY) === "dm"
        setState(!gates.dmGate || isDm ? "open" : "locked")
      })
      .catch(() => active && setState("locked"))
    return () => { active = false }
  }, [])

  if (state === "open") return <>{children}</>
  if (state === "checking") return <div className="flex min-h-screen items-center justify-center bg-[#0a0908] text-stone-500">Checking DM access…</div>

  return <div className="flex min-h-screen items-center justify-center bg-[#0a0908] p-6 text-center text-[#e8dcc4]">
    <div className="max-w-md rounded border border-[#4b3a19] bg-[#15110d] p-8">
      <h1 className="font-serif text-2xl text-[#d4b15a]">DM access required</h1>
      <p className="mt-3 text-sm text-stone-400">Enter through the campaign join gate with the Dungeon Master code before opening administration.</p>
      <a href="/join" className="mt-6 inline-block rounded border border-[#8a672d] px-4 py-2 text-sm text-[#e0c078]">Go to the join gate</a>
    </div>
  </div>
}
