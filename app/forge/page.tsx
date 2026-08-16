"use client"

// /forge — the Character Forge importer.
//
// One entry mode, ONE write path (POST /api/forge/import): paste an
// aop-character-v1 JSON exported from the Character Forge, preview it, save.
//
// Building from scratch happens in the embedded Forge at /forge/builder —
// the quick-build form that used to live here is retired. It produced
// characters with no skills, no spellcasting detail and no personality
// (the "bug factory"), and every path into the campaign now goes through
// the full builder's complete export instead.
//
// On success the page shows the character's claim link AND their three-word
// rejoin code — the same shape the /join gate accepts.

import { useEffect, useState } from "react"
import Link from "next/link"
import { Anvil, ArrowLeft, Check, ClipboardCopy, Hammer, ScrollText, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { MusicToggle } from "@/components/music-toggle"

interface ParsedPreview {
  name: string
  species?: string
  klass?: string
  level: number
  hpMax: number
  ac: number
  abilityLine: string
  preparedSpells: number
  inventoryCount: number
  payload: any
}

// Same localStorage keys the /join gate and the dashboard use.
const CHARACTER_LS_KEY = "aop_character_id"
const TOKEN_LS_KEY = "aop_claim_token"
const ROLE_LS_KEY = "aop_access_role"
const FORGE_KEY_LS_KEY = "aop_forge_key"

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const
const ABILITY_LABELS: Record<(typeof ABILITIES)[number], string> = {
  str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA",
}

export default function ForgePage() {
  const [pasted, setPasted] = useState("")
  const [preview, setPreview] = useState<ParsedPreview | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [duplicatePending, setDuplicatePending] = useState(false)
  const [claimUrl, setClaimUrl] = useState<string | null>(null)
  const [claimCode, setClaimCode] = useState<string | null>(null)
  const [copied, setCopied] = useState<"link" | "code" | null>(null)

  // The barred door applies here too: when a gate is armed, only a browser that
  // came through /join (dm, player, or forge role) may use the Forge. Fail-open
  // when no gate is armed — an unset env var never locks anyone out.
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

  const validate = () => {
    setParseError(null)
    setPreview(null)
    setClaimUrl(null)
    setClaimCode(null)
    try {
      const payload = JSON.parse(pasted)
      const format = payload?.format ?? payload?.character?.format
      if (format !== "aop-character-v1") {
        setParseError('This isn\'t an aop-character-v1 export — use "Export for Campaign" in the Character Forge.')
        return
      }
      const c = payload.character
      if (!c || typeof c.name !== "string" || !c.name.trim()) {
        setParseError("The export is missing a character name.")
        return
      }
      const abilityLine = ABILITIES
        .map((ab) => `${ABILITY_LABELS[ab]} ${c[`${ab}_score`] ?? 10}`)
        .join(" · ")
      const prepared = Array.isArray(c.sheet_spellcasting?.prepared)
        ? c.sheet_spellcasting.prepared.length
        : 0
      setPreview({
        name: c.name.trim(),
        species: c.sheet_species,
        klass: c.class,
        level: typeof c.level === "number" ? c.level : 1,
        hpMax: typeof c.hp_max === "number" ? c.hp_max : 10,
        ac: typeof c.ac === "number" ? c.ac : 10,
        abilityLine,
        preparedSpells: prepared,
        inventoryCount: Array.isArray(payload.inventory) ? payload.inventory.length : 0,
        payload,
      })
    } catch {
      setParseError("That doesn't parse as JSON. Copy the whole export from the Character Forge and paste it again.")
    }
  }

  const save = async (payload: any, confirmDuplicate = false) => {
    setSaving(true)
    setSaveError(null)
    setDuplicatePending(false)
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
        setDuplicatePending(true)
        setSaveError(data.error || "A character with this name already exists.")
        return
      }
      if (!res.ok) {
        setSaveError(data?.error || `Import failed (HTTP ${res.status}).`)
        return
      }
      setClaimUrl(data.claimUrl || null)
      setClaimCode(data.claimCode || null)
    } catch (e) {
      console.error("[Forge] import failed:", e)
      setSaveError("Could not reach the forge. Try again.")
    } finally {
      setSaving(false)
    }
  }

  const copy = async (text: string, which: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // Clipboard unavailable — the text is visible to copy by hand.
    }
  }

  // One-click seat claim for the player who just forged on THIS device: store
  // the same localStorage trio the /join gate writes, then open the dashboard.
  const claimHere = () => {
    if (!claimUrl) return
    try {
      const u = new URL(claimUrl)
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
    <div className="min-h-screen bg-[#0a0908] text-stone-200">
      <MusicToggle />
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Anvil className="w-7 h-7 text-[#c9a868]" />
            <div>
              <h1 className="text-2xl font-serif text-[#d4b15a]">The Character Forge — Import</h1>
              <p className="text-sm text-stone-500">
                Paste a forged character into the campaign.
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-stone-400 hover:text-[#c9a868] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
        </div>

        {/* Build-from-scratch pointer — the quick build's replacement */}
        <Link
          href="/forge/builder"
          className="flex items-center justify-between gap-3 rounded-lg border border-[#8a6a4a]/60 bg-[#171310] p-4 transition-colors hover:border-[#c9a868]"
        >
          <div className="flex items-center gap-3">
            <Hammer className="h-5 w-5 text-[#c9a868]" />
            <div>
              <span className="block font-serif text-[15px] text-[#e8dcc8]">Building from scratch?</span>
              <span className="block text-xs text-stone-500">
                Open the full Character Forge — step-by-step builder, saved per-browser, complete sheets every time.
              </span>
            </div>
          </div>
          <span className="shrink-0 text-sm text-[#c9a868]">Open the builder →</span>
        </Link>

        {/* Success state — the claim code + link */}
        {claimUrl && (
          <div className="bg-[#14201a] border border-emerald-700/50 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-300 font-medium">
              <Check className="w-5 h-5" /> Character forged and saved to the campaign.
            </div>
            {claimCode && (
              <div>
                <p className="text-sm text-stone-400">
                  Their three-word code — <span className="text-emerald-200">shown once, write it down</span>. It claims
                  this character from any device via <code className="text-[#c9b896]">/join</code>:
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 rounded border border-emerald-800/60 bg-[#0a0908] px-3 py-2 text-center font-mono text-[15px] tracking-wide text-emerald-100">
                    {claimCode}
                  </code>
                  <button
                    onClick={() => copy(claimCode, "code")}
                    className="flex items-center gap-1.5 px-3 py-2 rounded bg-[#1a1614] border border-[#3d3428] text-sm text-stone-300 hover:border-[#8a6a4a] transition-colors"
                  >
                    <ClipboardCopy className="w-4 h-4" />
                    {copied === "code" ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            )}
            <p className="text-sm text-stone-500">
              Or send the direct claim link — it locks their browser to this character:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-[#0a0908] border border-[#3d3428] rounded px-3 py-2 text-[#c9b896] break-all">
                {claimUrl}
              </code>
              <button
                onClick={() => copy(claimUrl, "link")}
                className="flex items-center gap-1.5 px-3 py-2 rounded bg-[#1a1614] border border-[#3d3428] text-sm text-stone-300 hover:border-[#8a6a4a] transition-colors"
              >
                <ClipboardCopy className="w-4 h-4" />
                {copied === "link" ? "Copied!" : "Copy"}
              </button>
            </div>
            <button
              onClick={claimHere}
              className="w-full py-2 rounded font-bold uppercase tracking-wider text-sm transition-all bg-gradient-to-r from-[#1d3527] via-[#25452f] to-[#1d3527] border border-emerald-700/70 hover:border-emerald-400 text-emerald-200 hover:text-white"
            >
              Play this character on this device
            </button>
            <p className="text-xs text-stone-600">
              Building for yourself? The button above claims the seat right here — no link needed.
              The new character also appears in the dashboard picker and on the DM view automatically.
            </p>
          </div>
        )}

        {/* Import */}
        <div className="bg-[#1a1614] border border-[#3d3428] rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-[#c9a868]" />
            <h2 className="text-lg font-serif text-[#e8dcc8]">Import from the Character Forge</h2>
          </div>
          <p className="text-sm text-stone-500">
            Paste the <code className="text-[#c9b896]">aop-character-v1</code> JSON exported from the
            Character Forge, validate it, and review exactly what will be created before anything is written.
          </p>
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder='{"format":"aop-character-v1","character":{...},"inventory":[...]}'
            rows={7}
            className="w-full px-3 py-2 text-xs font-mono bg-[#0f0d0c] border border-[#3d3428] rounded text-stone-300 placeholder:text-stone-700 focus:outline-none focus:border-[#8a6a4a]"
          />
          <div className="flex gap-2">
            <button
              onClick={validate}
              disabled={!pasted.trim()}
              className="px-4 py-2 rounded bg-[#2a2420] border border-[#3d3428] text-sm text-stone-300 hover:border-[#8a6a4a] transition-colors disabled:opacity-50"
            >
              Validate
            </button>
          </div>

          {parseError && (
            <div className="flex items-start gap-2 text-sm text-red-400 bg-[#201414] border border-red-900/50 rounded p-3">
              <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" /> {parseError}
            </div>
          )}

          {/* Preview card — shown BEFORE any write */}
          {preview && (
            <div className="bg-[#0f0d0c] border border-[#8a6a4a]/50 rounded-lg p-4 space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-serif text-[#d4b15a]">{preview.name}</span>
                <span className="text-sm text-stone-400">
                  {[preview.species, preview.klass].filter(Boolean).join(" ")} · Level {preview.level}
                </span>
              </div>
              <div className="text-xs text-stone-400">{preview.abilityLine}</div>
              <div className="flex gap-4 text-sm">
                <span className="text-red-300">HP {preview.hpMax}</span>
                <span className="text-amber-300">AC {preview.ac}</span>
                <span className="text-purple-300">{preview.preparedSpells} prepared spells</span>
                <span className="text-emerald-300">{preview.inventoryCount} items</span>
              </div>
              <p className="text-[11px] text-stone-600">
                This is exactly what will be created — nothing has been written yet.
              </p>
              <button
                onClick={() => save(preview.payload, duplicatePending)}
                disabled={saving}
                className={cn(
                  "w-full py-2 rounded font-bold uppercase tracking-wider text-sm transition-all",
                  "bg-gradient-to-r from-[#4a3a2a] via-[#5a4a3a] to-[#4a3a2a]",
                  "border border-[#8a6a4a] hover:border-[#c9a868] text-[#c9a868] hover:text-white",
                  saving && "opacity-60 cursor-not-allowed",
                )}
              >
                {saving ? "Forging…" : duplicatePending ? "Yes — create a second copy" : "Save to Campaign"}
              </button>
            </div>
          )}

          {saveError && (
            <div className="flex items-start gap-2 text-sm text-amber-400 bg-[#201a10] border border-amber-900/50 rounded p-3">
              <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" /> {saveError}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
