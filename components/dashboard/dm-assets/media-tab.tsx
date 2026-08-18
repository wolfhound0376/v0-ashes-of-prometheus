"use client"

// One generic tab body, configured per asset family.
//
// Scenes, fog overlays, item icons and the dashboard_assets library all reduce
// to the same shape: list rows from a table, show one or two media slots per row,
// upload to a whitelisted target, clear a target. Rather than four near-identical
// components, this takes a config.

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"
import { Archive } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { dmHeaders, ensureDmKey, clearDmKey } from "@/lib/dm-key"
import { MediaSlot, MediaDrop, ClearConfirm } from "./media-slot"

export interface SlotConfig {
  /** Whitelisted target key understood by /api/asset-media. */
  target: string
  /** Column on the row holding the URL. */
  column: string
  label: string
}

export interface MediaTabConfig {
  table: string
  /** Columns to select — must include id, the label column and every slot column. */
  select: string
  labelColumn: string
  /** Optional secondary line under the row name. */
  subtitleColumn?: string
  orderBy: string
  /** Optional server-side equality filter, e.g. only player characters. */
  filter?: { column: string; value: string | number | boolean }
  slots: SlotConfig[]
  emptyMessage: string
  /**
   * When true, each card gets an archive "x" in the top-right. Archiving sets
   * `archived_at` (non-destructive — nothing is deleted) and the tab only ever
   * lists rows where `archived_at` is null. Only meaningful for tables that
   * have an `archived_at` column (currently `characters`).
   */
  archivable?: boolean
  /**
   * When true, each card gets an ElevenLabs voice editor (voice_id +
   * voice_description columns must be in `select`). Saves via
   * /api/character-voice. Used by the Characters tab so players speak in a
   * chosen voice, mirroring the NPC tab's voice block.
   */
  voiceEditable?: boolean
  /**
   * When true, each card gets the scene-stage framing sliders (`stage_scale` +
   * `stage_offset_y` must be in `select`). Saves via /api/character-stage. Used
   * by the Characters tab so a full-body idle loop and a waist-up one can be
   * made to stand at the same world scale without re-cutting the art.
   */
  stageEditable?: boolean
}

interface Row {
  id: string
  [key: string]: unknown
}

