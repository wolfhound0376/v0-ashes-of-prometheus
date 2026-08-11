"use client"

import { useEffect, useState } from "react"
import { ImagePlus, Trash2, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

type Asset = "face_url" | "idle_url" | "talking_url"
type Npc = { name: string; face_url: string | null; idle_url: string | null; talking_url: string | null }

export function NpcAssetsPanel({ onClose }: { onClose: () => void }) {
  const [npcs, setNpcs] = useState<Npc[]>([])
  const [busy, setBusy] = useState("")
  const [dmCode, setDmCode] = useState("")
  const [status, setStatus] = useState("")

  const refresh = async () => {
    const { data } = await createClient().from("npc_encounters").select("name, face_url, idle_url, talking_url").order("name")
    const unique = new Map<string, Npc>()
    for (const row of (data ?? []) as Npc[]) if (!unique.has(row.name)) unique.set(row.name, row)
    setNpcs([...unique.values()])
  }
  useEffect(() => { void refresh() }, [])

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
    const code = dmCode || window.prompt("Enter the DM access code to clear canon media") || ""
    if (!code) return
    if (!dmCode) setDmCode(code)
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

  return <div className="fixed inset-0 z-[210] flex justify-end bg-black/70" onClick={onClose}>
    <aside className="h-full w-[520px] max-w-[95vw] overflow-y-auto border-l border-[#6b5123] bg-[#0d0b09] p-5 text-[#e8dcc4]" onClick={(event) => event.stopPropagation()}>
      <header className="mb-5 flex items-start justify-between"><div><h2 className="font-serif text-xl text-[#d4b15a]">NPC Canon Assets</h2><p className="mt-1 text-xs text-stone-500">Add or clear the face and animation loops shared by every encounter with this name.</p></div><button onClick={onClose} aria-label="Close NPC assets"><X /></button></header>
      {status ? <p role="status" aria-live="polite" className="mb-3 rounded border border-[#4b3a19] bg-[#15110d] px-3 py-2 text-xs text-[#d4b15a]">{status}</p> : null}
      <div className="space-y-3">{npcs.map((npc) => <article key={npc.name} className="rounded border border-[#3d3428] bg-[#15110d] p-3"><h3 className="mb-3 font-serif text-[#e0c078]">{npc.name}</h3><div className="grid grid-cols-3 gap-2">{([['face_url','Face','image/*'],['idle_url','Idle','video/mp4,video/webm'],['talking_url','Talking','video/mp4,video/webm']] as const).map(([asset,label,accept]) => <div key={asset} className="min-w-0"><div className="aspect-square overflow-hidden rounded border border-[#4b3a19] bg-black">{npc[asset] ? (asset === 'face_url' ? <img src={npc[asset]!} alt={`${npc.name} ${label}`} className="h-full w-full object-contain" /> : <video src={npc[asset]!} muted loop autoPlay playsInline className="h-full w-full object-contain" />) : <div className="flex h-full items-center justify-center text-stone-700"><ImagePlus /></div>}</div><p className="my-1 text-center text-[10px] uppercase text-stone-500">{label}</p><div className="flex justify-center gap-2"><label className="cursor-pointer text-[10px] text-[#d4b15a]">Add<input type="file" accept={accept} className="hidden" disabled={!!busy} onChange={(event) => void upload(npc, asset === 'face_url' ? 'face' : asset === 'idle_url' ? 'idle' : 'talking', event.target.files?.[0])} /></label>{npc[asset] ? <button disabled={!!busy} onClick={() => void clear(npc.name, asset)} className="text-red-400" title={`Clear ${label}`}><Trash2 className="h-3 w-3" /></button> : null}</div></div>)}</div></article>)}</div>
    </aside>
  </div>
}
