"use client"

import { useState, useEffect, useCallback, useMemo, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { MusicToggle } from "@/components/music-toggle"
import { useThemeAudio } from "@/components/theme-audio"

// The front door (Sam, 2026-10-14: "a cool dark screen that asks you who you are playing or if you
// are creating a new character").
//
//   WHO ARE YOU?   the party's characters as portrait cards, and one more card for a new face.
//   THE WORDS      the card chosen, the three-word code for THAT character; a new face takes the
//                  forge code. The server trades the code for the claim token, which never
//                  appears in a URL; nothing is stored until the code is good.
//   THEN           /awaken — the opening film, the fortune roll, Malachar's first words — and
//                  the slave pen.
//
// A card is a picture, not a key: picking Fifi's card and typing Scott's code is refused ("those
// words belong to someone else"), so the roster being public changes nothing about who may sit in a
// seat. The DM still has the shared DM code, behind a small link, and goes straight to the table.

const CHARACTER_LS_KEY = "aop_character_id"
const TOKEN_LS_KEY = "aop_claim_token"
const ROLE_LS_KEY = "aop_access_role"
const FORGE_KEY_LS_KEY = "aop_forge_key"
const FORGE_STORE_KEY = "aop_forge2014_v1"

interface RosterCharacter {
  id: string
  name: string
  class: string | null
  level: number | null
  portraitUrl: string | null
}

type Pick = { kind: "character"; character: RosterCharacter } | { kind: "new" } | { kind: "dm" }

/** How many builds the Character Forge has saved in THIS browser. */
function savedBuildCount(): number {
  try {
    const raw = window.localStorage.getItem(FORGE_STORE_KEY)
    if (!raw) return 0
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.chars) ? parsed.chars.length : 0
  } catch {
    return 0
  }
}

function Portrait({ c, size }: { c: RosterCharacter; size: "card" | "small" }) {
  const box = size === "card" ? "h-44 w-full" : "h-16 w-16"
  // Never cropped through the head (house rule): the portrait is CONTAINED in its frame.
  return c.portraitUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={c.portraitUrl} alt={c.name} className={`${box} object-contain object-bottom`} draggable={false} />
  ) : (
    <div className={`${box} flex items-center justify-center font-serif text-4xl text-[#c9a868]/70`}>{c.name.charAt(0)}</div>
  )
}

