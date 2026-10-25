"use client"

// /forge — THE FORGE. The guided path from "Start New Game" to a hero waiting at the cell door.
//
// Sam, 2026-10-24: "The intro to most players should have a start new game and then route you
// immediately into character creation. Part of character creation should be the creation of your
// pixel sprite, assigning standard rags attire and gestures through pixellab ai, and recording your
// voice for eleven labs use, also taking a few pictures with PC camera … You will be assigned a code
// but will be unable to be seated unless your account is activated by the DM."
//
// Six steps, one bar, no code to get in:
//
//   1 IDENTITY   your name, your hero's name
//   2 BUILD      the Character Forge (2014 rules, same-origin iframe of /forge2014.html — the one
//                place the rules live; nothing here invents a stat)
//   3 LOOK       four chips → one PixelLab figure in rags (drawn in the background, approved by
//                the DM later)
//   4 VOICE      pick a library voice (default) or record a minute of your own
//   5 FACE       three photos from the camera, or skip
//   6 OATH       review, then hand the hero in → your three words, and the wait for the DM
//
// Every step past Build has Skip for now. The draft autosaves on this device, so closing the tab
// loses nothing. Nothing expensive runs before the DM opens the cell: the Forge collects choices
// and raw material (private blobs), activation spends the money (app/api/forge/activate, DM lane).
//
// Malachar does not appear here. He never hints or helps, and help text in a wizard would be him
// helping — so the Forge speaks in its own neutral voice, and he gets one line at the very end.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Camera, Check, ClipboardCopy, Mic, Play, RotateCcw, Square, Volume2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { MusicToggle } from "@/components/music-toggle"
import { HomeButton } from "@/components/home-button"
import { useThemeAudio, fadeOutThemeAudio } from "@/components/theme-audio"
import { LOOK_OPTIONS, describeSprite, type ForgeAssets, type SpriteJob, type VoiceChoice, type FaceChoice, cleanName } from "@/lib/forge-submission"

const DRAFT_KEY = "aop_forge_draft_v1"
const FORGE_STORE_KEY = "aop_forge2014_v1"
const CHARACTER_LS_KEY = "aop_character_id"
const TOKEN_LS_KEY = "aop_claim_token"
const ROLE_LS_KEY = "aop_access_role"

const STEPS = ["Identity", "Build", "Look", "Voice", "Face", "Oath"] as const
type StepName = (typeof STEPS)[number]

interface Draft {
  id: string
  step: number
  playerName: string
  heroName: string
  buildCharId: string | null
  look: { hair: string; skin: string; build: string; mark: string } | null
  sprite: SpriteJob | null
  voice: VoiceChoice | null
  face: FaceChoice | null
  submitted: { code: string; submissionId: string } | null
}

function newDraft(): Draft {
  const id = (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now())).replace(/-/g, "").slice(0, 24)
  return { id, step: 0, playerName: "", heroName: "", buildCharId: null, look: null, sprite: null, voice: null, face: null, submitted: null }
}

function readDraft(): Draft {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return newDraft()
    const d = JSON.parse(raw)
    return d && typeof d === "object" && typeof d.id === "string" ? { ...newDraft(), ...d } : newDraft()
  } catch { return newDraft() }
}

function writeDraft(d: Draft) {
  try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch { /* private mode */ }
}

/** The builder's saved characters, raw. */
function readForgeChars(): any[] {
  try {
    const raw = window.localStorage.getItem(FORGE_STORE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed?.chars) ? parsed.chars : []
  } catch { return [] }
}

export default function ForgePage() {
  const router = useRouter()
  useThemeAudio()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [seatedHere, setSeatedHere] = useState(false)

  useEffect(() => {
    const d = readDraft()
    setDraft(d)
    try {
      const role = window.localStorage.getItem(ROLE_LS_KEY)
      setSeatedHere(role === "dm" || role === "player")
    } catch { /* storage blocked */ }
  }, [])

  const update = useCallback((patch: Partial<Draft>) => {
    setDraft((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      writeDraft(next)
      return next
    })
  }, [])

  const go = useCallback((step: number) => { update({ step: Math.max(0, Math.min(STEPS.length - 1, step)) }); window.scrollTo({ top: 0 }) }, [update])

  if (!draft) return <Shell><div className="py-24 text-center text-[11px] uppercase tracking-[0.4em] text-stone-600">Lighting the forge…</div></Shell>

  if (draft.submitted) {
    return (
      <Shell>
        <Waiting draft={draft} onAnother={() => { const d = newDraft(); writeDraft(d); setDraft(d) }} router={router} />
      </Shell>
    )
  }

  const step = draft.step

  return (
    <Shell>
      {seatedHere && (
        <p className="mb-3 text-center text-[11px] text-stone-600">
          Already seated? The sheet builder is at <a href="/forge/builder" className="text-[#c9a868] hover:underline">/forge/builder</a>, JSON import at <a href="/forge/import" className="text-[#c9a868] hover:underline">/forge/import</a>.
        </p>
      )}
      <StepRail step={step} draft={draft} onJump={(i) => { if (i <= step || canReach(draft, i)) go(i) }} />

      {/* The builder lives for the whole wizard so its export functions stay reachable at the Oath;
          it is only SHOWN on the Build step. */}
      <BuildStep draft={draft} update={update} visible={step === 1} onNext={() => go(2)} onBack={() => go(0)} />

      {step === 0 && <IdentityStep draft={draft} update={update} onNext={() => go(1)} />}
      {step === 2 && <LookStep draft={draft} update={update} onNext={() => go(3)} onBack={() => go(1)} />}
      {step === 3 && <VoiceStep draft={draft} update={update} onNext={() => go(4)} onBack={() => go(2)} />}
      {step === 4 && <FaceStep draft={draft} update={update} onNext={() => go(5)} onBack={() => go(3)} />}
      {step === 5 && <OathStep draft={draft} update={update} onBack={() => go(4)} onJump={go} />}
    </Shell>
  )
}

/** A step is reachable from the rail when everything before it is done (Build must be built). */
function canReach(d: Draft, i: number): boolean {
  if (i >= 1 && !(cleanName(d.playerName) && cleanName(d.heroName))) return false
  if (i >= 2 && !builtChar(d)) return false
  return true
}

