"use client"

// Bottom status strip from the v3.0 design: save state on the left, campaign
// export on the right. "Last saved" ticks live off the timestamp of the most
// recent successful save.

import { useEffect, useState, type ReactNode } from "react"
import { Cloud, Download, Loader2, Skull } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatusBarProps {
  lastSavedAt: number | null
  autoSave: boolean
  onToggleAutoSave?: () => void
  dmMode: boolean
  onToggleDmMode?: () => void
  onExport?: () => void
  exporting?: boolean
  /** Docked into the middle of the bar. The ambient-music and TTS controls
   *  live here: as free-floating fixed-position widgets they landed on top of
   *  Export Campaign, and every other screen edge is already occupied by a
   *  column. The bar's centre is the one place on the dashboard that is free. */
  centerSlot?: ReactNode
}

function relativeTime(ts: number | null, now: number): string {
  if (!ts) return "not yet"
  const secs = Math.max(0, Math.round((now - ts) / 1000))
  if (secs < 10) return "just now"
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  return `${hrs}h ago`
}

export function StatusBar({
  lastSavedAt,
  autoSave,
  onToggleAutoSave,
  dmMode,
  onToggleDmMode,
  onExport,
  exporting = false,
  centerSlot,
}: StatusBarProps) {
  // Re-render every 20s so the "2m ago" label stays honest.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000)
    return () => clearInterval(t)
  }, [])

  return (
    <footer className="flex items-center justify-between gap-3 border-t border-[#7a5f33]/50 bg-gradient-to-b from-[#0b0907] to-[#14100b] px-4 py-1.5 text-[11px]">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-[3px] border border-[#7a5f33]/45 bg-[#120e0a] px-2 py-1 text-stone-400">
          Last Saved: <span className="text-stone-300">{relativeTime(lastSavedAt, now)}</span>
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              lastSavedAt ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" : "bg-stone-600",
            )}
          />
        </span>

        <button
          type="button"
          onClick={onToggleAutoSave}
          className="flex items-center gap-1.5 rounded-[3px] border border-[#7a5f33]/45 bg-[#120e0a] px-2 py-1 text-stone-400 transition-colors hover:border-[#c9a868]/60 hover:text-[#e0cfa0]"
        >
          Auto-Save: <span className={autoSave ? "text-emerald-300" : "text-stone-500"}>{autoSave ? "On" : "Off"}</span>
          <Cloud className="h-3 w-3" />
        </button>

        <button
          type="button"
          onClick={onToggleDmMode}
          className={cn(
            "flex items-center gap-1.5 rounded-[3px] border px-2 py-1 transition-colors",
            dmMode
              ? "border-[#8a5fb0]/60 bg-[#1a1020] text-[#c9a0e8]"
              : "border-[#7a5f33]/45 bg-[#120e0a] text-stone-500 hover:border-[#c9a868]/60 hover:text-[#e0cfa0]",
          )}
        >
          <Skull className="h-3 w-3" />
          DM Mode: <span className="font-medium">{dmMode ? "On" : "Off"}</span>
        </button>
      </div>

      {centerSlot && <div className="flex min-w-0 items-center gap-2">{centerSlot}</div>}

      <button
        type="button"
        onClick={onExport}
        disabled={exporting}
        className="flex items-center gap-1.5 rounded-[3px] border border-[#7a5f33]/60 bg-gradient-to-b from-[#1d1710] to-[#120e0a] px-3 py-1 text-stone-300 transition-colors hover:border-[#c9a868] hover:text-[#e0cfa0] disabled:opacity-60"
      >
        {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
        {exporting ? "Exporting…" : "Export Campaign"}
      </button>
    </footer>
  )
}
