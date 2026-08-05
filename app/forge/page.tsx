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

import { useEffect, useMemo, useState } from "react"
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

// Same localStorage keys the /join gate and the dashboard use.
const CHARACTER_LS_KEY = "aop_character_id"
const TOKEN_LS_KEY = "aop_claim_token"
const ROLE_LS_KEY = "aop_access_role"
const FORGE_KEY_LS_KEY = "aop_forge_key"

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const
const ABILITY_LABELS: Record<(typeof ABILITIES)[number], string> = {
  str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA",
}

const CHARACTER_CLASSES = [
  "Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk",
  "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard",
] as const

type SpellAbility = "int" | "wis" | "cha"
type SpellcastingConfig = {
  ability: SpellAbility
  cantripLimit: number
  preparedLimit: number
  knownLimit?: number
  cantrips: string[]
  levelOne: string[]
  focus: string
  pact?: boolean
}

const SPELLCASTING: Partial<Record<(typeof CHARACTER_CLASSES)[number], SpellcastingConfig>> = {
  Bard: { ability: "cha", cantripLimit: 2, preparedLimit: 4, focus: "Musical Instrument", cantrips: ["Blade Ward", "Dancing Lights", "Light", "Mage Hand", "Mending", "Message", "Minor Illusion", "Prestidigitation", "True Strike", "Vicious Mockery"], levelOne: ["Bane", "Charm Person", "Color Spray", "Command", "Cure Wounds", "Detect Magic", "Disguise Self", "Dissonant Whispers", "Faerie Fire", "Feather Fall", "Healing Word", "Heroism", "Identify", "Sleep", "Tasha's Hideous Laughter", "Thunderwave"] },
  Cleric: { ability: "wis", cantripLimit: 3, preparedLimit: 4, focus: "Holy Symbol", cantrips: ["Guidance", "Light", "Mending", "Message", "Sacred Flame", "Spare the Dying", "Thaumaturgy", "Toll the Dead", "Word of Radiance"], levelOne: ["Bane", "Bless", "Command", "Cure Wounds", "Detect Magic", "Guiding Bolt", "Healing Word", "Heroism", "Inflict Wounds", "Protection from Evil and Good", "Sanctuary", "Shield of Faith"] },
  Druid: { ability: "wis", cantripLimit: 2, preparedLimit: 4, focus: "Druidic Focus", cantrips: ["Druidcraft", "Guidance", "Mending", "Message", "Poison Spray", "Produce Flame", "Shillelagh", "Spare the Dying", "Thorn Whip"], levelOne: ["Charm Person", "Cure Wounds", "Detect Magic", "Entangle", "Faerie Fire", "Fog Cloud", "Goodberry", "Healing Word", "Jump", "Longstrider", "Speak with Animals", "Thunderwave"] },
  Paladin: { ability: "cha", cantripLimit: 0, preparedLimit: 2, focus: "Holy Symbol", cantrips: [], levelOne: ["Bless", "Command", "Cure Wounds", "Divine Favor", "Heroism", "Protection from Evil and Good", "Searing Smite", "Shield of Faith"] },
  Ranger: { ability: "wis", cantripLimit: 0, preparedLimit: 2, focus: "Druidic Focus", cantrips: [], levelOne: ["Cure Wounds", "Detect Magic", "Entangle", "Fog Cloud", "Goodberry", "Hunter's Mark", "Jump", "Longstrider", "Speak with Animals"] },
  Sorcerer: { ability: "cha", cantripLimit: 4, preparedLimit: 2, focus: "Arcane Focus", cantrips: ["Acid Splash", "Blade Ward", "Chill Touch", "Dancing Lights", "Fire Bolt", "Light", "Mage Hand", "Message", "Minor Illusion", "Poison Spray", "Prestidigitation", "Ray of Frost", "Shocking Grasp", "True Strike"], levelOne: ["Burning Hands", "Charm Person", "Chromatic Orb", "Color Spray", "Detect Magic", "Disguise Self", "False Life", "Feather Fall", "Fog Cloud", "Grease", "Jump", "Mage Armor", "Magic Missile", "Ray of Sickness", "Shield", "Sleep", "Thunderwave", "Witch Bolt"] },
  Warlock: { ability: "cha", cantripLimit: 2, preparedLimit: 2, focus: "Arcane Focus", pact: true, cantrips: ["Blade Ward", "Chill Touch", "Eldritch Blast", "Mage Hand", "Message", "Minor Illusion", "Poison Spray", "Prestidigitation", "Toll the Dead", "True Strike"], levelOne: ["Charm Person", "Hellish Rebuke", "Hex", "Protection from Evil and Good", "Tasha's Hideous Laughter", "Witch Bolt"] },
  Wizard: { ability: "int", cantripLimit: 3, knownLimit: 6, preparedLimit: 4, focus: "Arcane Focus or Spellbook", cantrips: ["Acid Splash", "Blade Ward", "Chill Touch", "Dancing Lights", "Fire Bolt", "Light", "Mage Hand", "Mending", "Message", "Minor Illusion", "Prestidigitation", "Ray of Frost", "Shocking Grasp", "True Strike"], levelOne: ["Burning Hands", "Charm Person", "Chromatic Orb", "Color Spray", "Detect Magic", "Disguise Self", "False Life", "Feather Fall", "Find Familiar", "Fog Cloud", "Grease", "Identify", "Jump", "Mage Armor", "Magic Missile", "Ray of Sickness", "Shield", "Sleep", "Tasha's Hideous Laughter", "Thunderwave", "Witch Bolt"] },
}

