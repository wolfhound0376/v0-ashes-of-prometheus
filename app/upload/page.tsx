"use client"

/**
 * /upload — Team clip upload console. (PR-5 companion)
 *
 * Anyone on the team with the access code can land a cinematic without
 * touching the DM Assets panel: pick the category (location → state → kind →
 * scope), drop the file, done. Three deliberate mirrors of existing machinery,
 * no new server surface at all:
 *
 *   - Rows are created through POST /api/cinematics (same as the DM tab).
 *   - Videos land through POST /api/asset-media target "cinematic.video"
 *     (same closed-whitelist endpoint as every other DM asset).
 *   - The catalogue list at the bottom is the same cinematic_clips table the
 *     resolver, the DM tab, and the pipeline board all read.
 *
 * The auto-namer: files are renamed client-side to the canonical
 *   <location-slug>--<state|ambient>--<scope>-<kind>--YYYYMMDD-HHMM.<ext>
 * before upload, so blob storage stays greppable no matter what the file was
 * called on the uploader's desktop ("final_FINAL_v3 (2).mp4" never escapes).
 *
 * Upload rules enforced here because the pipeline doc demands them:
 * MP4/WebM only (the endpoint rejects MOV by design) and under 50 MB.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { dmHeaders, ensureDmKey, clearDmKey } from "@/lib/dm-key"

const SCOPES = ["party", "solo"] as const
const KINDS = ["environment", "action", "filler"] as const
const MAX_BYTES = 50 * 1024 * 1024 // hard server limit per the pipeline doc
const OK_TYPES = ["video/mp4", "video/webm"]

interface Clip {
  id: string
  location: string
  state: string | null
  scope: (typeof SCOPES)[number]
  kind: (typeof KINDS)[number]
  video_url: string | null
  created_at?: string
}

/** The auto-namer "subprogram": category → canonical filename. */
export function autoName(
  location: string,
  state: string,
  scope: string,
  kind: string,
  originalName: string,
): string {
  const slugify = (s: string) =>
    s
      .toLowerCase()
      .replace(/^scene_\d+_/i, "") // "Scene_1_Velkynvelve (slave pen)" → "velkynvelve (slave pen)"
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  const ext = /\.webm$/i.test(originalName) ? "webm" : "mp4"
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  return `${slugify(location) || "unplaced"}--${slugify(state) || "ambient"}--${scope}-${kind}--${stamp}.${ext}`
}

