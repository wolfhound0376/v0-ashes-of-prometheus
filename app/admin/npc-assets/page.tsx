"use client"

export const dynamic = "force-dynamic"

import { useState, useEffect, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase/client"

interface NpcRow {
  id: string
  name: string
  portrait_url: string | null
  face_url: string | null
  idle_url: string | null
  talking_url: string | null
  voice_id: string | null
  voice_description: string | null
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
      .select("id, name, portrait_url, face_url, idle_url, talking_url, voice_id, voice_description")
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

      {loading ? (
        <p className="text-stone-500">Loading NPCs…</p>
      ) : groups.length === 0 ? (
        <p className="text-stone-500">No NPCs found in npc_encounters.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((g) => (
            <NpcCard key={g.name} group={g} status={status[g.name]} onUpload={uploadFace} onUploadVideo={uploadVideo} />
          ))}
        </div>
      )}
    </div>
  )
}

function NpcCard({
  group,
  status,
  onUpload,
  onUploadVideo,
}: {
  group: NpcGroup
  status?: string
  onUpload: (name: string, file: File) => void
  onUploadVideo: (name: string, kind: "idle" | "talking", file: File) => void
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
