"use client"

import { useState, useCallback, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { FantasyPanel, PanelDivider } from "@/components/ui/fantasy-panel"

// The access gate. Everyone who is not already claimed lands here.
//
// A player types their three-word code; the server trades it for that character's
// claim_token, which we store in localStorage. The dashboard then behaves exactly
// as it does for a claim link — except the token never appears in the URL, so it
// can't be forwarded, screenshotted out of an address bar, or left in someone's
// browser history.
//
// The DM code unlocks the shared-TV / DM view instead of claiming a character.

const CHARACTER_LS_KEY = "aop_character_id"
const TOKEN_LS_KEY = "aop_claim_token"
const ROLE_LS_KEY = "aop_access_role"

export default function JoinPage() {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [status, setStatus] = useState<"idle" | "checking" | "error" | "limited" | "welcome">("idle")
  const [welcomeName, setWelcomeName] = useState<string | null>(null)

  const submit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (!code.trim() || status === "checking") return
      setStatus("checking")

      try {
        const res = await fetch("/api/claim-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        })

        if (res.status === 429) {
          setStatus("limited")
          return
        }

        const result = await res.json()

        if (!res.ok || !result?.ok) {
          setStatus("error")
          return
        }

        if (result.role === "dm") {
          window.localStorage.setItem(ROLE_LS_KEY, "dm")
          window.localStorage.removeItem(TOKEN_LS_KEY)
          setWelcomeName("Dungeon Master")
        } else {
          window.localStorage.setItem(ROLE_LS_KEY, "player")
          window.localStorage.setItem(CHARACTER_LS_KEY, result.character.id)
          window.localStorage.setItem(TOKEN_LS_KEY, result.claimToken)
          setWelcomeName(result.character.name)
        }

        setStatus("welcome")
        // Brief beat so the player sees whose seat they just took.
        setTimeout(() => router.replace("/"), 1100)
      } catch (err) {
        console.error("[v0] join: code check failed:", err)
        setStatus("error")
      }
    },
    [code, status, router],
  )

  const disabled = status === "checking" || status === "welcome"

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0806] p-6 text-stone-200">
      <div className="w-full max-w-md">
        <div className="mb-7 text-center">
          <h1 className="font-serif text-[26px] tracking-[0.18em] text-[#d9bd7e]">ASHES OF PROMETHEUS</h1>
          <p className="mt-2 text-sm text-stone-500">The door is barred. Speak the words.</p>
        </div>

        <FantasyPanel title="ENTER YOUR CODE">
          <form onSubmit={submit} className="px-5 pb-5 pt-4">
            <label htmlFor="access-code" className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-stone-500">
              Access code
            </label>
            <input
              id="access-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                if (status === "error" || status === "limited") setStatus("idle")
              }}
              disabled={disabled}
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="gloom-tallow-hush-193"
              className="w-full rounded-[3px] border border-[#7a5f33]/70 bg-[#0e0b08] px-3 py-3 text-center font-mono text-[15px] tracking-wide text-stone-100 placeholder:text-stone-700 focus:border-[#c9a868]/80 focus:outline-none disabled:opacity-60"
            />

            <p className="mt-2 text-center text-[11px] text-stone-600">
              Spaces, capitals and underscores are all fine.
            </p>

            {status === "error" && (
              <p role="alert" className="mt-3 text-center text-sm text-red-400/90">
                That code isn&apos;t recognised. Check it with your Dungeon Master.
              </p>
            )}
            {status === "limited" && (
              <p role="alert" className="mt-3 text-center text-sm text-red-400/90">
                Too many attempts. Wait a few minutes and try again.
              </p>
            )}
            {status === "welcome" && welcomeName && (
              <p role="status" className="mt-3 text-center text-sm text-[#d9bd7e]">
                Welcome back, {welcomeName}. Opening your dashboard…
              </p>
            )}

            <PanelDivider />

            <button
              type="submit"
              disabled={disabled || !code.trim()}
              className="w-full rounded-[3px] border border-[#c9a868]/70 bg-gradient-to-b from-[#1d1710] to-[#120e0a] px-4 py-2.5 font-serif text-[13px] uppercase tracking-[0.16em] text-[#d9bd7e] transition-colors hover:border-[#c9a868] hover:text-[#f0dba8] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === "checking" ? "Checking…" : "Enter"}
            </button>
          </form>
        </FantasyPanel>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-stone-600">
          Your code claims one character and stays remembered on this device.
          <br />
          Don&apos;t share it — whoever has it can act as you.
        </p>
      </div>
    </div>
  )
}

