"use client"

import { useEffect, useState } from "react"
import { ImagePlus, Trash2, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

type Asset = "face_url" | "idle_url" | "talking_url"
type Npc = {
  name: string
  face_url: string | null
  idle_url: string | null
  talking_url: string | null
  voice_id: string | null
  voice_description: string | null
}

export function NpcAssetsPanel({ onClose }: { onClose: () => void }) {
  const [npcs, setNpcs] = useState<Npc[]>([])
  const [busy, setBusy] = useState("")
  const [dmCode, setDmCode] = useState("")
  const [status, setStatus] = useState("")
  const [voiceDrafts, setVoiceDrafts] = useState<Record<string, { id: string; description: string }>>({})
  const [dmGateEnabled, setDmGateEnabled] = useState(true)

  const refresh = async () => {
    const { data } = await createClient().from("npc_encounters").select("name, face_url, idle_url, talking_url, voice_id, voice_description").order("name")
    const unique = new Map<string, Npc>()
    for (const row of (data ?? []) as Npc[]) if (!unique.has(row.name)) unique.set(row.name, row)
    const rows = [...unique.values()]
    setNpcs(rows)
    setVoiceDrafts((current) => Object.fromEntries(rows.map((npc) => [npc.name, current[npc.name] ?? {
      id: npc.voice_id ?? "",
      description: npc.voice_description ?? "",
    }])))
  }
  useEffect(() => {
    void refresh()
    void fetch("/api/claim-code", { cache: "no-store" })
      .then((response) => response.json())
      .then((gates: { dmGate?: boolean }) => setDmGateEnabled(Boolean(gates.dmGate)))
  }, [])

  const requestDmCode = (purpose: string): string | null => {
    if (!dmGateEnabled) return ""
    const code = dmCode || window.prompt(`Enter the DM access code to ${purpose}`) || ""
    if (!code) return null
    if (!dmCode) setDmCode(code)
    return code
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

  return <div className="fixed inset-0 z-[210] flex justify-end bg-black/70" onClick={onClose}>
    <aside className="h-full w-[520px] max-w-[95vw] overflow-y-auto border-l border-[#6b5123] bg-[#0d0b09] p-5 text-[#e8dcc4]" onClick={(event) => event.stopPropagation()}>
      <header className="mb-5 flex items-start justify-between"><div><h2 className="font-serif text-xl text-[#d4b15a]">NPC Canon Assets</h2><p className="mt-1 text-xs text-stone-500">Add or clear the face and animation loops shared by every encounter with this name.</p></div><button onClick={onClose} aria-label="Close NPC assets"><X /></button></header>
      {status ? <p role="status" aria-live="polite" className="mb-3 rounded border border-[#4b3a19] bg-[#15110d] px-3 py-2 text-xs text-[#d4b15a]">{status}</p> : null}
      <div className="space-y-3">{npcs.map((npc) => {
        const draft = voiceDrafts[npc.name] ?? { id: "", description: "" }
        return <article key={npc.name} className="rounded border border-[#3d3428] bg-[#15110d] p-3">
          <h3 className="mb-3 font-serif text-[#e0c078]">{npc.name}</h3>
          <div className="grid grid-cols-3 gap-2">{([['face_url','Face','image/*'],['idle_url','Idle','video/mp4,video/webm'],['talking_url','Talking','video/mp4,video/webm']] as const).map(([asset,label,accept]) => <div key={asset} className="min-w-0"><div className="aspect-square overflow-hidden rounded border border-[#4b3a19] bg-black">{npc[asset] ? (asset === 'face_url' ? <img src={npc[asset]!} alt={`${npc.name} ${label}`} className="h-full w-full object-contain" /> : <video src={npc[asset]!} muted loop autoPlay playsInline className="h-full w-full object-contain" />) : <div className="flex h-full items-center justify-center text-stone-700"><ImagePlus /></div>}</div><p className="my-1 text-center text-[10px] uppercase text-stone-500">{label}</p><div className="flex justify-center gap-2"><label className="cursor-pointer text-[10px] text-[#d4b15a]">Add<input type="file" accept={accept} className="hidden" disabled={!!busy} onChange={(event) => void upload(npc, asset === 'face_url' ? 'face' : asset === 'idle_url' ? 'idle' : 'talking', event.target.files?.[0])} /></label>{npc[asset] ? <button disabled={!!busy} onClick={() => void clear(npc.name, asset)} className="text-red-400" title={`Clear ${label}`}><Trash2 className="h-3 w-3" /></button> : null}</div></div>)}</div>
          <div className="mt-3 border-t border-[#3d3428] pt-3">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-[#9b8b6b]">ElevenLabs voice</p>
            <input value={draft.id} onChange={(event) => setVoiceDrafts((all) => ({ ...all, [npc.name]: { ...draft, id: event.target.value } }))} placeholder="ElevenLabs voice ID" className="w-full rounded border border-[#4b3a19] bg-black/40 px-2 py-1.5 text-xs text-[#e8dcc4]" />
            <textarea value={draft.description} onChange={(event) => setVoiceDrafts((all) => ({ ...all, [npc.name]: { ...draft, description: event.target.value } }))} placeholder="Voice description used when resolving a voice" rows={2} className="mt-2 w-full resize-y rounded border border-[#4b3a19] bg-black/40 px-2 py-1.5 text-xs text-[#e8dcc4]" />
            <div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-stone-500">Store the voice ID, not generated audio files.</span><button disabled={!!busy} onClick={() => void saveVoice(npc.name)} className="rounded border border-[#8a672d] px-3 py-1 text-[10px] text-[#d4b15a] disabled:opacity-50">Save voice</button></div>
          </div>
        </article>
      })}</div>
    </aside>
  </div>
}
