"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertCircle, Check, Loader2, Upload } from "lucide-react"
import { cn } from "@/lib/utils"

// The counterpart to /music-upload, for everything else the table needs. The
// list on the right is the point: rather than remembering which token has no
// rig, pick the empty one and give it a file.

type Kind = "token-model" | "scene-vfx" | "sfx" | "music" | "spell-icon"

const KINDS: { id: Kind; label: string; blurb: string; groups: string[] }[] = [
  {
    id: "token-model",
    label: "Token rig",
    blurb: "A .glb that stands on the board. Writes straight onto the token.",
    groups: [],
  },
  {
    id: "scene-vfx",
    label: "Scene VFX",
    blurb: "Fog, embers, torchlight — composited over the whole stage.",
    groups: [],
  },
  {
    id: "sfx",
    label: "Sound effect",
    blurb: "Goes into the sound bank. Name it in lib/sfx.ts to play it.",
    groups: ["magic", "combat", "movement", "creature", "ui"],
  },
  {
    id: "music",
    label: "Music",
    blurb: "A score track. Declare it in lib/music-library.ts to use it.",
    groups: ["combat", "exploration", "tension", "dungeon", "ambient"],
  },
  {
    id: "spell-icon",
    label: "Spell icon",
    blurb: "Art for a spell or action, looked up by slug.",
    groups: [],
  },
]

interface TargetRow {
  id: string
  label: string
  url: string | null
}

type Phase = "idle" | "signing" | "uploading" | "committing" | "done" | "error"

