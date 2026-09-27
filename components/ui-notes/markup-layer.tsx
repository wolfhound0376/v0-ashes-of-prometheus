"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, List, PenLine, RotateCcw, Trash2, X } from "lucide-react"
import { dmHeaders, ensureDmKey, hasDmKey, onDmKeyChange } from "@/lib/dm-key"
import { cn } from "@/lib/utils"

// Draw a box over any part of the live UI and leave a comment on it. Each note
// records the box, the viewport it was drawn at, the panels under it and the
// text inside it, so a coding pass can find the exact element without a
// screenshot. Only shown to the DM (or when ?markup is in the URL).

interface UiNote {
  id: string
  createdAt: string
  status: "open" | "done"
  path: string
  view: string
  viewport: { w: number; h: number }
  rect: { x: number; y: number; w: number; h: number }
  comment: string
  targets: string[]
  text: string
}

type Rect = { x: number; y: number; w: number; h: number }

const MARKUP_FLAG = "aop_markup_enabled"
const ROOT_ATTR = "data-markup-root"

function normalize(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
}

function describe(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const label =
    el.getAttribute("aria-label") ||
    el.getAttribute("alt") ||
    el.getAttribute("title") ||
    (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60)
  return label ? `${tag}: ${label}` : tag
}

/** The panels and elements under the box: grid-sampled hits plus the nearest headed ancestor of each. */
function collectTargets(rect: Rect): string[] {
  const found = new Set<string>()
  for (const fx of [0.2, 0.5, 0.8]) {
    for (const fy of [0.2, 0.5, 0.8]) {
      const hits = document.elementsFromPoint(rect.x + rect.w * fx, rect.y + rect.h * fy)
      const hit = hits.find((el) => !el.closest(`[${ROOT_ATTR}]`))
      if (!hit) continue
      found.add(describe(hit))
      let node: Element | null = hit.parentElement
      for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
        const heading = node.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > header h2, :scope > header h3")
        if (heading?.textContent?.trim()) {
          found.add(`panel: ${heading.textContent.replace(/\s+/g, " ").trim().slice(0, 80)}`)
          break
        }
      }
      if (found.size >= 12) return [...found]
    }
  }
  return [...found]
}

/** Visible text whose layout box intersects the drawn rect. */
function collectText(rect: Rect): string {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  const parts: string[] = []
  let length = 0
  while (walker.nextNode() && length < 600) {
    const node = walker.currentNode
    const text = node.textContent?.replace(/\s+/g, " ").trim()
    if (!text || node.parentElement?.closest(`[${ROOT_ATTR}]`)) continue
    range.selectNodeContents(node)
    const r = range.getBoundingClientRect()
    if (!r.width || !r.height) continue
    if (r.right < rect.x || r.left > rect.x + rect.w || r.bottom < rect.y || r.top > rect.y + rect.h) continue
    parts.push(text)
    length += text.length + 3
  }
  return parts.join(" · ").slice(0, 600)
}

function currentView(): string {
  return document.documentElement.dataset.view ?? "full"
}