export function MediaTab({ config }: { config: MediaTabConfig }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("")
  const [status, setStatus] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<{ row: Row; slot: SlotConfig } | null>(null)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    let query = supabase.from(config.table).select(config.select)
    if (config.filter) query = query.eq(config.filter.column, config.filter.value)
    if (config.archivable) query = query.is("archived_at", null)
    const { data, error } = await query.order(config.orderBy)
    if (error) console.error(`[dm-assets] ${config.table} fetch failed:`, error.message)
    setRows(((data as unknown as Row[]) || []).filter(Boolean))
    setLoading(false)
  }, [config.table, config.select, config.orderBy, config.archivable])

  useEffect(() => {
    void fetchRows()
  }, [fetchRows])

  // A 403 means the stored code is missing or stale. Drop it, ask once, retry.
  const withDmRetry = async (purpose: string, send: () => Promise<Response>): Promise<Response> => {
    let res = await send()
    if (res.status !== 403) return res
    clearDmKey()
    if (ensureDmKey(purpose) === null) return res
    res = await send()
    return res
  }

  const upload = async (row: Row, slot: SlotConfig, file: File) => {
    const key = `${row.id}:${slot.column}`
    setBusy(key)
    setStatus((s) => ({ ...s, [key]: `Uploading ${slot.label}…` }))
    try {
      const res = await withDmRetry(`upload the ${slot.label.toLowerCase()}`, () => {
        const fd = new FormData()
        fd.append("file", file)
        fd.append("target", slot.target)
        fd.append("id", row.id)
        return fetch("/api/asset-media", { method: "POST", headers: dmHeaders(), body: fd })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Upload failed")
      setStatus((s) => ({ ...s, [key]: `${slot.label} saved.` }))
      await fetchRows()
    } catch (err) {
      setStatus((s) => ({ ...s, [key]: (err as Error).message }))
    } finally {
      setBusy(null)
    }
  }

  const clear = async (row: Row, slot: SlotConfig) => {
    setConfirming(null)
    const key = `${row.id}:${slot.column}`
    setBusy(key)
    setStatus((s) => ({ ...s, [key]: `Clearing ${slot.label}…` }))
    try {
      const res = await withDmRetry(`clear the ${slot.label.toLowerCase()}`, () =>
        fetch("/api/asset-media", {
          method: "DELETE",
          headers: { ...dmHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ target: slot.target, id: row.id }),
        }),
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Clear failed")
      setStatus((s) => ({ ...s, [key]: `${slot.label} cleared. File kept in storage.` }))
      await fetchRows()
    } catch (err) {
      setStatus((s) => ({ ...s, [key]: (err as Error).message }))
    } finally {
      setBusy(null)
    }
  }

  // Non-destructive: hides the row from the dashboard and VTT by stamping
  // archived_at. It stays in the database and can be restored from /admin.
  const archive = async (row: Row) => {
    const label = String(row[config.labelColumn] ?? "this character")
    if (!confirm(`Archive "${label}"? It will be hidden from the dashboard and the VTT but nothing is deleted. You can restore it from the Admin \u2192 Characters page.`)) return
    const key = `${row.id}:__archive`
    setBusy(key)
    setStatus((s) => ({ ...s, [key]: `Archiving ${label}…` }))
    const supabase = createClient()
    const { error } = await supabase
      .from(config.table)
      .update({ archived_at: new Date().toISOString() })
      .eq("id", row.id)
    if (error) {
      setStatus((s) => ({ ...s, [key]: error.message }))
      setBusy(null)
      return
    }
    setBusy(null)
    await fetchRows()
  }

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => String(r[config.labelColumn] ?? "").toLowerCase().includes(q))
  }, [rows, filter, config.labelColumn])

  if (loading) return <p className="p-4 text-sm text-stone-500">Loading…</p>

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pb-2 pt-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name…"
          className="w-full rounded-sm border border-[#3d3428] bg-[#0f0d0b] px-3 py-1.5 text-sm text-[#e8dcc4] placeholder:text-stone-600 focus:border-[#c4a777]/60 focus:outline-none"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {visible.length === 0 ? (
          <p className="text-sm text-stone-500">{rows.length === 0 ? config.emptyMessage : "Nothing matches that filter."}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {visible.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-2 rounded-sm border border-[#3d3428]/60 bg-gradient-to-b from-[#1a1614] to-[#0f0d0b] p-3"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-serif text-base text-[#e8dcc4]">
                      {String(row[config.labelColumn] ?? "Untitled")}
                    </h3>
                    {config.subtitleColumn && row[config.subtitleColumn] ? (
                      <p className="truncate text-[10px] uppercase tracking-wider text-stone-600">
                        {String(row[config.subtitleColumn])}
                      </p>
                    ) : null}
                  </div>
                  {config.archivable ? (
                    <button
                      type="button"
                      onClick={() => void archive(row)}
                      disabled={busy === `${row.id}:__archive`}
                      title="Archive character (hide without deleting)"
                      aria-label={`Archive ${String(row[config.labelColumn] ?? "character")}`}
                      className="shrink-0 rounded border border-[#4b3a19] p-1 text-[#c6a060] transition-colors hover:border-[#c9a868] hover:bg-[#c4a777]/10 hover:text-white disabled:opacity-50"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>

                <div className={`grid gap-2 ${config.slots.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {config.slots.map((slot) => (
                    <MediaSlot
                      key={slot.column}
                      label={slot.label}
                      src={row[slot.column] as string | null}
                      className="h-24"
                      busy={busy === `${row.id}:${slot.column}`}
                      onClear={row[slot.column] ? () => setConfirming({ row, slot }) : undefined}
                    />
                  ))}
                </div>

                <div className={`grid gap-1.5 ${config.slots.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {config.slots.map((slot) => (
                    <MediaDrop key={slot.column} label={slot.label} onFile={(f) => void upload(row, slot, f)} />
                  ))}
                </div>

                {config.stageEditable ? <StageFraming key={`${row.id}-stage`} row={row} withDmRetry={withDmRetry} /> : null}

                {config.voiceEditable ? <VoiceEditor key={`${row.id}-voice`} row={row} withDmRetry={withDmRetry} /> : null}

                {config.slots.map((slot) => {
                  const msg = status[`${row.id}:${slot.column}`]
                  return msg ? (
                    <p key={slot.column} className="text-[11px] text-[#c4a777]">
                      {msg}
                    </p>
                  ) : null
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {confirming && (
        <ClearConfirm
          what={confirming.slot.label}
          where={String(confirming.row[config.labelColumn] ?? "this row")}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void clear(confirming.row, confirming.slot)}
        />
      )}
    </div>
  )
}


/**
 * Per-character ElevenLabs voice block — the Characters-tab twin of the NPC
 * tab's voice editor. Store the voice ID, not generated audio; leave the ID
 * blank and fill the description to let the resolver pick from the curated
 * library on first speech.
 */
function VoiceEditor({ row, withDmRetry }: { row: Row; withDmRetry: (purpose: string, send: () => Promise<Response>) => Promise<Response> }) {
  const [voiceId, setVoiceId] = useState(String(row.voice_id ?? ""))
  const [description, setDescription] = useState(String(row.voice_description ?? ""))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  const save = async () => {
    setSaving(true)
    setMessage("Saving voice…")
    try {
      const res = await withDmRetry("save the ElevenLabs voice", () =>
        fetch("/api/character-voice", {
          method: "POST",
          headers: { ...dmHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ id: row.id, voiceId: voiceId.trim(), voiceDescription: description.trim() }),
        }),
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Voice save failed")
      setMessage("Voice saved.")
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded border border-[#3d3428]/60 bg-black/25 p-2">
      <p className="mb-1.5 text-[10px] uppercase tracking-wider text-[#9b8b6b]">ElevenLabs voice</p>
      <input
        value={voiceId}
        onChange={(e) => setVoiceId(e.target.value)}
        placeholder="ElevenLabs voice ID (optional)"
        className="w-full rounded border border-[#4b3a19] bg-black/40 px-2 py-1.5 text-xs text-[#e8dcc4] placeholder:text-stone-600"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Voice description — e.g. young, warm, quick; gravelly and low…"
        rows={2}
        className="mt-1.5 w-full resize-y rounded border border-[#4b3a19] bg-black/40 px-2 py-1.5 text-xs text-[#e8dcc4] placeholder:text-stone-600"
      />
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="min-w-0 text-[10px] text-stone-500">{message || "Store the voice ID, not audio. Blank ID + description = auto-match."}</span>
        <button
          disabled={saving}
          onClick={() => void save()}
          className="shrink-0 rounded border border-[#8a672d] px-3 py-1 text-[10px] text-[#d4b15a] disabled:opacity-50"
        >
          Save voice
        </button>
      </div>
    </div>
  )
}


/**
 * Scene-stage framing block — how tall this character stands on the Character
 * View stage, and where their feet land.
 *
 * Idle loops arrive framed however the render happened to frame them. Fifi's is
 * a waist-up crop flush to its frame; Samson's is a full body inside a tall
 * frame with empty space under his feet. Sized off the frame alone, he read as
 * a fairy hovering mid-air beside her. Rather than re-cut the art every time,
 * the DM drags two sliders against a live preview of the real loop.
 *
 * Size  — multiplier on the stage's default 88% height (1 = unchanged).
 * Feet  — percent of the figure's own height to push DOWN, which buries any
 *         transparent padding below the bottom edge and lands the feet on the
 *         ground line.
 */
function StageFraming({ row, withDmRetry }: { row: Row; withDmRetry: (purpose: string, send: () => Promise<Response>) => Promise<Response> }) {
  const initialScale = Number(row.stage_scale)
  const initialOffset = Number(row.stage_offset_y)
  const [scale, setScale] = useState(Number.isFinite(initialScale) ? initialScale : 1)
  const [offsetY, setOffsetY] = useState(Number.isFinite(initialOffset) ? initialOffset : 0)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  const media = (row.idle_url as string | null) || null
  const preview: CSSProperties = {
    height: `${88 * scale}%`,
    maxWidth: `${48 * scale}%`,
    transform: `translate(-50%, ${offsetY}%)`,
  }

  const save = async () => {
    setSaving(true)
    setMessage("Saving stage framing…")
    try {
      const res = await withDmRetry("save the stage framing", () =>
        fetch("/api/character-stage", {
          method: "POST",
          headers: { ...dmHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ id: row.id, stageScale: scale, stageOffsetY: offsetY }),
        }),
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Stage save failed")
      setMessage("Stage framing saved.")
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded border border-[#3d3428]/60 bg-black/25 p-2">
      <p className="mb-1.5 text-[10px] uppercase tracking-wider text-[#9b8b6b]">Scene-stage framing</p>

      {media ? (
        <div className="relative mb-2 h-28 overflow-hidden rounded border border-[#4b3a19] bg-gradient-to-b from-[#16233b] to-[#05070c]">
          {/* Same box the real stage uses, so what you drag is what you get. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[#c4a777]/40" />
          <video
            key={media}
            src={media}
            autoPlay
            loop
            muted
            playsInline
            aria-hidden="true"
            style={preview}
            className="absolute bottom-0 left-1/2 object-contain object-bottom"
          />
        </div>
      ) : (
        <p className="mb-2 text-[10px] text-stone-600">Upload an Idle loop to preview the framing.</p>
      )}

      <label className="block text-[10px] text-stone-500">
        <span className="flex justify-between"><span>Size</span><span className="text-[#c4a777]">{scale.toFixed(2)}×</span></span>
        <input
          type="range"
          min={0.2}
          max={3}
          step={0.05}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
          className="mt-0.5 w-full accent-[#c4a777]"
        />
      </label>

      <label className="mt-1 block text-[10px] text-stone-500">
        <span className="flex justify-between"><span>Feet (down ↓)</span><span className="text-[#c4a777]">{offsetY.toFixed(1)}%</span></span>
        <input
          type="range"
          min={-50}
          max={50}
          step={0.5}
          value={offsetY}
          onChange={(e) => setOffsetY(Number(e.target.value))}
          className="mt-0.5 w-full accent-[#c4a777]"
        />
      </label>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="min-w-0 text-[10px] text-stone-500">{message || "Match head sizes across the party, then drag the feet to the ground line."}</span>
        <div className="flex shrink-0 gap-1.5">
          <button
            onClick={() => { setScale(1); setOffsetY(0); setMessage("") }}
            className="rounded border border-[#4b3a19] px-2 py-1 text-[10px] text-stone-400"
          >
            Reset
          </button>
          <button
            disabled={saving}
            onClick={() => void save()}
            className="rounded border border-[#8a672d] px-3 py-1 text-[10px] text-[#d4b15a] disabled:opacity-50"
          >
            Save framing
          </button>
        </div>
      </div>
    </div>
  )
}
