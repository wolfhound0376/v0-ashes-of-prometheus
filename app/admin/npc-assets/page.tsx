"use client"

export const dynamic = "force-dynamic"

import { useState, useEffect, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { ConditionsEditor } from "@/components/conditions/conditions-editor"

interface NpcRow {
  id: string
  name: string
  portrait_url: string | null
  face_url: string | null
  idle_url: string | null
  talking_url: string | null
  voice_id: string | null
  voice_description: string | null
  conditions: string[] | null
}

// One card per unique NPC name (rows are deduped by name for display).
interface NpcGroup {
  name: string
  ids: string[]
  portrait_url: string | null
  face_url: string | null
  idle_url: string | null
  talking_url: string | null
  voice_id: string | null
  voice_description: string | null
  conditions: string[]
}

function groupByName(rows: NpcRow[]): NpcGroup[] {
  const map = new Map<string, NpcGroup>()
  for (const r of rows) {
    const key = r.name
    const existing = map.get(key)
    if (existing) {
      existing.ids.push(r.id)
      existing.portrait_url ||= r.portrait_url
      existing.face_url ||= r.face_url
      existing.idle_url ||= r.idle_url
      existing.talking_url ||= r.talking_url
      existing.voice_id ||= r.voice_id
      existing.voice_description ||= r.voice_description
      if (existing.conditions.length === 0 && Array.isArray(r.conditions) && r.conditions.length > 0) {
        existing.conditions = r.conditions
      }
    } else {
      map.set(key, {
        name: r.name,
        ids: [r.id],
        portrait_url: r.portrait_url,
        face_url: r.face_url,
        idle_url: r.idle_url,
        talking_url: r.talking_url,
        voice_id: r.voice_id,
        voice_description: r.voice_description,
        conditions: Array.isArray(r.conditions) ? r.conditions : [],
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
}

export default function NpcAssetsAdmin() {
  const [groups, setGroups] = useState<NpcGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<Record<string, string>>({})

  // Create the client inside the callback: createClient() returns a new object
  // every render, so depending on it here would recreate fetchNpcs each render
  // and drive the mount effect into an infinite update loop.
  const fetchNpcs = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from("npc_encounters")
      .select("id, name, portrait_url, face_url, idle_url, talking_url, voice_id, voice_description, conditions")
      .order("name")
    if (error) console.error("[v0] fetch npcs error:", error)
    setGroups(groupByName((data as NpcRow[]) || []))
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchNpcs()
  }, [fetchNpcs])

  const uploadFace = async (name: string, file: File) => {
    if (!file.type.startsWith("image/")) {
      setStatus((s) => ({ ...s, [name]: "Please choose an image file." }))
      return
    }
    setStatus((s) => ({ ...s, [name]: "Uploading…" }))
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("npcName", name)
      const res = await fetch("/api/npc-face", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Upload failed")
      setStatus((s) => ({ ...s, [name]: `Saved to ${json.updatedCount} row(s).` }))
      await fetchNpcs()
    } catch (err) {
      setStatus((s) => ({ ...s, [name]: (err as Error).message }))
    }
  }

  // Upload a looping face video (idle or talking) to /api/npc-video.
  const uploadVideo = async (name: string, kind: "idle" | "talking", file: File) => {
    const okTypes = ["video/mp4", "video/webm"]
    if (!okTypes.includes(file.type)) {
      setStatus((s) => ({ ...s, [name]: "Please choose an MP4 or WebM video." }))
      return
    }
    setStatus((s) => ({ ...s, [name]: `Uploading ${kind} video…` }))
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("npcName", name)
      fd.append("kind", kind)
      const res = await fetch("/api/npc-video", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Upload failed")
      setStatus((s) => ({ ...s, [name]: `${kind} video saved to ${json.updatedCount} row(s).` }))
      await fetchNpcs()
    } catch (err) {
      setStatus((s) => ({ ...s, [name]: (err as Error).message }))
    }
  }

  // Persist conditions to EVERY row sharing this NPC name (identity is by name).
  const saveConditions = async (name: string, ids: string[], next: string[]) => {
    setStatus((s) => ({ ...s, [name]: "Saving conditions…" }))
    const supabase = createClient()
    const { error } = await supabase.from("npc_encounters").update({ conditions: next }).in("id", ids)
    if (error) {
      setStatus((s) => ({ ...s, [name]: error.message }))
      return
    }
    setStatus((s) => ({ ...s, [name]: `Conditions saved to ${ids.length} row(s).` }))
    // Optimistically update local state so the editor reflects the save.
    setGroups((gs) => gs.map((g) => (g.name === name ? { ...g, conditions: next } : g)))
  }

  return (
    <div className="min-h-screen bg-[#0a0908] text-[#e8dcc4] p-6">
      <header className="mb-6">
        <h1 className="font-serif text-2xl text-[#c4a777] tracking-wide">NPC Canon Assets</h1>
        <p className="text-sm text-stone-500 mt-1">
          Set each NPC&apos;s canon face image plus optional looping{" "}
          <span className="text-stone-400">idle</span> and <span className="text-stone-400">talking</span> videos (MP4/WebM).
          Face saves to <code className="text-[#c4a777]">faces/&lt;npc-name&gt;.png</code>, videos to{" "}
          <code className="text-[#c4a777]">videos/&lt;npc-name&gt;-idle|talking.mp4</code>, applied to every row sharing that name.
        </p>
      </header>

      <LichAnimationsSection />

      {loading ? (
        <p className="text-stone-500">Loading NPCs…</p>
      ) : groups.length === 0 ? (
        <p className="text-stone-500">No NPCs found in npc_encounters.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((g) => (
            <NpcCard key={g.name} group={g} status={status[g.name]} onUpload={uploadFace} onUploadVideo={uploadVideo} onSaveConditions={saveConditions} />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// DUNGEON MASTER — Malachar's looping portrait animations.
//
// Reads/writes public.lich_animations (RLS allows the anon client both). The
// three states idle / speaking / casting are always rendered even when a row
// is missing, so a gap is obvious. `state` has NO unique constraint, so the
// upsert is done by hand: select by state, then update-by-id or insert. This
// is URL-only — the loops are generated externally and pasted in as blob URLs.
// ============================================================================
const LICH_STATES = ["idle", "speaking", "casting"] as const

interface LichRow {
  id: string
  state: string | null
  video_url: string | null
  prompt: string | null
}

function LichAnimationsSection() {
  const [rows, setRows] = useState<Record<string, { id?: string; video_url: string; prompt: string }>>({})
  const [status, setStatus] = useState<Record<string, { ok: boolean; msg: string }>>({})
  const [loading, setLoading] = useState(true)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase.from("lich_animations").select("id, state, video_url, prompt")
    if (error) console.error("[v0] fetch lich_animations error:", error)
    const next: Record<string, { id?: string; video_url: string; prompt: string }> = {}
    for (const s of LICH_STATES) next[s] = { video_url: "", prompt: "" }
    for (const r of (data as LichRow[]) || []) {
      if (!r.state) continue
      next[r.state] = { id: r.id, video_url: r.video_url ?? "", prompt: r.prompt ?? "" }
    }
    setRows(next)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  const setField = (state: string, field: "video_url" | "prompt", value: string) =>
    setRows((r) => ({ ...r, [state]: { ...(r[state] ?? { video_url: "", prompt: "" }), [field]: value } }))

  const save = async (state: string) => {
    setStatus((s) => ({ ...s, [state]: { ok: true, msg: "Saving…" } }))
    const supabase = createClient()
    const row = rows[state] ?? { video_url: "", prompt: "" }
    const payload = { video_url: row.video_url || null, prompt: row.prompt || null }
    try {
      // No unique constraint on `state`, so check for an existing row first and
      // branch between update-by-id and insert.
      const { data: existing, error: selErr } = await supabase
        .from("lich_animations")
        .select("id")
        .eq("state", state)
        .limit(1)
      if (selErr) throw selErr
      if (existing && existing.length > 0) {
        const { error } = await supabase
          .from("lich_animations")
          .update(payload)
          .eq("id", (existing[0] as { id: string }).id)
        if (error) throw error
      } else {
        const { error } = await supabase.from("lich_animations").insert({ state, ...payload })
        if (error) throw error
      }
      setStatus((s) => ({ ...s, [state]: { ok: true, msg: "Saved." } }))
      await fetchRows()
    } catch (err) {
      setStatus((s) => ({ ...s, [state]: { ok: false, msg: (err as Error).message } }))
    }
  }

  return (
    <section className="mb-8 rounded-sm border border-[#3d3428]/60 bg-gradient-to-b from-[#1a1614] to-[#0f0d0b] p-4">
      <h2 className="font-serif text-lg text-[#c4a777]">Dungeon Master — Malachar</h2>
      <p className="text-[11px] text-stone-500 mt-1 mb-4">
        Paste externally-generated loop URLs (blob URLs) for each state. <span className="text-stone-400">Idle</span> plays while
        Malachar is silent; <span className="text-stone-400">speaking</span> plays while he narrates aloud.
      </p>

      {loading ? (
        <p className="text-stone-500 text-sm">Loading loops…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {LICH_STATES.map((state) => {
            const row = rows[state] ?? { video_url: "", prompt: "" }
            const st = status[state]
            return (
              <div
                key={state}
                className="grid grid-cols-[84px_1fr_auto] items-start gap-3 rounded-sm border border-[#3d3428]/50 bg-[#0f0d0b] p-3"
              >
                <div className="flex flex-col items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-[#c4a777]">{state}</span>
                  {row.video_url ? (
                    <div className="w-16 h-16 rounded-sm overflow-hidden border border-[#3d3428]/60 bg-[#0a0908]">
                      <video src={row.video_url} muted loop autoPlay playsInline className="w-full h-full object-cover object-top" />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-sm border border-[#3d3428]/60 bg-[#0a0908] flex items-center justify-center text-[10px] text-stone-600">
                      none
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    value={row.video_url}
                    onChange={(e) => setField(state, "video_url", e.target.value)}
                    placeholder="https://…  (MP4/WebM blob URL)"
                    className="w-full rounded-sm border border-[#3d3428]/70 bg-[#0a0908] px-2 py-1.5 text-xs text-[#e8dcc4] placeholder:text-stone-600"
                  />
                  <input
                    value={row.prompt}
                    onChange={(e) => setField(state, "prompt", e.target.value)}
                    placeholder="Generation prompt (optional)"
                    className="w-full rounded-sm border border-[#3d3428]/70 bg-[#0a0908] px-2 py-1.5 text-xs text-[#e8dcc4] placeholder:text-stone-600"
                  />
                  {st ? <p className={`text-[11px] ${st.ok ? "text-[#c4a777]" : "text-red-400"}`}>{st.msg}</p> : null}
                </div>
                <button
                  onClick={() => save(state)}
                  className="rounded-sm border border-[#a88745] px-3 py-1.5 text-xs text-[#d9c492] hover:bg-[#2a1e0e]"
                >
                  Save
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function NpcCard({
  group,
  status,
  onUpload,
  onUploadVideo,
  onSaveConditions,
}: {
  group: NpcGroup
  status?: string
  onUpload: (name: string, file: File) => void
  onUploadVideo: (name: string, kind: "idle" | "talking", file: File) => void
  onSaveConditions: (name: string, ids: string[], next: string[]) => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onUpload(group.name, file)
  }

  return (
    <div className="rounded-sm border border-[#3d3428]/60 bg-gradient-to-b from-[#1a1614] to-[#0f0d0b] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-lg text-[#e8dcc4]">{group.name}</h2>
        <span className="text-[10px] text-stone-600">
          {group.ids.length} row{group.ids.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Current thumbnails */}
      <div className="flex gap-3 flex-wrap">
        <Thumb label="Portrait" src={group.portrait_url} />
        <Thumb label="Canon face" src={group.face_url} highlight />
        <VideoThumb label="Idle" src={group.idle_url} />
        <VideoThumb label="Talking" src={group.talking_url} />
      </div>

      {group.voice_description && (
        <p className="text-[11px] text-stone-500 leading-snug">
          <span className="text-stone-400">Voice:</span> {group.voice_description}
          {group.voice_id ? <span className="text-stone-600"> ({group.voice_id})</span> : null}
        </p>
      )}

      {/* Conditions editor — persists to every row sharing this NPC name. */}
      <div>
        <p className="text-[11px] text-stone-400 mb-1">Conditions</p>
        <ConditionsEditor
          value={group.conditions}
          onChange={(next) => onSaveConditions(group.name, group.ids, next)}
        />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-sm border-2 border-dashed px-3 py-4 text-center text-xs transition-colors ${
          dragOver
            ? "border-[#c4a777] bg-[#c4a777]/10 text-[#e8dcc4]"
            : "border-[#3d3428]/70 text-stone-500 hover:border-[#c4a777]/60"
        }`}
      >
        Drop an image here, or click to choose a file
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onUpload(group.name, file)
            e.target.value = ""
          }}
        />
      </div>

      {/* Looping face-video slots (idle + talking). */}
      <div className="grid grid-cols-2 gap-2">
        <VideoDrop label="Idle video" onFile={(f) => onUploadVideo(group.name, "idle", f)} />
        <VideoDrop label="Talking video" onFile={(f) => onUploadVideo(group.name, "talking", f)} />
      </div>

      {status && <p className="text-[11px] text-[#c4a777]">{status}</p>}
    </div>
  )
}

// Compact drop/pick zone for a single looping video slot (MP4/WebM).
function VideoDrop({ label, onFile }: { label: string; onFile: (file: File) => void }) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files?.[0]
        if (file) onFile(file)
      }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-sm border-2 border-dashed px-2 py-3 text-center text-[11px] leading-snug transition-colors ${
        dragOver ? "border-[#c4a777] bg-[#c4a777]/10 text-[#e8dcc4]" : "border-[#3d3428]/70 text-stone-500 hover:border-[#c4a777]/60"
      }`}
    >
      {label}
      <span className="block text-[9px] text-stone-600">MP4 / WebM</span>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ""
        }}
      />
    </div>
  )
}

// Looping muted preview of an idle/talking clip (or "none" placeholder).
function VideoThumb({ label, src }: { label: string; src: string | null }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-20 h-20 rounded-sm overflow-hidden bg-[#0a0908] border border-[#3d3428]/60 flex items-center justify-center">
        {src ? (
          <video src={src} muted loop autoPlay playsInline className="w-full h-full object-cover object-top" />
        ) : (
          <span className="text-[10px] text-stone-600">none</span>
        )}
      </div>
      <span className="text-[10px] text-stone-500">{label}</span>
    </div>
  )
}

function Thumb({ label, src, highlight = false }: { label: string; src: string | null; highlight?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`w-20 h-20 rounded-sm overflow-hidden bg-[#0a0908] border ${
          highlight ? "border-[#c4a777]/50" : "border-[#3d3428]/60"
        } flex items-center justify-center`}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src || "/placeholder.svg"} alt={`${label} thumbnail`} className="w-full h-full object-cover object-top" />
        ) : (
          <span className="text-[10px] text-stone-600">none</span>
        )}
      </div>
      <span className="text-[10px] text-stone-500">{label}</span>
    </div>
  )
}
