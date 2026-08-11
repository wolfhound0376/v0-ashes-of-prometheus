"use client"

// Shared building blocks for the DM asset panel.
//
// MediaSlot renders whatever is at a URL — a still through <img>, a loop through
// a muted autoplaying <video> — and exposes a clear button only when something is
// actually set. MediaDrop takes an image or a video; the two used to be separate
// because nothing outside NPC faces could hold a clip.

import { useRef, useState } from "react"
import { Loader2, Trash2 } from "lucide-react"
import { MEDIA_ACCEPT, isVideoUrl } from "@/lib/media-url"

export function MediaSlot({
  label,
  src,
  busy = false,
  highlight = false,
  className = "h-16",
  onClear,
}: {
  label: string
  src: string | null | undefined
  busy?: boolean
  highlight?: boolean
  className?: string
  onClear?: () => void
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <div
        className={`relative flex w-full items-center justify-center overflow-hidden rounded-sm border bg-[#0a0908] ${
          highlight ? "border-[#c4a777]/50" : "border-[#3d3428]/60"
        } ${className}`}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin text-[#c4a777]" />
        ) : src ? (
          <>
            {isVideoUrl(src) ? (
              <video src={src} muted loop autoPlay playsInline className="h-full w-full object-cover object-top" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={`${label} preview`} className="h-full w-full object-cover object-top" />
            )}
            {isVideoUrl(src) && (
              <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/75 px-1 text-[8px] uppercase tracking-wider text-[#c4a777]">
                loop
              </span>
            )}
            {onClear && (
              <button
                onClick={onClear}
                aria-label={`Clear ${label}`}
                title={`Clear ${label}`}
                className="absolute right-0.5 top-0.5 rounded bg-black/80 p-1 text-stone-400 opacity-80 transition-opacity hover:text-red-400 hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </>
        ) : (
          <span className="text-[10px] text-stone-600">none</span>
        )}
      </div>
      <span className="truncate text-[9px] uppercase tracking-wider text-stone-500">{label}</span>
    </div>
  )
}

export function MediaDrop({
  label,
  hint = "Image or MP4",
  accept = MEDIA_ACCEPT,
  onFile,
}: {
  label: string
  hint?: string
  accept?: string
  onFile: (file: File) => void
}) {
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
      className={`cursor-pointer rounded-sm border-2 border-dashed px-2 py-2 text-center text-[10px] leading-snug transition-colors ${
        dragOver
          ? "border-[#c4a777] bg-[#c4a777]/10 text-[#e8dcc4]"
          : "border-[#3d3428]/70 text-stone-500 hover:border-[#c4a777]/60"
      }`}
    >
      Set {label}
      <span className="block text-[9px] text-stone-600">{hint}</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
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

/** Shared confirm sheet for clearing a reference. */
export function ClearConfirm({
  what,
  where,
  onCancel,
  onConfirm,
}: {
  what: string
  where: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-lg border border-[#3d3428] bg-[#1a1614] p-5 shadow-2xl">
        <h3 className="mb-2 font-serif text-lg text-red-400">Clear {what}?</h3>
        <p className="mb-4 text-sm text-stone-300">
          This removes the {what} reference from <span className="text-[#d4b15a]">{where}</span>.
        </p>
        <p className="mb-5 text-xs text-stone-500">
          The file itself is kept in storage, so this is reversible by re-uploading.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded border border-[#3d3428] bg-[#2a2520] px-4 py-2 text-sm text-stone-400 hover:border-stone-500 hover:text-stone-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded border border-red-500/50 bg-red-500/20 px-4 py-2 text-sm text-red-400 hover:bg-red-500/30"
          >
            Clear it
          </button>
        </div>
      </div>
    </div>
  )
}
