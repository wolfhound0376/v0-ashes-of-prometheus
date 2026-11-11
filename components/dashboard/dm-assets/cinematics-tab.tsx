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
//
// THE ROW IS THE TRIGGER (Sam, 2026-11-10: "have a better way to add them"). A film's card now carries the
// whole rule for when it plays, editable in place:
//   moment    one sentence — what the film shows. Malachar reads it beside the cue name.
//   fired by  which door opens it (Malachar, the rules, the map, a look, the game, the DM by hand).
//   plate     the Underwalk plate it belongs to, or anywhere in the scene.
//   hero      whose film it is, or anyone's.
//   retired   kept on file, never offered, never served.
// Test plays the film in THIS window only: no request is made, so no hero's first viewing is spent.
// The strip under each card and the shooting list come from the request log (/api/cinematics/health).

import { useCallback, useEffect, useMemo, useState } from "react"
import { Play, Trash2, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { dmHeaders, ensureDmKey, clearDmKey } from "@/lib/dm-key"
import { MediaSlot, MediaDrop, ClearConfirm } from "./media-slot"
import { FIRED_BY, FIRED_BY_LABEL, PLATE_OPTIONS, clipWarnings, type FiredBy, type Health } from "@/lib/cinematic-health"

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
  moment: string | null
  fired_by: FiredBy
  plate: string | null
  retired: boolean
  character_id: string | null
}

type Hero = { id: string; name: string }

const CLIP_COLUMNS = "id, location, state, scope, kind, video_url, moment, fired_by, plate, retired, character_id"

