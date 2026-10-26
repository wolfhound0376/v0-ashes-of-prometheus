"use client"

// ============================================================================
// ROLL PANEL — the Baldur's Gate 3 moment, for checks the painted map asks for.
//
// Sam, 2026-10-25: "Make it like BG3 and make it look good." In BG3 a check is
// a scene of its own: the game stops, a panel names what you are trying and how
// hard it is, itemises your bonuses, and YOU throw the die. Then the total
// lands and the verdict is stamped across it. This is that panel.
//
//   ready    → what you're attempting, how hard (a word, never the DC), your
//              bonus as chips, and a d20 to click. Step back is free.
//   rolling  → the dashboard's 3D dice tumble over everything (DiceProvider).
//   done     → the natural roll on the die, the total counting up, and a
//              SUCCESS / FAILURE stamp. Continues on its own after a beat.
//
// The DC never appears here (Sam's ruling): the player learns the difficulty as
// the DMG's word for it, and the outcome — not the number they needed.
// ============================================================================

import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { WalkModifierPart } from "@/lib/walk-roll"

export type RollPanelPhase = "ready" | "rolling" | "done"

export interface RollPanelResult {
  natural: number
  total: number
  success: boolean
}

export interface RollPanelProps {
  who: string
  title: string
  checkLabel: string
  difficulty: string
  parts: WalkModifierPart[]
  modifier: number
  phase: RollPanelPhase
  result: RollPanelResult | null
  onRoll: () => void
  onCancel: () => void
  onDone: () => void
}

const AUTO_CONTINUE_MS = 2600
const COUNT_MS = 650

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

