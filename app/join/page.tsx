"use client"

import { useState, useEffect, useCallback, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { FantasyPanel, PanelDivider } from "@/components/ui/fantasy-panel"
import { MusicToggle } from "@/components/music-toggle"

// The access gate. Everyone who is not already claimed lands here.
//
// A player types their three-word code; the server trades it for that character's
// claim_token. Instead of bolting straight to the dashboard, a valid code now
// opens the CHARACTER PICKER: enter as your character, create a new one in the
// Character Forge, or import a forged JSON. The token still never appears in a
// URL, and nothing is stored until the player actually picks a path.
//
// The DM code is the one path that skips the picker — the DM screen behaves
// exactly as before, and the shared DM code can never select a player character.

const CHARACTER_LS_KEY = "aop_character_id"
const TOKEN_LS_KEY = "aop_claim_token"
const ROLE_LS_KEY = "aop_access_role"
const FORGE_KEY_LS_KEY = "aop_forge_key"
const FORGE_STORE_KEY = "aop_forge2014_v1"

interface PickerCharacter {
  id: string
  name: string
  class: string | null
  level: number | null
  portraitUrl: string | null
}

type PickerSession =
  | { role: "player"; character: PickerCharacter; claimToken: string }
  | { role: "forge" }

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

export default function JoinPage() {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [status, setStatus] = useState<"idle" | "checking" | "error" | "limited" | "welcome">("idle")
  const [session, setSession] = useState<PickerSession | null>(null)
  const [savedBuilds, setSavedBuilds] = useState(0)
  const [forgeGate, setForgeGate] = useState(false)

  // Ask the server which gates are armed so the forge hint only shows when a
  // forge code actually exists to hand out.
  useEffect(() => {
    fetch("/api/claim-code")
      .then((res) => res.json())
      .then((cfg) => setForgeGate(Boolean(cfg?.forgeGate)))
      .catch(() => {})
  }, [])

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
          // The DM path is untouched: no picker, straight to the shared screen.
          window.localStorage.setItem(ROLE_LS_KEY, "dm")
          window.localStorage.removeItem(TOKEN_LS_KEY)
          // The DM code also unlocks the Forge importer — remember it for /forge.
          window.localStorage.setItem(FORGE_KEY_LS_KEY, code.trim())
          setStatus("welcome")
          setTimeout(() => router.replace("/"), 1100)
          return
        }

        if (result.role === "forge") {
          // A forge code opens character creation instead of claiming a seat. The
          // code is kept locally so /forge can authorise the import server-side.
          window.localStorage.setItem(ROLE_LS_KEY, "forge")
          window.localStorage.setItem(FORGE_KEY_LS_KEY, code.trim())
          setSavedBuilds(savedBuildCount())
          setSession({ role: "forge" })
          setStatus("idle")
          return
        }

        // Player code — show the picker. Nothing is written to localStorage
        // until the player actually chooses a path.
        setSavedBuilds(savedBuildCount())
        setSession({
          role: "player",
          character: {
            id: result.character.id,
            name: result.character.name,
            class: result.character.class ?? null,
            level: typeof result.character.level === "number" ? result.character.level : null,
            portraitUrl: result.character.portraitUrl ?? null,
          },
          claimToken: result.claimToken,
        })
        setStatus("idle")
      } catch (err) {
        console.error("[v0] join: code check failed:", err)
        setStatus("error")
      }
    },
    [code, status, router],
  )

  /** Store the localStorage trio that binds this browser to the seat. */
  const claimSeat = useCallback(() => {
    if (!session || session.role !== "player") return
    window.localStorage.setItem(ROLE_LS_KEY, "player")
    window.localStorage.setItem(CHARACTER_LS_KEY, session.character.id)
    window.localStorage.setItem(TOKEN_LS_KEY, session.claimToken)
  }, [session])

  const enterAsCharacter = () => {
    claimSeat()
    router.replace("/")
  }

  const goCreate = () => {
    // A claimed player creating a second character authorises the import with
    // their own (characterId, claimToken) pair — so claim the seat first.
    if (session?.role === "player") claimSeat()
    router.push("/forge/builder")
  }

  const goImport = () => {
    if (session?.role === "player") claimSeat()
    router.push("/forge")
  }

  const disabled = status === "checking" || status === "welcome"

  // -------------------------------------------------------------------------
  // Phase 2 — the character picker.
  // -------------------------------------------------------------------------
  if (session) {
    const isPlayer = session.role === "player"
    const character = isPlayer ? session.character : null
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0806] p-6 text-stone-200">
        <MusicToggle />
        <div className="w-full max-w-md">
          <div className="mb-7 text-center">
            <h1 className="font-serif text-[26px] tracking-[0.18em] text-[#d9bd7e]">ASHES OF PROMETHEUS</h1>
            <p className="mt-2 text-sm text-stone-500">
              {isPlayer ? "The door opens. Choose your path." : "The forge fires are lit."}
            </p>
          </div>

          <FantasyPanel title={isPlayer ? "YOUR SEAT AT THE TABLE" : "THE FORGE AWAITS"}>
            <div className="px-5 pb-5 pt-4">
              {character && (
                <>
                  <div className="flex items-center gap-4">
                    {character.portraitUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={character.portraitUrl}
                        alt={character.name}
                        className="h-20 w-20 shrink-0 rounded-[3px] border border-[#7a5f33]/70 object-cover object-top"
                      />
                    ) : (
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[3px] border border-[#7a5f33]/70 bg-[#0e0b08] font-serif text-2xl text-[#c9a868]">
                        {character.name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-serif text-lg text-[#e8d9ae]">{character.name}</div>
                      <div className="text-sm text-stone-400">
                        {[character.class, character.level != null ? `Level ${character.level}` : null]
                          .filter(Boolean)
                          .join(" · ") || "Adventurer"}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={enterAsCharacter}
                    className="mt-4 w-full rounded-[3px] border border-[#c9a868]/70 bg-gradient-to-b from-[#1d1710] to-[#120e0a] px-4 py-3 font-serif text-[14px] uppercase tracking-[0.16em] text-[#d9bd7e] transition-colors hover:border-[#c9a868] hover:text-[#f0dba8]"
                  >
                    Enter as {character.name}
                  </button>

                  <PanelDivider />
                </>
              )}

              <div className="space-y-2.5">
                <button
                  onClick={goCreate}
                  className={
                    isPlayer
                      ? "w-full rounded-[3px] border border-[#3d3428] bg-[#0f0d0c] px-4 py-3 text-left transition-colors hover:border-[#8a6a4a]"
                      : "w-full rounded-[3px] border border-[#c9a868]/70 bg-gradient-to-b from-[#1d1710] to-[#120e0a] px-4 py-3 text-left transition-colors hover:border-[#c9a868]"
                  }
                >
                  <span className={isPlayer ? "block text-sm text-stone-300" : "block font-serif text-sm uppercase tracking-[0.12em] text-[#d9bd7e]"}>
                    ⚒ Create a character
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-stone-500">
                    Build a hero step by step in the Character Forge.
                    {savedBuilds > 0 && (
                      <> {savedBuilds} saved build{savedBuilds === 1 ? "" : "s"} on this device — resume or finish there.</>
                    )}
                  </span>
                </button>

                <button
                  onClick={goImport}
                  className="w-full rounded-[3px] border border-[#3d3428] bg-[#0f0d0c] px-4 py-3 text-left transition-colors hover:border-[#8a6a4a]"
                >
                  <span className="block text-sm text-stone-300">📜 Import a character</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-stone-500">
                    Paste an <code className="text-[#c9b896]">aop-character-v1</code> export from the Forge.
                  </span>
                </button>
              </div>
            </div>
          </FantasyPanel>

          <p className="mt-6 text-center text-[11px] leading-relaxed text-stone-600">
            {isPlayer
              ? "Entering locks this character to this browser. Creating or importing binds the new character here instead."
              : "When your character is forged you'll get a three-word code of your own — it claims your seat on any device."}
          </p>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Phase 1 — the code gate.
  // -------------------------------------------------------------------------
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0806] p-6 text-stone-200">
      <MusicToggle />
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
            {status === "welcome" && (
              <p role="status" className="mt-3 text-center text-sm text-[#d9bd7e]">
                Welcome back, Dungeon Master. Opening your screen…
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

        {forgeGate && (
          <p className="mt-6 text-center text-[12px] leading-relaxed text-stone-500">
            New to the table? Ask your Dungeon Master for the{" "}
            <span className="text-[#c9a868]">forge code</span> — it opens the Character
            Forge so you can build your own hero.
          </p>
        )}

        <p className="mt-6 text-center text-[11px] leading-relaxed text-stone-600">
          Your code claims one character and stays remembered on this device.
          <br />
          Don&apos;t share it — whoever has it can act as you.
        </p>
      </div>
    </div>
  )
}
