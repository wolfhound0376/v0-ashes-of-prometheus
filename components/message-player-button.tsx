"use client"

// MESSAGE A PLAYER (Sam, 2026-10-26: "the dashboard UI should have a way (button) to communicate with another
// player. This button should also be present on the pixel dashboard.")
//
// One self-contained button for both places: the dashboard's top bar (variant "gold") and the pixel map's header
// (variant "pixel"). It works out who this browser is from its seat (localStorage `aop_character_id` →
// /api/table), lists the OTHER players seated at the live table, and opens a private thread with whichever one
// you pick. Messages are `dialogue` rows on channel 'direct' (lib/direct-messages.ts) — they never reach
// Malachar, the DM transcript, the party pane or the map's speech bubbles, because every one of those readers
// filters to channel 'dm' or 'party'.
//
// No seat (the DM, a spectator, the staging table) → no button. Messages are SAID ALOUD TO THE TABLE (Sam,
// 2026-10-26: "This should display with everyone. No voice heard."): every seated player sees a bubble under the
// button for every message (sender → recipient, the line; tap to open that thread) and hears it in the sender's
// own ElevenLabs voice. On the dashboard (variant "gold") this button plays the voice; on the pixel map the walk
// itself draws the bubble over the sender's sprite and voices it (/api/map-dialogue carries 'direct' rows), so
// the button there stays silent and nobody hears a line twice. The addressee also gets the unread count + chime.
//
// The thread view lists only the conversation between you and the player you picked; the table hears all of it.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { ArrowLeft, Mail, SendHorizontal, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { uiChime, uiLatch } from "@/lib/ui-tick"
import { cn } from "@/lib/utils"
import {
  cleanMessage, contactsFor, directRow, DIRECT_CHANNEL, isForMe, MAX_MESSAGE, threadOf, totalUnread, unreadBySender,
  type Contact, type DirectRow, type SeatLike,
} from "@/lib/direct-messages"

const SEAT_POLL_MS = 15000
/** How long an arrival bubble stays up before it fades on its own. */
const BUBBLE_MS = 9000
const READ_KEY = "aop_dm_last_read"

type Variant = "gold" | "pixel"

// The sender's saved hero voice, through the same route the map uses (/api/npc-tts resolves a hero by name).
// WebAudio rather than <audio>: the game found <audio> silently mute in some Chromium builds. Lines play one at a time.
let voiceCtx: AudioContext | null = null
let voiceQueue: Promise<void> = Promise.resolve()
function sayAloud(speaker: string, text: string) {
  voiceQueue = voiceQueue.then(async () => {
    try {
      const res = await fetch("/api/npc-tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, npcName: speaker }) })
      if (!res.ok) throw new Error(`tts ${res.status}`)
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      voiceCtx = voiceCtx ?? new AC()
      if (voiceCtx.state !== "running") await Promise.race([voiceCtx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 1500))])
      const buf = await voiceCtx.decodeAudioData(await res.arrayBuffer())
      const src = voiceCtx.createBufferSource()
      src.buffer = buf
      src.connect(voiceCtx.destination)
      await new Promise<void>((done) => { src.onended = () => done(); src.start() })
    } catch (err) {
      console.warn("[MessagePlayer] voice unavailable:", speaker, err)
    }
  })
}

function readLastRead(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(READ_KEY) || "{}") || {} } catch { return {} }
}
function writeLastRead(v: Record<string, string>) {
  try { localStorage.setItem(READ_KEY, JSON.stringify(v)) } catch { /* storage blocked */ }
}

