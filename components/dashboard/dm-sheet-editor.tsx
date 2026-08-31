"use client"

// DM-only sheet override.
//
// Once start_campaign() runs, enforce_character_lock blocks writes to 28 build
// fields on any seated player character. This is the sanctioned way through it:
// the form POSTs to /api/dm/character-sheet, which calls dm_unlock_character(),
// applies the patch, and relocks — writing a snapshot and the DM's stated
// reason into characters_history on the way.
//
// It reads and writes RAW database columns rather than the mapped view the
// sheet renders, so what a DM edits is what is actually stored. Only changed
// fields are sent.

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, Loader2, Lock, LockOpen, Save, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { dmHeaders } from "@/lib/dm-key"
import { cn } from "@/lib/utils"

type Row = Record<string, unknown>

const NUMBER_FIELDS = [
  "level", "xp", "xp_to_next", "hp_current", "hp_max", "sheet_hp_temp", "ac",
  "initiative", "proficiency_bonus", "passive_perception",
  "sheet_passive_insight", "sheet_passive_investigation",
] as const

const SCORES = ["str", "dex", "con", "int", "wis", "cha"] as const

const TEXT_FIELDS = [
  "name", "class", "sheet_species", "sheet_background", "sheet_alignment",
  "sheet_player_name", "sheet_hit_dice", "speed", "senses", "size", "languages",
] as const

const LONG_TEXT_FIELDS = [
  "skills", "sheet_defenses", "damage_resistances", "damage_immunities",
  "condition_immunities", "sheet_backstory", "sheet_allies_organizations",
  "sheet_additional_notes",
] as const

const JSON_FIELDS = [
  "conditions", "sheet_save_proficiencies", "sheet_skill_proficiencies",
  "sheet_proficiencies", "sheet_features", "sheet_attacks", "sheet_currency",
  "sheet_appearance", "sheet_personality", "sheet_spellcasting",
] as const

const LABEL: Record<string, string> = {
  sheet_species: "Species", sheet_background: "Background",
  sheet_alignment: "Alignment", sheet_player_name: "Player",
  sheet_hit_dice: "Hit dice", sheet_hp_temp: "Temp HP",
  hp_current: "HP current", hp_max: "HP max", ac: "AC",
  proficiency_bonus: "Proficiency", passive_perception: "Passive perception",
  sheet_passive_insight: "Passive insight",
  sheet_passive_investigation: "Passive investigation",
  xp_to_next: "XP to next", sheet_defenses: "Defenses",
  sheet_backstory: "Backstory", sheet_allies_organizations: "Allies & orgs",
  sheet_additional_notes: "Notes", sheet_spellcasting: "Spellcasting",
}

