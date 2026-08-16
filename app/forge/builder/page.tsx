"use client"

// /forge/builder — the Character Forge 2014 builder, embedded in the app.
//
// The builder itself is the untouched CharacterForge_2014Edition.html, served
// same-origin from /forge2014.html inside an iframe. Because it runs on the
// site origin, its localStorage save (aop_forge2014_v1) accumulates per-browser
// here, so a player's in-progress builds survive reloads and revisits.
//
// "Add to campaign" reuses the builder's OWN export pipeline: the saved char
// (from localStorage, defaults filled by the iframe's migrateChar) is passed to
// the iframe's exportPayload() — the exact function behind its Export tab — and
// the resulting aop-character-v1 payload goes through the existing
// POST /api/forge/import. One conversion path, zero duplicated derive() logic.
// On success the player gets their claim link AND a three-word rejoin code.

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Anvil, ArrowLeft, Check, ClipboardCopy, Music2, RefreshCw, ScrollText, ShieldAlert, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"
import { getThemeAudio, playThemeAudio } from "@/components/theme-audio"
import { MusicToggle } from "@/components/music-toggle"
import { isMusicOff, setMusicOff } from "@/lib/audio-prefs"

const CHARACTER_LS_KEY = "aop_character_id"
const TOKEN_LS_KEY = "aop_claim_token"
const ROLE_LS_KEY = "aop_access_role"
const FORGE_KEY_LS_KEY = "aop_forge_key"
const FORGE_STORE_KEY = "aop_forge2014_v1"

interface SavedBuild {
  id: string
  name: string
  clazz: string
  level: number
  built: boolean
}

function readSavedBuilds(): SavedBuild[] {
  try {
    const raw = window.localStorage.getItem(FORGE_STORE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed?.chars)) return []
    return parsed.chars.map((c: any) => ({
      id: String(c?.id ?? ""),
      name: typeof c?.name === "string" && c.name.trim() ? c.name.trim() : "Unnamed hero",
      clazz: typeof c?.clazz === "string" ? c.clazz : "—",
      level: typeof c?.level === "number" ? c.level : 1,
      built: Boolean(c?.built),
    }))
  } catch {
    return []
  }
}

/** The raw saved char object (not the display row) for export. */
function readSavedChar(id: string): any | null {
  try {
    const raw = window.localStorage.getItem(FORGE_STORE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed?.chars)) return null
    return parsed.chars.find((c: any) => c?.id === id) ?? null
  } catch {
    return null
  }
}

interface ForgeResult {
  name: string
  claimUrl: string | null
  claimCode: string | null
}

