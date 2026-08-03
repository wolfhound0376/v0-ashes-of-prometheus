"use client"

// ============================================================================
// DM NARRATION — Malachar's voice, on a toggle.
//
// The lich voice already existed: /api/tts speaks through the custom
// ElevenLabs voice NiQt0cwFeLsVf6cAmcCp. What was missing was anything that
// STARTED it in the V4 dashboard. The only per-line speaker buttons lived in
// the v3 left column, which V4 keeps mounted at `display: none` — so the
// buttons were in the DOM but unreachable, and the status bar's "Mute
// Malachar voice" was muting something that never played.
//
// This is the switch. On, and every new Malachar line is spoken as it lands.
// Off, and the table reads.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"
import { sanitizeForTTS } from "@/lib/tts"

const DM_SPEAKER = "Malachar"
const STORAGE_KEY = "dm-narration-enabled"

// A valid zero-sample WAV. Played inside the toggle's click handler so the
// document counts as user-activated for audio before any narration arrives —
// otherwise the FIRST spoken line can land outside a gesture and get blocked.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="

type Line = { id?: string; speaker: string; text: string; pending?: boolean }

export function DmNarration({ dialogue, className }: { dialogue: Line[]; className?: string }) {
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState<"idle" | "loading" | "speaking" | "blocked">("idle")

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const queueRef = useRef<string[]>([])
  const drainingRef = useRef(false)
  // Keyed by the SANITISED TEXT, not the row id. The dashboard inserts an
  // optimistic entry with a temp id and then merges the real Supabase row over
  // it — same words, different id. Keying on id would speak every line twice.
  const spokenRef = useRef<Set<string>>(new Set())
  const enabledRef = useRef(false)
  // False until the first feed snapshot has been taken with narration on. Stops
  // the existing transcript being read out when the toggle is restored from
  // localStorage on page load.
  const primedRef = useRef(false)
  const hydratedRef = useRef(false)

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ""
      audioRef.current = null
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  // Speak one line, start to finish. Resolves when the audio ends (or fails),
  // so the drain loop below never overlaps two lines.
  const speak = useCallback(async (text: string) => {
    setStatus("loading")
    let res: Response
    try {
      res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "onyx" }),
      })
    } catch (err) {
      console.log("[v0] DM narration fetch error:", err)
      setStatus("idle")
      return
    }
    if (!res.ok) {
      console.log("[v0] DM narration TTS failed:", res.status)
      setStatus("idle")
      return
    }
    // The toggle may have been switched off while the audio was downloading.
    if (!enabledRef.current) { setStatus("idle"); return }

    const url = URL.createObjectURL(await res.blob())
    objectUrlRef.current = url
    const audio = new Audio(url)
    audioRef.current = audio

    await new Promise<void>((resolve) => {
      const done = () => {
        if (objectUrlRef.current === url) { URL.revokeObjectURL(url); objectUrlRef.current = null }
        if (audioRef.current === audio) audioRef.current = null
        resolve()
      }
      audio.onended = done
      audio.onerror = done
      setStatus("speaking")
      audio.play().catch((err) => {
        // Autoplay policy. The toggle click is a user gesture so this is rare,
        // but say so plainly rather than sitting there mute.
        console.log("[v0] DM narration play() blocked:", err?.message)
        setStatus("blocked")
        done()
      })
    })
    if (enabledRef.current) setStatus("idle")
  }, [])

  const drain = useCallback(async () => {
    if (drainingRef.current) return
    drainingRef.current = true
    while (enabledRef.current && queueRef.current.length) {
      const next = queueRef.current.shift()
      if (next) await speak(next)
    }
    drainingRef.current = false
    if (!enabledRef.current) setStatus("idle")
  }, [speak])

  // Restore the saved preference after mount, so SSR and the first client
  // render agree (localStorage during render is a hydration mismatch).
  useEffect(() => {
    setEnabled(localStorage.getItem(STORAGE_KEY) === "true")
    hydratedRef.current = true
  }, [])

  // Persist it — but only once the value above has been read back, or the
  // initial `false` would overwrite a saved `true` before restore runs.
  useEffect(() => {
    if (!hydratedRef.current) return
    localStorage.setItem(STORAGE_KEY, String(enabled))
  }, [enabled])

  useEffect(() => {
    enabledRef.current = enabled
    if (!enabled) {
      queueRef.current = []
      stopAudio()
      setStatus("idle")
    }
  }, [enabled, stopAudio])

  useEffect(() => stopAudio, [stopAudio])

  // Watch the feed and speak what is genuinely NEW.
  //
  // The hard part here is telling a fresh narration beat apart from a bulk
  // load. The dialogue feed arrives asynchronously and is refetched on
  // reconnect, so a naive "speak anything I have not heard" reads the whole
  // session aloud the moment the page is refreshed with the toggle already on.
  //
  // Malachar narrates ONE line per turn. Any change that brings in more than
  // one unheard line is therefore a load, not a beat: mark it heard, say
  // nothing. That single rule covers first paint, refetch, reconnect and
  // switching the toggle on mid-session.
  useEffect(() => {
    const dmLines = dialogue
      .filter((entry) => entry.speaker === DM_SPEAKER)
      .map((entry) => sanitizeForTTS(entry.text))
      .filter(Boolean)

    if (!enabled) {
      // Off: everything on screen counts as heard, so switching on later does
      // not read the backlog.
      spokenRef.current = new Set(dmLines)
      primedRef.current = false
      return
    }

    const unheard = dmLines.filter((line) => !spokenRef.current.has(line))
    // Whatever happens, none of these get spoken twice.
    for (const line of dmLines) spokenRef.current.add(line)

    if (!primedRef.current) {
      // First pass with narration on — this is the existing transcript.
      primedRef.current = true
      return
    }
    if (unheard.length !== 1) {
      if (unheard.length > 1) console.log("[v0] DM narration: bulk load of", unheard.length, "lines — not speaking")
      return
    }

    queueRef.current.push(unheard[0])
    void drain()
  }, [dialogue, enabled, drain])

  const label = !enabled
    ? "DM Voice off — click to hear Malachar narrate"
    : status === "loading" ? "DM Voice — fetching Malachar's voice…"
    : status === "speaking" ? "DM Voice — Malachar is speaking, click to silence him"
    : status === "blocked" ? "DM Voice — your browser blocked the audio, click off and on again"
    : "DM Voice on — Malachar will speak each new line"

  const toggle = () => {
    setEnabled((wasEnabled) => {
      if (!wasEnabled) {
        // Unlock audio while we still have the click. Failure is harmless —
        // it only means the first line may need a second try.
        void new Audio(SILENT_WAV).play().catch(() => {})
        setStatus("idle")
      }
      return !wasEnabled
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={enabled}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[9px] transition-colors",
        enabled
          ? "border border-[#a88745] bg-[#241a08] text-[#ead39e]"
          : "border border-[#4b3a19] text-[#8f8061] hover:border-[#8a6f3c] hover:text-[#cdb276]",
        className,
      )}
    >
      {status === "loading" ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
        : enabled ? <Volume2 className={cn("h-2.5 w-2.5", status === "speaking" && "animate-pulse")} />
        : <VolumeX className="h-2.5 w-2.5" />}
      DM Voice
    </button>
  )
}
