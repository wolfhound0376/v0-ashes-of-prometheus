"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { FantasyPanel } from "@/components/ui/fantasy-panel"
import { Dices, Send, ChevronDown, ChevronUp } from "lucide-react"
import type DiceBox from "@3d-dice/dice-box"

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

// --- 3D dice renderer (@3d-dice/dice-box) config -------------------------------
// Static assets copied to /public/assets/dice-box (see copyAssets in the pkg).
const DICE_ASSET_PATH = "/assets/dice-box/"
// Query selector for the persistent canvas mount inside the overlay.
const DICE_MOUNT_SELECTOR = "dice-box-mount"
// Deep bronze/gold base color for the dice bodies (parchment pips come baked
// into the default theme's diffuse texture).
const DICE_THEME_COLOR = "#9c7238"
// If the renderer can't initialize within this window, treat it as failed so
// rolls fall back silently to the classic (local) roller.
const DICE_INIT_TIMEOUT_MS = 8000
// Max time to wait for the physics simulation to settle before falling back.
const RESPONSE_TIMEOUT_MS = 6000
// How long the total lingers prominently in the overlay before auto-dismiss.
const RESULT_DISPLAY_MS = 1500

function sidesOf(die: string): number {
  const m = /d\s*(\d+)/i.exec(die)
  return m ? Number.parseInt(m[1], 10) : 20
}

// Build a display notation string like "2d20+3" / "1d6-1" / "1d20".
function buildNotation(spec: RollSpec): string {
  const mod = spec.modifier
  const modStr = mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : ""
  return `${spec.numDice}${spec.die}${modStr}`
}

