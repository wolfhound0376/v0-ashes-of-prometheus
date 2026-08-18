"use client"

import { useEffect, useState } from "react"
import { ImagePlus, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { ensureDmKey, getDmKey, fetchDmGateEnabled } from "@/lib/dm-key"
import { npcWindowStyle, readFraming, STAGE_OFFSET_MAX, STAGE_OFFSET_MIN, STAGE_SCALE_MAX, STAGE_SCALE_MIN } from "@/lib/stage-framing"

type Asset = "face_url" | "idle_url" | "talking_url"
type Npc = {
  name: string
  face_url: string | null
  idle_url: string | null
  talking_url: string | null
  voice_id: string | null
  voice_description: string | null
  stage_scale: number | string | null
  stage_offset_y: number | string | null
}

export function NpcAssetsTab() {
  const [npcs, setNpcs] = useState<Npc[]>([])
  const [busy, setBusy] = useState("")
  const [status, setStatus] = useState("")
  const [voiceDrafts, setVoiceDrafts] = useState<Record<string, { id: string; description: string }>>({})
  const [frameDrafts, setFrameDrafts] = useState<Record<string, { scale: number; offsetY: number }>>({})
  const [dmGateEnabled, setDmGateEnabled] = useState(true)

  const refresh = async () => {
    const { data } = await createClient().from("npc_encounters").select("name, face_url, idle_url, talking_url, voice_id, voice_description, stage_scale, stage_offset_y").order("name")
    const unique = new Map<string, Npc>()
    for (const row of (data ?? []) as Npc[]) if (!unique.has(row.name)) unique.set(row.name, row)
    const rows = [...unique.values()]
    setNpcs(rows)
    setVoiceDrafts((current) => Object.fromEntries(rows.map((npc) => [npc.name, current[npc.name] ?? {
      id: npc.voice_id ?? "",
      description: npc.voice_description ?? "",
    }])))
    setFrameDrafts((current) => Object.fromEntries(rows.map((npc) => [npc.name, current[npc.name] ?? readFraming(npc)])))
  }
  useEffect(() => {
    void refresh()
    void fetchDmGateEnabled().then(setDmGateEnabled)
  }, [])

  // Shared with the other tabs and with /join, so the code survives a reload
  // and is only ever typed once per browser.
  const requestDmCode = (purpose: string): string | null => {
    if (!dmGateEnabled) return ""
    return getDmKey() || ensureDmKey(purpose)
  }

  const upload = async (npc: Npc, kind: "face" | "idle" | "talking", file?: File) => {
    if (!file) return
    setBusy(`${npc.name}-${kind}`)
    setStatus(`Uploading ${npc.name} ${kind}…`)
    try {
      const form = new FormData()
      form.append("npcName", npc.name)
      form.append("file", file)
      if (kind !== "face") form.append("kind", kind)
      const response = await fetch(kind === "face" ? "/api/npc-face" : "/api/npc-video", { method: "POST", body: form })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || "Upload failed")
      await refresh()
      setStatus(`${npc.name} ${kind} saved to ${result.updatedCount ?? 0} row(s).`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed")
    } finally {
      setBusy("")
    }
  }

  const clear = async (npcName: string, asset: Asset) => {
    const code = requestDmCode("clear canon media")
    if (code === null) return
    setBusy(`${npcName}-${asset}`)
    setStatus(`Clearing ${npcName} ${asset.replace("_url", "")}…`)
    try {
      const response = await fetch("/api/npc-asset", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ npcName, asset, dmCode: code }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || "Clear failed")
      await refresh()
      setStatus(`Cleared ${asset.replace("_url", "")} from ${result.updatedCount ?? 0} row(s).`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Clear failed")
    } finally {
      setBusy("")
    }
  }

  const saveVoice = async (npcName: string) => {
    const draft = voiceDrafts[npcName] ?? { id: "", description: "" }
    const code = requestDmCode("save the ElevenLabs voice")
    if (code === null) return
    setBusy(`${npcName}-voice`)
    setStatus(`Saving ${npcName} voice…`)
    try {
      const response = await fetch("/api/npc-asset", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ npcName, voiceId: draft.id, voiceDescription: draft.description, dmCode: code }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || "Voice save failed")
      await refresh()
      setStatus(`${npcName} voice saved to ${result.updatedCount ?? 0} row(s).`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Voice save failed")
    } finally {
      setBusy("")
    }
  }

  // The head window shows whatever the loop was framed as. A face close-up needs
  // nothing; a full-body goblin renders as a speck. These two numbers zoom the
  // window into the face without re-cutting the art, and are written to every
  // row sharing the name, the same way art and voice are.
  const saveFraming = async (npcName: string) => {
    const draft = frameDrafts[npcName] ?? { scale: 1, offsetY: 0 }
    const code = requestDmCode("save the head-window framing")
    if (code === null) return
    setBusy(`${npcName}-frame`)
    setStatus(`Saving ${npcName} framing…`)
    try {
      const response = await fetch("/api/npc-asset", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ npcName, stageScale: draft.scale, stageOffsetY: draft.offsetY, dmCode: code }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || "Framing save failed")
      await refresh()
      setStatus(`${npcName} framing saved to ${result.updatedCount ?? 0} row(s).`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Framing save failed")
    } finally {
      setBusy("")
    }
  }

  return <div className="min-h-0 flex-1 overflow-y-auto p-4 text-[#e8dcc4]">
      {status ? <p role="status" aria-live="polite" className="mb-3 rounded border border-[#4b3a19] bg-[#15110d] px-3 py-2 text-xs text-[#d4b15a]">{status}</p> : null}
      <div className="space-y-3">{npcs.map((npc) => {
        const draft = voiceDrafts[npc.name] ?? { id: "", description: "" }
        const frame = frameDrafts[npc.name] ?? { scale: 1, offsetY: 0 }
        const framePreview = npc.idle_url || npc.talking_url || npc.face_url
        return <article key={npc.name} className="rounded border border-[#3d3428] bg-[#15110d] p-3">
          <h3 className="mb-3 font-serif text-[#e0c078]">{npc.name}</h3>
          <div className="grid grid-cols-3 gap-2">{([['face_url','Face','image/*'],['idle_url','Idle','video/mp4,video/webm'],['talking_url','Talking','video/mp4,video/webm']] as const).map(([asset,label,accept]) => <div key={asset} className="min-w-0"><div className="aspect-square overflow-hidden rounded border border-[#4b3a19] bg-black">{npc[asset] ? (asset === 'face_url' ? <img src={npc[asset]!} alt={`${npc.name} ${label}`} className="h-full w-full object-contain" /> : <video src={npc[asset]!} muted loop autoPlay playsInline className="h-full w-full object-contain" />) : <div className="flex h-full items-center justify-center text-stone-700"><ImagePlus /></div>}</div><p className="my-1 text-center text-[10px] uppercase text-stone-500">{label}</p><div className="flex justify-center gap-2"><label className="cursor-pointer text-[10px] text-[#d4b15a]">Add<input type="file" accept={accept} className="hidden" disabled={!!busy} onChange={(event) => void upload(npc, asset === 'face_url' ? 'face' : asset === 'idle_url' ? 'idle' : 'talking', event.target.files?.[0])} /></label>{npc[asset] ? <button disabled={!!busy} onClick={() => void clear(npc.name, asset)} className="text-red-400" title={`Clear ${label}`}><Trash2 className="h-3 w-3" /></button> : null}</div></div>)}</div>
          <div className="mt-3 border-t border-[#3d3428] pt-3">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-[#9b8b6b]">Head-window framing</p>
            {framePreview ? (
              <div className="relative mb-2 h-32 overflow-hidden rounded border border-[#6b5123] bg-[radial-gradient(circle_at_50%_30%,#302314,#050403_70%)]">
                {/* The real head window, at the real anchoring, so the sliders tell the truth. */}
                {framePreview === npc.face_url
                  ? <img src={framePreview} alt={`${npc.name} framing preview`} style={npcWindowStyle({ stage_scale: frame.scale, stage_offset_y: frame.offsetY })} className="absolute inset-0 h-full w-full object-contain object-top" />
                  : <video key={framePreview} src={framePreview} autoPlay loop muted playsInline style={npcWindowStyle({ stage_scale: frame.scale, stage_offset_y: frame.offsetY })} className="absolute inset-0 h-full w-full object-contain object-top" />}
                <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-[#c49b4e]/20" />
              </div>
            ) : <p className="mb-2 text-[10px] text-stone-600">Add a face or idle loop to preview the framing.</p>}
            <label className="block text-[10px] text-stone-500">
              <span className="flex justify-between"><span>Zoom</span><span className="text-[#c4a777]">{frame.scale.toFixed(2)}×</span></span>
              <input type="range" min={STAGE_SCALE_MIN} max={STAGE_SCALE_MAX} step={0.05} value={frame.scale}
                onChange={(event) => setFrameDrafts((all) => ({ ...all, [npc.name]: { ...frame, scale: Number(event.target.value) } }))}
                className="mt-0.5 w-full accent-[#c4a777]" />
            </label>
            <label className="mt-1 block text-[10px] text-stone-500">
              <span className="flex justify-between"><span>Vertical (↓ down)</span><span className="text-[#c4a777]">{frame.offsetY.toFixed(1)}%</span></span>
              <input type="range" min={STAGE_OFFSET_MIN} max={STAGE_OFFSET_MAX} step={0.5} value={frame.offsetY}
                onChange={(event) => setFrameDrafts((all) => ({ ...all, [npc.name]: { ...frame, offsetY: Number(event.target.value) } }))}
                className="mt-0.5 w-full accent-[#c4a777]" />
            </label>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="min-w-0 text-[10px] text-stone-500">Zoom until the face fills the window. Applies to every row named {npc.name}.</span>
              <div className="flex shrink-0 gap-1.5">
                <button disabled={!!busy} onClick={() => setFrameDrafts((all) => ({ ...all, [npc.name]: { scale: 1, offsetY: 0 } }))} className="rounded border border-[#4b3a19] px-2 py-1 text-[10px] text-stone-400 disabled:opacity-50">Reset</button>
                <button disabled={!!busy} onClick={() => void saveFraming(npc.name)} className="rounded border border-[#8a672d] px-3 py-1 text-[10px] text-[#d4b15a] disabled:opacity-50">Save framing</button>
              </div>
            </div>
          </div>
          <div className="mt-3 border-t border-[#3d3428] pt-3">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-[#9b8b6b]">ElevenLabs voice</p>
            <input value={draft.id} onChange={(event) => setVoiceDrafts((all) => ({ ...all, [npc.name]: { ...draft, id: event.target.value } }))} placeholder="ElevenLabs voice ID" className="w-full rounded border border-[#4b3a19] bg-black/40 px-2 py-1.5 text-xs text-[#e8dcc4]" />
            <textarea value={draft.description} onChange={(event) => setVoiceDrafts((all) => ({ ...all, [npc.name]: { ...draft, description: event.target.value } }))} placeholder="Voice description used when resolving a voice" rows={2} className="mt-2 w-full resize-y rounded border border-[#4b3a19] bg-black/40 px-2 py-1.5 text-xs text-[#e8dcc4]" />
            <div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-stone-500">Store the voice ID, not generated audio files.</span><button disabled={!!busy} onClick={() => void saveVoice(npc.name)} className="rounded border border-[#8a672d] px-3 py-1 text-[10px] text-[#d4b15a] disabled:opacity-50">Save voice</button></div>
          </div>
        </article>
      })}</div>
  </div>
}