export function RollPanel(p: RollPanelProps) {
  const titleId = useId()
  const dieRef = useRef<HTMLButtonElement>(null)
  const [shown, setShown] = useState(0)
  const [stamped, setStamped] = useState(false)

  // Focus the die the moment the panel opens, so Enter / Space throws it.
  useEffect(() => {
    if (p.phase === "ready") dieRef.current?.focus()
  }, [p.phase])

  // Escape steps back, but only before the die is thrown.
  useEffect(() => {
    if (p.phase !== "ready") return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); p.onCancel() } }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [p.phase, p.onCancel])

  // The total counts up from the natural roll, then the verdict stamps down.
  useEffect(() => {
    if (p.phase !== "done" || !p.result) { setShown(0); setStamped(false); return }
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const { natural, total } = p.result
    if (reduce) { setShown(total); setStamped(true); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / COUNT_MS)
      setShown(Math.round(natural + (total - natural) * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(tick)
      else setStamped(true)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [p.phase, p.result])

  // Carry on by itself once the verdict has had a moment to land.
  useEffect(() => {
    if (!stamped) return
    const t = setTimeout(p.onDone, AUTO_CONTINUE_MS)
    return () => clearTimeout(t)
  }, [stamped, p.onDone])

  if (typeof document === "undefined") return null

  const done = p.phase === "done" && p.result
  const rolling = p.phase === "rolling"
  const crit = done && p.result!.natural === 20
  const fumble = done && p.result!.natural === 1
  const win = done && p.result!.success

  return createPortal(
    <div
      className="aop-rp-backdrop fixed inset-0 z-[95] flex items-center justify-center px-4"
      onClick={() => { if (stamped) p.onDone() }}
    >
      <style>{CSS}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`aop-rp-card relative w-[min(92vw,440px)] ${rolling ? "aop-rp-dim" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <Corners />

        {/* Header: who, what, with which */}
        <div className="flex flex-col items-center gap-1 px-8 pt-7 text-center">
          <div className="text-[11px] uppercase tracking-[0.32em] text-[#a08a63]">{p.who} · Ability check</div>
          <h2 id={titleId} className="font-serif text-[26px] font-semibold leading-tight text-[#f0dba8] [text-shadow:0_2px_12px_rgba(201,168,104,0.25)]">
            {p.title}
          </h2>
          <div className="text-[15px] text-[#cbb791]">{p.checkLabel}</div>
        </div>

        {/* The die */}
        <div className="relative mt-4 flex flex-col items-center">
          <button
            ref={dieRef}
            type="button"
            disabled={p.phase !== "ready"}
            onClick={p.onRoll}
            aria-label={p.phase === "ready" ? `Roll a d20 for ${p.title}` : done ? `Rolled ${p.result!.natural}` : "Rolling"}
            className={`aop-rp-die relative grid h-[168px] w-[168px] place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#5fd4c4] focus-visible:ring-offset-4 focus-visible:ring-offset-[#110d09] ${p.phase === "ready" ? "aop-rp-ready cursor-pointer" : "cursor-default"} ${crit ? "aop-rp-crit" : ""} ${fumble ? "aop-rp-fumble" : ""}`}
          >
            <D20 face={done ? String(p.result!.natural) : ""} tone={crit ? "crit" : fumble ? "fumble" : "gold"} />
          </button>

          <div className="aop-rp-ribbon -mt-3 px-5 py-1 font-serif text-[13px] uppercase tracking-[0.28em] text-[#f0dba8]">
            {p.difficulty}
          </div>

          <div aria-live="polite" className="mt-2 h-5 text-[13px] text-[#a08a63]">
            {p.phase === "ready" ? "Click the die to roll" : rolling ? "Rolling…" : crit ? "Natural 20" : fumble ? "Natural 1" : ""}
          </div>
        </div>

        {/* Bonus chips → total */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 px-6">
          {p.parts.map((part) => (
            <span key={part.label} className="rounded-[4px] border border-[#5a4526] bg-[#1d1610] px-2.5 py-1 text-[14px] text-[#e6d3a8]">
              {part.label} <b className="font-semibold text-[#f0dba8]">{signed(part.value)}</b>
            </span>
          ))}
          {p.parts.length === 0 && (
            <span className="rounded-[4px] border border-[#3d3020] px-2.5 py-1 text-[14px] text-[#a08a63]">No bonus</span>
          )}
          <span className="px-1 text-[14px] text-[#a08a63]">=</span>
          <span className="rounded-[4px] border border-[#c9a868]/70 bg-[#2a2013] px-2.5 py-1 font-serif text-[15px] font-semibold text-[#f6e4b6]">
            {signed(p.modifier)}
          </span>
        </div>

        {/* Total + verdict */}
        <div className="relative mt-5 flex h-[84px] items-center justify-center border-t border-[#3d3020]/80">
          {done ? (
            <div className="flex items-baseline gap-3">
              <span className="text-[14px] uppercase tracking-[0.2em] text-[#a08a63]">Total</span>
              <span className="font-serif text-[46px] font-bold leading-none text-[#f6e4b6] tabular-nums">{shown}</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={p.onCancel}
              disabled={p.phase !== "ready"}
              className="min-h-[44px] px-4 text-[14px] text-[#a08a63] transition-colors hover:text-[#f0dba8] disabled:opacity-0"
            >
              Step back
            </button>
          )}
          {stamped && (
            <div className={`aop-rp-stamp pointer-events-none absolute font-serif text-[30px] font-bold uppercase tracking-[0.3em] ${win ? "aop-rp-win" : "aop-rp-lose"}`}>
              {win ? "Success" : "Failure"}
            </div>
          )}
        </div>
        <div className="h-3" />
      </div>
    </div>,
    document.body,
  )
}

// A front-on icosahedron: the hexagon outline, the face triangle, and the six
// edges that make it read as a d20 rather than a hexagon. Drawn, not traced.
function D20({ face, tone }: { face: string; tone: "gold" | "crit" | "fumble" }) {
  const id = useId().replace(/:/g, "")
  const edge = tone === "fumble" ? "#e07a63" : tone === "crit" ? "#ffe9a8" : "#d9b56a"
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2a17" />
          <stop offset="1" stopColor="#140e08" />
        </linearGradient>
        <linearGradient id={`c${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a3519" />
          <stop offset="1" stopColor="#24180c" />
        </linearGradient>
      </defs>
      <polygon points="50,4 90,27 90,73 50,96 10,73 10,27" fill={`url(#f${id})`} stroke={edge} strokeWidth="2.2" strokeLinejoin="round" />
      <polygon points="50,22 76,66 24,66" fill={`url(#c${id})`} stroke={edge} strokeWidth="1.8" strokeLinejoin="round" />
      <path
        d="M50 4L50 22M90 27L50 22M90 27L76 66M90 73L76 66M50 96L76 66M50 96L24 66M10 73L24 66M10 27L24 66M10 27L50 22"
        stroke={edge} strokeWidth="1.1" opacity=".55" fill="none"
      />
      {face ? (
        <text x="50" y="56" textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-serif), serif" fontWeight="700" fontSize="19" fill={edge}>
          {face}
        </text>
      ) : (
        <text x="50" y="56" textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-serif), serif" fontWeight="600" fontSize="11" letterSpacing="1" fill={edge} opacity=".7">
          d20
        </text>
      )}
    </svg>
  )
}

function Corners() {
  const c = "pointer-events-none absolute h-5 w-5 border-[#c9a868]"
  return (
    <>
      <span aria-hidden className={`${c} left-2 top-2 border-l-2 border-t-2`} />
      <span aria-hidden className={`${c} right-2 top-2 border-r-2 border-t-2`} />
      <span aria-hidden className={`${c} bottom-2 left-2 border-b-2 border-l-2`} />
      <span aria-hidden className={`${c} bottom-2 right-2 border-b-2 border-r-2`} />
    </>
  )
}

const CSS = `
.aop-rp-backdrop{background:radial-gradient(ellipse at center,rgba(8,6,4,.55) 0%,rgba(4,3,2,.82) 70%);animation:aop-rp-fade .18s ease-out}
.aop-rp-card{background:linear-gradient(180deg,#1a140e 0%,#0f0b08 100%);border:1px solid #7a5f33;border-radius:6px;
  box-shadow:0 0 0 1px #000,inset 0 0 0 3px #0f0b08,inset 0 0 0 4px rgba(201,168,104,.28),0 24px 80px rgba(0,0,0,.7),0 0 60px rgba(201,168,104,.08);
  animation:aop-rp-rise .26s cubic-bezier(.2,.9,.3,1.1);transition:opacity .2s}
.aop-rp-dim{opacity:.35}
.aop-rp-ribbon{background:linear-gradient(90deg,transparent,#3a2a14 18%,#4a3519 50%,#3a2a14 82%,transparent);border-top:1px solid rgba(201,168,104,.45);border-bottom:1px solid rgba(201,168,104,.45)}
.aop-rp-die{transition:transform .18s ease,filter .18s ease}
.aop-rp-ready{animation:aop-rp-breathe 2.4s ease-in-out infinite}
.aop-rp-ready:hover{transform:translateY(-3px) scale(1.04);filter:drop-shadow(0 0 22px rgba(240,219,168,.55))}
.aop-rp-ready:active{transform:scale(.96)}
.aop-rp-crit{filter:drop-shadow(0 0 26px rgba(255,220,140,.75))}
.aop-rp-fumble{filter:drop-shadow(0 0 18px rgba(224,122,99,.55))}
.aop-rp-stamp{animation:aop-rp-stamp .32s cubic-bezier(.2,1.7,.4,1) both;padding:4px 18px;border:3px double currentColor;border-radius:4px;transform:rotate(-6deg);background:rgba(15,11,8,.85)}
.aop-rp-win{color:#f0d27a;text-shadow:0 0 18px rgba(240,210,122,.55)}
.aop-rp-lose{color:#e07a63;text-shadow:0 0 18px rgba(224,122,99,.45)}
@keyframes aop-rp-fade{from{opacity:0}to{opacity:1}}
@keyframes aop-rp-rise{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
@keyframes aop-rp-breathe{0%,100%{filter:drop-shadow(0 0 8px rgba(217,181,106,.25))}50%{filter:drop-shadow(0 0 20px rgba(217,181,106,.6))}}
@keyframes aop-rp-stamp{from{opacity:0;transform:rotate(-6deg) scale(2.2)}to{opacity:1;transform:rotate(-6deg) scale(1)}}
@media (prefers-reduced-motion:reduce){.aop-rp-backdrop,.aop-rp-card,.aop-rp-ready,.aop-rp-stamp{animation:none}.aop-rp-ready:hover{transform:none}}
`