// Compute a roll locally — the classic roller, used as the silent fallback ONLY
// when the 3D renderer is unavailable, fails, or never settles. When the 3D
// dice do roll, THEIR values are authoritative and this is never invoked.
function resolveClassic(spec: RollSpec): DiceResult {
  const sides = sidesOf(spec.die)
  const rolls: number[] = []
  for (let i = 0; i < spec.numDice; i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1)
  }
  const total = rolls.reduce((sum, r) => sum + r, 0) + spec.modifier
  return { die: spec.die, rolls, modifier: spec.modifier, total, label: spec.label, timestamp: new Date() }
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

  // 3D renderer lifecycle. The DiceBox instance + its canvas are created once
  // into a permanently-mounted container so the overlay opens instantly.
  // diceFailed flips the whole flow to the silent classic fallback.
  const [diceReady, setDiceReady] = useState(false)
  const [diceFailed, setDiceFailed] = useState(false)
  const diceBoxRef = useRef<DiceBox | null>(null)

  // Overlay state.
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [overlayPhase, setOverlayPhase] = useState<"rolling" | "result">("rolling")
  const [overlayLabel, setOverlayLabel] = useState<string>("")
  const [overlayNotation, setOverlayNotation] = useState<string>("")
  const [overlayResult, setOverlayResult] = useState<DiceResult | null>(null)

  // The in-flight request. token disambiguates a live roll from one that has
  // already timed out (so a late-settling simulation is ignored).
  const pendingRef = useRef<{ token: number; spec: RollSpec } | null>(null)
  const tokenRef = useRef(0)
  const responseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Initialize the 3D dice renderer once the portal (and its mount node) exist.
  useEffect(() => {
    if (!mounted || diceBoxRef.current) return
    let cancelled = false
    const initTimer = setTimeout(() => {
      if (!diceBoxRef.current && !cancelled) {
        console.warn("[DiceRoller] 3D dice init timed out; using classic roller.")
        setDiceFailed(true)
      }
    }, DICE_INIT_TIMEOUT_MS)
    ;(async () => {
      try {
        const mod = await import("@3d-dice/dice-box")
        const DiceBoxCtor = mod.default
        const box = new DiceBoxCtor({
          id: "dice-canvas",
          assetPath: DICE_ASSET_PATH,
          container: `#${DICE_MOUNT_SELECTOR}`,
          theme: "default",
          themeColor: DICE_THEME_COLOR,
          scale: 6,
          gravity: 2,
          enableShadows: true,
          shadowTransparency: 0.75,
          lightIntensity: 1.1,
        })
        await box.init()
        if (cancelled) return
        diceBoxRef.current = box
        setDiceReady(true)
      } catch (err) {
        console.warn("[DiceRoller] 3D dice failed to initialize; using classic roller.", err)
        if (!cancelled) setDiceFailed(true)
      } finally {
        clearTimeout(initTimer)
      }
    })()
    return () => {
      cancelled = true
      clearTimeout(initTimer)
    }
  }, [mounted])

  // Apply a finished roll to the shared roll-handling path: the result log and
  // the telemetry callback. Used by BOTH the 3D result and the classic
  // fallback, so the dashboard stays the single system of record.
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

  // Initiate ANY roll. Opens the cinematic overlay and tumbles the 3D dice;
  // dice-box's own simulation produces the authoritative values. If the
  // renderer is unavailable or never settles, resolves silently with the
  // classic roller so gameplay never blocks.
  const initiateRoll = useCallback(
    (spec: RollSpec) => {
      // A roll is already in flight — ignore re-entrancy.
      if (pendingRef.current) return

      const notation = buildNotation(spec)
      const box = diceBoxRef.current

      // Renderer unusable → resolve classic immediately, no overlay.
      if (diceFailed || !diceReady || !box) {
        applyResult(resolveClassic(spec))
        return
      }

      const token = ++tokenRef.current
      pendingRef.current = { token, spec }

      // Open the overlay in the rolling phase.
      setOverlayResult(null)
      setOverlayPhase("rolling")
      setOverlayLabel(spec.label || "Dice roll")
      setOverlayNotation(notation)
      setOverlayOpen(true)

      // Roll the dice portion only (modifier is applied to the total by us);
      // dice-box notation does not include modifiers.
      const diceNotation = `${spec.numDice}${spec.die}`

      box
        .roll(diceNotation)
        .then((results) => {
          const pend = pendingRef.current
          if (!pend || pend.token !== token) return // stale — already timed out
          if (responseTimerRef.current) clearTimeout(responseTimerRef.current)
          pendingRef.current = null

          // Trust dice-box's simulated values as authoritative (never re-roll).
          const values = Array.isArray(results)
            ? results.map((r) => r.value).filter((v) => typeof v === "number" && Number.isFinite(v))
            : []

          if (values.length === 0) {
            // Unexpected empty result — fall back silently.
            closeOverlay()
            applyResult(resolveClassic(spec))
            return
          }

          const sum = values.reduce((a, b) => a + b, 0)
          const result: DiceResult = {
            die: spec.die,
            rolls: values,
            modifier: spec.modifier,
            total: sum + spec.modifier,
            label: spec.label,
            timestamp: new Date(),
          }

          // Reveal the total prominently, then auto-dismiss and commit to the log.
          setOverlayResult(result)
          setOverlayPhase("result")
          resultTimerRef.current = setTimeout(() => {
            closeOverlay()
            applyResult(result)
          }, RESULT_DISPLAY_MS)
        })
        .catch((err) => {
          const pend = pendingRef.current
          if (!pend || pend.token !== token) return
          if (responseTimerRef.current) clearTimeout(responseTimerRef.current)
          pendingRef.current = null
          console.warn("[DiceRoller] 3D roll failed; using classic result.", err)
          closeOverlay()
          applyResult(resolveClassic(spec))
        })

      // Safety net: dice never settle within the window → silent classic result.
      responseTimerRef.current = setTimeout(() => {
        const pend = pendingRef.current
        if (!pend || pend.token !== token) return
        pendingRef.current = null
        closeOverlay()
        applyResult(resolveClassic(spec))
      }, RESPONSE_TIMEOUT_MS)
    },
    [diceFailed, diceReady, applyResult, closeOverlay],
  )

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
          {diceFailed && (
            <p className="text-[10px] text-stone-600">3D dice unavailable — rolling locally.</p>
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
            onClick={() => initiateRoll({ die: selectedDie, numDice, modifier, label: rollLabel || undefined })}
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

      {/* Cinematic roll overlay + permanently-mounted (preloaded) 3D canvas.
          Rendered via portal at body level so it's centered over the whole
          dashboard and immune to panel stacking contexts. The dice canvas mount
          stays in the DOM so the renderer never re-initializes; visibility
          toggles via opacity so the overlay opens instantly. */}
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
              {/* Roll label — serif, above the tray */}
              <div className="mb-2 flex items-center justify-center gap-2 text-center">
                <Dices className="h-4 w-4 text-[#c9a868]" />
                <span className="font-serif text-sm font-semibold tracking-[0.12em] text-[#e0cfa0]">
                  {overlayLabel}
                </span>
                <span className="text-[10px] text-stone-500">{overlayNotation}</span>
              </div>

              {/* Near-black felt tray holding the tumbling 3D dice */}
              <div className="relative aspect-square w-[min(78vw,420px)] overflow-hidden rounded border-2 border-[#3d3428] bg-[#0a0908]">
                {/* Persistent 3D dice canvas mount (preloaded). */}
                <div
                  id={DICE_MOUNT_SELECTOR}
                  className="absolute inset-0 h-full w-full [&_canvas]:!absolute [&_canvas]:!inset-0 [&_canvas]:!h-full [&_canvas]:!w-full"
                />

                {/* Subtle amber rim light around the felt. */}
                <div className="pointer-events-none absolute inset-0 rounded shadow-[inset_0_0_46px_rgba(212,177,90,0.16)]" />

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