export function MarkupLayer() {
  const [enabled, setEnabled] = useState(false)
  const [active, setActive] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [notes, setNotes] = useState<UiNote[]>([])
  const [drag, setDrag] = useState<{ start: { x: number; y: number }; rect: Rect } | null>(null)
  const [draft, setDraft] = useState<Rect | null>(null)
  const [comment, setComment] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [path, setPath] = useState("/")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has("markup")) window.localStorage.setItem(MARKUP_FLAG, "1")
    const refresh = () => setEnabled(hasDmKey() || window.localStorage.getItem(MARKUP_FLAG) === "1")
    refresh()
    setPath(window.location.pathname)
    return onDmKeyChange(refresh)
  }, [])

  const loadNotes = useCallback(async () => {
    if (!hasDmKey()) return
    const res = await fetch("/api/ui-notes", { headers: dmHeaders(), cache: "no-store" })
    if (!res.ok) {
      setError(res.status === 403 ? "The DM code was not accepted." : "Could not load notes.")
      return
    }
    const data = (await res.json()) as { notes: UiNote[] }
    setNotes(data.notes)
    setError(null)
  }, [])

  const start = useCallback(() => {
    if (!ensureDmKey("leave layout notes")) return
    setPath(window.location.pathname)
    setActive(true)
    void loadNotes()
  }, [loadNotes])

  const stop = useCallback(() => {
    setActive(false)
    setDrag(null)
    setDraft(null)
    setComment("")
  }, [])

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable='true']")
      if (e.key === "Escape" && active) {
        if (draft) setDraft(null)
        else stop()
      } else if (!typing && e.shiftKey && e.key.toLowerCase() === "m") {
        if (active) stop()
        else start()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [enabled, active, draft, start, stop])

  useEffect(() => {
    if (draft) textareaRef.current?.focus()
  }, [draft])

  const save = async () => {
    if (!draft || !comment.trim()) return
    setSaving(true)
    setError(null)
    const note = {
      comment: comment.trim(),
      path: window.location.pathname + window.location.search,
      view: currentView(),
      viewport: { w: window.innerWidth, h: window.innerHeight },
      rect: draft,
      targets: collectTargets(draft),
      text: collectText(draft),
    }
    try {
      const res = await fetch("/api/ui-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...dmHeaders() },
        body: JSON.stringify({ note }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? "Could not save the note.")
      setNotes((prev) => [data.note as UiNote, ...prev])
      setDraft(null)
      setComment("")
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (id: string, status: UiNote["status"]) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, status } : n)))
    await fetch("/api/ui-notes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...dmHeaders() },
      body: JSON.stringify({ id, status }),
    })
  }

  const remove = async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id))
    await fetch(`/api/ui-notes?id=${id}`, { method: "DELETE", headers: dmHeaders() })
  }

  if (!enabled) return null

  const pageNotes = notes.filter((n) => n.path.split("?")[0] === path && n.status === "open")
  const vw = typeof window === "undefined" ? 1 : window.innerWidth
  const vh = typeof window === "undefined" ? 1 : window.innerHeight
  const placed = (n: UiNote): Rect => {
    const sx = n.viewport.w ? vw / n.viewport.w : 1
    const sy = n.viewport.h ? vh / n.viewport.h : 1
    return { x: n.rect.x * sx, y: n.rect.y * sy, w: n.rect.w * sx, h: n.rect.h * sy }
  }
  const box = drag?.rect ?? draft

  const formLeft = draft ? Math.min(Math.max(8, draft.x), vw - 328) : 0
  const formTop = draft ? (draft.y + draft.h + 176 < vh ? draft.y + draft.h + 8 : Math.max(8, draft.y - 176)) : 0

  return (
    <div {...{ [ROOT_ATTR]: "" }} className="font-sans">
      {!active && (
        <button
          type="button"
          onClick={start}
          className="fixed bottom-20 left-3 z-[400] flex items-center gap-2 rounded-full border border-[#c9a868]/60 bg-[#15110c]/95 px-3 py-2 text-xs text-[#e2c98e] shadow-lg transition-colors hover:border-[#c9a868] hover:text-[#f0dba8]"
          aria-label="Mark up this screen (Shift+M)"
        >
          <PenLine className="h-4 w-4" aria-hidden="true" />
          <span>Mark up</span>
        </button>
      )}

      {active && (
        <>
          <div
            className="fixed inset-0 z-[400] cursor-crosshair bg-[#0a0806]/25"
            onPointerDown={(e) => {
              if (draft) return
              ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
              const p = { x: e.clientX, y: e.clientY }
              setDrag({ start: p, rect: { ...p, w: 0, h: 0 } })
            }}
            onPointerMove={(e) => {
              if (!drag) return
              setDrag({ start: drag.start, rect: normalize(drag.start, { x: e.clientX, y: e.clientY }) })
            }}
            onPointerUp={() => {
              if (!drag) return
              if (drag.rect.w > 12 && drag.rect.h > 12) setDraft(drag.rect)
              setDrag(null)
            }}
          />

          {pageNotes.map((n, i) => {
            const r = placed(n)
            return (
              <div
                key={n.id}
                className="pointer-events-none fixed z-[401] rounded-sm border-2 border-dashed border-[#e0651a]/80"
                style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
              >
                <span className="absolute -left-2 -top-3 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#e0651a] px-1.5 text-xs font-semibold text-[#0a0806]">
                  {pageNotes.length - i}
                </span>
              </div>
            )
          })}

          {box && (
            <div
              className="pointer-events-none fixed z-[402] rounded-sm border-2 border-[#f0dba8] bg-[#f0dba8]/10"
              style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
            />
          )}

          <div className="fixed left-1/2 top-3 z-[403] flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#7a5f33] bg-[#15110c]/95 py-1.5 pl-4 pr-1.5 text-xs text-[#e2c98e] shadow-lg">
            <span className="hidden sm:inline">Drag a box around anything, then describe the change.</span>
            <span className="sm:hidden">Drag to box an area</span>
            <button
              type="button"
              onClick={() => setListOpen((v) => !v)}
              className="flex items-center gap-1 rounded-full border border-[#7a5f33] px-2.5 py-1 hover:border-[#c9a868]"
            >
              <List className="h-3.5 w-3.5" aria-hidden="true" />
              Notes ({notes.filter((n) => n.status === "open").length})
            </button>
            <button
              type="button"
              onClick={stop}
              className="flex items-center gap-1 rounded-full bg-[#c9a868] px-2.5 py-1 font-semibold text-[#0a0806] hover:bg-[#f0dba8]"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Done
            </button>
          </div>

          {draft && (
            <form
              className="fixed z-[404] flex w-80 flex-col gap-2 rounded-md border border-[#7a5f33] bg-[#15110c] p-3 shadow-2xl"
              style={{ left: formLeft, top: formTop }}
              onSubmit={(e) => {
                e.preventDefault()
                void save()
              }}
            >
              <label htmlFor="markup-comment" className="text-xs uppercase tracking-wider text-[#c9a868]">
                What should change here?
              </label>
              <textarea
                id="markup-comment"
                ref={textareaRef}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    void save()
                  }
                }}
                rows={4}
                placeholder="e.g. Make this panel shorter and move the party list above it"
                className="resize-none rounded-sm border border-[#3d3428] bg-[#0a0806] p-2 text-sm leading-relaxed text-stone-200 placeholder:text-stone-500 focus:border-[#c9a868] focus:outline-none"
              />
              {error && <p className="text-xs text-[#e0651a]">{error}</p>}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-stone-500">Ctrl/Cmd + Enter to save</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(null)
                      setComment("")
                    }}
                    className="rounded-sm border border-[#3d3428] px-3 py-1 text-xs text-stone-300 hover:border-stone-500"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !comment.trim()}
                    className="rounded-sm bg-[#c9a868] px-3 py-1 text-xs font-semibold text-[#0a0806] hover:bg-[#f0dba8] disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save note"}
                  </button>
                </div>
              </div>
            </form>
          )}

          {listOpen && (
            <aside
              aria-label="Layout notes"
              className="fixed bottom-0 right-0 top-0 z-[405] flex w-full max-w-sm flex-col border-l border-[#7a5f33] bg-[#110e0a] shadow-2xl"
            >
              <header className="flex items-center justify-between border-b border-[#3d3428] px-4 py-3">
                <h2 className="font-serif text-sm uppercase tracking-[0.18em] text-[#e2c98e]">Layout notes</h2>
                <button type="button" onClick={() => setListOpen(false)} aria-label="Close notes" className="text-stone-400 hover:text-stone-200">
                  <X className="h-4 w-4" />
                </button>
              </header>
              <ol className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
                {notes.length === 0 && <li className="text-sm text-stone-500">No notes yet. Drag a box on the screen to add one.</li>}
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className={cn(
                      "flex flex-col gap-1.5 rounded-sm border p-3",
                      n.status === "done" ? "border-[#3d3428] opacity-60" : "border-[#7a5f33] bg-[#15110c]",
                    )}
                  >
                    <p className="text-sm leading-relaxed text-stone-200">{n.comment}</p>
                    <p className="text-[11px] text-stone-500">
                      {n.path} · {n.view} · {n.viewport.w}×{n.viewport.h} · {new Date(n.createdAt).toLocaleString()}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void setStatus(n.id, n.status === "done" ? "open" : "done")}
                        className="flex items-center gap-1 rounded-sm border border-[#3d3428] px-2 py-0.5 text-[11px] text-stone-300 hover:border-[#c9a868]"
                      >
                        {n.status === "done" ? <RotateCcw className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                        {n.status === "done" ? "Reopen" : "Mark done"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(n.id)}
                        className="flex items-center gap-1 rounded-sm border border-[#3d3428] px-2 py-0.5 text-[11px] text-stone-400 hover:border-[#e0651a] hover:text-[#e0651a]"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            </aside>
          )}
        </>
      )}
    </div>
  )
}