function builtChar(d: Draft): any | null {
  if (!d.buildCharId) return null
  const c = readForgeChars().find((x) => x?.id === d.buildCharId)
  return c && c.built ? c : null
}

// ---------------------------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------------------------

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[#0a0908] text-stone-200">
      <MusicToggle />
      <HomeButton />
      <div className="pointer-events-none fixed inset-0 bg-[url('/images/forge-creation-bg.webp')] bg-cover bg-center opacity-40" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_50%_20%,rgba(0,0,0,0.2)_0%,rgba(0,0,0,0.7)_60%,#0a0908_100%)]" />
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6">
        <div className="mb-6 text-center">
          <div className="text-[10px] uppercase tracking-[0.5em] text-[#8a6a3a]">Ashes of Prometheus</div>
          <h1 className="mt-2 font-serif text-3xl tracking-[0.14em] text-[#e8c56a]">The Forge</h1>
        </div>
        {children}
      </div>
    </div>
  )
}

function StepRail({ step, draft, onJump }: { step: number; draft: Draft; onJump: (i: number) => void }) {
  const done = (i: number) => {
    if (i === 0) return Boolean(cleanName(draft.playerName) && cleanName(draft.heroName))
    if (i === 1) return Boolean(builtChar(draft))
    if (i === 2) return Boolean(draft.look)
    if (i === 3) return Boolean(draft.voice)
    if (i === 4) return Boolean(draft.face)
    return false
  }
  const skipped = (i: number) => (i === 3 && draft.voice?.mode === "skip") || (i === 4 && draft.face?.mode === "skip") || (i === 2 && draft.sprite?.status === "deferred" && !draft.look)
  return (
    <ol className="mx-auto mb-8 flex w-full max-w-3xl items-center justify-between gap-1" aria-label="Forge steps">
      {STEPS.map((name, i) => {
        const active = i === step
        const isDone = done(i) && !active
        return (
          <li key={name} className="flex flex-1 items-center last:flex-none">
            <button
              type="button"
              onClick={() => onJump(i)}
              className={cn("group flex flex-col items-center gap-1.5", i > step && !canReach(draft, i) && "cursor-default")}
            >
              <span
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-full border font-serif text-[13px] transition-all",
                  active ? "border-[#e8c56a] bg-gradient-to-b from-[#3a2c14] to-[#1d1710] text-[#f0dba8] shadow-[0_0_24px_rgba(232,197,106,0.45)] scale-110" :
                  isDone ? "border-[#c9a868]/80 bg-[#1a140c] text-[#c9a868]" :
                  skipped(i) ? "border-dashed border-[#5a4a3a] text-stone-500" :
                  "border-[#3d3428] bg-black/40 text-stone-600",
                )}
              >
                {isDone ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={cn("text-[10px] uppercase tracking-[0.25em]", active ? "text-[#e8c56a]" : isDone ? "text-[#c9a868]/80" : "text-stone-600")}>{name}</span>
            </button>
            {i < STEPS.length - 1 && <span className={cn("mx-2 mb-5 h-px flex-1", done(i) ? "bg-gradient-to-r from-[#c9a868]/70 to-[#c9a868]/30" : "bg-[#2a241e]")} />}
          </li>
        )
      })}
    </ol>
  )
}

function Card({ children, wide, className }: { children: React.ReactNode; wide?: boolean; className?: string }) {
  return (
    <section className={cn("relative mx-auto w-full rounded-[3px] border border-[#7a5f33]/70 bg-gradient-to-b from-[#15110c]/95 via-[#100d09]/95 to-[#0b0907]/95 p-6 shadow-[inset_0_0_0_1px_rgba(201,168,104,0.10),inset_0_1px_0_0_rgba(212,177,90,0.16),0_10px_40px_rgba(0,0,0,0.7)] sm:p-8", wide ? "max-w-6xl" : "max-w-3xl", className)}>
      <Bracket className="left-[5px] top-[5px]" />
      <Bracket className="right-[5px] top-[5px] -scale-x-100" />
      <Bracket className="bottom-[5px] left-[5px] -scale-y-100" />
      <Bracket className="bottom-[5px] right-[5px] -scale-100" />
      {children}
    </section>
  )
}

function Bracket({ className }: { className: string }) {
  return (
    <svg aria-hidden viewBox="0 0 14 14" className={cn("pointer-events-none absolute h-3.5 w-3.5 text-[#c9a868]/70", className)}>
      <path d="M0 13V0h13" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="2.2" cy="2.2" r="1.1" fill="currentColor" />
    </svg>
  )
}

function Heading({ kicker, children, sub }: { kicker: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-6 text-center">
      <div className="text-[10px] uppercase tracking-[0.45em] text-[#8a6a3a]">{kicker}</div>
      <h2 className="mt-2 font-serif text-2xl tracking-[0.06em] text-[#e8d9ae] [text-wrap:balance]">{children}</h2>
      {sub && <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-stone-500">{sub}</p>}
    </div>
  )
}

function Nav({ onBack, onNext, nextLabel, nextDisabled, onSkip, skipLabel = "Skip for now" }: { onBack?: () => void; onNext?: () => void; nextLabel?: string; nextDisabled?: boolean; onSkip?: () => void; skipLabel?: string }) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#2a241e] pt-5">
      <button type="button" onClick={onBack} disabled={!onBack} className="px-3 py-2 text-[11px] uppercase tracking-[0.25em] text-stone-500 hover:text-stone-300 disabled:invisible">← Back</button>
      <div className="flex items-center gap-3">
        {onSkip && <button type="button" onClick={onSkip} className="px-3 py-2 text-[11px] uppercase tracking-[0.25em] text-stone-500 hover:text-[#c9a868]">{skipLabel}</button>}
        {onNext && (
          <button type="button" onClick={onNext} disabled={nextDisabled} className="rounded-sm border border-[#c9a868]/70 bg-gradient-to-b from-[#1d1710] to-[#120e0a] px-7 py-2.5 font-serif text-[13px] uppercase tracking-[0.25em] text-[#d9bd7e] transition-all hover:border-[#c9a868] hover:text-[#f0dba8] hover:shadow-[0_0_30px_rgba(201,168,104,0.25)] disabled:cursor-not-allowed disabled:opacity-40">
            {nextLabel ?? "Next"}
          </button>
        )}
      </div>
    </div>
  )
}