export default function JoinPage() {
  const router = useRouter()
  useThemeAudio()
  const [roster, setRoster] = useState<RosterCharacter[] | null>(null)
  const [pick, setPick] = useState<Pick | null>(null)
  const [code, setCode] = useState("")
  const [status, setStatus] = useState<"idle" | "checking" | "error" | "mismatch" | "limited" | "welcome" | "pending" | "rejected">("idle")
  const [pendingHero, setPendingHero] = useState<string | null>(null)
  const [savedBuilds, setSavedBuilds] = useState(0)
  const [forgeNext, setForgeNext] = useState<"create" | "import" | null>(null)

  // The party. Public already — the dashboard lists them for everyone — so the anon client will do.
  useEffect(() => {
    let live = true
    createClient()
      .from("characters")
      .select("id, name, class, level, portrait_image_url, avatar_image_url")
      .eq("is_player", true)
      .is("archived_at", null)
      .order("name")
      .then(({ data }: { data: unknown }) => {
        if (!live) return
        const rows = (data ?? []) as { id: string; name: string; class: string | null; level: number | null; portrait_image_url: string | null; avatar_image_url: string | null }[]
        setRoster(rows.map((r) => ({ id: r.id, name: r.name, class: r.class, level: r.level, portraitUrl: r.portrait_image_url ?? r.avatar_image_url ?? null })))
      })
    setSavedBuilds(savedBuildCount())
    return () => { live = false }
  }, [])

  const chosen = useMemo(() => (pick?.kind === "character" ? pick.character : null), [pick])

  const submit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (!pick || !code.trim() || status === "checking") return
      setStatus("checking")
      try {
        const res = await fetch("/api/claim-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        })
        if (res.status === 429) { setStatus("limited"); return }
        const result = await res.json()
        if (!res.ok || !result?.ok) {
          // A hero from the Forge whose cell is not open yet: real words, no seat yet.
          if (result?.reason === "pending" || result?.reason === "rejected") { setPendingHero(result.heroName ?? null); setStatus(result.reason); return }
          setStatus("error"); return
        }

        if (result.role === "dm") {
          if (pick.kind !== "dm") { setStatus("mismatch"); return }
          window.localStorage.setItem(ROLE_LS_KEY, "dm")
          window.localStorage.removeItem(TOKEN_LS_KEY)
          window.localStorage.setItem(FORGE_KEY_LS_KEY, code.trim())
          // Mint the DM session cookie too (best-effort), then the table: who is seated, who is
          // waiting at the Forge, Begin session or Rehearsal (/dm).
          await fetch("/api/dm/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) }).catch(() => {})
          setStatus("welcome")
          setTimeout(() => router.replace("/dm"), 900)
          return
        }

        if (result.role === "forge") {
          if (pick.kind !== "new") { setStatus("mismatch"); return }
          window.localStorage.setItem(ROLE_LS_KEY, "forge")
          window.localStorage.setItem(FORGE_KEY_LS_KEY, code.trim())
          setStatus("idle")
          setForgeNext("create")
          return
        }

        // A player code. On "a new face" it still works — a claimed player may forge a second
        // character, and the import is authorised by their own seat — otherwise it must be the
        // card they chose.
        if (pick.kind === "new") {
          window.localStorage.setItem(ROLE_LS_KEY, "player")
          window.localStorage.setItem(CHARACTER_LS_KEY, result.character.id)
          window.localStorage.setItem(TOKEN_LS_KEY, result.claimToken)
          setStatus("idle")
          setForgeNext("create")
          return
        }
        if (pick.kind !== "character" || result.character?.id !== pick.character.id) { setStatus("mismatch"); return }
        window.localStorage.setItem(ROLE_LS_KEY, "player")
        window.localStorage.setItem(CHARACTER_LS_KEY, result.character.id)
        window.localStorage.setItem(TOKEN_LS_KEY, result.claimToken)
        setStatus("welcome")
        setTimeout(() => router.replace("/awaken"), 700)
      } catch (err) {
        console.error("[join] code check failed:", err)
        setStatus("error")
      }
    },
    [pick, code, status, router],
  )

  const busy = status === "checking" || status === "welcome"

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-stone-200">
      <MusicToggle />
      {/* the key art, far back in the dark */}
      <div className="pointer-events-none absolute inset-0 bg-[url('/images/intro-poster.webp')] bg-cover bg-center opacity-25" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.15)_0%,rgba(0,0,0,0.85)_70%,#000_100%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-6 py-14">
        <div className="mb-10 text-center">
          <div className="text-[10px] uppercase tracking-[0.5em] text-[#8a6a3a]">Ashes of Prometheus</div>
          <h1 className="mt-3 font-serif text-4xl tracking-[0.12em] text-[#e8c56a] sm:text-5xl">
            {pick ? (pick.kind === "character" ? `Speak the words, ${chosen?.name.split(" ")[0]}` : pick.kind === "new" ? "A new face in the dark" : "Behind the screen") : "Who are you?"}
          </h1>
          <p className="mt-3 text-sm text-stone-500">
            {pick
              ? pick.kind === "character"
                ? "Your three words claim this seat on this device."
                : pick.kind === "new"
                  ? "The forge code from your Dungeon Master opens the Character Forge."
                  : "The Dungeon Master's code. Players, go back and pick your card."
              : "Pick the one you are playing, or a new face."}
          </p>
        </div>

        {/* ---- WHO ARE YOU? ---------------------------------------------------------------- */}
        {!pick && (
          <>
            <div className="grid w-full grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {roster === null && (
                <div className="col-span-full py-10 text-center text-xs uppercase tracking-[0.3em] text-stone-600">Lighting the lamps…</div>
              )}
              {(roster ?? []).map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setPick({ kind: "character", character: c }); setCode(""); setStatus("idle") }}
                  className="group relative flex flex-col items-center rounded-sm border border-[#3d3428] bg-gradient-to-b from-[#120e0a]/90 to-black/90 px-3 pb-4 pt-4 text-center transition-all hover:-translate-y-1 hover:border-[#c9a868] hover:shadow-[0_0_40px_rgba(201,168,104,0.25)]"
                >
                  <Portrait c={c} size="card" />
                  <div className="mt-3 font-serif text-lg text-[#e8d9ae] group-hover:text-[#fff3cf]">{c.name.split(" of ")[0]}</div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
                    {[c.class, c.level != null ? `Lv ${c.level}` : null].filter(Boolean).join(" · ") || "Adventurer"}
                  </div>
                </button>
              ))}
              <button
                onClick={() => { setPick({ kind: "new" }); setCode(""); setStatus("idle") }}
                className="group flex flex-col items-center justify-center rounded-sm border border-dashed border-[#3d3428] bg-black/60 px-3 pb-4 pt-4 text-center transition-all hover:-translate-y-1 hover:border-[#c9a868]/70"
              >
                <div className="flex h-44 w-full items-center justify-center font-serif text-6xl text-[#8a6a3a] group-hover:text-[#c9a868]">+</div>
                <div className="mt-3 font-serif text-lg text-[#c9b896]">A new face</div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Forge · import · waiting</div>
              </button>
            </div>
            <button onClick={() => { setPick({ kind: "dm" }); setCode(""); setStatus("idle") }} className="mt-10 text-[11px] uppercase tracking-[0.3em] text-stone-600 hover:text-[#c9a868]">
              Dungeon Master
            </button>
          </>
        )}

        {/* ---- THE WORDS ------------------------------------------------------------------- */}
        {pick && !forgeNext && (
          <form onSubmit={submit} className="w-full max-w-md">
            {chosen && (
              <div className="mb-6 flex items-center justify-center gap-4">
                <div className="rounded-sm border border-[#7a5f33]/60 bg-black/60 p-1"><Portrait c={chosen} size="small" /></div>
                <div className="text-left">
                  <div className="font-serif text-lg text-[#e8d9ae]">{chosen.name}</div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">{[chosen.class, chosen.level != null ? `Level ${chosen.level}` : null].filter(Boolean).join(" · ") || "Adventurer"}</div>
                </div>
              </div>
            )}
            <input
              value={code}
              onChange={(e) => { setCode(e.target.value); if (status !== "idle" && status !== "checking") setStatus("idle") }}
              disabled={busy}
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={pick.kind === "character" ? "gloom-tallow-hush" : pick.kind === "new" ? "the forge code, or your own words" : "the DM code"}
              className="w-full rounded-sm border border-[#7a5f33]/70 bg-black/70 px-3 py-3 text-center font-mono text-[16px] tracking-wide text-stone-100 placeholder:text-stone-700 focus:border-[#c9a868] focus:outline-none disabled:opacity-60"
            />
            <p className="mt-2 text-center text-[11px] text-stone-600">Spaces, capitals and dashes are all fine.</p>
            {status === "error" && <p role="alert" className="mt-3 text-center text-sm text-red-400/90">Those words aren&apos;t recognised. Check them with your Dungeon Master.</p>}
            {status === "mismatch" && <p role="alert" className="mt-3 text-center text-sm text-red-400/90">Those words belong to someone else. Pick the right card, or a different code.</p>}
            {status === "limited" && <p role="alert" className="mt-3 text-center text-sm text-red-400/90">Too many attempts. Wait a few minutes and try again.</p>}
            {status === "pending" && <p role="status" className="mt-3 text-center text-sm text-[#d9bd7e]">The Dungeon Master hasn&apos;t opened {pendingHero ? `${pendingHero}'s` : "your"} cell yet. Ask them, then try again.</p>}
            {status === "rejected" && <p role="alert" className="mt-3 text-center text-sm text-red-400/90">The Dungeon Master turned {pendingHero ?? "that hero"} away at the Forge. Talk to them.</p>}
            {status === "welcome" && <p role="status" className="mt-3 text-center text-sm text-[#d9bd7e]">{pick.kind === "dm" ? "Welcome back, Dungeon Master." : "The door opens…"}</p>}
            <div className="mt-6 flex items-center justify-center gap-3">
              <button type="button" onClick={() => { setPick(null); setStatus("idle") }} disabled={busy} className="px-4 py-2.5 text-[11px] uppercase tracking-[0.25em] text-stone-500 hover:text-stone-300">
                Back
              </button>
              <button
                type="submit"
                disabled={busy || !code.trim()}
                className="rounded-sm border border-[#c9a868]/70 bg-gradient-to-b from-[#1d1710] to-[#120e0a] px-8 py-2.5 font-serif text-[13px] uppercase tracking-[0.25em] text-[#d9bd7e] transition-colors hover:border-[#c9a868] hover:text-[#f0dba8] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {status === "checking" ? "Checking…" : pick.kind === "character" ? "Enter" : "Open"}
              </button>
            </div>
          </form>
        )}

        {/* ---- THE FORGE ------------------------------------------------------------------- */}
        {pick?.kind === "new" && forgeNext && (
          <div className="w-full max-w-md space-y-3">
            <button onClick={() => router.push("/forge/builder")} className="w-full rounded-sm border border-[#c9a868]/70 bg-gradient-to-b from-[#1d1710] to-[#120e0a] px-4 py-3 text-left transition-colors hover:border-[#c9a868]">
              <span className="block font-serif text-sm uppercase tracking-[0.12em] text-[#d9bd7e]">⚒ Create a character</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-stone-500">
                Build a hero step by step in the Character Forge.
                {savedBuilds > 0 && <> {savedBuilds} saved build{savedBuilds === 1 ? "" : "s"} on this device — resume or finish there.</>}
              </span>
            </button>
            <button onClick={() => router.push("/forge/import")} className="w-full rounded-sm border border-[#3d3428] bg-black/60 px-4 py-3 text-left transition-colors hover:border-[#8a6a4a]">
              <span className="block text-sm text-stone-300">📜 Import a character</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-stone-500">Paste an <code className="text-[#c9b896]">aop-character-v1</code> export from the Forge.</span>
            </button>
            <p className="pt-3 text-center text-[11px] leading-relaxed text-stone-600">When your character is forged you&apos;ll get three words of your own — they claim your seat on any device.</p>
          </div>
        )}

        <p className="mt-12 text-center text-[11px] leading-relaxed text-stone-700">
          Your words claim one character and stay remembered on this device. Don&apos;t share them — whoever has them can act as you.
        </p>
      </div>
    </div>
  )
}