const CLERIC_DOMAINS = ["Knowledge", "Life", "Light", "Nature", "Tempest", "Trickery", "War"] as const
const CLERIC_DOMAIN_LEVEL_ONE: Record<string, string[]> = {
  Knowledge: ["Command", "Identify"], Life: ["Bless", "Cure Wounds"], Light: ["Burning Hands", "Faerie Fire"],
  Nature: ["Animal Friendship", "Speak with Animals"], Tempest: ["Fog Cloud", "Thunderwave"],
  Trickery: ["Charm Person", "Disguise Self"], War: ["Divine Favor", "Shield of Faith"],
}

function modifierFor(score: number): number {
  return Math.floor((score - 10) / 2)
}

function SpellChoiceGrid({
  title, choices, selected, limit, onToggle,
}: {
  title: string
  choices: string[]
  selected: string[]
  limit: number
  onToggle: (spell: string) => void
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-purple-300">{title}</h4>
        <span className={cn("text-[11px]", selected.length === limit ? "text-emerald-400" : "text-stone-500")}>{selected.length} / {limit}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {choices.map((spell) => {
          const checked = selected.includes(spell)
          const disabled = !checked && selected.length >= limit
          return (
            <button key={spell} type="button" onClick={() => onToggle(spell)} disabled={disabled} aria-pressed={checked} className={cn("rounded border px-2 py-2 text-left text-xs transition-colors", checked ? "border-purple-500 bg-purple-950/60 text-purple-100" : "border-[#3d3428] bg-[#0f0d0c] text-stone-400 hover:border-purple-800", disabled && "cursor-not-allowed opacity-35")}>{spell}</button>
          )
        })}
      </div>
    </div>
  )
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
  const [qSubclass, setQSubclass] = useState("")
  const [qCantrips, setQCantrips] = useState<string[]>([])
  const [qPrepared, setQPrepared] = useState<string[]>([])
  const [qKnown, setQKnown] = useState<string[]>([])

  const quickSpellcasting = SPELLCASTING[qClass as keyof typeof SPELLCASTING]
  const quickSpellComplete = !quickSpellcasting || (
    qCantrips.length === quickSpellcasting.cantripLimit &&
    qPrepared.length === quickSpellcasting.preparedLimit &&
    (!quickSpellcasting.knownLimit || qKnown.length === quickSpellcasting.knownLimit)
  )

  useEffect(() => {
    setQCantrips([])
    setQPrepared([])
    setQKnown([])
    setQSubclass("")
  }, [qClass])

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
    } catch (e) {
      console.error("[Forge] import failed:", e)
      setSaveError("Could not reach the forge. Try again.")
    } finally {
      setSaving(false)
    }
  }

  const quickPayload = useMemo(() => {
    const spellAbilityModifier = quickSpellcasting ? modifierFor(qScores[quickSpellcasting.ability]) : 0
    const domainSpells = qClass === "Cleric" && qSubclass ? CLERIC_DOMAIN_LEVEL_ONE[qSubclass] ?? [] : []
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
      sheet_subclass: qSubclass ? `${qSubclass} Domain` : undefined,
      sheet_spellcasting: quickSpellcasting ? {
        ability: quickSpellcasting.ability,
        save_dc: 8 + 2 + spellAbilityModifier,
        attack_bonus: 2 + spellAbilityModifier,
        cantrips: qCantrips,
        prepared: qPrepared,
        known: qKnown,
        domain_spells: domainSpells,
        slots: { "1": { max: quickSpellcasting.pact ? 1 : 2, used: 0 } },
        pact: Boolean(quickSpellcasting.pact),
        focus: quickSpellcasting.focus,
        rules_version: "5e-2024",
      } : undefined,
    }
    for (const ab of ABILITIES) {
      character[`${ab}_score`] = qScores[ab]
      character[`${ab}_modifier`] = modifierFor(qScores[ab])
    }
    return { format: "aop-character-v1", character, inventory: [] }
  }, [qName, qClass, qSpecies, qBackground, qScores, qHp, qAc, qSubclass, qCantrips, qPrepared, qKnown, quickSpellcasting])

  const toggleSpell = (spell: string, selected: string[], setSelected: (next: string[]) => void, limit: number) => {
    if (selected.includes(spell)) setSelected(selected.filter((name) => name !== spell))
    else if (selected.length < limit) setSelected([...selected, spell])
  }

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
                  <select
                    value={qClass}
                    onChange={(e) => setQClass(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm bg-[#0f0d0c] border border-[#3d3428] rounded text-stone-300 focus:outline-none focus:border-[#8a6a4a]"
                  >
                    {CHARACTER_CLASSES.map((className) => <option key={className}>{className}</option>)}
                  </select>
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
              {quickSpellcasting && (
                <section className="space-y-4 rounded-lg border border-purple-900/60 bg-[#120d16] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-serif text-lg text-purple-200">Spellcasting</h3>
                      <p className="text-xs text-stone-500">
                        {ABILITY_LABELS[quickSpellcasting.ability]} · Save DC {8 + 2 + modifierFor(qScores[quickSpellcasting.ability])} · Attack {modifierFor(qScores[quickSpellcasting.ability]) + 2 >= 0 ? "+" : ""}{modifierFor(qScores[quickSpellcasting.ability]) + 2} · {quickSpellcasting.focus}
                      </p>
                    </div>
                    <span className="rounded border border-purple-800/60 px-2 py-1 text-[10px] uppercase tracking-wider text-purple-300">5E 2024 · Level 1</span>
                  </div>

                  {qClass === "Cleric" && (
                    <label className="block space-y-1 text-xs text-stone-500">
                      <span>Divine Domain <span className="text-stone-700">(optional for campaigns using 2014 subclass timing)</span></span>
                      <select value={qSubclass} onChange={(e) => setQSubclass(e.target.value)} className="w-full rounded border border-[#3d3428] bg-[#0f0d0c] px-2 py-1.5 text-sm text-stone-300 focus:border-purple-700 focus:outline-none">
                        <option value="">Not selected</option>
                        {CLERIC_DOMAINS.map((domain) => <option key={domain} value={domain}>{domain} Domain</option>)}
                      </select>
                    </label>
                  )}

                  {quickSpellcasting.cantripLimit > 0 && (
                    <SpellChoiceGrid title="Cantrips" selected={qCantrips} choices={quickSpellcasting.cantrips} limit={quickSpellcasting.cantripLimit} onToggle={(spell) => toggleSpell(spell, qCantrips, setQCantrips, quickSpellcasting.cantripLimit)} />
                  )}
                  {quickSpellcasting.knownLimit && (
                    <SpellChoiceGrid title="Starting Spellbook · Level 1" selected={qKnown} choices={quickSpellcasting.levelOne} limit={quickSpellcasting.knownLimit} onToggle={(spell) => {
                      toggleSpell(spell, qKnown, (next) => {
                        setQKnown(next)
                        setQPrepared((prepared) => prepared.filter((name) => next.includes(name)))
                      }, quickSpellcasting.knownLimit || 0)
                    }} />
                  )}
                  <SpellChoiceGrid title={qClass === "Wizard" ? "Prepared from Spellbook" : "Prepared Level 1 Spells"} selected={qPrepared} choices={qClass === "Wizard" ? qKnown : quickSpellcasting.levelOne} limit={quickSpellcasting.preparedLimit} onToggle={(spell) => toggleSpell(spell, qPrepared, setQPrepared, quickSpellcasting.preparedLimit)} />
                  <p className="text-[11px] text-stone-600">Selections are saved with the character and appear in the dashboard&apos;s full character sheet. Spell slots refresh after a long rest.</p>
                </section>
              )}
              <button
                onClick={() => save(quickPayload, duplicatePending)}
                disabled={saving || !qName.trim() || !quickSpellComplete}
                className={cn(
                  "w-full py-2 rounded font-bold uppercase tracking-wider text-sm transition-all",
                  "bg-gradient-to-r from-[#4a3a2a] via-[#5a4a3a] to-[#4a3a2a]",
                  "border border-[#8a6a4a] hover:border-[#c9a868] text-[#c9a868] hover:text-white",
                  (saving || !qName.trim() || !quickSpellComplete) && "opacity-60 cursor-not-allowed",
                )}
              >
                {saving ? "Forging…" : duplicatePending ? "Yes — create a second copy" : "Save to Campaign"}
              </button>
              <p className="text-[11px] text-stone-600">
                Quick builds are Level 1 with empty inventory. Spellcasters must complete their spell choices before saving.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