export default function ForgeBuilderPage() {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [builds, setBuilds] = useState<SavedBuild[]>([])
  const [saving, setSaving] = useState<string | null>(null) // id being saved
  const [error, setError] = useState<string | null>(null)
  const [duplicateId, setDuplicateId] = useState<string | null>(null)
  const [result, setResult] = useState<ForgeResult | null>(null)
  const [copied, setCopied] = useState<"code" | "link" | null>(null)

  // Creation theme — the shared layout audio. If the player came through the
  // intro it is already playing and simply carries on; otherwise it starts
  // here. Loops while a hero is being forged, ceases once seated.
  const [musicOn, setMusicOn] = useState(false)
  const seatedRef = useRef(false) // set when a hero joins the campaign
  const mutedRef = useRef(false) // set when the player mutes by hand

  // The barred door applies here exactly as it does on /forge.
  useEffect(() => {
    ;(async () => {
      try {
        const role = window.localStorage.getItem(ROLE_LS_KEY)
        if (role === "dm" || role === "player" || role === "forge") return
        const res = await fetch("/api/claim-code")
        const cfg = await res.json()
        if (cfg?.dmGate || cfg?.forgeGate) window.location.replace("/join")
      } catch {
        /* gate unreachable — leave the forge open rather than strand anyone */
      }
    })()
  }, [])

  const refresh = useCallback(() => setBuilds(readSavedBuilds()), [])

  useEffect(() => {
    refresh()
    // The iframe's persist() writes localStorage; storage events fire in THIS
    // window (a different document), so the list tracks the builder live.
    window.addEventListener("storage", refresh)
    const interval = window.setInterval(refresh, 4000) // belt-and-braces for same-tab writes
    return () => {
      window.removeEventListener("storage", refresh)
      window.clearInterval(interval)
    }
  }, [refresh])

  // Start the creation theme. Browsers block un-gestured autoplay, so we try
  // immediately and fall back to the first click/keypress on the page.
  useEffect(() => {
    const audio = getThemeAudio()
    if (!audio) return
    const tryPlay = () => {
      // Respect the shared "music off" preference each time — a player can
      // refuse music and no later tap should start the theme.
      if (seatedRef.current || mutedRef.current || isMusicOff()) return
      if (!audio.paused) {
        setMusicOn(true) // already carrying over from the intro
        return
      }
      audio.volume = 0.55
      playThemeAudio().then(() => setMusicOn(true)).catch(() => {})
    }
    tryPlay()
    window.addEventListener("pointerdown", tryPlay)
    window.addEventListener("keydown", tryPlay)
    return () => {
      window.removeEventListener("pointerdown", tryPlay)
      window.removeEventListener("keydown", tryPlay)
      // No pause here — the shared theme plays on; destinations decide.
    }
  }, [])

  // The hero is seated - fade the theme out rather than cutting it dead.
  useEffect(() => {
    if (!result) return
    seatedRef.current = true
    const audio = getThemeAudio()
    if (!audio || audio.paused) return
    const fade = window.setInterval(() => {
      if (audio.volume > 0.05) audio.volume = Math.max(0, audio.volume - 0.05)
      else {
        window.clearInterval(fade)
        audio.pause()
        setMusicOn(false)
      }
    }, 120)
    return () => window.clearInterval(fade)
  }, [result])

  const toggleMusic = () => {
    const audio = getThemeAudio()
    if (!audio) return
    if (audio.paused) {
      mutedRef.current = false
      // Clear the shared refusal so the theme is allowed to start (and so the
      // corner MusicToggle and the dashboard agree with this button).
      setMusicOff(false)
      if (seatedRef.current) return // the seat has been taken; the song is done
      audio.volume = 0.55
      playThemeAudio().then(() => setMusicOn(true)).catch(() => {})
    } else {
      mutedRef.current = true
      // Persist the refusal so it survives navigation and reload.
      setMusicOff(true)
      audio.pause()
      setMusicOn(false)
    }
  }

  const addToCampaign = async (id: string, confirmDuplicate = false) => {
    setError(null)
    if (!confirmDuplicate) setDuplicateId(null)
    const w = frameRef.current?.contentWindow as any
    if (!w || typeof w.exportPayload !== "function" || typeof w.migrateChar !== "function") {
      setError("The Forge is still loading below — give it a moment, then try again.")
      return
    }
    const char = readSavedChar(id)
    if (!char) {
      setError("That build isn't in this browser's saved characters any more. Hit refresh.")
      refresh()
      return
    }
    if (!char.built) {
      setError(`"${char.name || "That hero"}" isn't finished yet — complete the build in the Forge below first.`)
      return
    }

    let payload: any
    try {
      w.migrateChar(char) // fill any missing defaults exactly as the builder would
      payload = w.exportPayload(char)
    } catch (e) {
      console.error("[Forge builder] export failed:", e)
      setError("The Forge couldn't export that build. Open it below, check the Export tab, and try again.")
      return
    }

    setSaving(id)
    try {
      // Carry whichever credential this browser holds: the forge/DM code from
      // /join, or a claimed player's own (characterId, claimToken) pair.
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      const forgeKey = window.localStorage.getItem(FORGE_KEY_LS_KEY)
      if (forgeKey) headers["x-forge-key"] = forgeKey
      const ownCharacter = window.localStorage.getItem(CHARACTER_LS_KEY)
      const ownToken = window.localStorage.getItem(TOKEN_LS_KEY)
      if (ownCharacter && ownToken) {
        headers["x-character-id"] = ownCharacter
        headers["x-claim-token"] = ownToken
      }
      const res = await fetch(`/api/forge/import${confirmDuplicate ? "?confirm=duplicate" : ""}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 && data?.duplicate) {
        setDuplicateId(id)
        setError(data.error || "A character with this name already exists.")
        return
      }
      if (!res.ok) {
        setError(data?.error || `Import failed (HTTP ${res.status}).`)
        return
      }
      setResult({
        name: payload?.character?.name ?? char.name ?? "Your hero",
        claimUrl: data.claimUrl ?? null,
        claimCode: data.claimCode ?? null,
      })
      setDuplicateId(null)
    } catch (e) {
      console.error("[Forge builder] import failed:", e)
      setError("Could not reach the forge. Try again.")
    } finally {
      setSaving(null)
    }
  }

  const copy = async (text: string, which: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      /* visible to copy by hand */
    }
  }

  // One-click seat claim for the player who just forged on THIS device.
  const claimHere = () => {
    if (!result?.claimUrl) return
    try {
      const u = new URL(result.claimUrl)
      const c = u.searchParams.get("c")
      const k = u.searchParams.get("k")
      if (!c || !k) return
      window.localStorage.setItem(CHARACTER_LS_KEY, c)
      window.localStorage.setItem(TOKEN_LS_KEY, k)
      window.localStorage.setItem(ROLE_LS_KEY, "player")
      window.location.replace("/")
    } catch {
      /* malformed URL — the visible link still works by hand */
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0908] bg-[url('/images/forge-creation-bg.webp')] bg-cover bg-fixed bg-center text-stone-200">
      <MusicToggle />
      <div className="min-h-screen bg-[#0a0908]/75">
        <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Anvil className="h-7 w-7 text-[#c9a868]" />
            <div>
              <h1 className="font-serif text-2xl text-[#d4b15a]">The Character Forge</h1>
              <p className="text-sm text-stone-500">
                Build your hero below. Saved builds live in this browser — add one to the campaign when it&apos;s ready.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-4 text-sm">
            <button
              onClick={toggleMusic}
              title={musicOn ? "Mute the creation theme" : "Play the creation theme"}
              className="flex items-center gap-1.5 text-stone-400 transition-colors hover:text-[#c9a868]"
            >
              {musicOn ? <Music2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {musicOn ? "Theme" : "Muted"}
            </button>
            <Link href="/forge" className="flex items-center gap-1.5 text-stone-400 transition-colors hover:text-[#c9a868]">
              <ScrollText className="h-4 w-4" /> Import JSON
            </Link>
            <Link href="/" className="flex items-center gap-1.5 text-stone-400 transition-colors hover:text-[#c9a868]">
              <ArrowLeft className="h-4 w-4" /> Dashboard
            </Link>
          </div>
        </div>

        {/* Success — claim code + link, shown once */}
        {result && (
          <div className="space-y-3 rounded-lg border border-emerald-700/50 bg-[#14201a] p-5">
            <div className="flex items-center gap-2 font-medium text-emerald-300">
              <Check className="h-5 w-5" /> {result.name} has joined the campaign.
            </div>
            {result.claimCode && (
              <div>
                <p className="text-sm text-stone-400">
                  Their three-word code — <span className="text-emerald-200">shown once, write it down</span>. It rejoins
                  this character from any device via the door at <code className="text-[#c9b896]">/join</code>:
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 rounded border border-emerald-800/60 bg-[#0a0908] px-3 py-2 text-center font-mono text-[15px] tracking-wide text-emerald-100">
                    {result.claimCode}
                  </code>
                  <button
                    onClick={() => copy(result.claimCode!, "code")}
                    className="flex items-center gap-1.5 rounded border border-[#3d3428] bg-[#1a1614] px-3 py-2 text-sm text-stone-300 transition-colors hover:border-[#8a6a4a]"
                  >
                    <ClipboardCopy className="h-4 w-4" />
                    {copied === "code" ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            )}
            {result.claimUrl && (
              <div>
                <p className="text-sm text-stone-500">Or the direct claim link (same seat, one use is enough):</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 break-all rounded border border-[#3d3428] bg-[#0a0908] px-3 py-2 text-xs text-[#c9b896]">
                    {result.claimUrl}
                  </code>
                  <button
                    onClick={() => copy(result.claimUrl!, "link")}
                    className="flex items-center gap-1.5 rounded border border-[#3d3428] bg-[#1a1614] px-3 py-2 text-sm text-stone-300 transition-colors hover:border-[#8a6a4a]"
                  >
                    <ClipboardCopy className="h-4 w-4" />
                    {copied === "link" ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            )}
            <button
              onClick={claimHere}
              className="w-full rounded border border-emerald-700/70 bg-gradient-to-r from-[#1d3527] via-[#25452f] to-[#1d3527] py-2 text-sm font-bold uppercase tracking-wider text-emerald-200 transition-all hover:border-emerald-400 hover:text-white"
            >
              Play this character on this device
            </button>
          </div>
        )}

        {/* Saved builds */}
        <div className="rounded-lg border border-[#3d3428] bg-[#1a1614] p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-serif text-lg text-[#e8dcc8]">Your saved characters</h2>
            <button
              onClick={refresh}
              className="flex items-center gap-1.5 text-xs text-stone-500 transition-colors hover:text-[#c9a868]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
          {builds.length === 0 ? (
            <p className="text-sm text-stone-500">
              Nothing saved in this browser yet — hit <span className="text-[#c9a868]">Create Character</span> in the
              Forge below. Builds save automatically as you go.
            </p>
          ) : (
            <ul className="divide-y divide-[#2a241e]">
              {builds.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <span className="font-serif text-[15px] text-[#e8d9ae]">{b.name}</span>
                    <span className="ml-2 text-xs text-stone-500">
                      {b.clazz} · Level {b.level} {b.built ? "" : "· still in the wizard"}
                    </span>
                  </div>
                  <button
                    onClick={() => addToCampaign(b.id, duplicateId === b.id)}
                    disabled={saving !== null || !b.built}
                    title={b.built ? undefined : "Finish the build in the Forge below first"}
                    className={cn(
                      "shrink-0 rounded border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all",
                      "border-[#8a6a4a] bg-gradient-to-r from-[#4a3a2a] via-[#5a4a3a] to-[#4a3a2a] text-[#c9a868] hover:border-[#c9a868] hover:text-white",
                      (saving !== null || !b.built) && "cursor-not-allowed opacity-40",
                    )}
                  >
                    {saving === b.id
                      ? "Forging…"
                      : duplicateId === b.id
                        ? "Yes — create a second copy"
                        : "Add to campaign"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded border border-amber-900/50 bg-[#201a10] p-3 text-sm text-amber-400">
              <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" /> {error}
            </div>
          )}
        </div>

        {/* The builder itself — untouched, same-origin */}
        <iframe
          ref={frameRef}
          src="/forge2014.html"
          title="Character Forge — 2014 Edition"
          className="h-[calc(100vh-140px)] min-h-[560px] w-full rounded-lg border border-[#3d3428] bg-[#0a0908]"
        />
        </div>
      </div>
    </div>
  )
}
