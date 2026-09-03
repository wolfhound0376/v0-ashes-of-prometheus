"use client"

// Cinematics — clip catalogue for the trigger system. (PR-4)
//
// Unlike the other tabs, rows here are CREATED by the DM (a clip entry is
// location + optional state variant + scope + kind), then the video lands in
// the standard MediaSlot/MediaDrop upload flow through /api/asset-media —
// deliberately the same mechanism as every other DM asset, not a new one.
//
// Locations are a CLOSED LIST: the dropdown offers only registered
// environments (plus the generic fallback tier), and the server re-validates
// against the scene registry — resolve_cinematic matches on scene_key, so a
// clip filed here can never drift out of reach of its scene.
//
// DM-only: the parent panel renders only for a DM browser, and every write
// re-checks DM_ACCESS_CODE server-side.

import { useCallback, useEffect, useMemo, useState } from "react"
import { Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { dmHeaders, ensureDmKey, clearDmKey } from "@/lib/dm-key"
import { MediaSlot, MediaDrop, ClearConfirm } from "./media-slot"

interface Clip {
  id: string
  location: string
  state: string | null
  scope: "solo" | "party"
  // Mirrors KINDS in app/api/cinematics/route.ts, which the server
  // re-validates against. Unlike the upload console this list is written out
  // twice — here and in the <option> block below — so both move together.
  kind: "environment" | "action" | "filler" | "opening"
  video_url: string | null
}

const VIDEO_TARGET = "cinematic.video"
const VIDEO_ACCEPT = "video/mp4,video/webm"

export function CinematicsTab() {
  const [clips, setClips] = useState<Clip[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<Record<string, string>>({})
  const [confirming, setConfirming] = useState<{ clip: Clip; action: "clear" | "delete" } | null>(null)

  // New-clip form
  const [location, setLocation] = useState("")
  const [state, setState] = useState("")
  const [scope, setScope] = useState<Clip["scope"]>("party")
  const [kind, setKind] = useState<Clip["kind"]>("environment")
  const [formStatus, setFormStatus] = useState("")

  const fetchClips = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("cinematic_clips")
      .select("id, location, state, scope, kind, video_url")
      .order("location")
      .order("kind")
    if (error) console.error("[dm-assets] cinematic_clips fetch failed:", error.message)
    setClips((data as Clip[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void fetchClips()
    // Known environment names keep location strings consistent for PR-5 lookup.
    void createClient()
      .from("environments")
      .select("name")
      .order("name")
      .then(({ data }: { data: { name: string }[] | null }) => setLocations([...new Set((data || []).map((r) => r.name).filter(Boolean))]))
  }, [fetchClips])

  // A 403 means the stored code is missing or stale. Drop it, ask once, retry.
  const withDmRetry = async (purpose: string, send: () => Promise<Response>): Promise<Response> => {
    let res = await send()
    if (res.status !== 403) return res
    clearDmKey()
    if (ensureDmKey(purpose) === null) return res
    res = await send()
    return res
  }

  const createClip = async () => {
    const loc = location.trim()
    if (!loc) {
      setFormStatus("Location is required.")
      return
    }
    setBusy("__create")
    setFormStatus("Adding clip…")
    try {
      const res = await withDmRetry("add a cinematic clip", () =>
        fetch("/api/cinematics", {
          method: "POST",
          headers: { ...dmHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ location: loc, state: state.trim() || undefined, scope, kind }),
        }),
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Could not add the clip")
      setLocation("")
      setState("")
      setFormStatus("Clip added — drop the video onto its card below.")
      await fetchClips()
    } catch (err) {
      setFormStatus((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const upload = async (clip: Clip, file: File) => {
    const key = `${clip.id}:video`
    setBusy(key)
    setStatus((s) => ({ ...s, [key]: "Uploading video…" }))
    try {
      const res = await withDmRetry("upload the clip video", () => {
        const fd = new FormData()
        fd.append("file", file)
        fd.append("target", VIDEO_TARGET)
        fd.append("id", clip.id)
        return fetch("/api/asset-media", { method: "POST", headers: dmHeaders(), body: fd })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Upload failed")
      setStatus((s) => ({ ...s, [key]: "Video saved." }))
      await fetchClips()
    } catch (err) {
      setStatus((s) => ({ ...s, [key]: (err as Error).message }))
    } finally {
      setBusy(null)
    }
  }

  const clearVideo = async (clip: Clip) => {
    setConfirming(null)
    const key = `${clip.id}:video`
    setBusy(key)
    setStatus((s) => ({ ...s, [key]: "Clearing video…" }))
    try {
      const res = await withDmRetry("clear the clip video", () =>
        fetch("/api/asset-media", {
          method: "DELETE",
          headers: { ...dmHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ target: VIDEO_TARGET, id: clip.id }),
        }),
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Clear failed")
      setStatus((s) => ({ ...s, [key]: "Video cleared — the clip entry remains." }))
      await fetchClips()
    } catch (err) {
      setStatus((s) => ({ ...s, [key]: (err as Error).message }))
    } finally {
      setBusy(null)
    }
  }

  const deleteClip = async (clip: Clip) => {
    setConfirming(null)
    const key = `${clip.id}:video`
    setBusy(key)
    try {
      const res = await withDmRetry("delete the clip", () =>
        fetch("/api/cinematics", {
          method: "DELETE",
          headers: { ...dmHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ id: clip.id }),
        }),
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Delete failed")
      await fetchClips()
    } catch (err) {
      setStatus((s) => ({ ...s, [key]: (err as Error).message }))
    } finally {
      setBusy(null)
    }
  }

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return clips
    return clips.filter((c) => `${c.location} ${c.state ?? ""} ${c.kind} ${c.scope}`.toLowerCase().includes(q))
  }, [clips, filter])

  const selectClass =
    "rounded-sm border border-[#3d3428] bg-[#0f0d0b] px-2 py-1.5 text-sm text-[#e8dcc4] focus:border-[#c4a777]/60 focus:outline-none"

  if (loading) return <p className="p-4 text-sm text-stone-500">Loading…</p>

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-[#3d3428]/60 px-4 pb-3 pt-3">
        <p className="mb-1.5 text-[10px] uppercase tracking-wider text-stone-600">New clip</p>
        <div className="flex flex-wrap gap-1.5">
          {/* Closed scene list: clips can only be filed under a registered
              environment (or the generic fallback tier). Free text is gone —
              it is how mismatched location keys used to be born. */}
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={`${selectClass} min-w-0 flex-1`}
            aria-label="Location"
          >
            <option value="" disabled>
              Location — choose a registered scene…
            </option>
            {locations.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value="generic">generic (fallback tier)</option>
          </select>
          <input
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="State (optional) — burning, quiet"
            className={`${selectClass} w-44 placeholder:text-stone-600`}
          />
          <select value={scope} onChange={(e) => setScope(e.target.value as Clip["scope"])} className={selectClass} aria-label="Scope">
            <option value="party">Party</option>
            <option value="solo">Solo</option>
          </select>
          <select value={kind} onChange={(e) => setKind(e.target.value as Clip["kind"])} className={selectClass} aria-label="Kind">
            <option value="environment">Environment</option>
            <option value="action">Action</option>
            <option value="filler">Filler</option>
            <option value="opening">Opening</option>
          </select>
          <button
            onClick={() => void createClip()}
            disabled={busy === "__create"}
            className="rounded-sm border border-[#c9a868] bg-[#c4a777]/12 px-3 py-1 text-[11px] uppercase tracking-wider text-[#f0dcae] hover:bg-[#c4a777]/20 disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {formStatus ? <p className="mt-1.5 text-[11px] text-[#c4a777]">{formStatus}</p> : null}
      </div>

      <div className="shrink-0 px-4 pb-2 pt-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by location, state or kind…"
          className="w-full rounded-sm border border-[#3d3428] bg-[#0f0d0b] px-3 py-1.5 text-sm text-[#e8dcc4] placeholder:text-stone-600 focus:border-[#c4a777]/60 focus:outline-none"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {visible.length === 0 ? (
          <p className="text-sm text-stone-500">
            {clips.length === 0 ? "No clips yet. Add one above, then drop its video onto the card." : "Nothing matches that filter."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {visible.map((clip) => {
              const key = `${clip.id}:video`
              return (
                <div key={clip.id} className="flex flex-col gap-2 rounded-sm border border-[#3d3428]/60 bg-gradient-to-b from-[#1a1614] to-[#0f0d0b] p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-serif text-base text-[#e8dcc4]">
                        {clip.location}
                        {clip.state ? <span className="text-[#c4a777]"> — {clip.state}</span> : null}
                      </h3>
                      <p className="truncate text-[10px] uppercase tracking-wider text-stone-600">
                        {clip.kind} · {clip.scope}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirming({ clip, action: "delete" })}
                      disabled={busy === key}
                      title="Delete this clip entry"
                      aria-label={`Delete clip for ${clip.location}`}
                      className="shrink-0 rounded border border-[#4b3a19] p-1 text-[#c6a060] transition-colors hover:border-red-700 hover:text-red-400 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <MediaSlot
                    label="Video"
                    src={clip.video_url}
                    className="h-24"
                    busy={busy === key}
                    onClear={clip.video_url ? () => setConfirming({ clip, action: "clear" }) : undefined}
                  />
                  <MediaDrop label="Video" accept={VIDEO_ACCEPT} onFile={(f) => void upload(clip, f)} />
                  {status[key] ? <p className="text-[11px] text-[#c4a777]">{status[key]}</p> : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {confirming && (
        <ClearConfirm
          what={confirming.action === "delete" ? "clip entry" : "video"}
          where={confirming.clip.state ? `${confirming.clip.location} — ${confirming.clip.state}` : confirming.clip.location}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void (confirming.action === "delete" ? deleteClip(confirming.clip) : clearVideo(confirming.clip))}
        />
      )}
    </div>
  )
}