export default function AssetUploadPage() {
  const [kind, setKind] = useState<Kind>("token-model")
  const [group, setGroup] = useState<string>("")
  const [rows, setRows] = useState<TargetRow[]>([])
  const [manifestOnly, setManifestOnly] = useState(false)
  const [hint, setHint] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>("idle")
  const [message, setMessage] = useState<string | null>(null)
  const [lastUrl, setLastUrl] = useState<string | null>(null)
  const [loadingRows, setLoadingRows] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const spec = KINDS.find((k) => k.id === kind)!

  const loadRows = useCallback(async (which: Kind) => {
    setLoadingRows(true)
    try {
      const res = await fetch(`/api/asset-upload?kind=${which}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Could not load the list")
      setRows(data.rows ?? [])
      setManifestOnly(Boolean(data.manifestOnly))
      setHint(data.hint ?? "")
      setSelectedId(null)
    } catch (err) {
      setRows([])
      setMessage(err instanceof Error ? err.message : "Could not load the list")
      setPhase("error")
    } finally {
      setLoadingRows(false)
    }
  }, [])

  useEffect(() => {
    setGroup(spec.groups[0] ?? "")
    setPhase("idle")
    setMessage(null)
    setLastUrl(null)
    void loadRows(kind)
  }, [kind, loadRows, spec.groups])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMessage(null)
    setLastUrl(null)

    try {
      // 1. ask for somewhere to put it
      setPhase("signing")
      const signRes = await fetch("/api/asset-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sign",
          kind,
          filename: file.name,
          group: kind === "token-model" ? group.trim() || undefined : group || undefined,
        }),
      })
      const signed = await signRes.json()
      if (!signRes.ok) throw new Error(signed.error || "Could not get an upload URL")

      // 2. the bytes go straight to storage, never through our own function
      setPhase("uploading")
      const put = await fetch(signed.signedUrl, {
        method: "PUT",
        body: file,
        headers: file.type ? { "Content-Type": file.type } : undefined,
      })
      if (!put.ok) throw new Error(`Storage rejected the file (${put.status})`)

      // 3. and only now does it become live
      if (signed.writesRow) {
        if (!selectedId) {
          throw new Error("The file is uploaded, but pick which row it belongs to before it goes live.")
        }
        setPhase("committing")
        const commitRes = await fetch("/api/asset-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "commit", kind, rowId: selectedId, publicUrl: signed.publicUrl }),
        })
        const committed = await commitRes.json()
        if (!commitRes.ok) throw new Error(committed.error || "Uploaded, but the row was not written")
        setMessage(`${committed.label} now has its asset.`)
        await loadRows(kind)
      } else {
        setMessage(`Uploaded to ${signed.path}. ${signed.hint}`)
      }

      setLastUrl(signed.publicUrl)
      setPhase("done")
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed")
      setPhase("error")
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const busy = phase === "signing" || phase === "uploading" || phase === "committing"
  const needsRow = !manifestOnly && !selectedId
  const missing = rows.filter((r) => !r.url).length

  return (
    <main className="min-h-screen bg-[#0a0908] text-stone-200">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8 border-b border-stone-800 pb-5">
          <h1 className="font-serif text-3xl text-amber-100">Asset upload</h1>
          <p className="mt-1 text-sm text-stone-400">
            Puts a file where the game actually reads from, and writes the row that makes it live.
          </p>
        </header>

        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              className={cn(
                "rounded border px-3 py-1.5 text-sm transition-colors",
                kind === k.id
                  ? "border-amber-600 bg-amber-950/50 text-amber-100"
                  : "border-stone-800 text-stone-400 hover:border-stone-600 hover:text-stone-200",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-stone-400">{spec.blurb}</p>

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <section>
            <h2 className="mb-3 font-serif text-lg text-amber-100">
              {manifestOnly ? "Where it lands" : "What is missing"}
            </h2>

            {spec.groups.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {spec.groups.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGroup(g)}
                    className={cn(
                      "rounded border px-2.5 py-1 font-mono text-xs transition-colors",
                      group === g
                        ? "border-amber-700 text-amber-200"
                        : "border-stone-800 text-stone-500 hover:text-stone-300",
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}

            {kind === "token-model" && (
              <label className="mb-4 block text-sm">
                <span className="text-stone-400">Character slug (folder in the models bucket)</span>
                <input
                  type="text"
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                  placeholder="shuushar — blank goes to _incoming/"
                  className="mt-1 w-full rounded border border-stone-800 bg-stone-950 px-3 py-2 font-mono text-sm text-stone-200 placeholder:text-stone-600 focus:border-amber-700 focus:outline-none"
                />
              </label>
            )}

            {manifestOnly ? (
              <p className="rounded border border-stone-800 bg-stone-950/60 p-4 text-sm text-stone-400">
                {hint}
              </p>
            ) : loadingRows ? (
              <p className="text-sm text-stone-500">Loading…</p>
            ) : (
              <>
                <p className="mb-2 text-xs text-stone-500">
                  {missing} of {rows.length} still empty — pick one, then choose a file.
                </p>
                <ul className="max-h-80 space-y-px overflow-y-auto rounded border border-stone-800">
                  {rows.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(row.id)}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors",
                          selectedId === row.id ? "bg-amber-950/40 text-amber-100" : "hover:bg-stone-900",
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            row.url ? "bg-emerald-600" : "bg-red-800",
                          )}
                          aria-hidden
                        />
                        <span className="flex-1 truncate">{row.label}</span>
                        <span className="font-mono text-[11px] text-stone-600">
                          {row.url ? "has art" : "empty"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section>
            <h2 className="mb-3 font-serif text-lg text-amber-100">Give it a file</h2>

            <button
              type="button"
              disabled={busy || needsRow}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "flex w-full flex-col items-center gap-2 rounded border border-dashed px-6 py-10 transition-colors",
                busy || needsRow
                  ? "cursor-not-allowed border-stone-800 text-stone-600"
                  : "border-stone-700 text-stone-300 hover:border-amber-700 hover:text-amber-100",
              )}
            >
              {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
              <span className="text-sm">
                {phase === "signing" && "Asking for somewhere to put it…"}
                {phase === "uploading" && "Uploading straight to storage…"}
                {phase === "committing" && "Writing the row…"}
                {!busy && needsRow && "Pick a row on the left first"}
                {!busy && !needsRow && "Choose a file"}
              </span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFile}
              className="hidden"
            />

            {message && (
              <div
                className={cn(
                  "mt-4 flex items-start gap-2 rounded border p-3 text-sm",
                  phase === "error"
                    ? "border-red-900 bg-red-950/30 text-red-200"
                    : "border-emerald-900 bg-emerald-950/20 text-emerald-100",
                )}
              >
                {phase === "error" ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <Check className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>{message}</span>
              </div>
            )}

            {lastUrl && (
              <p className="mt-3 break-all font-mono text-[11px] text-stone-500">{lastUrl}</p>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
