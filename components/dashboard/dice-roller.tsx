"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { FantasyPanel } from "@/components/ui/fantasy-panel"
import { Dices, Send, ChevronDown, ChevronUp } from "lucide-react"

interface DiceResult {
  die: string
  rolls: number[]
  modifier: number
  total: number
  label?: string
  timestamp: Date
}

// A roll request: everything needed to build a notation and resolve locally.
interface RollSpec {
  die: string
  numDice: number
  modifier: number
  label?: string
}

interface DiceRollerProps {
  onRollResult?: (result: DiceResult) => void
  onSendToLich?: (message: string) => void
  characterName?: string
}

// Standard D&D dice
const DICE_TYPES = [
  { die: "d4", sides: 4, color: "from-[#4a3a2a] to-[#2a1a0a]", border: "border-[#8a6a4a]" },
  { die: "d6", sides: 6, color: "from-[#3a4a2a] to-[#1a2a0a]", border: "border-[#6a8a4a]" },
  { die: "d8", sides: 8, color: "from-[#2a3a4a] to-[#0a1a2a]", border: "border-[#4a6a8a]" },
  { die: "d10", sides: 10, color: "from-[#4a2a3a] to-[#2a0a1a]", border: "border-[#8a4a6a]" },
  { die: "d12", sides: 12, color: "from-[#3a2a4a] to-[#1a0a2a]", border: "border-[#6a4a8a]" },
  { die: "d20", sides: 20, color: "from-[#4a4a2a] to-[#2a2a0a]", border: "border-[#8a8a4a]" },
  { die: "d100", sides: 100, color: "from-[#2a2a2a] to-[#0a0a0a]", border: "border-[#6a6a6a]" },
]

// URL + origin of the external animated dice app used as the cinematic visual.
const EMBED_URL = "https://rosebud.ai/play/trayroll-dice"
const EMBED_ORIGIN = "https://rosebud.ai"
// Only trust postMessage events originating from this host (or a subdomain).
const TRUSTED_HOST = "rosebud.ai"
// If the iframe hasn't loaded within this window, treat it as failed and the
// overlay will silently fall back to the classic roller.
const IFRAME_LOAD_TIMEOUT_MS = 8000
// Max time to wait for the animated app to post its result before falling back.
const RESPONSE_TIMEOUT_MS = 6000
// How long the total lingers prominently in the overlay before auto-dismiss.
const RESULT_DISPLAY_MS = 1500

function sidesOf(die: string): number {
  const m = /d\s*(\d+)/i.exec(die)
  return m ? Number.parseInt(m[1], 10) : 20
}

// Build a dice notation string like "2d20+3" / "1d6-1" / "1d20".
function buildNotation(spec: RollSpec): string {
  const mod = spec.modifier
  const modStr = mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : ""
  return `${spec.numDice}${spec.die}${modStr}`
}

// Derive a single-die descriptor from a dice notation string like "2d20+3".
function dieFromNotation(notation: string): { die: string; sides: number } | null {
  const m = /(\d*)\s*d\s*(\d+)/i.exec(notation)
  if (!m) return null
  const sides = Number.parseInt(m[2], 10)
  if (!Number.isFinite(sides) || sides < 2 || sides > 1000) return null
  return { die: `d${sides}`, sides }
}

// Is this message origin allowed? (rosebud.ai or any *.rosebud.ai)
function isTrustedOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase()
    return host === TRUSTED_HOST || host.endsWith(`.${TRUSTED_HOST}`)
  } catch {
    return false
  }
}

// Compute a roll locally — the classic roller, used as the silent fallback.
function resolveClassic(spec: RollSpec): DiceResult {
  const sides = sidesOf(spec.die)
  const rolls: number[] = []
  for (let i = 0; i < spec.numDice; i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1)
  }
  const total = rolls.reduce((sum, r) => sum + r, 0) + spec.modifier
  return { die: spec.die, rolls, modifier: spec.modifier, total, label: spec.label, timestamp: new Date() }
}

/**
 * Validate + normalize an incoming { type:'dice-roll', requestId, notation,
 * rolls, modifier, total } payload from the external app. Returns the requestId
 * plus a DiceResult only when every field is sane (correct types, per-die
 * ranges, and a total consistent with rolls + modifier). Returns null otherwise
 * so bogus, spoofed, or stale messages are ignored.
 */