export function MessagePlayerButton({ variant = "gold", align = "right", className }: { variant?: Variant; align?: "left" | "right"; className?: string }) {
  const pixel = variant === "pixel"
  const voiced = !pixel
  const supabaseRef = useRef(createClient())
  const instanceId = useId()
  const [me, setMe] = useState<{ id: string; name: string } | null>(null)
  const [seats, setSeats] = useState<SeatLike[]>([])
  const [rows, setRows] = useState<DirectRow[]>([])
  const [open, setOpen] = useState(false)
  const [withName, setWithName] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [lastRead, setLastRead] = useState<Record<string, string>>({})
  const [bubble, setBubble] = useState<DirectRow | null>(null)
  const bubbleTimer = useRef<number | null>(null)
  // The realtime handler is created once per hero; it reads what is on screen through refs.
  const viewingRef = useRef<{ open: boolean; withName: string | null }>({ open: false, withName: null })
  viewingRef.current = { open, withName }
  const endRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  // Who am I, and who else is at the table. Re-read so a player who sits down or is stepped away shows up.
  useEffect(() => {
    let live = true
    setLastRead(readLastRead())
    const read = async () => {
      let id = ""
      try { id = localStorage.getItem("aop_character_id") ?? "" } catch { /* storage blocked */ }
      if (!id) { if (live) setMe(null); return }
      try {
        const r = await fetch(`/api/table?characterId=${encodeURIComponent(id)}`, { cache: "no-store" })
        const j = await r.json()
        if (!live || j.error) return
        setMe(j.mine && !j.mine.dm ? { id: j.mine.id, name: String(j.mine.name ?? "").trim() } : null)
        setSeats(Array.isArray(j.seats) ? j.seats : [])
      } catch { /* a blip: keep what we had */ }
    }
    read()
    const t = window.setInterval(read, SEAT_POLL_MS)
    return () => { live = false; window.clearInterval(t) }
  }, [])

  // My messages, both directions, plus live arrivals.
  useEffect(() => {
    if (!me?.name) return
    const supabase = supabaseRef.current
    let cancelled = false
    const name = me.name
    ;(async () => {
      const { data, error } = await supabase
        .from("dialogue")
        .select("id, speaker, recipient, text, created_at")
        .eq("channel", DIRECT_CHANNEL)
        .order("created_at", { ascending: false })
        .limit(200)
      if (cancelled) return
      if (error) { setNotice("Messages are not switched on yet."); return }
      setRows(((data ?? []) as DirectRow[]).reverse())
    })()

    let channel: ReturnType<typeof supabase.channel> | null = null
    try {
      channel = supabase
        .channel(`direct-${instanceId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "dialogue", filter: `channel=eq.${DIRECT_CHANNEL}` },
          (payload: { new: Record<string, any> }) => {
            const r = payload.new as DirectRow
            const fromMe = r.speaker?.trim().toLowerCase() === name.toLowerCase()
            setRows((prev) => {
              if (prev.some((x) => x.id === r.id)) return prev
              const pending = prev.findIndex((x) => x.id.startsWith("dm-optimistic-") && x.speaker === r.speaker && x.recipient === r.recipient && x.text === r.text)
              if (pending !== -1) { const next = prev.slice(); next[pending] = r; return next }
              return [...prev, r]
            })
            // Said aloud to the table: everyone hears it in the sender's voice (on the map, the walk says it).
            if (voiced) sayAloud(r.speaker, r.text)
            if (isForMe(r, name)) uiChime()
            if (!fromMe) {
              const v = viewingRef.current
              const reading = v.open && v.withName?.trim().toLowerCase() === r.speaker?.trim().toLowerCase()
              if (!reading) {
                setBubble(r)
                if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current)
                bubbleTimer.current = window.setTimeout(() => setBubble(null), BUBBLE_MS)
              }
            }
          })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "dialogue" },
          (payload: { old: Record<string, any> }) => {
            const gone = payload.old?.id
            if (typeof gone === "string") setRows((prev) => prev.filter((x) => x.id !== gone))
          })
        .subscribe()
    } catch (err) {
      console.error("[MessagePlayer] realtime subscribe failed:", err)
    }
    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
      if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current)
    }
  }, [me?.name, instanceId, voiced])

  const contacts: Contact[] = useMemo(() => contactsFor(seats, me?.id), [seats, me?.id])
  const unread = useMemo(() => (me ? unreadBySender(rows, me.name, lastRead) : {}), [rows, me, lastRead])
  const total = totalUnread(unread)
  const thread = useMemo(() => (me && withName ? threadOf(rows, me.name, withName) : []), [rows, me, withName])

  const markRead = useCallback((name: string) => {
    setLastRead((prev) => {
      const next = { ...prev, [name.trim().toLowerCase()]: new Date().toISOString() }
      writeLastRead(next)
      return next
    })
  }, [])

  // An open thread stays read as lines arrive in it.
  useEffect(() => {
    if (open && withName) markRead(withName)
    endRef.current?.scrollIntoView({ block: "end" })
  }, [open, withName, thread.length, markRead])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("pointerdown", down)
    window.addEventListener("keydown", key)
    return () => { window.removeEventListener("pointerdown", down); window.removeEventListener("keydown", key) }
  }, [open])

  const send = async () => {
    if (!me || !withName) return
    const text = cleanMessage(draft)
    if (!text) return
    setDraft("")
    const optimistic: DirectRow = { id: `dm-optimistic-${Date.now()}-${Math.random()}`, speaker: me.name, recipient: withName, text, created_at: new Date().toISOString() }
    setRows((prev) => [...prev, optimistic])
    const { error } = await supabaseRef.current.from("dialogue").insert(directRow(me.name, withName, text))
    if (error) {
      console.error("[MessagePlayer] send failed:", error)
      setRows((prev) => prev.filter((x) => x.id !== optimistic.id))
      setDraft(text)
      setNotice("That message did not go through. Try again.")
    } else setNotice(null)
  }

  if (!me) return null

  const s = pixel ? PIXEL : GOLD
  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <button
        type="button"
        data-no-tick
        onPointerDown={(e) => { if (e.button === 0) uiLatch() }}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={total ? `Message a player — ${total} unread` : "Message a player"}
        title="Message a player"
        className={s.button}
      >
        <Mail className="h-3.5 w-3.5" aria-hidden />
        <span>Message</span>
        {total > 0 && <span className={s.badge}>{total > 9 ? "9+" : total}</span>}
      </button>

      {bubble && !open && (
        <button
          type="button"
          role="status"
          aria-live="polite"
          onClick={() => { uiLatch(); setWithName(bubble.speaker.trim()); setOpen(true); setBubble(null) }}
          className={cn(s.pop, align === "right" ? "right-0" : "left-0")}
        >
          <span className={s.popFrom}>{bubble.speaker} <span className="opacity-60">→ {me && isForMe(bubble, me.name) ? "you" : bubble.recipient}</span></span>
          <span className={s.popText}>{bubble.text}</span>
          <span className={s.popHint}>{me && isForMe(bubble, me.name) ? "Tap to reply" : `Tap to message ${bubble.speaker}`}</span>
        </button>
      )}

      {open && (
        <div role="dialog" aria-label="Message a player" className={cn(s.panel, align === "right" ? "right-0" : "left-0")}>
          <div className={s.head}>
            {withName ? (
              <button type="button" onClick={() => setWithName(null)} className={s.iconBtn} aria-label="Back to players">
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <span className="flex-1 truncate">{withName ? withName : "Message a player"}</span>
            <button type="button" onClick={() => setOpen(false)} className={s.iconBtn} aria-label="Close">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {!withName ? (
            <div className="max-h-72 overflow-y-auto p-1.5">
              {contacts.length === 0 ? (
                <p className={s.empty}>No one else is seated at the table.</p>
              ) : (
                contacts.map((c) => {
                  const n = unread[c.name.toLowerCase()] ?? 0
                  return (
                    <button key={c.id} type="button" onClick={() => { uiLatch(); setWithName(c.name) }} className={s.contact}>
                      {c.thumbnail
                        ? <img src={c.thumbnail} alt="" className={s.avatar} />
                        : <span className={cn(s.avatar, "grid place-items-center text-[11px]")}>{c.name.slice(0, 1)}</span>}
                      <span className="flex-1 truncate text-left">{c.name}</span>
                      {n > 0 && <span className={s.badgeInline}>{n}</span>}
                    </button>
                  )
                })
              )}
            </div>
          ) : (
            <>
              <div className="max-h-64 min-h-24 space-y-1.5 overflow-y-auto px-3 py-2">
                {thread.length === 0 ? (
                  <p className={s.empty}>Said aloud — the whole table sees and hears it.</p>
                ) : (
                  thread.map((m) => {
                    const fromMe = m.speaker.trim().toLowerCase() === me.name.toLowerCase()
                    return (
                      <div key={m.id} className={cn("flex", fromMe ? "justify-end" : "justify-start")}>
                        <span className={fromMe ? s.bubbleMine : s.bubbleTheirs}>{m.text}</span>
                      </div>
                    )
                  })
                )}
                <div ref={endRef} />
              </div>
              <div className="p-2">
                <div className={s.composer}>
                  <input
                    type="text"
                    value={draft}
                    maxLength={MAX_MESSAGE}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation() // the map listens for keys to walk; typing must never move the hero
                      if (e.key !== "Enter" || e.nativeEvent.isComposing) return
                      void send()
                    }}
                    placeholder={`To ${withName}…`}
                    className={s.input}
                  />
                  <button type="button" onClick={() => void send()} aria-label="Send message" className={s.iconBtn}>
                    <SendHorizontal className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
          {notice && <p className={s.notice}>{notice}</p>}
        </div>
      )}
    </div>
  )
}

// The dashboard's struck-gold look.
const GOLD = {
  button: "relative inline-flex items-center gap-1.5 rounded-[3px] border border-[#7a5f33]/60 bg-[#120e0a] px-3 py-1.5 text-xs text-[#e0cfa0] transition-colors hover:border-[#c9a868] hover:bg-[#1f1710] hover:text-[#f3dc9c] hover:shadow-[0_0_12px_rgba(201,168,104,0.35)]",
  badge: "absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#c9563f] px-1 text-[9px] font-semibold text-white shadow-[0_0_8px_rgba(201,86,63,0.7)]",
  badgeInline: "grid h-4 min-w-4 place-items-center rounded-full bg-[#c9563f] px-1 text-[9px] font-semibold text-white",
  panel: "absolute top-full z-50 mt-2 w-80 overflow-hidden rounded-[4px] border border-[#7a5f33]/70 bg-[#0d0a07]/97 text-stone-200 shadow-[0_12px_40px_rgba(0,0,0,0.7)] backdrop-blur",
  head: "flex items-center gap-2 border-b border-[#3d3428] px-3 py-2 font-serif text-[11px] uppercase tracking-[0.18em] text-[#c4a777]",
  iconBtn: "rounded-sm p-1 text-[#c9a868] transition-colors hover:bg-[#241a10] hover:text-[#f0cd7a]",
  contact: "flex w-full items-center gap-2.5 rounded-[3px] px-2 py-1.5 text-[13px] text-stone-200 transition-colors hover:bg-[#1f1710]",
  avatar: "h-7 w-7 shrink-0 rounded-full border border-[#7a5f33]/60 bg-[#1a1410] object-cover text-[#c4a777]",
  empty: "px-2 py-3 text-[11px] italic text-stone-500",
  bubbleMine: "max-w-[85%] rounded-[6px] rounded-br-none bg-[#2a1d10] px-2.5 py-1.5 text-[13px] text-[#f0e2bd]",
  bubbleTheirs: "max-w-[85%] rounded-[6px] rounded-bl-none border border-[#3d3428] bg-[#15110c] px-2.5 py-1.5 text-[13px] text-stone-200",
  composer: "flex items-center gap-2 rounded-[3px] border border-[#7a5f33]/50 bg-[#0a0908] p-1",
  input: "flex-1 bg-transparent px-2 py-1 text-[13px] text-stone-200 placeholder:text-stone-600 focus:outline-none",
  notice: "border-t border-[#3d3428] px-3 py-1.5 text-[11px] text-[#e8a38f]",
  pop: "absolute top-full z-50 mt-2 flex w-72 flex-col gap-0.5 rounded-[6px] rounded-tr-none border border-[#c9a868]/80 bg-[#15100a]/97 px-3 py-2 text-left shadow-[0_0_18px_rgba(201,168,104,0.35),0_12px_32px_rgba(0,0,0,0.7)] backdrop-blur animate-in fade-in slide-in-from-top-1",
  popFrom: "font-serif text-[10px] uppercase tracking-[0.18em] text-[#c9a868]",
  popText: "line-clamp-3 text-[13px] text-[#f0e2bd]",
  popHint: "text-[10px] italic text-stone-500",
}

// The pixel map's look: square corners, hard 2px borders, a stepped drop shadow and a monospace face.
const PIXEL = {
  button: "relative inline-flex items-center gap-1.5 border-2 border-black bg-[#2a1606] px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[#f4d77a] shadow-[inset_0_0_0_1px_#c9a23a,2px_2px_0_0_#000] [image-rendering:pixelated] hover:bg-[#3a1f08] hover:text-[#fff3cf] active:translate-x-px active:translate-y-px",
  badge: "absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center border-2 border-black bg-[#8b3dff] px-0.5 font-mono text-[9px] font-bold text-white",
  badgeInline: "grid h-4 min-w-4 place-items-center border-2 border-black bg-[#8b3dff] px-0.5 font-mono text-[9px] font-bold text-white",
  panel: "absolute top-full z-50 mt-2 w-80 border-2 border-black bg-[#120a04] font-mono text-[#f4e7c4] shadow-[inset_0_0_0_2px_#c9a23a,4px_4px_0_0_#000]",
  head: "flex items-center gap-2 border-b-2 border-[#c9a23a] bg-[#2a1606] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#f4d77a]",
  iconBtn: "p-1 text-[#f4d77a] hover:bg-[#3a1f08] hover:text-[#fff3cf]",
  contact: "flex w-full items-center gap-2.5 px-2 py-1.5 text-[12px] text-[#f4e7c4] hover:bg-[#2a1606] hover:shadow-[inset_0_0_0_1px_#c9a23a]",
  avatar: "h-7 w-7 shrink-0 border-2 border-black bg-[#2a1606] object-cover text-[#f4d77a] [image-rendering:pixelated]",
  empty: "px-2 py-3 text-[11px] text-[#a8936a]",
  bubbleMine: "max-w-[85%] border-2 border-black bg-[#3d2509] px-2 py-1 text-[12px] text-[#fff3cf] shadow-[2px_2px_0_0_#000]",
  bubbleTheirs: "max-w-[85%] border-2 border-black bg-[#1d1440] px-2 py-1 text-[12px] text-[#e9defc] shadow-[2px_2px_0_0_#000]",
  composer: "flex items-center gap-2 border-2 border-black bg-[#0a0603] p-1 shadow-[inset_0_0_0_1px_#7a5418]",
  input: "flex-1 bg-transparent px-2 py-1 text-[12px] text-[#f4e7c4] placeholder:text-[#7a6a4a] focus:outline-none",
  notice: "border-t-2 border-[#c9a23a] px-3 py-1.5 text-[11px] text-[#ff9a7a]",
  pop: "absolute top-full z-50 mt-2 flex w-72 flex-col gap-0.5 border-2 border-black bg-[#1d1440] px-3 py-2 text-left font-mono shadow-[inset_0_0_0_2px_#8b3dff,4px_4px_0_0_#000] [image-rendering:pixelated]",
  popFrom: "text-[10px] font-bold uppercase tracking-[0.14em] text-[#f4d77a]",
  popText: "line-clamp-3 text-[12px] text-[#e9defc]",
  popHint: "text-[10px] text-[#a8936a]",
}