const label = (k: string) =>
  LABEL[k] ?? k.replace(/^sheet_/, "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())

const modifierFor = (score: number) => Math.floor((score - 10) / 2)

export function DmSheetEditor({
  characterId,
  onClose,
  onSaved,
}: {
  characterId: string
  onClose: () => void
  onSaved?: () => void
}) {
  const [row, setRow] = useState<Row | null>(null)
  const [draft, setDraft] = useState<Row>({})
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setRow(null)
    setDraft({})
    setResult(null)
    setError(null)
    const supabase = createClient()
    supabase
      .from("characters")
      .select("*")
      .eq("id", characterId)
      .single()
      .then(({ data, error }: { data: Row | null; error: { message: string } | null }) => {
        if (cancelled) return
        if (error) setError(`Could not load the sheet: ${error.message}`)
        else setRow(data as Row)
      })
    return () => {
      cancelled = true
    }
  }, [characterId])

  const set = useCallback((key: string, value: unknown) => {
    setDraft((d) => ({ ...d, [key]: value }))
  }, [])

  const valueOf = useCallback(
    (key: string) => (key in draft ? draft[key] : row?.[key]),
    [draft, row],
  )

  // Only changed fields travel. JSON fields are compared as text so that
  // reformatting alone doesn't count as a change.
  const patch = useMemo(() => {
    if (!row) return {}
    const out: Row = {}
    for (const [k, v] of Object.entries(draft)) {
      const before = row[k]
      const same =
        typeof v === "object" || typeof before === "object"
          ? JSON.stringify(before ?? null) === JSON.stringify(v ?? null)
          : String(before ?? "") === String(v ?? "")
      if (!same) out[k] = v
    }
    return out
  }, [draft, row])

  const changedKeys = Object.keys(patch)
  const locked = !!row?.locked_at

  const save = async () => {
    if (!reason.trim() || changedKeys.length === 0) return
    setSaving(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/dm/character-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...dmHeaders() },
        body: JSON.stringify({ id: characterId, reason: reason.trim(), patch }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error ?? `Save failed (${res.status})`)
        return
      }
      setRow(json.character as Row)
      setDraft({})
      setReason("")
      const bits = [`Saved ${json.changed.length} field${json.changed.length === 1 ? "" : "s"}`]
      if (json.derived?.length) bits.push(`derived ${json.derived.join(", ")}`)
      if (json.rejected?.length) bits.push(`ignored ${json.rejected.join(", ")}`)
      if (json.wasLocked) bits.push(json.relocked ? "sheet relocked" : "RELOCK FAILED")
      setResult(bits.join(" · "))
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  if (error && !row) {
    return <div className="p-4 text-sm text-red-400">{error}</div>
  }
  if (!row) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-stone-400">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading sheet…
      </div>
    )
  }

  const inputCls =
    "w-full bg-[#1a1614] border border-[#3d3428]/60 rounded px-2 py-1 text-sm text-stone-200 focus:border-amber-500/60 focus:outline-none"

  return (
    <div className="space-y-4 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-amber-400">
          {locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
          DM override — {String(row.name ?? "")}
          <span className="text-stone-500 normal-case tracking-normal">
            {locked ? "sheet is locked" : "sheet is unlocked"}
          </span>
        </div>
        <button onClick={onClose} className="text-stone-500 hover:text-stone-300" aria-label="Close editor">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {TEXT_FIELDS.map((k) => (
          <label key={k} className="block">
            <span className="text-[10px] uppercase tracking-wider text-stone-500">{label(k)}</span>
            <input
              className={inputCls}
              value={String(valueOf(k) ?? "")}
              onChange={(e) => set(k, e.target.value)}
            />
          </label>
        ))}
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-stone-500 mb-1">
          Ability scores — modifiers derive automatically
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {SCORES.map((a) => {
            const score = Number(valueOf(`${a}_score`) ?? 10)
            const mod = modifierFor(score)
            return (
              <label key={a} className="block text-center">
                <span className="text-[10px] uppercase text-stone-500">{a}</span>
                <input
                  type="number"
                  className={cn(inputCls, "text-center")}
                  value={String(valueOf(`${a}_score`) ?? "")}
                  onChange={(e) => set(`${a}_score`, e.target.value === "" ? null : Number(e.target.value))}
                />
                <span className="text-[10px] text-amber-400/80">
                  {mod >= 0 ? `+${mod}` : mod}
                </span>
              </label>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {NUMBER_FIELDS.map((k) => (
          <label key={k} className="block">
            <span className="text-[10px] uppercase tracking-wider text-stone-500">{label(k)}</span>
            <input
              type="number"
              className={inputCls}
              value={String(valueOf(k) ?? "")}
              onChange={(e) => set(k, e.target.value === "" ? null : Number(e.target.value))}
            />
          </label>
        ))}
      </div>

      <div className="space-y-2">
        {LONG_TEXT_FIELDS.map((k) => (
          <label key={k} className="block">
            <span className="text-[10px] uppercase tracking-wider text-stone-500">{label(k)}</span>
            <textarea
              rows={2}
              className={inputCls}
              value={String(valueOf(k) ?? "")}
              onChange={(e) => set(k, e.target.value)}
            />
          </label>
        ))}
      </div>

      <details className="rounded border border-[#3d3428]/40">
        <summary className="cursor-pointer px-2 py-1 text-[10px] uppercase tracking-wider text-stone-500">
          Structured fields (JSON)
        </summary>
        <div className="space-y-2 p-2">
          {JSON_FIELDS.map((k) => (
            <JsonField key={k} name={label(k)} value={valueOf(k)} onChange={(v) => set(k, v)} />
          ))}
        </div>
      </details>

      <div className="space-y-2 rounded border border-amber-500/25 bg-amber-500/5 p-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-amber-400">
            Reason (required — written to the audit trail)
          </span>
          <input
            className={inputCls}
            placeholder="e.g. levelled Samson to 2 after the spider fight"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-stone-500">
            {changedKeys.length === 0
              ? "No changes"
              : `${changedKeys.length} change${changedKeys.length === 1 ? "" : "s"}: ${changedKeys.join(", ")}`}
          </span>
          <button
            onClick={save}
            disabled={saving || !reason.trim() || changedKeys.length === 0}
            className="flex items-center gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-300 hover:bg-amber-500/20 disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save override
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-1.5 text-[11px] text-red-400">
            <AlertTriangle className="mt-0.5 w-3 h-3 shrink-0" />
            {error}
          </div>
        )}
        {result && <div className="text-[11px] text-emerald-400">{result}</div>}
      </div>
    </div>
  )
}

/** A JSON column edited as text, so malformed input can't be submitted. */
function JsonField({
  name,
  value,
  onChange,
}: {
  name: string
  value: unknown
  onChange: (v: unknown) => void
}) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2))
  const [bad, setBad] = useState(false)

  useEffect(() => {
    setText(JSON.stringify(value ?? null, null, 2))
    setBad(false)
    // Only resync when the stored value itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value ?? null)])

  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-stone-500">
        {name} {bad && <span className="text-red-400">— invalid JSON, not saved</span>}
      </span>
      <textarea
        rows={4}
        spellCheck={false}
        className={cn(
          "w-full rounded border bg-[#1a1614] px-2 py-1 font-mono text-[11px] text-stone-300 focus:outline-none",
          bad ? "border-red-500/60" : "border-[#3d3428]/60 focus:border-amber-500/60",
        )}
        value={text}
        onChange={(e) => {
          const next = e.target.value
          setText(next)
          try {
            onChange(JSON.parse(next))
            setBad(false)
          } catch {
            setBad(true)
          }
        }}
      />
    </label>
  )
}
