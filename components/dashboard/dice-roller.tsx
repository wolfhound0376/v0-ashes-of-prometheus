"use client"

import { useState, useCallback, useEffect, useRef } from "react"
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

// URL of the external animated dice app embedded as the default visual roller.
const EMBED_URL = "https://rosebud.ai/play/trayroll-dice"
// Only trust postMessage events originating from this host (or a subdomain).
const TRUSTED_HOST = "rosebud.ai"
// If the iframe hasn't loaded within this window, fall back to the classic roller.
const IFRAME_LOAD_TIMEOUT_MS = 8000

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

/**
 * Validate + normalize an incoming { type:'dice-roll', notation, rolls,
 * modifier, total } payload from the external app. Returns a DiceResult only
 * when every field is sane (correct types, per-die ranges, and a total that is
 * consistent with the rolls + modifier). Returns null otherwise so bogus or
 * spoofed messages are ignored.
 */
function parseIncomingRoll(data: unknown): DiceResult | null {
  if (!data || typeof data !== "object") return null
  const d = data as Record<string, unknown>
  if (d.type !== "dice-roll") return null

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
    die: parsed.die,
    rolls: rolls as number[],
    modifier,
    total: expected,
    label: "Animated Roll",
    timestamp: new Date(),
  }
}

export function DiceRoller({ onRollResult, onSendToLich, characterName = "Player" }: DiceRollerProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [selectedDie, setSelectedDie] = useState<string>("d20")
  const [numDice, setNumDice] = useState(1)
  const [modifier, setModifier] = useState(0)
  const [rollLabel, setRollLabel] = useState("")
  const [lastResult, setLastResult] = useState<DiceResult | null>(null)
  const [isRolling, setIsRolling] = useState(false)
  const [rollingFace, setRollingFace] = useState(20)
  const [flash, setFlash] = useState<"crit" | "fumble" | null>(null)

  // Roller mode. Default to the embedded animated app; the classic built-in
  // roller stays available behind a toggle and as an automatic fallback.
  const [useClassic, setUseClassic] = useState(false)
  const [iframeFailed, setIframeFailed] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Effective view: embedded unless the user chose classic or the iframe failed.
  const showEmbedded = !useClassic && !iframeFailed

  // Apply a finished roll to the shared roll-handling path: crit/fumble drama,
  // the result log, and the telemetry callback. Used by BOTH the built-in
  // roller and rolls received from the embedded animated app, so the external
  // app becomes the visual while the dashboard stays the system of record.
  const applyResult = useCallback(
    (result: DiceResult) => {
      if (result.die === "d20" && result.rolls.length === 1) {
        if (result.rolls[0] === 20) setFlash("crit")
        else if (result.rolls[0] === 1) setFlash("fumble")
        setRollingFace(result.rolls[0])
      }
      setLastResult(result)
      onRollResult?.(result)
      setTimeout(() => setFlash(null), 1400)
    },
    [onRollResult],
  )

  const rollDice = useCallback(() => {
    const dieConfig = DICE_TYPES.find((d) => d.die === selectedDie)
    if (!dieConfig) return

    setIsRolling(true)
    setFlash(null)

    // Tumble: rapidly cycle the visible face while "rolling"
    const cycle = setInterval(() => {
      setRollingFace(Math.floor(Math.random() * dieConfig.sides) + 1)
    }, 55)

    setTimeout(() => {
      clearInterval(cycle)

      const rolls: number[] = []
      for (let i = 0; i < numDice; i++) {
        rolls.push(Math.floor(Math.random() * dieConfig.sides) + 1)
      }

      const total = rolls.reduce((sum, r) => sum + r, 0) + modifier

      const result: DiceResult = {
        die: selectedDie,
        rolls,
        modifier,
        total,
        label: rollLabel || undefined,
        timestamp: new Date(),
      }

      setIsRolling(false)
      applyResult(result)
    }, 650)
  }, [selectedDie, numDice, modifier, rollLabel, applyResult])

  // Listen for roll events posted by the embedded animated dice app. Validates
  // the origin and sanity-checks the payload before feeding it into the shared
  // roll-handling path. The external app may not post messages yet — this is
  // built to spec regardless.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!isTrustedOrigin(event.origin)) return
      const result = parseIncomingRoll(event.data)
      if (!result) {
        // Origin was trusted but the payload was malformed — surface it so the
        // external app's postMessage shape can be diagnosed while wiring it up.
        console.warn("[DiceRoller] Ignored malformed dice-roll message from", event.origin, event.data)
        return
      }
      applyResult(result)
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [applyResult])

  // Auto-fallback: if the embedded app never loads, switch to the classic roller.
  useEffect(() => {
    if (!showEmbedded) return
    if (iframeLoaded) return
    loadTimerRef.current = setTimeout(() => {
      if (!iframeLoaded) setIframeFailed(true)
    }, IFRAME_LOAD_TIMEOUT_MS)
    return () => {
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current)
    }
  }, [showEmbedded, iframeLoaded])

  const sendResultToLich = useCallback(() => {
    if (!lastResult || !onSendToLich) return

    const modifierStr =
      lastResult.modifier !== 0
        ? lastResult.modifier > 0
          ? `+${lastResult.modifier}`
          : `${lastResult.modifier}`
        : ""

    const rollDescription = lastResult.label ? `${lastResult.label}: ` : ""

    // Base the notation on the actual result (works for embedded rolls too).
    const message = `[Dice Roll] ${characterName} rolled ${lastResult.rolls.length}${lastResult.die}${modifierStr}${rollDescription ? ` for ${rollDescription}` : ""}: [${lastResult.rolls.join(", ")}]${modifierStr} = **${lastResult.total}**`

    onSendToLich(message)
  }, [lastResult, onSendToLich, characterName])

  // Quick roll buttons for common checks
  const quickRolls = [
    { label: "Attack", die: "d20", mod: 0 },
    { label: "Damage", die: "d6", mod: 0 },
    { label: "Initiative", die: "d20", mod: 0 },
    { label: "Saving Throw", die: "d20", mod: 0 },
  ]

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
          {/* Roller mode toggle */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-stone-600">
              {showEmbedded ? "Animated roller" : "Classic roller"}
            </span>
            <button
              onClick={() => {
                // Toggling back to embedded resets the failure/load state for a retry.
                if (useClassic) {
                  setIframeFailed(false)
                  setIframeLoaded(false)
                }
                setUseClassic((v) => !v)
              }}
              className="px-2 py-0.5 text-[10px] uppercase tracking-wider rounded bg-[#2a2420] border border-[#3d3428]/60 text-stone-400 hover:text-stone-200 hover:border-[#5d5448] transition-colors"
            >
              {useClassic ? "Use animated" : "Classic roller"}
            </button>
          </div>

          {iframeFailed && !useClassic && (
            <p className="text-[10px] text-[#c87a7a]">Animated roller unavailable — using classic roller.</p>
          )}

          {showEmbedded ? (
            /* Embedded animated dice app (the visual roller). Responsive to the
               panel width; dark border matching the dashboard style. */
            <div className="relative w-full aspect-square rounded border-2 border-[#3d3428] overflow-hidden bg-[#0f0d0c]">
              <iframe
                src={EMBED_URL}
                title="Animated Dice Roller"
                className="absolute inset-0 h-full w-full"
                allow="autoplay; fullscreen"
                onLoad={() => setIframeLoaded(true)}
                onError={() => setIframeFailed(true)}
              />
            </div>
          ) : (
            <>
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

              {/* Roll Button */}
              <button
                onClick={rollDice}
                disabled={isRolling}
                className={cn(
                  "w-full py-2 rounded font-bold uppercase tracking-wider text-sm transition-all",
                  "bg-gradient-to-r from-[#4a3a2a] via-[#5a4a3a] to-[#4a3a2a]",
                  "border border-[#8a6a4a] hover:border-[#c9a868]",
                  "text-[#c9a868] hover:text-white",
                  "shadow-[0_0_15px_rgba(200,150,80,0.2)] hover:shadow-[0_0_20px_rgba(200,150,80,0.4)]",
                  isRolling && "animate-pulse",
                )}
              >
                {isRolling
                  ? "Rolling..."
                  : `Roll ${numDice}${selectedDie}${modifier !== 0 ? (modifier > 0 ? `+${modifier}` : modifier) : ""}`}
              </button>

              {/* Keyframes for the dice drama */}
              <style>{`
                @keyframes aopDiceSpin {
                  0%   { transform: rotate(0deg) scale(1); }
                  50%  { transform: rotate(180deg) scale(1.12); }
                  100% { transform: rotate(360deg) scale(1); }
                }
                @keyframes aopCritPulse {
                  0%   { transform: scale(0.85); box-shadow: 0 0 0 rgba(212,177,90,0); }
                  40%  { transform: scale(1.18); box-shadow: 0 0 28px rgba(212,177,90,0.85); }
                  100% { transform: scale(1); box-shadow: 0 0 8px rgba(212,177,90,0.3); }
                }
                @keyframes aopFumble {
                  0%, 100% { transform: translateX(0) rotate(0deg); }
                  20% { transform: translateX(-5px) rotate(-4deg); }
                  40% { transform: translateX(5px) rotate(4deg); }
                  60% { transform: translateX(-4px) rotate(-3deg); }
                  80% { transform: translateX(4px) rotate(3deg); }
                }
              `}</style>

              {/* Animated d20 stage — tumbles while rolling, flashes on crit/fumble */}
              {(isRolling || flash) && (
                <div className="flex flex-col items-center justify-center py-1">
                  <div
                    className={cn(
                      "relative w-20 h-20 flex items-center justify-center rounded-xl border-2 font-serif font-extrabold text-3xl select-none",
                      "bg-gradient-to-br from-[#3a3320] to-[#1a1608]",
                      isRolling && "border-[#8a8a4a] text-[#e8d89a]",
                      flash === "crit" && "border-[#d4b15a] text-[#ffe9a8]",
                      flash === "fumble" && "border-[#8a4a4a] text-[#ff8a7a]",
                      !isRolling && !flash && "border-[#3d3428] text-stone-300",
                    )}
                    style={{
                      animation: isRolling
                        ? "aopDiceSpin 0.5s linear infinite"
                        : flash === "crit"
                          ? "aopCritPulse 1.4s ease-out"
                          : flash === "fumble"
                            ? "aopFumble 0.6s ease-in-out"
                            : undefined,
                    }}
                  >
                    {rollingFace}
                  </div>
                  {flash === "crit" && (
                    <span className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-[#ffd76a] drop-shadow">
                      Critical Hit!
                    </span>
                  )}
                  {flash === "fumble" && (
                    <span className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-[#ff7a6a] drop-shadow">
                      Fumble!
                    </span>
                  )}
                </div>
              )}
            </>
          )}

          {/* Last Result — shared between both roller modes (the roll log) */}
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

          {/* Quick Roll Buttons — classic roller only (they configure the built-in roll) */}
          {!showEmbedded && (
            <div className="flex gap-1 flex-wrap">
              {quickRolls.map((qr) => (
                <button
                  key={qr.label}
                  onClick={() => {
                    setSelectedDie(qr.die)
                    setRollLabel(qr.label)
                    setNumDice(1)
                  }}
                  className="px-2 py-1 text-[10px] uppercase tracking-wider rounded bg-[#2a2420] border border-[#3d3428]/60 text-stone-500 hover:text-stone-300 hover:border-[#5d5448] transition-colors"
                >
                  {qr.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </FantasyPanel>
  )
}