const inputCls = "w-full rounded-sm border border-[#7a5f33]/60 bg-black/60 px-3 py-3 font-serif text-[17px] tracking-wide text-stone-100 placeholder:text-stone-700 focus:border-[#c9a868] focus:outline-none"

// ---------------------------------------------------------------------------------------------
// 1 — Identity
// ---------------------------------------------------------------------------------------------

function IdentityStep({ draft, update, onNext }: { draft: Draft; update: (p: Partial<Draft>) => void; onNext: () => void }) {
  const ok = Boolean(cleanName(draft.playerName) && cleanName(draft.heroName))
  return (
    <Card>
      <Heading kicker="1 · Identity" sub="Two names. The first is yours; the second is who you were before the chains.">Who were you, before the chains?</Heading>
      <form onSubmit={(e) => { e.preventDefault(); if (ok) onNext() }} className="mx-auto max-w-md space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.25em] text-stone-500">Your name — the player</span>
          <input value={draft.playerName} onChange={(e) => update({ playerName: e.target.value })} className={inputCls} placeholder="Alejandro" autoFocus autoComplete="off" maxLength={40} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] uppercase tracking-[0.25em] text-stone-500">Your hero's name</span>
          <input value={draft.heroName} onChange={(e) => update({ heroName: e.target.value })} className={inputCls} placeholder="Varek of the Low Road" autoComplete="off" maxLength={40} />
          <span className="mt-1.5 block text-[11px] text-stone-600">A name the drow will learn to hate. You can still change it in the Forge.</span>
        </label>
        <Nav onNext={() => ok && onNext()} nextLabel="Next: Build" nextDisabled={!ok} />
      </form>
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------
// 2 — Build (the Character Forge 2014, embedded)
// ---------------------------------------------------------------------------------------------

function BuildStep({ draft, update, visible, onNext, onBack }: { draft: Draft; update: (p: Partial<Draft>) => void; visible: boolean; onNext: () => void; onBack: () => void }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [frameReady, setFrameReady] = useState(false)
  const [built, setBuilt] = useState<any | null>(null)
  const openedRef = useRef(false)

  // Watch the builder's own save for OUR character: it appears when "+ Forge a new character" is
  // pressed, and `built` flips when the player presses "Create Character →" on its Review page.
  useEffect(() => {
    const tick = () => {
      const chars = readForgeChars()
      if (!draft.buildCharId) return
      const c = chars.find((x) => x?.id === draft.buildCharId) ?? null
      setBuilt(c && c.built ? c : null)
    }
    tick()
    const t = window.setInterval(tick, 1200)
    window.addEventListener("storage", tick)
    return () => { window.clearInterval(t); window.removeEventListener("storage", tick) }
  }, [draft.buildCharId])

  // Open the right place inside the builder: a fresh draft gets a fresh character (no roster, no
  // demo cards to wade through); a draft that already has one reopens it where it left off.
  const openBuilder = useCallback(() => {
    const w = frameRef.current?.contentWindow as any
    const doc = frameRef.current?.contentDocument
    if (!w || !doc) return false
    const before = readForgeChars().map((c) => c?.id)
    if (draft.buildCharId) {
      const idx = before.indexOf(draft.buildCharId)
      const cards = doc.querySelectorAll("#rosterGrid .char-card:not(.new)")
      const card = idx >= 0 ? (cards[idx] as HTMLElement | undefined) : undefined
      if (card) { card.click(); return true }
      // The character is gone from this browser (storage cleared): start again below.
    }
    const plus = doc.querySelector("#rosterGrid .char-card.new") as HTMLElement | null
    if (!plus) return false
    plus.click()
    // The builder persists on its next render; read the new id back.
    window.setTimeout(() => {
      const after = readForgeChars()
      const fresh = after.find((c) => c?.id && !before.includes(c.id)) ?? after[after.length - 1]
      if (fresh?.id) update({ buildCharId: fresh.id })
    }, 400)
    return true
  }, [draft.buildCharId, update])

  useEffect(() => {
    if (!visible || !frameReady || openedRef.current) return
    let tries = 0
    const t = window.setInterval(() => {
      tries += 1
      if (openBuilder() || tries > 25) { window.clearInterval(t); openedRef.current = true }
    }, 200)
    return () => window.clearInterval(t)
  }, [visible, frameReady, openBuilder])

  return (
    <div className={visible ? "" : "hidden"} aria-hidden={!visible}>
      <Card wide>
        <Heading kicker="2 · Build" sub={<>The Forge below walks you through class, background, species and the rest, one page at a time. Press <span className="text-[#d9bd7e]">Create Character →</span> on its last page when you are done — this bar picks it up.</>}>
          What are you?
        </Heading>

        {built ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-sm border border-emerald-700/50 bg-[#10201a]/80 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full border border-emerald-500/60 text-emerald-300"><Check className="h-4 w-4" /></span>
              <div>
                <div className="font-serif text-lg text-[#e8d9ae]">{cleanName(draft.heroName) || built.name || "Your hero"}</div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">{[built.species, built.clazz, built.level ? `Level ${built.level}` : null].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
            <button type="button" onClick={onNext} className="rounded-sm border border-emerald-500/70 bg-gradient-to-b from-[#1d3527] to-[#122018] px-6 py-2.5 font-serif text-[13px] uppercase tracking-[0.25em] text-emerald-100 transition-all hover:border-emerald-300 hover:shadow-[0_0_30px_rgba(52,211,153,0.25)]">Next: Look</button>
          </div>
        ) : (
          <p className="mb-4 text-center text-[11px] uppercase tracking-[0.25em] text-stone-600">Building… the bar lights up when the sheet is complete</p>
        )}

        <iframe
          ref={frameRef}
          src="/forge2014.html"
          title="Character Forge — 2014 Edition"
          onLoad={() => setFrameReady(true)}
          className="h-[min(78vh,900px)] min-h-[520px] w-full rounded-[3px] border border-[#3d3428] bg-[#0a0908]"
        />
        <Nav onBack={onBack} onNext={built ? onNext : undefined} nextLabel="Next: Look" />
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// 3 — Look (PixelLab figure in rags)
// ---------------------------------------------------------------------------------------------

function LookStep({ draft, update, onNext, onBack }: { draft: Draft; update: (p: Partial<Draft>) => void; onNext: () => void; onBack: () => void }) {
  const c = useMemo(() => builtChar(draft), [draft])
  const [look, setLook] = useState(draft.look ?? guessLook(c))
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const description = useMemo(() => describeSprite({ species: c?.species, clazz: c?.clazz, ...look }), [c, look])
  const sprite = draft.sprite

  // Keep the chips in the draft as they change, so a reload keeps them.
  useEffect(() => { update({ look }) }, [look, update])

  // Poll a running job.
  useEffect(() => {
    if (!sprite || sprite.status !== "drawing" || (!sprite.jobId && !sprite.characterId)) return
    const t = window.setInterval(async () => {
      try {
        const q = new URLSearchParams()
        if (sprite.jobId) q.set("jobId", sprite.jobId)
        if (sprite.characterId) q.set("characterId", sprite.characterId)
        const r = await fetch(`/api/forge/sprite?${q}`, { cache: "no-store" })
        const j = await r.json()
        if (j.status === "ready") update({ sprite: { ...sprite, status: "ready", characterId: j.characterId ?? sprite.characterId, previewUrl: j.previewUrl ?? undefined } })
        else if (j.status === "failed") update({ sprite: { ...sprite, status: "failed" } })
        else if (j.status === "deferred") update({ sprite: { ...sprite, status: "deferred" } })
      } catch { /* try again next tick */ }
    }, 6000)
    return () => window.clearInterval(t)
  }, [sprite, update])

  const draw = async () => {
    setBusy(true); setNote(null)
    try {
      const r = await fetch("/api/forge/sprite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description }) })
      const j = await r.json()
      if (!r.ok) { setNote(j.error ?? "The Forge could not start the drawing."); return }
      if (j.deferred) { update({ sprite: { status: "deferred" } }); setNote(j.reason ?? "Your figure will be drawn when the DM opens your cell."); return }
      update({ sprite: { status: "drawing", jobId: j.jobId ?? undefined, characterId: j.characterId ?? undefined } })
      setNote("Your figure is being drawn — usually a few minutes. Carry on; it shows up at the Oath.")
    } catch {
      setNote("Could not reach the Forge. Try again, or skip for now.")
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <Heading kicker="3 · Look" sub="Four choices make the figure the drow will see on the map. It wears rags — the drow took everything else.">How will the drow remember your face?</Heading>
      <div className="grid gap-5 sm:grid-cols-2">
        <ChipRow label="Hair" value={look.hair} options={LOOK_OPTIONS.hair} onPick={(v) => setLook({ ...look, hair: v })} />
        <ChipRow label="Skin" value={look.skin} options={LOOK_OPTIONS.skin} onPick={(v) => setLook({ ...look, skin: v })} />
        <ChipRow label="Build" value={look.build} options={LOOK_OPTIONS.build} onPick={(v) => setLook({ ...look, build: v })} />
        <ChipRow label="A mark" value={look.mark} options={LOOK_OPTIONS.mark} onPick={(v) => setLook({ ...look, mark: v })} />
      </div>

      <div className="mt-6 rounded-sm border border-[#3d3428] bg-black/50 p-4">
        <div className="mb-1 text-[10px] uppercase tracking-[0.3em] text-stone-600">What the Forge will ask for</div>
        <p className="text-sm leading-relaxed text-stone-400">{description}</p>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
        {sprite?.status === "ready" && sprite.previewUrl ? (
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sprite.previewUrl} alt="Your figure" className="h-32 w-32 rounded-sm border border-[#7a5f33]/60 bg-black/60 object-contain [image-rendering:pixelated]" />
            <div className="text-sm text-stone-400">Drawn. The DM approves it before it walks.</div>
          </div>
        ) : sprite?.status === "drawing" ? (
          <div className="flex items-center gap-3 text-sm text-stone-400"><span className="h-2 w-2 animate-pulse rounded-full bg-[#c9a868]" /> Your figure is being drawn…</div>
        ) : sprite?.status === "deferred" ? (
          <div className="text-sm text-stone-400">Your figure will be drawn when the DM opens your cell.</div>
        ) : (
          <button type="button" onClick={draw} disabled={busy} className="rounded-sm border border-[#c9a868]/70 bg-gradient-to-b from-[#1d1710] to-[#120e0a] px-7 py-2.5 font-serif text-[13px] uppercase tracking-[0.25em] text-[#d9bd7e] transition-all hover:border-[#c9a868] hover:text-[#f0dba8] disabled:opacity-50">
            {busy ? "Starting…" : sprite?.status === "failed" ? "Try drawing again" : "Draw my figure"}
          </button>
        )}
      </div>
      {note && <p className="mt-3 text-center text-[12px] text-stone-500">{note}</p>}

      <Nav onBack={onBack} onNext={onNext} nextLabel="Next: Voice" onSkip={sprite ? undefined : () => { update({ sprite: { status: "deferred" } }); onNext() }} />
    </Card>
  )
}

function guessLook(c: any): { hair: string; skin: string; build: string; mark: string } {
  const pick = (list: readonly string[], text: unknown, fallback: string) => {
    const t = typeof text === "string" ? text.toLowerCase() : ""
    return list.find((o) => t && t.includes(o.split(" ")[0])) ?? fallback
  }
  const d = c?.details ?? {}
  return { hair: pick(LOOK_OPTIONS.hair, d.hair, "dark brown"), skin: pick(LOOK_OPTIONS.skin, d.skin, "fair"), build: "average", mark: "none" }
}

function ChipRow({ label, value, options, onPick }: { label: string; value: string; options: readonly string[]; onPick: (v: string) => void }) {
  return (
    <div>
      <div className="mb-2 text-[11px] uppercase tracking-[0.25em] text-stone-500">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o} type="button" onClick={() => onPick(o)} aria-pressed={value === o}
            className={cn("rounded-full border px-3 py-1.5 text-[12px] transition-all", value === o ? "border-[#e8c56a] bg-[#2a2014] text-[#f0dba8] shadow-[0_0_14px_rgba(232,197,106,0.3)]" : "border-[#3d3428] bg-black/40 text-stone-400 hover:border-[#8a6a3a] hover:text-stone-200")}>
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// 4 — Voice
// ---------------------------------------------------------------------------------------------

type LibVoice = { id: string; name: string; gender: string; tags: string[] }

function VoiceStep({ draft, update, onNext, onBack }: { draft: Draft; update: (p: Partial<Draft>) => void; onNext: () => void; onBack: () => void }) {
  const [tab, setTab] = useState<"pick" | "record">(draft.voice?.mode === "record" ? "record" : "pick")
  const [voices, setVoices] = useState<LibVoice[]>([])
  const [sampleLine, setSampleLine] = useState("")
  const [playing, setPlaying] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const chosen = draft.voice?.mode === "library" ? draft.voice.voiceId : null

  useEffect(() => {
    fetch("/api/forge/voices").then((r) => r.json()).then((j) => { setVoices(j.voices ?? []); setSampleLine(j.sampleLine ?? "") }).catch(() => {})
  }, [])

  const play = async (v: LibVoice) => {
    try {
      setPlaying(v.id)
      const r = await fetch("/api/forge/voices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voiceId: v.id }) })
      if (!r.ok) { setPlaying(null); return }
      const url = URL.createObjectURL(await r.blob())
      const a = audioRef.current ?? new Audio()
      audioRef.current = a
      a.src = url
      a.onended = () => { setPlaying(null); URL.revokeObjectURL(url) }
      await a.play()
    } catch { setPlaying(null) }
  }

  return (
    <Card>
      <Heading kicker="4 · Voice" sub="Your hero speaks on the map and in the dark. Pick a voice from the library, or lend your own.">How do you sound when you speak to your captors?</Heading>
      <div className="mb-5 flex justify-center gap-2">
        {(["pick", "record"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={cn("rounded-full border px-4 py-1.5 text-[11px] uppercase tracking-[0.25em] transition-all", tab === t ? "border-[#e8c56a] bg-[#2a2014] text-[#f0dba8]" : "border-[#3d3428] text-stone-500 hover:text-stone-300")}>
            {t === "pick" ? "Pick a voice" : "Record my own"}
          </button>
        ))}
      </div>

      {tab === "pick" && (
        <>
          {sampleLine && <p className="mb-4 text-center text-[12px] italic text-stone-500">Every voice says: “{sampleLine}”</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {voices.length === 0 && <div className="col-span-full py-6 text-center text-[11px] uppercase tracking-[0.3em] text-stone-600">Tuning the voices…</div>}
            {voices.map((v) => (
              <div key={v.id} className={cn("flex items-center justify-between gap-3 rounded-sm border px-3 py-2.5 transition-all", chosen === v.id ? "border-[#e8c56a] bg-[#2a2014]/70 shadow-[0_0_18px_rgba(232,197,106,0.2)]" : "border-[#3d3428] bg-black/40 hover:border-[#8a6a3a]")}>
                <button type="button" onClick={() => update({ voice: { mode: "library", voiceId: v.id, voiceName: v.name } })} className="min-w-0 flex-1 text-left">
                  <div className="font-serif text-[15px] text-[#e8d9ae]">{v.name}</div>
                  <div className="truncate text-[11px] text-stone-500">{v.gender} · {v.tags.join(", ")}</div>
                </button>
                <button type="button" onClick={() => play(v)} aria-label={`Hear ${v.name}`} className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-colors", playing === v.id ? "border-[#e8c56a] text-[#e8c56a]" : "border-[#3d3428] text-stone-400 hover:border-[#c9a868] hover:text-[#c9a868]")}>
                  {playing === v.id ? <Volume2 className="h-3.5 w-3.5 animate-pulse" /> : <Play className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "record" && <Recorder draft={draft} update={update} />}

      <Nav onBack={onBack} onNext={onNext} nextLabel="Next: Face" nextDisabled={!draft.voice || draft.voice.mode === "skip"} onSkip={() => { update({ voice: { mode: "skip" } }); onNext() }} />
    </Card>
  )
}

function Recorder({ draft, update }: { draft: Draft; update: (p: Partial<Draft>) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "done" | "uploading" | "saved">(draft.voice?.mode === "record" ? "saved" : "idle")
  const [seconds, setSeconds] = useState(0)
  const [consent, setConsent] = useState(draft.voice?.mode === "record")
  const [blob, setBlob] = useState<Blob | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<number | null>(null)
  const previewUrl = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const start = async () => {
    setErr(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m))
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunks.current = []
      r.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data) }
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        setBlob(new Blob(chunks.current, { type: r.mimeType || "audio/webm" }))
        setState("done")
      }
      rec.current = r
      r.start(250)
      setSeconds(0); setState("recording")
      timer.current = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch {
      setErr("No microphone, or permission refused. You can pick a library voice instead.")
    }
  }
  const stop = () => { rec.current?.stop(); if (timer.current) window.clearInterval(timer.current) }
  useEffect(() => { if (state === "recording" && seconds >= 120) stop() }, [seconds, state]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!blob || !consent) return
    setState("uploading"); setErr(null)
    try {
      const fd = new FormData()
      fd.set("kind", "voice"); fd.set("draft", draft.id); fd.set("file", blob, "voice.webm")
      const r = await fetch("/api/forge/media", { method: "POST", body: fd })
      const j = await r.json()
      if (!r.ok) { setErr(j.error ?? "Upload failed."); setState("done"); return }
      update({ voice: { mode: "record", samplePath: j.pathname, consent: true, consentBy: cleanName(draft.playerName) || "player" } })
      setState("saved")
    } catch { setErr("Could not reach the Forge."); setState("done") }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-sm border border-[#3d3428] bg-black/50 p-4 text-sm leading-relaxed text-stone-400">
        Read this aloud, in your hero's voice, for about a minute. A quiet room helps.
        <blockquote className="mt-3 border-l-2 border-[#7a5f33]/60 pl-3 font-serif text-[15px] italic text-[#e8d9ae]">
          “I remember the road before the dark. The smell of woodsmoke, a door that was mine. They took the rest — the pack, the blade, the name on the ledger. Fine. Let them count their bolts. I count the days. And when the count is right, I will be the one holding the keys.”
        </blockquote>
      </div>
      <div className="mt-5 flex flex-col items-center gap-3">
        {state === "idle" && <button type="button" onClick={start} className="flex items-center gap-2 rounded-full border border-[#c9a868]/70 bg-gradient-to-b from-[#1d1710] to-[#120e0a] px-6 py-3 font-serif text-[13px] uppercase tracking-[0.25em] text-[#d9bd7e] hover:border-[#c9a868]"><Mic className="h-4 w-4" /> Record</button>}
        {state === "recording" && (
          <>
            <div className={cn("font-mono text-3xl tabular-nums", seconds >= 60 ? "text-emerald-300" : "text-[#e8c56a]")}>{String(Math.floor(seconds / 60)).padStart(1, "0")}:{String(seconds % 60).padStart(2, "0")}</div>
            <div className="text-[11px] uppercase tracking-[0.25em] text-stone-500">{seconds >= 60 ? "That's enough — stop when you like" : "Keep going to one minute"}</div>
            <button type="button" onClick={stop} className="flex items-center gap-2 rounded-full border border-red-500/60 px-6 py-3 font-serif text-[13px] uppercase tracking-[0.25em] text-red-200 hover:border-red-400"><Square className="h-4 w-4" /> Stop</button>
          </>
        )}
        {(state === "done" || state === "uploading") && previewUrl && (
          <>
            <audio controls src={previewUrl} className="w-full" />
            <label className="flex items-start gap-3 text-[12px] leading-relaxed text-stone-400">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 accent-[#c9a868]" />
              <span>I agree that the Dungeon Master may use this recording to make an AI voice for my character, in this game only. If I am under 18, a parent is ticking this.</span>
            </label>
            <div className="flex gap-3">
              <button type="button" onClick={() => { setBlob(null); setState("idle") }} className="flex items-center gap-2 px-4 py-2 text-[11px] uppercase tracking-[0.25em] text-stone-500 hover:text-stone-300"><RotateCcw className="h-3.5 w-3.5" /> Again</button>
              <button type="button" onClick={save} disabled={!consent || state === "uploading"} className="rounded-sm border border-[#c9a868]/70 bg-gradient-to-b from-[#1d1710] to-[#120e0a] px-6 py-2.5 font-serif text-[13px] uppercase tracking-[0.25em] text-[#d9bd7e] hover:border-[#c9a868] disabled:opacity-40">{state === "uploading" ? "Keeping…" : "Use this"}</button>
            </div>
          </>
        )}
        {state === "saved" && (
          <div className="flex items-center gap-3 text-sm text-emerald-300"><Check className="h-4 w-4" /> Your voice is kept. The clone is made only when the DM opens your cell.
            <button type="button" onClick={() => { update({ voice: null }); setBlob(null); setConsent(false); setState("idle") }} className="text-[11px] uppercase tracking-[0.2em] text-stone-500 hover:text-stone-300">Redo</button>
          </div>
        )}
        {err && <p className="text-center text-[12px] text-red-400/90">{err}</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// 5 — Face
// ---------------------------------------------------------------------------------------------

const SHOTS = ["Straight on", "Turn a little left", "Turn a little right"] as const

function FaceStep({ draft, update, onNext, onBack }: { draft: Draft; update: (p: Partial<Draft>) => void; onNext: () => void; onBack: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [camera, setCamera] = useState<"off" | "on" | "denied">("off")
  const [shots, setShots] = useState<Blob[]>([])
  const [consent, setConsent] = useState(draft.face?.mode === "photos")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const saved = draft.face?.mode === "photos" ? draft.face.paths.length : 0
  const urls = useMemo(() => shots.map((b) => URL.createObjectURL(b)), [shots])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])

  const openCamera = async () => {
    setErr(null)
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      streamRef.current = s
      if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play().catch(() => {}) }
      setCamera("on")
    } catch { setCamera("denied") }
  }
  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()) }, [])

  const snap = () => {
    const v = videoRef.current
    if (!v || shots.length >= 3) return
    const c = document.createElement("canvas")
    const w = Math.min(1280, v.videoWidth || 1280), h = Math.round(w * ((v.videoHeight || 960) / (v.videoWidth || 1280)))
    c.width = w; c.height = h
    c.getContext("2d")?.drawImage(v, 0, 0, w, h)
    c.toBlob((b) => { if (b) setShots((s) => [...s, b]) }, "image/jpeg", 0.92)
  }

  const save = async () => {
    if (!consent || shots.length === 0) return
    setBusy(true); setErr(null)
    try {
      const paths: string[] = []
      for (const b of shots) {
        const fd = new FormData()
        fd.set("kind", "face"); fd.set("draft", draft.id); fd.set("file", b, "face.jpg")
        const r = await fetch("/api/forge/media", { method: "POST", body: fd })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? "Upload failed")
        paths.push(j.pathname)
      }
      update({ face: { mode: "photos", paths, consent: true, consentBy: cleanName(draft.playerName) || "player" } })
      streamRef.current?.getTracks().forEach((t) => t.stop()); setCamera("off")
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <Card>
      <Heading kicker="5 · Face" sub="Three photos make the face the films will use. Only the DM sees them; they are deleted once the portrait is approved.">Let the lich see you.</Heading>
      {saved > 0 ? (
        <div className="flex flex-col items-center gap-3 text-sm text-emerald-300"><span className="flex items-center gap-2"><Check className="h-4 w-4" /> {saved} photo{saved === 1 ? "" : "s"} kept.</span>
          <button type="button" onClick={() => { update({ face: null }); setShots([]); setConsent(false) }} className="text-[11px] uppercase tracking-[0.2em] text-stone-500 hover:text-stone-300">Retake</button>
        </div>
      ) : (
        <div className="mx-auto max-w-xl">
          <div className="relative aspect-[4/3] overflow-hidden rounded-sm border border-[#3d3428] bg-black">
            <video ref={videoRef} muted playsInline className={cn("h-full w-full -scale-x-100 object-cover", camera === "on" ? "opacity-100" : "opacity-0")} />
            {camera === "on" && <div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="h-[62%] w-[42%] rounded-[50%] border border-[#e8c56a]/50" /></div>}
            {camera !== "on" && (
              <div className="absolute inset-0 grid place-items-center">
                {camera === "denied" ? (
                  <p className="px-6 text-center text-sm text-stone-400">No camera, or permission refused. Skip for now — the DM can add your portrait later.</p>
                ) : (
                  <button type="button" onClick={openCamera} className="flex items-center gap-2 rounded-full border border-[#c9a868]/70 bg-gradient-to-b from-[#1d1710] to-[#120e0a] px-6 py-3 font-serif text-[13px] uppercase tracking-[0.25em] text-[#d9bd7e] hover:border-[#c9a868]"><Camera className="h-4 w-4" /> Open the camera</button>
                )}
              </div>
            )}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {SHOTS.map((label, i) => (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <div className="aspect-[4/3] w-full overflow-hidden rounded-sm border border-[#3d3428] bg-black/60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {urls[i] ? <img src={urls[i]} alt={label} className="h-full w-full -scale-x-100 object-cover" /> : <div className="grid h-full place-items-center text-[10px] uppercase tracking-[0.2em] text-stone-700">{i + 1}</div>}
                </div>
                <span className={cn("text-[10px] uppercase tracking-[0.2em]", shots.length === i && camera === "on" ? "text-[#e8c56a]" : "text-stone-600")}>{label}</span>
              </div>
            ))}
          </div>
          {camera === "on" && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button type="button" onClick={snap} disabled={shots.length >= 3} className="rounded-full border border-[#c9a868]/70 bg-gradient-to-b from-[#1d1710] to-[#120e0a] px-6 py-2.5 font-serif text-[13px] uppercase tracking-[0.25em] text-[#d9bd7e] hover:border-[#c9a868] disabled:opacity-40">
                {shots.length >= 3 ? "Three taken" : `Take ${SHOTS[shots.length].toLowerCase()}`}
              </button>
              {shots.length > 0 && <button type="button" onClick={() => setShots([])} className="flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-[0.25em] text-stone-500 hover:text-stone-300"><RotateCcw className="h-3.5 w-3.5" /> Again</button>}
            </div>
          )}
          {shots.length > 0 && (
            <>
              <label className="mt-4 flex items-start gap-3 text-[12px] leading-relaxed text-stone-400">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 accent-[#c9a868]" />
                <span>These photos are used only to make this character's portrait and film scenes, only the DM sees them, and they are deleted after the portrait is approved. If I am under 18, a parent is ticking this.</span>
              </label>
              <div className="mt-3 flex justify-center">
                <button type="button" onClick={save} disabled={!consent || busy} className="rounded-sm border border-[#c9a868]/70 bg-gradient-to-b from-[#1d1710] to-[#120e0a] px-6 py-2.5 font-serif text-[13px] uppercase tracking-[0.25em] text-[#d9bd7e] hover:border-[#c9a868] disabled:opacity-40">{busy ? "Keeping…" : "Keep these"}</button>
              </div>
            </>
          )}
          {err && <p className="mt-3 text-center text-[12px] text-red-400/90">{err}</p>}
        </div>
      )}
      <Nav onBack={onBack} onNext={onNext} nextLabel="Next: Oath" nextDisabled={!draft.face || draft.face.mode === "skip"} onSkip={() => { streamRef.current?.getTracks().forEach((t) => t.stop()); update({ face: { mode: "skip" } }); onNext() }} />
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------
// 6 — Oath (review and hand in)
// ---------------------------------------------------------------------------------------------

function OathStep({ draft, update, onBack, onJump }: { draft: Draft; update: (p: Partial<Draft>) => void; onBack: () => void; onJump: (i: number) => void }) {
  const c = useMemo(() => builtChar(draft), [draft])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const handIn = async () => {
    setBusy(true); setErr(null)
    try {
      const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Character Forge — 2014 Edition"]')
      const w = frame?.contentWindow as any
      if (!c || !w || typeof w.exportPayload !== "function" || typeof w.migrateChar !== "function") { setErr("The Forge is still loading. Give it a moment and try again."); return }
      const copy = JSON.parse(JSON.stringify(c))
      w.migrateChar(copy)
      copy.name = cleanName(draft.heroName) || copy.name
      copy.playerName = cleanName(draft.playerName) || copy.playerName
      const payload = w.exportPayload(copy)
      const assets: ForgeAssets = { look: draft.look ? { ...draft.look, description: describeSprite({ species: c.species, clazz: c.clazz, ...draft.look }) } : undefined, sprite: draft.sprite ?? undefined, voice: draft.voice ?? { mode: "skip" }, face: draft.face ?? { mode: "skip" } }
      const r = await fetch("/api/forge/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerName: draft.playerName, heroName: draft.heroName, payload, assets }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) { setErr(j.error ?? `The Forge refused (HTTP ${r.status}).`); return }
      fadeOutThemeAudio()
      update({ submitted: { code: j.code, submissionId: j.submissionId } })
    } catch { setErr("Could not reach the Forge.") } finally { setBusy(false) }
  }

  const rows: { label: string; value: React.ReactNode; step: number }[] = [
    { label: "Player", value: draft.playerName, step: 0 },
    { label: "Hero", value: draft.heroName, step: 0 },
    { label: "Sheet", value: c ? [c.species, c.clazz, c.background, c.level ? `Level ${c.level}` : null].filter(Boolean).join(" · ") : "Not built", step: 1 },
    { label: "Look", value: draft.look ? `${draft.look.hair} hair, ${draft.look.skin} skin, ${draft.look.build} build${draft.look.mark !== "none" ? `, ${draft.look.mark}` : ""}` : "Left to the DM", step: 2 },
    { label: "Figure", value: draft.sprite?.status === "ready" ? "Drawn" : draft.sprite?.status === "drawing" ? "Still being drawn" : "Drawn when the cell opens", step: 2 },
    { label: "Voice", value: draft.voice?.mode === "library" ? draft.voice.voiceName : draft.voice?.mode === "record" ? "Your own recording" : "A library voice, chosen by the DM", step: 3 },
    { label: "Face", value: draft.face?.mode === "photos" ? `${draft.face.paths.length} photo${draft.face.paths.length === 1 ? "" : "s"}` : "Skipped", step: 4 },
  ]

  return (
    <Card>
      <Heading kicker="6 · Oath" sub="Look it over. Each line jumps back to its step.">The Forge is done with you.</Heading>
      <div className="mx-auto max-w-xl divide-y divide-[#2a241e] rounded-sm border border-[#3d3428] bg-black/40">
        {rows.map((r) => (
          <button key={r.label} type="button" onClick={() => onJump(r.step)} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-[#1a140c]/60">
            <span className="text-[11px] uppercase tracking-[0.25em] text-stone-500">{r.label}</span>
            <span className="flex-1 text-right font-serif text-[15px] text-[#e8d9ae]">{r.value}</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-stone-600">edit</span>
          </button>
        ))}
      </div>
      {draft.sprite?.status === "ready" && draft.sprite.previewUrl && (
        <div className="mt-5 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={draft.sprite.previewUrl} alt="Your figure" className="h-40 w-40 rounded-sm border border-[#7a5f33]/60 bg-black/60 object-contain [image-rendering:pixelated]" />
        </div>
      )}
      <p className="mx-auto mt-6 max-w-xl text-center text-[12px] leading-relaxed text-stone-500">
        Handing in gives you three words. The words are yours; the seat is the Dungeon Master's to open. Nothing walks the map until they do.
      </p>
      {err && <p className="mt-3 text-center text-[12px] text-red-400/90">{err}</p>}
      <Nav onBack={onBack} onNext={handIn} nextLabel={busy ? "Handing in…" : "Give myself to the dark"} nextDisabled={busy || !c} />
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------
// Waiting for the DM
// ---------------------------------------------------------------------------------------------

function Waiting({ draft, onAnother, router }: { draft: Draft; onAnother: () => void; router: ReturnType<typeof useRouter> }) {
  const code = draft.submitted!.code
  const [status, setStatus] = useState<"pending" | "activated" | "rejected" | "unknown">("pending")
  const [copied, setCopied] = useState(false)
  const [entering, setEntering] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    const tick = async () => {
      try {
        const r = await fetch(`/api/forge/submit?code=${encodeURIComponent(code)}`, { cache: "no-store" })
        const j = await r.json()
        if (!live) return
        if (j.ok) setStatus(j.status)
        else if (j.reason === "unknown") setStatus("unknown")
      } catch { /* next tick */ }
    }
    tick()
    const t = window.setInterval(tick, 5000)
    return () => { live = false; window.clearInterval(t) }
  }, [code])

  const enter = async () => {
    setEntering(true); setErr(null)
    try {
      const r = await fetch("/api/claim-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) })
      const j = await r.json()
      if (!r.ok || !j.ok || j.role !== "player") { setErr("The door did not open yet. Try again in a moment."); return }
      window.localStorage.setItem(ROLE_LS_KEY, "player")
      window.localStorage.setItem(CHARACTER_LS_KEY, j.character.id)
      window.localStorage.setItem(TOKEN_LS_KEY, j.claimToken)
      router.replace("/awaken")
    } catch { setErr("Could not reach the door.") } finally { setEntering(false) }
  }

  const words = code.split("-")
  return (
    <Card className="text-center">
      <div className="text-[10px] uppercase tracking-[0.45em] text-[#8a6a3a]">Malachar</div>
      <p className="mx-auto mt-3 max-w-lg font-serif text-lg italic leading-relaxed text-[#b98cf0] [text-shadow:0_0_18px_rgba(123,47,214,0.45)]">
        “Another one. How thoughtful. Sit. Wait. I'll decide whether you're worth waking.”
      </p>

      <div className="mx-auto mt-8 max-w-md">
        <div className="text-[11px] uppercase tracking-[0.3em] text-stone-500">Your words</div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {words.map((w, i) => (
            <span key={i} className="rounded-sm border border-[#7a5f33]/70 bg-black/60 px-4 py-2 font-serif text-xl tracking-[0.12em] text-[#f0dba8]">{w}</span>
          ))}
        </div>
        <button type="button" onClick={() => { navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }) }} className="mt-3 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.25em] text-stone-500 hover:text-[#c9a868]">
          <ClipboardCopy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
        </button>
        <p className="mt-3 text-[12px] leading-relaxed text-stone-500">Write these down. They are how you come back — from this device or any other. Don't share them: whoever has them can act as you.</p>
      </div>

      <div className="mt-8">
        {status === "pending" && <Pill tone="wait">Waiting for the Dungeon Master</Pill>}
        {status === "activated" && <Pill tone="open">Your cell is open</Pill>}
        {status === "rejected" && <Pill tone="shut">The Dungeon Master turned this hero away</Pill>}
        {status === "unknown" && <Pill tone="shut">The Forge has no record of these words</Pill>}
      </div>

      {status === "activated" && (
        <button type="button" onClick={enter} disabled={entering} className="mt-6 rounded-sm border-2 border-[#8a6a3a] bg-gradient-to-b from-[#2a2015]/90 via-black/80 to-[#2a2015]/90 px-14 py-4 font-serif text-2xl uppercase tracking-[0.4em] text-[#e8c56a] shadow-[0_0_40px_rgba(201,168,104,0.35)] transition-all hover:border-[#f4e0a8] hover:text-[#fff3cf] hover:shadow-[0_0_80px_rgba(232,197,106,0.6)] disabled:opacity-50">
          {entering ? "…" : "Enter"}
        </button>
      )}
      {status === "pending" && <p className="mt-4 text-[12px] text-stone-600">This page keeps watch. You can close it and come back through <span className="text-stone-400">Play Saved Game</span> with your words.</p>}
      {err && <p className="mt-3 text-[12px] text-red-400/90">{err}</p>}

      <div className="mt-10 border-t border-[#2a241e] pt-4">
        <button type="button" onClick={onAnother} className="text-[11px] uppercase tracking-[0.25em] text-stone-600 hover:text-stone-400">Forge another hero</button>
      </div>
    </Card>
  )
}

function Pill({ tone, children }: { tone: "wait" | "open" | "shut"; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] uppercase tracking-[0.3em]",
      tone === "wait" && "border-[#7a3a2a]/70 bg-[#2a1410]/70 text-[#e0a090]",
      tone === "open" && "border-emerald-500/60 bg-[#10201a]/80 text-emerald-200 shadow-[0_0_24px_rgba(52,211,153,0.25)]",
      tone === "shut" && "border-[#3d3428] bg-black/60 text-stone-500")}>
      <span className={cn("h-2 w-2 rounded-full", tone === "wait" && "animate-pulse bg-[#e0705a]", tone === "open" && "bg-emerald-400", tone === "shut" && "bg-stone-600")} />
      {children}
    </span>
  )
}