function parseIncomingRoll(data: unknown): { requestId: string; result: DiceResult } | null {
  if (!data || typeof data !== "object") return null
  const d = data as Record<string, unknown>
  if (d.type !== "dice-roll") return null

  if (typeof d.requestId !== "string" || d.requestId.length === 0) return null

  const notation = d.notation
  if (typeof notation !== "string") return null
  const parsed = dieFromNotation(notation)
  if (!parsed) return null

  const rolls = d.rolls
  if (!Array.isArray(rolls) || rolls.length === 0 || rolls.length > 100) return null
  if (!rolls.every((r) => typeof r === "number" && Number.isInteger(r) && r >= 1 && r <= parsed.sides)) {
    return null
  }

  const rawMod = d.modifier
  const modifier = typeof rawMod === "number" && Number.isFinite(rawMod) ? Math.trunc(rawMod) : 0
  if (Math.abs(modifier) > 1000) return null

  const sum = (rolls as number[]).reduce((a, b) => a + b, 0)
  const expected = sum + modifier
  // Trust the provided total only if it agrees with rolls+modifier.
  if (typeof d.total === "number" && Number.isFinite(d.total) && d.total !== expected) return null

  return {
    requestId: d.requestId,
    result: {
      die: parsed.die,
      rolls: rolls as number[],
      modifier,
      total: expected,
      timestamp: new Date(),
    },
  }
}