/** "3 days ago", for the strip under each card. */
function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return mins <= 1 ? "just now" : `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} days ago`
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
  const [moment, setMoment] = useState("")
  const [firedBy, setFiredBy] = useState<FiredBy>("malachar")
  const [plate, setPlate] = useState("")
  const [heroId, setHeroId] = useState("")

  const [heroes, setHeroes] = useState<Hero[]>([])
  const [health, setHealth] = useState<Health | null>(null)
  const [onlyAttention, setOnlyAttention] = useState(false)
  const [testing, setTesting] = useState<Clip | null>(null)
  // Moment text being typed on a card, before it is saved (clip id -> draft).
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const fetchClips = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("cinematic_clips")
      .select(CLIP_COLUMNS)
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
    // The heroes a film can belong to.
    void createClient()
      .from("characters")
      .select("id, name")
      .eq("is_player", true)
      .order("name")
      .then(({ data }: { data: Hero[] | null }) => setHeroes((data || []).filter((h) => h.id && h.name)))
  }, [fetchClips])

  // What the request log says about each film. Read-only and best-effort: without the DM code stored the tab
  // still works, it just shows no history (the first write will ask for the code, and this is retried then).
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/cinematics/health", { headers: dmHeaders() })
      if (res.ok) setHealth((await res.json()) as Health)
    } catch {
      /* the catalogue is still usable without its history */
    }
  }, [])
  useEffect(() => { void fetchHealth() }, [fetchHealth])

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
          body: JSON.stringify({
            location: loc, state: state.trim() || undefined, scope, kind,
            moment: moment.trim(), fired_by: firedBy, plate: plate || null, character_id: heroId || null,
          }),
        }),
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Could not add the clip")
      setLocation("")
      setState("")
      setMoment("")
      setPlate("")
      setHeroId("")
      setFormStatus("Clip added — drop the video onto its card below.")
      await fetchClips()
      void fetchHealth()
    } catch (err) {
      setFormStatus((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  // Change one part of a film's trigger. The card shows the saved row, so a refused change simply snaps back.
  const patchClip = async (clip: Clip, change: Partial<Pick<Clip, "moment" | "fired_by" | "plate" | "retired" | "character_id" | "scope">>) => {
    const key = `${clip.id}:video`
    setBusy(key)
    setStatus((s) => ({ ...s, [key]: "Saving…" }))
    try {
      const res = await withDmRetry("change a cinematic's trigger", () =>
        fetch("/api/cinematics", {
          method: "PATCH",
          headers: { ...dmHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ id: clip.id, ...change }),
        }),
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Could not save the change")
      setClips((all) => all.map((c) => (c.id === clip.id ? { ...c, ...(json.clip as Clip) } : c)))
      setDrafts((d) => { const next = { ...d }; delete next[clip.id]; return next })
      setStatus((s) => ({ ...s, [key]: "Saved." }))
      if (!health) void fetchHealth()
    } catch (err) {
      setStatus((s) => ({ ...s, [key]: (err as Error).message }))
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
    return clips.filter((c) => {
      if (onlyAttention && clipWarnings(c, heroes).length === 0) return false
      if (!q) return true
      return `${c.location} ${c.state ?? ""} ${c.kind} ${c.scope} ${c.fired_by} ${c.moment ?? ""}`.toLowerCase().includes(q)
    })
  }, [clips, filter, onlyAttention, heroes])

  const attentionCount = useMemo(() => clips.filter((c) => clipWarnings(c, heroes).length > 0).length, [clips, heroes])
  const plateName = (slug: string | null) => (slug ? PLATE_OPTIONS.find((p) => p.slug === slug)?.name ?? slug : null)
  const heroName = (id: string | null) => (id ? heroes.find((h) => h.id === id)?.name ?? "one hero" : null)

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
        {/* The trigger: when it fires, who fires it, where, and whose it is. */}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <input
            value={moment}
            onChange={(e) => setMoment(e.target.value)}
            maxLength={300}
            placeholder="The moment, in one sentence — what the film shows (Malachar reads this)"
            className={`${selectClass} min-w-0 flex-1 placeholder:text-stone-600`}
            aria-label="The moment"
          />
          <select value={firedBy} onChange={(e) => setFiredBy(e.target.value as FiredBy)} className={selectClass} aria-label="Fired by">
            {FIRED_BY.map((f) => (
              <option key={f} value={f}>{FIRED_BY_LABEL[f]}</option>
            ))}
          </select>
          <select value={plate} onChange={(e) => setPlate(e.target.value)} className={selectClass} aria-label="Plate">
            <option value="">Anywhere in the scene</option>
            {PLATE_OPTIONS.map((p) => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
          </select>
          <select value={heroId} onChange={(e) => setHeroId(e.target.value)} className={selectClass} aria-label="Whose film">
            <option value="">Any hero</option>
            {heroes.map((h) => (
              <option key={h.id} value={h.id}>Only {h.name}</option>
            ))}
          </select>
        </div>
        {formStatus ? <p className="mt-1.5 text-[11px] text-[#c4a777]">{formStatus}</p> : null}
      </div>

      {/* THE SHOOTING LIST: moments the game asked for film of and found none. Most-asked first. */}
      {health && health.misses.length > 0 ? (
        <div className="shrink-0 border-b border-[#3d3428]/60 px-4 py-2">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-stone-600">Asked for, not filmed yet</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-[#c4a777]">
            {health.misses.slice(0, 8).map((m) => (
              <li key={`${m.location}|${m.state}|${m.kind}`}>
                <span className="text-[#e8dcc4]">{m.state ?? "default view"}</span>
                <span className="text-stone-500"> · {m.location} · asked {m.asked}× · last {ago(m.last)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="shrink-0 px-4 pb-2 pt-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by location, cue, kind or who fires it…"
          className="w-full rounded-sm border border-[#3d3428] bg-[#0f0d0b] px-3 py-1.5 text-sm text-[#e8dcc4] placeholder:text-stone-600 focus:border-[#c4a777]/60 focus:outline-none"
        />
        <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-[11px] text-stone-400">
          <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} className="accent-[#c4a777]" />
          Only films that need attention ({attentionCount})
        </label>
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
              const warnings = clipWarnings(clip, heroes)
              const use = health?.byClip[clip.id]
              const draft = drafts[clip.id]
              const momentDirty = draft !== undefined && draft.trim() !== (clip.moment ?? "")
              return (
                <div key={clip.id} className={`flex flex-col gap-2 rounded-sm border border-[#3d3428]/60 bg-gradient-to-b from-[#1a1614] to-[#0f0d0b] p-3 ${clip.retired ? "opacity-55" : ""}`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-serif text-base text-[#e8dcc4]">
                        {clip.location}
                        {clip.state ? <span className="text-[#c4a777]"> — {clip.state}</span> : null}
                      </h3>
                      <p className="truncate text-[10px] uppercase tracking-wider text-stone-600">
                        {clip.kind} · {clip.scope}
                        {plateName(clip.plate) ? ` · ${plateName(clip.plate)}` : ""}
                        {heroName(clip.character_id) ? ` · only ${heroName(clip.character_id)}` : ""}
                        {clip.retired ? " · retired" : ""}
                      </p>
                    </div>
                    {clip.video_url ? (
                      <button
                        type="button"
                        onClick={() => setTesting(clip)}
                        title="Play this film here only. Nobody's first viewing is spent."
                        className="flex shrink-0 items-center gap-1 rounded border border-[#4b3a19] px-1.5 py-1 text-[10px] uppercase tracking-wider text-[#c6a060] transition-colors hover:border-[#c9a868] hover:text-[#f0dcae]"
                      >
                        <Play className="h-3 w-3" /> Test
                      </button>
                    ) : null}
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

                  {warnings.length > 0 ? (
                    <ul className="flex flex-wrap gap-1">
                      {warnings.map((w) => (
                        <li key={w} className="rounded-sm border border-amber-700/50 bg-amber-900/20 px-1.5 py-0.5 text-[10px] text-amber-300">{w}</li>
                      ))}
                    </ul>
                  ) : null}

                  {/* The moment: what Malachar is told this film shows. */}
                  <div className="flex gap-1.5">
                    <input
                      value={draft ?? clip.moment ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [clip.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter" && momentDirty) void patchClip(clip, { moment: draft ?? "" }) }}
                      maxLength={300}
                      placeholder="The moment, in one sentence — what the film shows"
                      aria-label="The moment"
                      className={`${selectClass} min-w-0 flex-1 text-[13px] placeholder:text-stone-600`}
                    />
                    {momentDirty ? (
                      <button
                        type="button"
                        onClick={() => void patchClip(clip, { moment: draft ?? "" })}
                        disabled={busy === key}
                        className="shrink-0 rounded-sm border border-[#c9a868] bg-[#c4a777]/12 px-2 text-[10px] uppercase tracking-wider text-[#f0dcae] hover:bg-[#c4a777]/20 disabled:opacity-50"
                      >
                        Save
                      </button>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <select value={clip.fired_by} disabled={busy === key} onChange={(e) => void patchClip(clip, { fired_by: e.target.value as FiredBy })} className={`${selectClass} min-w-0 flex-1 text-[12px]`} aria-label="Fired by">
                      {FIRED_BY.map((f) => (
                        <option key={f} value={f}>{FIRED_BY_LABEL[f]}</option>
                      ))}
                    </select>
                    <select value={clip.plate ?? ""} disabled={busy === key} onChange={(e) => void patchClip(clip, { plate: e.target.value || null })} className={`${selectClass} text-[12px]`} aria-label="Plate">
                      <option value="">Anywhere in the scene</option>
                      {PLATE_OPTIONS.map((p) => (
                        <option key={p.slug} value={p.slug}>{p.name}</option>
                      ))}
                    </select>
                    <select value={clip.character_id ?? ""} disabled={busy === key} onChange={(e) => void patchClip(clip, { character_id: e.target.value || null })} className={`${selectClass} text-[12px]`} aria-label="Whose film">
                      <option value="">Any hero</option>
                      {heroes.map((h) => (
                        <option key={h.id} value={h.id}>Only {h.name}</option>
                      ))}
                      {/* A film bound to someone who is not on the hero list still shows its binding. */}
                      {clip.character_id && !heroes.some((h) => h.id === clip.character_id) ? <option value={clip.character_id}>Only one hero</option> : null}
                    </select>
                    <button
                      type="button"
                      onClick={() => void patchClip(clip, { retired: !clip.retired })}
                      disabled={busy === key}
                      title={clip.retired ? "Bring this film back into play" : "Keep it on file but never play it"}
                      className="rounded-sm border border-[#4b3a19] px-2 text-[10px] uppercase tracking-wider text-[#c6a060] hover:border-[#c9a868] hover:text-[#f0dcae] disabled:opacity-50"
                    >
                      {clip.retired ? "Un-retire" : "Retire"}
                    </button>
                  </div>

                  <p className="text-[11px] text-stone-500">
                    {use
                      ? `Played ${use.served}× · last ${ago(use.last)} · for ${use.to.join(", ")}`
                      : health
                        ? "Never played"
                        : "History appears once the DM code is entered"}
                  </p>

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

      {/* TEST: the film, here and nowhere else. No request is made, so nothing is logged and nobody's first
          viewing is spent. Muted, like every film in play (Tabletop Audio owns the sound). */}
      {testing?.video_url ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-6" onClick={() => setTesting(null)} role="dialog" aria-label="Test this film">
          <div className="relative w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setTesting(null)} aria-label="Close" className="absolute -top-8 right-0 text-stone-300 hover:text-white">
              <X className="h-5 w-5" />
            </button>
            <video src={testing.video_url} autoPlay muted controls playsInline className="max-h-[78vh] w-full rounded-sm border border-[#3d3428] bg-black" />
            <p className="mt-2 text-center text-[12px] text-[#c4a777]">
              {testing.state ?? "default view"} — {testing.moment || "no moment written"}
            </p>
          </div>
        </div>
      ) : null}

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
