"use client"

// /forge — the Character Forge importer + quick builder.
//
// Two entry modes, ONE write path (POST /api/forge/import):
//  1. Import: paste aop-character-v1 JSON exported from the Character Forge.
//  2. Quick build: a minimal form that constructs a small aop-character-v1
//     payload client-side and submits through the same endpoint.
//
// On success the page shows the character's claim link — the same URL shape
// the multiplayer claim-link flow verifies (/?c=<id>&k=<token>).

import { useMemo, useState } from "react"
import Link from "next/link"
import { Anvil, ArrowLeft, Check, ClipboardCopy, Hammer, ScrollText, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"

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

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const
const ABILITY_LABELS: Record<(typeof ABILITIES)[number], string> = {
  str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA",
}

function modifierFor(score: number): number {
  return Math.floor((score - 10) / 2)
}

export default function ForgePage() {
  const [pasted, setPasted] = useState("")
  const [preview, setPreview] = useState<ParsedPreview | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [duplicatePending, setDuplicatePending] = useState(false)
  const [claimUrl, setClaimUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Quick build form state
  const [quickOpen, setQuickOpen] = useState(false)
  const [qName, setQName] = useState("")
  const [qClass, setQClass] = useState("Fighter")
  const [qSpecies, setQSpecies] = useState("Human")
  const [qBackground, setQBackground] = useState("")
  const [qScores, setQScores] = useState<Record<(typeof ABILITIES)[number], number>>({
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
  })
  const [qHp, setQHp] = useState(10)
  const [qAc, setQAc] = useState(10)

  const validate = () => {
    setParseError(null)
    setPreview(null)
    setClaimUrl(null)
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
      const res = await fetch(`/api/forge/import${confirmDuplicate ? "?confirm=duplicate" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    } catch (e) {
      console.error("[Forge] import failed:", e)
      setSaveError("Could not reach the forge. Try again.")
    } finally {
      setSaving(false)
    }
  }

  const quickPayload = useMemo(() => {
    const character: Record<string, unknown> = {
      name: qName.trim(),
      class: qClass,
      level: 1,
      hp_max: qHp,
      hp_current: qHp,
      ac: qAc,
      proficiency_bonus: 2,
      sheet_species: qSpecies,
      sheet_background: qBackground || undefined,
      passive_perception: 10 + modifierFor(qScores.wis),
      initiative: modifierFor(qScores.dex),
    }
    for (const ab of ABILITIES) {
      character[`${ab}_score`] = qScores[ab]
      character[`${ab}_modifier`] = modifierFor(qScores[ab])
    }
    return { format: "aop-character-v1", character, inventory: [] }
  }, [qName, qClass, qSpecies, qBackground, qScores, qHp, qAc])

  const copyClaim = async () => {
    if (!claimUrl) return
    try {
      await navigator.clipboard.writeText(claimUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable — the link is visible to copy by hand.
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0908] text-stone-200">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Anvil className="w-7 h-7 text-[#c9a868]" />
            <div>
              <h1 className="text-2xl font-serif text-[#d4b15a]">The Character Forge</h1>
              <p className="text-sm text-stone-500">
                Import a forged character into the campaign — or hammer out a quick one to play tonight.
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

        {/* Success state — the claim link */}
        {claimUrl && (
          <div className="bg-[#14201a] border border-emerald-700/50 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-300 font-medium">
              <Check className="w-5 h-5" /> Character forged and saved to the campaign.
            </div>
            <p className="text-sm text-stone-400">
              Send this link to the player — it locks their browser to this character:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-[#0a0908] border border-[#3d3428] rounded px-3 py-2 text-[#c9b896] break-all">
                {claimUrl}
              </code>
              <button
                onClick={copyClaim}
                className="flex items-center gap-1.5 px-3 py-2 rounded bg-[#1a1614] border border-[#3d3428] text-sm text-stone-300 hover:border-[#8a6a4a] transition-colors"
              >
                <ClipboardCopy className="w-4 h-4" />
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-stone-600">
              The new character also appears in the dashboard picker and on the DM view automatically.
            </p>
          </div>
        )}

        {/* Import (primary path) */}
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

        {/* Quick build (secondary) */}
        <div className="bg-[#1a1614] border border-[#3d3428] rounded-lg">
          <button
            onClick={() => setQuickOpen(!quickOpen)}
            className="w-full flex items-center justify-between p-5 text-left"
          >
            <div className="flex items-center gap-2">
              <Hammer className="w-5 h-5 text-stone-500" />
              <span className="text-lg font-serif text-[#e8dcc8]">Quick build</span>
              <span className="text-xs text-stone-600">— enough to seat a player tonight</span>
            </div>
            <span className="text-stone-500 text-sm">{quickOpen ? "Hide" : "Open"}</span>
          </button>
          {quickOpen && (
            <div className="px-5 pb-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-stone-500 space-y-1">
                  <span>Name *</span>
                  <input
                    value={qName}
                    onChange={(e) => setQName(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm bg-[#0f0d0c] border border-[#3d3428] rounded text-stone-300 focus:outline-none focus:border-[#8a6a4a]"
                  />
                </label>
                <label className="text-xs text-stone-500 space-y-1">
                  <span>Class</span>
                  <input
                    value={qClass}
                    onChange={(e) => setQClass(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm bg-[#0f0d0c] border border-[#3d3428] rounded text-stone-300 focus:outline-none focus:border-[#8a6a4a]"
                  />
                </label>
                <label className="text-xs text-stone-500 space-y-1">
                  <span>Species</span>
                  <input
                    value={qSpecies}
                    onChange={(e) => setQSpecies(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm bg-[#0f0d0c] border border-[#3d3428] rounded text-stone-300 focus:outline-none focus:border-[#8a6a4a]"
                  />
                </label>
                <label className="text-xs text-stone-500 space-y-1">
                  <span>Background</span>
                  <input
                    value={qBackground}
                    onChange={(e) => setQBackground(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm bg-[#0f0d0c] border border-[#3d3428] rounded text-stone-300 focus:outline-none focus:border-[#8a6a4a]"
                  />
                </label>
              </div>
              <div className="grid grid-cols-6 gap-2">
                {ABILITIES.map((ab) => (
                  <label key={ab} className="text-xs text-stone-500 text-center space-y-1">
                    <span>{ABILITY_LABELS[ab]}</span>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={qScores[ab]}
                      onChange={(e) =>
                        setQScores((prev) => ({ ...prev, [ab]: Number.parseInt(e.target.value, 10) || 10 }))
                      }
                      className="w-full px-1 py-1.5 text-sm text-center bg-[#0f0d0c] border border-[#3d3428] rounded text-stone-300 focus:outline-none focus:border-[#8a6a4a]"
                    />
                    <span className="block text-[10px] text-stone-600">
                      {modifierFor(qScores[ab]) >= 0 ? "+" : ""}
                      {modifierFor(qScores[ab])}
                    </span>
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-stone-500 space-y-1">
                  <span>Max HP</span>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={qHp}
                    onChange={(e) => setQHp(Number.parseInt(e.target.value, 10) || 10)}
                    className="w-full px-2 py-1.5 text-sm bg-[#0f0d0c] border border-[#3d3428] rounded text-stone-300 focus:outline-none focus:border-[#8a6a4a]"
                  />
                </label>
                <label className="text-xs text-stone-500 space-y-1">
                  <span>AC</span>
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={qAc}
                    onChange={(e) => setQAc(Number.parseInt(e.target.value, 10) || 10)}
                    className="w-full px-2 py-1.5 text-sm bg-[#0f0d0c] border border-[#3d3428] rounded text-stone-300 focus:outline-none focus:border-[#8a6a4a]"
                  />
                </label>
              </div>
              <button
                onClick={() => save(quickPayload, duplicatePending)}
                disabled={saving || !qName.trim()}
                className={cn(
                  "w-full py-2 rounded font-bold uppercase tracking-wider text-sm transition-all",
                  "bg-gradient-to-r from-[#4a3a2a] via-[#5a4a3a] to-[#4a3a2a]",
                  "border border-[#8a6a4a] hover:border-[#c9a868] text-[#c9a868] hover:text-white",
                  (saving || !qName.trim()) && "opacity-60 cursor-not-allowed",
                )}
              >
                {saving ? "Forging…" : duplicatePending ? "Yes — create a second copy" : "Save to Campaign"}
              </button>
              <p className="text-[11px] text-stone-600">
                Quick builds are Level 1 with empty inventory — refine them later in the Character Forge and re-import.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