export function DiceRoller({ onRollResult, onSendToLich, characterName = "Player" }: DiceRollerProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [selectedDie, setSelectedDie] = useState<string>("d20")
  const [numDice, setNumDice] = useState(1)
  const [modifier, setModifier] = useState(0)
  const [rollLabel, setRollLabel] = useState("")
  const [lastResult, setLastResult] = useState<DiceResult | null>(null)

  // Portal readiness (avoid SSR document access).
  const [mounted, setMounted] = useState(false)

  // Iframe lifecycle. The iframe is mounted permanently (preloaded, hidden) so
  // the overlay opens instantly; iframeFailed flips the whole flow to the
  // silent classic fallback.
  const [iframeReady, setIframeReady] = useState(false)
  const [iframeFailed, setIframeFailed] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  // Overlay state.
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [overlayPhase, setOverlayPhase] = useState<"rolling" | "result">("rolling")
  const [overlayLabel, setOverlayLabel] = useState<string>("")
  const [overlayNotation, setOverlayNotation] = useState<string>("")
  const [overlayResult, setOverlayResult] = useState<DiceResult | null>(null)

  // The in-flight request (kept in a ref so the message handler always reads
  // the latest without re-registering).
  const pendingRef = useRef<{ requestId: string; spec: RollSpec; notation: string } | null>(null)
  const responseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Apply a finished roll to the shared roll-handling path: the result log and
  // the telemetry callback. Used by BOTH the animated app's response and the
  // classic fallback, so the dashboard stays the single system of record.
  const applyResult = useCallback(
    (result: DiceResult) => {
      setLastResult(result)
      onRollResult?.(result)
    },
    [onRollResult],
  )

  const closeOverlay = useCallback(() => {
    setOverlayOpen(false)
    setOverlayResult(null)
    setOverlayPhase("rolling")
  }, [])

  // Initiate ANY roll. Opens the cinematic overlay and drives the animated app
  // two-way; if the app is unavailable or never answers, resolves silently with
  // the classic roller so gameplay never blocks.
  const initiateRoll = useCallback(
    (spec: RollSpec) => {
      // A roll is already in flight — ignore re-entrancy.
      if (pendingRef.current) return

      const notation = buildNotation(spec)

      // Iframe unusable → resolve classic immediately, no overlay.
      const win = iframeRef.current?.contentWindow
      if (iframeFailed || !iframeReady || !win) {
        applyResult(resolveClassic(spec))
        return
      }

      const requestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `roll-${Date.now()}-${Math.random().toString(36).slice(2)}`

      pendingRef.current = { requestId, spec, notation }

      // Open the overlay in the rolling phase.
      setOverlayResult(null)
      setOverlayPhase("rolling")
      setOverlayLabel(spec.label || "Dice roll")
      setOverlayNotation(notation)
      setOverlayOpen(true)

      // Ask the animated app to play this exact roll.
      try {
        win.postMessage({ type: "roll-request", requestId, notation, label: spec.label || "Dice roll" }, EMBED_ORIGIN)
      } catch {
        // If posting fails, fall through to the timeout fallback below.
      }

      // Safety net: no valid response within the window → silent classic result.
      responseTimerRef.current = setTimeout(() => {
        const pend = pendingRef.current
        pendingRef.current = null
        closeOverlay()
        if (pend) applyResult(resolveClassic(pend.spec))
      }, RESPONSE_TIMEOUT_MS)
    },
    [iframeFailed, iframeReady, applyResult, closeOverlay],
  )

  // Listen for roll results posted by the embedded animated dice app. Validates
  // origin, matches requestId, and sanity-checks the payload before feeding it
  // into the shared roll-handling path. Built to spec even though the external
  // app's postMessage support is being added separately.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!isTrustedOrigin(event.origin)) return
      const pend = pendingRef.current
      if (!pend) return // no roll in flight

      const parsed = parseIncomingRoll(event.data)
      if (!parsed) {
        console.warn("[DiceRoller] Ignored malformed dice-roll message from", event.origin, event.data)
        return
      }
      if (parsed.requestId !== pend.requestId) return // stale / mismatched request

      // Matched a live request — cancel the fallback timer and consume it.
      if (responseTimerRef.current) clearTimeout(responseTimerRef.current)
      pendingRef.current = null

      const result: DiceResult = { ...parsed.result, label: pend.spec.label }

      // Show the total prominently, then auto-dismiss and commit to the log.
      setOverlayResult(result)
      setOverlayPhase("result")
      resultTimerRef.current = setTimeout(() => {
        closeOverlay()
        applyResult(result)
      }, RESULT_DISPLAY_MS)
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [applyResult, closeOverlay])

  // Detect an iframe that never loads and mark it failed (drives silent fallback).
  useEffect(() => {
    if (iframeReady || iframeFailed) return
    loadTimerRef.current = setTimeout(() => {
      setIframeFailed(true)
    }, IFRAME_LOAD_TIMEOUT_MS)
    return () => {
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current)
    }
  }, [iframeReady, iframeFailed])

  // Clean up any pending timers on unmount.
  useEffect(() => {
    return () => {
      if (responseTimerRef.current) clearTimeout(responseTimerRef.current)
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current)
    }
  }, [])

  const sendResultToLich = useCallback(() => {
    if (!lastResult || !onSendToLich) return

    const modifierStr =
      lastResult.modifier !== 0
        ? lastResult.modifier > 0
          ? `+${lastResult.modifier}`
          : `${lastResult.modifier}`
        : ""

    const rollDescription = lastResult.label ? `${lastResult.label}: ` : ""

    const message = `[Dice Roll] ${characterName} rolled ${lastResult.rolls.length}${lastResult.die}${modifierStr}${rollDescription ? ` for ${rollDescription}` : ""}: [${lastResult.rolls.join(", ")}]${modifierStr} = **${lastResult.total}**`

    onSendToLich(message)
  }, [lastResult, onSendToLich, characterName])

  // Quick rolls initiate a roll immediately through the cinematic overlay.
  // Attack / Initiative / Saving Throw are d20 checks; Damage uses the currently
  // selected die + count. All carry the current modifier.
  const quickRolls: { label: string; spec: RollSpec }[] = [
    { label: "Attack", spec: { die: "d20", numDice: 1, modifier, label: "Attack roll" } },
    { label: "Damage", spec: { die: selectedDie, numDice, modifier, label: "Damage roll" } },
    { label: "Initiative", spec: { die: "d20", numDice: 1, modifier, label: "Initiative" } },
    { label: "Saving Throw", spec: { die: "d20", numDice: 1, modifier, label: "Saving throw" } },
  ]

  const busy = overlayOpen

  // Crit/fumble accent for the overlay total (single d20 only).
  const overlayCrit =
    overlayResult && overlayResult.die === "d20" && overlayResult.rolls.length === 1 && overlayResult.rolls[0] === 20
  const overlayFumble =
    overlayResult && overlayResult.die === "d20" && overlayResult.rolls.length === 1 && overlayResult.rolls[0] === 1

  return (
    <FantasyPanel className="flex-shrink-0">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#2a2420]/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Dices className="w-4 h-4 text-[#c9a868]" />
          <span className="text-xs font-semibold tracking-[0.15em] uppercase text-[#c9b896]">Dice Roller</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-stone-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-stone-500" />
        )}
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
          {iframeFailed && (
            <p className="text-[10px] text-stone-600">Animated roller unavailable — rolling locally.</p>
          )}

          {/* Dice Selection */}
          <div className="flex gap-1 justify-center flex-wrap">
            {DICE_TYPES.map((dieType) => (
              <button
                key={dieType.die}
                onClick={() => setSelectedDie(dieType.die)}
                className={cn(
                  "w-10 h-10 rounded border-2 flex items-center justify-center text-xs font-bold transition-all",
                  "bg-gradient-to-br",
                  dieType.color,
                  selectedDie === dieType.die
                    ? cn(dieType.border, "ring-2 ring-[#d4b15a]/60 shadow-lg")
                    : "border-[#3d3428]/60 hover:border-[#5d5448]",
                  selectedDie === dieType.die ? "text-white" : "text-stone-400",
                )}
              >
                {dieType.die}
              </button>
            ))}
          </div>

          {/* Number of Dice & Modifier */}
          <div className="flex gap-2 items-center justify-center">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setNumDice(Math.max(1, numDice - 1))}
                className="w-6 h-6 rounded bg-[#2a2420] border border-[#3d3428] text-stone-400 hover:text-white hover:border-[#5d5448] transition-colors"
              >
                -
              </button>
              <span className="w-8 text-center text-sm font-bold text-[#c9a868]">{numDice}</span>
              <button
                onClick={() => setNumDice(Math.min(10, numDice + 1))}
                className="w-6 h-6 rounded bg-[#2a2420] border border-[#3d3428] text-stone-400 hover:text-white hover:border-[#5d5448] transition-colors"
              >
                +
              </button>
            </div>

            <span className="text-stone-500 text-lg font-bold">{selectedDie}</span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setModifier(modifier - 1)}
                className="w-6 h-6 rounded bg-[#2a2420] border border-[#3d3428] text-stone-400 hover:text-white hover:border-[#5d5448] transition-colors"
              >
                -
              </button>
              <span
                className={cn(
                  "w-10 text-center text-sm font-bold",
                  modifier > 0 ? "text-[#7ac87a]" : modifier < 0 ? "text-[#c87a7a]" : "text-stone-500",
                )}
              >
                {modifier >= 0 ? `+${modifier}` : modifier}
              </span>
              <button
                onClick={() => setModifier(modifier + 1)}
                className="w-6 h-6 rounded bg-[#2a2420] border border-[#3d3428] text-stone-400 hover:text-white hover:border-[#5d5448] transition-colors"
              >
                +
              </button>
            </div>
          </div>

          {/* Roll Label */}
          <input
            type="text"
            value={rollLabel}
            onChange={(e) => setRollLabel(e.target.value)}
            placeholder="Roll label (optional)"
            className="w-full px-2 py-1 text-xs bg-[#1a1614] border border-[#3d3428] rounded text-stone-300 placeholder:text-stone-600 focus:outline-none focus:border-[#5d5448]"
          />

          {/* Roll Button — routes through the cinematic overlay */}
          <button
            onClick={() =>
              initiateRoll({ die: selectedDie, numDice, modifier, label: rollLabel || undefined })
            }
            disabled={busy}
            className={cn(
              "w-full py-2 rounded font-bold uppercase tracking-wider text-sm transition-all",
              "bg-gradient-to-r from-[#4a3a2a] via-[#5a4a3a] to-[#4a3a2a]",
              "border border-[#8a6a4a] hover:border-[#c9a868]",
              "text-[#c9a868] hover:text-white",
              "shadow-[0_0_15px_rgba(200,150,80,0.2)] hover:shadow-[0_0_20px_rgba(200,150,80,0.4)]",
              busy && "opacity-60 cursor-not-allowed",
            )}
          >
            {busy
              ? "Rolling..."
              : `Roll ${numDice}${selectedDie}${modifier !== 0 ? (modifier > 0 ? `+${modifier}` : modifier) : ""}`}
          </button>

          {/* Last Result — the roll log (shared by overlay + fallback results) */}
          {lastResult && (
            <div className="p-2 bg-[#0f0d0c] border border-[#3d3428] rounded">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wider text-stone-500">
                  {lastResult.label || "Result"}
                </span>
                <span className="text-[10px] text-stone-600">
                  {lastResult.rolls.length}
                  {lastResult.die}
                  {lastResult.modifier !== 0 &&
                    (lastResult.modifier > 0 ? `+${lastResult.modifier}` : lastResult.modifier)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex gap-1 flex-wrap">
                  {lastResult.rolls.map((roll, i) => (
                    <span
                      key={i}
                      className={cn(
                        "w-6 h-6 rounded flex items-center justify-center text-xs font-bold",
                        "bg-[#2a2420] border border-[#3d3428]",
                        // Highlight natural 20s and 1s for d20
                        lastResult.die === "d20" && roll === 20 && "bg-[#2a4a2a] border-[#4a8a4a] text-[#7ac87a]",
                        lastResult.die === "d20" && roll === 1 && "bg-[#4a2a2a] border-[#8a4a4a] text-[#c87a7a]",
                        !(lastResult.die === "d20" && (roll === 20 || roll === 1)) && "text-stone-300",
                      )}
                    >
                      {roll}
                    </span>
                  ))}
                  {lastResult.modifier !== 0 && (
                    <span
                      className={cn(
                        "px-1 h-6 rounded flex items-center justify-center text-xs font-bold",
                        lastResult.modifier > 0 ? "text-[#7ac87a]" : "text-[#c87a7a]",
                      )}
                    >
                      {lastResult.modifier > 0 ? `+${lastResult.modifier}` : lastResult.modifier}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-2xl font-serif font-bold text-[#d4b15a]">{lastResult.total}</span>

                  {/* Send to Lich button */}
                  {onSendToLich && (
                    <button
                      onClick={sendResultToLich}
                      className="p-1.5 rounded bg-[#2a1a2a] border border-[#6a4a8a]/60 hover:border-[#8a6aaa] text-[#a87ac8] hover:text-white transition-colors"
                      title="Send result to the Lich"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Quick Roll Buttons — each initiates a cinematic roll */}
          <div className="flex gap-1 flex-wrap">
            {quickRolls.map((qr) => (
              <button
                key={qr.label}
                onClick={() => initiateRoll(qr.spec)}
                disabled={busy}
                className={cn(
                  "px-2 py-1 text-[10px] uppercase tracking-wider rounded bg-[#2a2420] border border-[#3d3428]/60 text-stone-500 hover:text-stone-300 hover:border-[#5d5448] transition-colors",
                  busy && "opacity-60 cursor-not-allowed",
                )}
              >
                {qr.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cinematic roll overlay + permanently-mounted (preloaded) iframe.
          Rendered via portal at body level so it's centered over the whole
          dashboard and immune to panel stacking contexts. The container stays
          mounted so the iframe never reloads; visibility toggles via opacity. */}
      {mounted &&
        createPortal(
          <div
            className={cn(
              "fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-200",
              overlayOpen ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            aria-hidden={!overlayOpen}
            role="dialog"
            aria-label="Dice roll"
          >
            {/* Dimmed backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

            {/* Dark fantasy frame */}
            <div className="relative z-10 rounded-lg border-2 border-[#8a6a4a] bg-gradient-to-b from-[#1a1614] to-[#0f0d0c] p-4 shadow-[0_0_40px_rgba(0,0,0,0.7),0_0_24px_rgba(200,150,80,0.15)]">
              <div className="mb-2 flex items-center justify-center gap-2 text-center">
                <Dices className="h-4 w-4 text-[#c9a868]" />
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c9b896]">
                  {overlayLabel}
                </span>
                <span className="text-[10px] text-stone-500">{overlayNotation}</span>
              </div>

              <div className="relative aspect-square w-[min(78vw,420px)] overflow-hidden rounded border-2 border-[#3d3428] bg-[#0a0908]">
                {/* The animated dice app (permanently mounted / preloaded). */}
                <iframe
                  ref={iframeRef}
                  src={EMBED_URL}
                  title="Animated Dice Roller"
                  className="absolute inset-0 h-full w-full"
                  allow="autoplay; fullscreen"
                  onLoad={() => setIframeReady(true)}
                  onError={() => setIframeFailed(true)}
                />

                {/* Prominent total reveal (result phase). */}
                {overlayPhase === "result" && overlayResult && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 backdrop-blur-[2px]">
                    <span className="text-[11px] uppercase tracking-[0.25em] text-stone-400">
                      {overlayResult.label || "Result"}
                    </span>
                    <span
                      className={cn(
                        "font-serif text-7xl font-extrabold drop-shadow-[0_0_18px_rgba(212,177,90,0.5)]",
                        overlayCrit ? "text-[#ffe9a8]" : overlayFumble ? "text-[#ff8a7a]" : "text-[#d4b15a]",
                      )}
                    >
                      {overlayResult.total}
                    </span>
                    <span className="text-xs text-stone-400">
                      [{overlayResult.rolls.join(", ")}]
                      {overlayResult.modifier !== 0 &&
                        (overlayResult.modifier > 0 ? ` +${overlayResult.modifier}` : ` ${overlayResult.modifier}`)}
                    </span>
                    {overlayCrit && (
                      <span className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-[#ffd76a]">
                        Critical Hit!
                      </span>
                    )}
                    {overlayFumble && (
                      <span className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-[#ff7a6a]">Fumble!</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </FantasyPanel>
  )
}
