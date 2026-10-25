"use client"

// The settings sheet — a small dark panel that slides up over whatever page opened it.
//
// Two switches only (lib/settings.ts): Cinematics and Intro music. Sam, 2026-10-24: "I also should
// be able to have an option to not have cinematics or intro scores." Both are remembered on this
// device; the choice holds across the title screen, the opening and the dashboard.
//
// The gear that opens it (SettingsGear) sits bottom-right on the pre-game pages. The sheet is plain
// markup rather than the shadcn Dialog so it carries the game's own look — gold rule, small caps,
// carved toggles — with nothing to theme twice.

import { useEffect, useState } from "react"
import { Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { readSettings, writeSettings, onSettingsChange, type PlayerSettings } from "@/lib/settings"
import { setMusicOff } from "@/lib/audio-prefs"

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-7 w-14 shrink-0 rounded-full border transition-colors duration-300",
        on ? "border-[#c9a868] bg-gradient-to-r from-[#5a4320] to-[#8a6a3a] shadow-[0_0_18px_rgba(201,168,104,0.35)]" : "border-[#3d3428] bg-[#0f0c09]",
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] h-5 w-5 rounded-full border transition-all duration-300",
          on ? "left-[31px] border-[#f0dba8] bg-gradient-to-b from-[#f4e2b0] to-[#c9a868]" : "left-[3px] border-[#5a4a3a] bg-gradient-to-b from-[#3d3428] to-[#1a1512]",
        )}
      />
      <span className={cn("absolute inset-y-0 text-[9px] font-semibold uppercase tracking-[0.2em] leading-7", on ? "left-2.5 text-[#1a1208]" : "right-2 text-stone-600")}>
        {on ? "On" : "Off"}
      </span>
    </button>
  )
}

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [s, setS] = useState<PlayerSettings>({ cinematics: true, introMusic: true })

  useEffect(() => {
    setS(readSettings())
    return onSettingsChange(() => setS(readSettings()))
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const set = (patch: Partial<PlayerSettings>) => {
    const next = writeSettings(patch)
    // Turning the intro score back on should also lift the older global mute, or the switch would
    // read "On" and nothing would play.
    if (patch.introMusic === true) setMusicOff(false)
    setS(next)
  }

  return (
    <div
      aria-hidden={!open}
      className={cn("fixed inset-0 z-[60] flex items-end justify-center transition-opacity duration-300 sm:items-center", open ? "opacity-100" : "pointer-events-none opacity-0")}
    >
      <button type="button" aria-label="Close settings" onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className={cn(
          "relative w-full max-w-md rounded-t-md border border-[#7a5f33]/70 bg-gradient-to-b from-[#15110c] via-[#100d09] to-[#0b0907] p-6 shadow-[0_-10px_60px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(212,177,90,0.16)] transition-transform duration-300 sm:rounded-md",
          open ? "translate-y-0" : "translate-y-6",
        )}
      >
        <div className="mb-5 text-center">
          <div className="text-[10px] uppercase tracking-[0.45em] text-[#8a6a3a]">Settings</div>
          <div className="mx-auto mt-2 h-px w-24 bg-gradient-to-r from-transparent via-[#c9a868]/70 to-transparent" />
        </div>

        <div className="divide-y divide-[#2a241e]">
          <div className="flex items-start justify-between gap-4 py-4">
            <div>
              <div className="font-serif text-[15px] tracking-[0.08em] text-[#e8d9ae]">Cinematics</div>
              <p className="mt-1 text-[12px] leading-relaxed text-stone-500">Opening films and entrance scenes. Off means you see a still and a line of text instead.</p>
            </div>
            <Toggle on={s.cinematics} onChange={(v) => set({ cinematics: v })} label="Cinematics" />
          </div>
          <div className="flex items-start justify-between gap-4 py-4">
            <div>
              <div className="font-serif text-[15px] tracking-[0.08em] text-[#e8d9ae]">Intro music</div>
              <p className="mt-1 text-[12px] leading-relaxed text-stone-500">Title and opening scores. Game sound effects are not affected.</p>
            </div>
            <Toggle on={s.introMusic} onChange={(v) => set({ introMusic: v })} label="Intro music" />
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-sm border border-[#c9a868]/60 bg-gradient-to-b from-[#1d1710] to-[#120e0a] py-2.5 font-serif text-[12px] uppercase tracking-[0.3em] text-[#d9bd7e] transition-colors hover:border-[#c9a868] hover:text-[#f0dba8]"
        >
          Done
        </button>
        <p className="mt-3 text-center text-[10px] text-stone-700">Remembered on this device.</p>
      </div>
    </div>
  )
}

/** The gear. Bottom-right, out of the way, same size as the music toggle it keeps company with. */
export function SettingsGear({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Settings"
      aria-label="Open settings"
      className={cn(
        "fixed bottom-4 right-4 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-[#8a6a3a]/60 bg-gradient-to-b from-[#1a1614] to-[#0f0d0b] text-[#c4a777] shadow-lg shadow-black/40 transition-all hover:rotate-45 hover:border-[#c4a777] hover:text-[#e8c56a]",
        className,
      )}
    >
      <Settings className="h-4 w-4" />
    </button>
  )
}