export default function UploadConsole() {
  const [locations, setLocations] = useState<string[]>([])
  const [knownStates, setKnownStates] = useState<string[]>([])
  const [clips, setClips] = useState<Clip[]>([])

  const [location, setLocation] = useState("")
  const [state, setState] = useState("")
  const [scope, setScope] = useState<(typeof SCOPES)[number]>("party")
  const [kind, setKind] = useState<(typeof KINDS)[number]>("environment")
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const [dragging, setDragging] = useState(false)

  const fetchClips = useCallback(async () => {
    const { data } = await createClient()
      .from("cinematic_clips")
      .select("id, location, state, scope, kind, video_url, created_at")
      .order("location")
      .order("state", { nullsFirst: true })
    const rows = (data || []) as Clip[]
    setClips(rows)
    setKnownStates([...new Set(rows.map((c) => c.state).filter((s): s is string => !!s))].sort())
  }, [])

  useEffect(() => {
    void fetchClips()
    void createClient()
      .from("environments")
      .select("name")
      .order("name")
      .then(({ data }) =>
        setLocations([...new Set((data || []).map((r: { name: string }) => r.name).filter(Boolean))]),
      )
  }, [fetchClips])

  // Same 403 dance as the DM tab: stale/missing code → drop it, ask once, retry.
  const withDmRetry = async (purpose: string, send: () => Promise<Response>): Promise<Response> => {
    let res = await send()
    if (res.status !== 403) return res
    clearDmKey()
    if (ensureDmKey(purpose) === null) return res
    res = await send()
    return res
  }

  const finalName = useMemo(
    () => (file && location.trim() ? autoName(location, state, scope, kind, file.name) : null),
    [file, location, state, scope, kind],
  )

  const acceptFile = (f: File | null | undefined) => {
    if (!f) return
    if (!OK_TYPES.includes(f.type) && !/\.(mp4|webm)$/i.test(f.name)) {
      setStatus("MP4 or WebM only — the server rejects MOV by design. Transcode in Resolve first.")
      return
    }
    if (f.size > MAX_BYTES) {
      setStatus(`That file is ${(f.size / 1024 / 1024).toFixed(1)} MB — the hard limit is 50 MB. 1080p H.264 at 5s should land ~5–15 MB.`)
      return
    }
    setStatus("")
    setFile(f)
  }

  const upload = async () => {
    const loc = location.trim()
    const st = state.trim()
    if (!loc || !file) {
      setStatus(!loc ? "Pick a location first." : "Choose a video file.")
      return
    }
    setBusy(true)
    try {
      // 1. Find the matching socket, or create it.
      let clip = clips.find(
        (c) => c.location === loc && (c.state ?? "") === st && c.scope === scope && c.kind === kind,
      )
      if (!clip) {
        setStatus("Creating catalogue entry…")
        const res = await withDmRetry("add a cinematic clip", () =>
          fetch("/api/cinematics", {
            method: "POST",
            headers: { ...dmHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ location: loc, state: st || undefined, scope, kind }),
          }),
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Could not create the catalogue entry")
        clip = json.clip as Clip
      } else if (clip.video_url) {
        // Replacing is legitimate (better take) but never silent.
        const sure = window.confirm("This socket already has a video. Replace it with the new file?")
        if (!sure) {
          setBusy(false)
          setStatus("Upload cancelled — socket already wired.")
          return
        }
      }

      // 2. Auto-name, then send through the standard asset pipeline.
      const named = new File([file], autoName(loc, st, scope, kind, file.name), { type: file.type })
      setStatus(`Uploading as ${named.name}…`)
      const res = await withDmRetry("upload the clip video", () => {
        const fd = new FormData()
        fd.append("file", named)
        fd.append("target", "cinematic.video")
        fd.append("id", clip!.id)
        return fetch("/api/asset-media", { method: "POST", headers: dmHeaders(), body: fd })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Upload failed")

      setStatus(`✓ Wired: ${named.name}`)
      setFile(null)
      setState("")
      await fetchClips()
    } catch (err) {
      setStatus((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const wired = clips.filter((c) => c.video_url).length
  const grouped = useMemo(() => {
    const map = new Map<string, Clip[]>()
    for (const c of clips) {
      const list = map.get(c.location) ?? []
      list.push(c)
      map.set(c.location, list)
    }
    return [...map.entries()]
  }, [clips])

  return (
    <main className="min-h-screen bg-[#0a0907] px-4 py-8 text-[#ddd2bc]">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-serif text-xl font-bold text-[#e8dcc4]">Cinematic Upload Console</h1>
        <p className="mt-1 text-[11px] text-[#9b8b6b]">
          Pick the category, drop the file — it lands auto-named in the shared catalogue and goes
          live for the resolver immediately. MP4/WebM, under 50&nbsp;MB.
        </p>

        <div className="mt-6 space-y-3 rounded border border-[#4b3a19] bg-[#12100b] p-4">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#8f8061]">Location (category)</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              list="upload-locations"
              placeholder="Start typing — known scenes appear"
              className="w-full rounded border border-[#4b3a19] bg-[#0a0907] px-3 py-2 text-xs text-[#ddd2bc]"
            />
            <datalist id="upload-locations">
              {locations.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#8f8061]">State (moment)</label>
              <input
                value={state}
                onChange={(e) => setState(e.target.value)}
                list="upload-states"
                placeholder="blank = ambient"
                className="w-full rounded border border-[#4b3a19] bg-[#0a0907] px-3 py-2 text-xs text-[#ddd2bc]"
              />
              <datalist id="upload-states">
                {knownStates.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#8f8061]">Kind</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}
                className="w-full rounded border border-[#4b3a19] bg-[#0a0907] px-3 py-2 text-xs text-[#ddd2bc]"
              >
                {KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-[#8f8061]">Scope</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as (typeof SCOPES)[number])}
                className="w-full rounded border border-[#4b3a19] bg-[#0a0907] px-3 py-2 text-xs text-[#ddd2bc]"
              >
                {SCOPES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              acceptFile(e.dataTransfer.files?.[0])
            }}
            className={`rounded border-2 border-dashed p-6 text-center text-xs transition-colors ${
              dragging ? "border-[#cdb276] bg-[#1c1408]" : "border-[#4b3a19]"
            }`}
          >
            {file ? (
              <span className="text-[#e8dcc4]">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</span>
            ) : (
              <span className="text-[#8f8061]">Drop the final render here, or</span>
            )}
            <div className="mt-2">
              <label className="cursor-pointer rounded border border-[#695326] px-3 py-1.5 text-[10px] text-[#cdb276] hover:bg-[#251a0d]">
                Browse…
                <input
                  type="file"
                  accept="video/mp4,video/webm,.mp4,.webm"
                  className="hidden"
                  onChange={(e) => acceptFile(e.target.files?.[0])}
                />
              </label>
            </div>
          </div>

          {finalName ? (
            <p className="text-[10px] text-[#9b8b6b]">
              Will be saved as <code className="text-[#cdb276]">{finalName}</code>
            </p>
          ) : null}

          <button
            disabled={busy || !file || !location.trim()}
            onClick={() => void upload()}
            className="w-full rounded border border-[#695326] bg-[#1c1408] py-2.5 font-serif text-sm text-[#e8dcc4] hover:bg-[#251a0d] disabled:opacity-40"
          >
            {busy ? "Working…" : "Upload to catalogue"}
          </button>
          {status ? <p className="text-[11px] text-[#cdb276]">{status}</p> : null}
        </div>

        {/* The shared list, called up live. Same table the resolver reads. */}
        <div className="mt-8">
          <h2 className="font-serif text-sm font-bold text-[#e8dcc4]">
            Shared catalogue · {wired}/{clips.length} wired
          </h2>
          {grouped.map(([loc, rows]) => (
            <div key={loc} className="mt-3">
              <h3 className="text-[10px] uppercase tracking-wider text-[#8f8061]">{loc}</h3>
              <ul className="mt-1 space-y-1">
                {rows.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-2 rounded border border-[#2c2312] bg-[#12100b] px-3 py-1.5 text-[11px]"
                  >
                    <span className={c.video_url ? "text-[#7d9a6f]" : "text-[#a5772a]"}>
                      {c.video_url ? "●" : "○"}
                    </span>
                    <span className="text-[#ddd2bc]">{c.state ?? "ambient"}</span>
                    <span className="text-[#6d6450]">{c.kind} · {c.scope}</span>
                    <span className="ml-auto text-[#6d6450]">
                      {c.video_url ? "wired" : "awaiting upload"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
