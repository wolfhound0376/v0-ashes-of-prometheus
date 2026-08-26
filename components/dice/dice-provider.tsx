"use client"

// ============================================================================
// SHARED DICE ENGINE — one roller, one truth.
//
// This provider owns the SINGLE 3D dice engine (@3d-dice/dice-box) and the
// cinematic roll overlay for the whole dashboard. Every roll — the dice tray,
// the character sheet, attacks, saves, skills — goes through roll() here.
// Nothing else in the app may compute a dice result on its own: the physics
// simulation's values are authoritative, with the classic (local) roller used
// ONLY as a silent fallback when the renderer is unavailable.
//
// The engine + overlay were lifted out of components/dashboard/dice-roller.tsx
// unchanged in behavior; that component is now UI-only and rolls through this
// provider like everyone else.
//
// RESILIENT INIT (2026-08-10): the engine used to get exactly one 8-second
// attempt at page load; a slow first load (cold cache after a heavy deploy)
// or a WebGL hiccup meant every roll for the rest of the session quietly
// resolved as instant text. Now the load-time cutoff is a soft notice — the
// attempt keeps going in the background and a late success still restores the
// 3D dice — hard failures auto-retry with backoff, a small "tap to retry"
// chip appears when the engine is down, and any roll re-kicks a dead engine.
// Rolls are never blocked: classic results stand in exactly as before.
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { Dices } from "lucide-react"
import type DiceBox from "@3d-dice/dice-box"

// --- Public types -----------------------------------------------------------

export interface DiceResult {
  die: string
  rolls: number[]
  modifier: number
  total: number
  label?: string
  timestamp: Date
  /** Natural 20 on a single d20. */
  isCrit: boolean
  /** Natural 1 on a single d20. */
  isFail: boolean
  rollMode?: RollMode
  keptRolls?: number[]
}

export type RollMode = "normal" | "advantage" | "disadvantage"

export interface RollSpec {
  die: string
  numDice: number
  modifier: number
  label?: string
  rollMode?: RollMode
}

export interface DiceContextValue {
  /**
   * Roll dice through the shared cinematic roller. Resolves with the final
   * result once the dice settle (or the classic fallback resolves). Rolls
   * requested while another is in flight are queued — never dropped, never
   * overlapping.
   */
  roll: (spec: RollSpec) => Promise<DiceResult>
  /**
   * Announce a completed roll (or roll sequence) to the table. The dashboard
   * page wires this to the shared dialogue feed; `toLich: true` additionally
   * sends it to Malachar as this browser's character so the DM narrates the
   * outcome. Outside the dashboard this is a no-op.
   */
  announce: (text: string, opts?: { toLich?: boolean; result?: DiceResult }) => void
  /** True while a roll is tumbling in the overlay. */
  busy: boolean
  /** True when the 3D renderer initialized successfully. */
  ready: boolean
}

// --- Engine constants (unchanged from the original dice-roller) -------------

const DICE_ASSET_PATH = "/assets/dice-box/"
const DICE_MOUNT_SELECTOR = "dice-box-mount"
const DICE_THEME_COLOR = "#8b1814"
// Soft notice, not a death sentence: after this long the classic roller (and
// the retry chip) take over, but the attempt keeps loading in the background
// and a late success still brings the 3D dice up.
const DICE_INIT_SOFT_TIMEOUT_MS = 20000
// A failed attempt retries on its own this many times, waiting a little
// longer each time. After that the chip (or the next roll) can re-kick it.
const DICE_INIT_MAX_AUTO_RETRIES = 3
const DICE_INIT_RETRY_DELAY_MS = 8000

// Sam's dice-box recording: two dice shaken and tumbled onto felt. One shared
// element, rewound on each roll, so rapid rolls retrigger cleanly instead of
// stacking overlapping copies. Created lazily on first roll — a roll is always
// user-initiated, so autoplay policy never blocks it.
const DICE_SFX_SRC = "/audio/dice-roll.mp3"
let diceSfx: HTMLAudioElement | null = null

function playDiceSfx() {
  if (typeof window === "undefined") return
  try {
    if (!diceSfx) {
      diceSfx = new Audio(DICE_SFX_SRC)
      diceSfx.preload = "auto"
      diceSfx.volume = 0.7
    }
    diceSfx.currentTime = 0
    void diceSfx.play().catch(() => {})
  } catch {
    // Never let a missing or blocked sound file stop the dice from rolling.
  }
}
const RESPONSE_TIMEOUT_MS = 6000
const RESULT_DISPLAY_MS = 1500

function sidesOf(die: string): number {
  const m = /d\s*(\d+)/i.exec(die)
  return m ? Number.parseInt(m[1], 10) : 20
}

export function buildNotation(spec: RollSpec): string {
  const mod = spec.modifier
  const modStr = mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : ""
  const mode = spec.rollMode && spec.rollMode !== "normal" ? ` (${spec.rollMode})` : ""
  return `${spec.numDice}${spec.die}${modStr}${mode}`
}

function finalize(spec: RollSpec, rolls: number[]): DiceResult {
  const usesD20Mode = spec.die === "d20" && spec.rollMode && spec.rollMode !== "normal"
  const keptRolls = usesD20Mode
    ? Array.from({ length: spec.numDice }, (_, index) => {
        const pair = rolls.slice(index * 2, index * 2 + 2)
        if (pair.length === 0) return 0
        return spec.rollMode === "advantage" ? Math.max(...pair) : Math.min(...pair)
      })
    : rolls
  const total = keptRolls.reduce((sum, r) => sum + r, 0) + spec.modifier
  const single20 = spec.die === "d20" && keptRolls.length === 1
  return {
    die: spec.die,
    rolls,
    modifier: spec.modifier,
    total,
    label: spec.label,
    timestamp: new Date(),
    isCrit: single20 && keptRolls[0] === 20,
    isFail: single20 && keptRolls[0] === 1,
    rollMode: spec.rollMode,
    keptRolls,
  }
}

function physicalDiceCount(spec: RollSpec): number {
  return spec.die === "d20" && spec.rollMode && spec.rollMode !== "normal" ? spec.numDice * 2 : spec.numDice
}

// Classic (local) roller — silent fallback ONLY when the 3D renderer is
// unavailable, fails, or never settles. When the 3D dice roll, THEIR values
// are authoritative and this is never invoked.
function resolveClassic(spec: RollSpec): DiceResult {
  const sides = sidesOf(spec.die)
  const rolls: number[] = []
  for (let i = 0; i < physicalDiceCount(spec); i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1)
  }
  return finalize(spec, rolls)
}

// --- Context ----------------------------------------------------------------

// Default context: rolls resolve via the classic roller with no overlay, and
// announce is a no-op. This keeps panels safe if they ever render outside the
// dashboard (e.g. an admin preview) — but the dashboard always provides the
// real engine.
const DiceContext = createContext<DiceContextValue>({
  roll: async (spec) => resolveClassic(spec),
  announce: () => {},
  busy: false,
  ready: false,
})

export function useDice(): DiceContextValue {
  return useContext(DiceContext)
}

// --- Provider ---------------------------------------------------------------

interface DiceProviderProps {
  children: ReactNode
  /** Wired by the dashboard page to the shared dialogue feed / Lich chat. */
  onAnnounce?: (text: string, opts: { toLich: boolean; result?: DiceResult }) => void
}

interface QueuedRoll {
  spec: RollSpec
  resolve: (result: DiceResult) => void
}

export function DiceProvider({ children, onAnnounce }: DiceProviderProps) {
  const [mounted, setMounted] = useState(false)
  const [diceReady, setDiceReady] = useState(false)
  // True when no engine is up and no attempt is quietly making progress —
  // i.e. the state the retry chip should be visible in.
  const [diceFailed, setDiceFailed] = useState(false)
  const diceBoxRef = useRef<DiceBox | null>(null)

  // Init lifecycle. One attempt in flight at a time; auto-retries with
  // backoff; the chip and startRoll can both re-kick a dead engine.
  const initializingRef = useRef(false)
  const autoRetryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmountedRef = useRef(false)

  // Overlay state.
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [overlayPhase, setOverlayPhase] = useState<"rolling" | "result">("rolling")
  const [overlayLabel, setOverlayLabel] = useState("")
  const [overlayNotation, setOverlayNotation] = useState("")
  const [overlayResult, setOverlayResult] = useState<DiceResult | null>(null)

  // In-flight + queued rolls. token disambiguates a live roll from one that
  // already timed out (so a late-settling simulation is ignored).
  const pendingRef = useRef<{ token: number; spec: RollSpec; resolve: (r: DiceResult) => void } | null>(null)
  const queueRef = useRef<QueuedRoll[]>([])
  const tokenRef = useRef(0)
  const responseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // initDice re-enters itself through the retry timer, so keep it in a ref
  // (same pattern as startRollRef below).
  const initDiceRef = useRef<() => void>(() => {})

  // Start (or restart) the 3D dice renderer. Safe to call any time: it
  // no-ops when the engine is already up or an attempt is in flight.
  const initDice = useCallback(() => {
    if (typeof window === "undefined") return
    if (diceBoxRef.current || initializingRef.current) return
    initializingRef.current = true
    setDiceFailed(false)

    // Soft cutoff: flip the UI to the classic roller + retry chip, but let
    // the attempt keep loading — on a slow connection "late" is still a win.
    const softTimer = setTimeout(() => {
      if (!diceBoxRef.current && !unmountedRef.current) {
        console.warn(
          `[Dice] 3D dice init passed ${DICE_INIT_SOFT_TIMEOUT_MS / 1000}s; classic roller standing in while it keeps loading.`,
        )
        setDiceFailed(true)
      }
    }, DICE_INIT_SOFT_TIMEOUT_MS)

    ;(async () => {
      try {
        const mod = await import("@3d-dice/dice-box")
        const DiceBoxCtor = mod.default
        // A dead canvas left by an earlier failed attempt would sit beneath
        // the new one and confuse the engine — start from a clean mount.
        document.getElementById(DICE_MOUNT_SELECTOR)?.replaceChildren()
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
        if (unmountedRef.current || diceBoxRef.current) return
        diceBoxRef.current = box
        autoRetryCountRef.current = 0
        setDiceReady(true)
        setDiceFailed(false)
      } catch (err) {
        console.warn("[Dice] 3D dice failed to initialize; classic roller standing in.", err)
        if (unmountedRef.current) return
        setDiceFailed(true)
        if (autoRetryCountRef.current < DICE_INIT_MAX_AUTO_RETRIES) {
          autoRetryCountRef.current += 1
          retryTimerRef.current = setTimeout(
            () => initDiceRef.current(),
            DICE_INIT_RETRY_DELAY_MS * autoRetryCountRef.current,
          )
        }
      } finally {
        clearTimeout(softTimer)
        initializingRef.current = false
      }
    })()
  }, [])
  initDiceRef.current = initDice

  // Initialize the 3D dice renderer once the portal (and its mount node) exist.
  useEffect(() => {
    if (!mounted) return
    unmountedRef.current = false
    initDice()
    return () => {
      unmountedRef.current = true
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [mounted, initDice])

  const closeOverlay = useCallback(() => {
    setOverlayOpen(false)
    setOverlayResult(null)
    setOverlayPhase("rolling")
  }, [])

  // Complete the in-flight roll, then run the next queued one (if any).
  const settle = useCallback(
    (result: DiceResult, resolve: (r: DiceResult) => void) => {
      resolve(result)
      const next = queueRef.current.shift()
      if (next) {
        // Small beat between queued rolls so back-to-back rolls read clearly.
        setTimeout(() => startRollRef.current?.(next.spec, next.resolve), 250)
      } else {
        setBusy(false)
      }
    },
    [],
  )

  // startRoll is self-referential through settle → queue, so keep it in a ref.
  const startRollRef = useRef<((spec: RollSpec, resolve: (r: DiceResult) => void) => void) | null>(null)

  const startRoll = useCallback(
    (spec: RollSpec, resolve: (r: DiceResult) => void) => {
      const box = diceBoxRef.current

      // Above the renderer check on purpose: the dice should sound the same
      // whether the 3D box is up or the classic fallback resolved it.
      playDiceSfx()

      // Renderer unusable → resolve classic immediately, no overlay. A roll
      // is also a fine moment to re-kick a dead engine: this roll resolves
      // classic, the next one may get the physics back.
      if (diceFailed || !diceReady || !box) {
        if (!box) initDiceRef.current()
        settle(resolveClassic(spec), resolve)
        return
      }

      const token = ++tokenRef.current
      pendingRef.current = { token, spec, resolve }

      // Open the overlay in the rolling phase.
      setOverlayResult(null)
      setOverlayPhase("rolling")
      setOverlayLabel(spec.label || "Dice roll")
      setOverlayNotation(buildNotation(spec))
      setOverlayOpen(true)

      // Roll the dice portion only (modifier is applied to the total by us);
      // dice-box notation does not include modifiers.
      const diceNotation = `${physicalDiceCount(spec)}${spec.die}`

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
            closeOverlay()
            settle(resolveClassic(spec), resolve)
            return
          }

          const result = finalize(spec, values)

          // Reveal the total prominently, then auto-dismiss and hand it back.
          setOverlayResult(result)
          setOverlayPhase("result")
          resultTimerRef.current = setTimeout(() => {
            closeOverlay()
            settle(result, resolve)
          }, RESULT_DISPLAY_MS)
        })
        .catch((err) => {
          const pend = pendingRef.current
          if (!pend || pend.token !== token) return
          if (responseTimerRef.current) clearTimeout(responseTimerRef.current)
          pendingRef.current = null
          console.warn("[Dice] 3D roll failed; using classic result.", err)
          closeOverlay()
          settle(resolveClassic(spec), resolve)
        })

      // Safety net: dice never settle within the window → silent classic result.
      responseTimerRef.current = setTimeout(() => {
        const pend = pendingRef.current
        if (!pend || pend.token !== token) return
        pendingRef.current = null
        closeOverlay()
        settle(resolveClassic(spec), resolve)
      }, RESPONSE_TIMEOUT_MS)
    },
    [diceFailed, diceReady, settle, closeOverlay],
  )
  startRollRef.current = startRoll

  // Public roll(): queue if a roll is already tumbling, otherwise start now.
  const roll = useCallback(
    (spec: RollSpec): Promise<DiceResult> =>
      new Promise<DiceResult>((resolve) => {
        if (pendingRef.current || queueRef.current.length > 0) {
          queueRef.current.push({ spec, resolve })
          return
        }
        setBusy(true)
        startRoll(spec, resolve)
      }),
    [startRoll],
  )

  const announce = useCallback(
    (text: string, opts?: { toLich?: boolean; result?: DiceResult }) => {
      onAnnounce?.(text, { toLich: opts?.toLich ?? false, result: opts?.result })
    },
    [onAnnounce],
  )

  // Clean up any pending timers on unmount.
  useEffect(() => {
    return () => {
      if (responseTimerRef.current) clearTimeout(responseTimerRef.current)
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current)
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [])

  const overlayCrit = overlayResult?.isCrit ?? false
  const overlayFumble = overlayResult?.isFail ?? false

  return (
    <DiceContext.Provider value={{ roll, announce, busy, ready: diceReady && !diceFailed }}>
      {children}

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
            <div className="absolute inset-0 bg-black/85 backdrop-blur-[3px]" />

            {/* Dark fantasy frame */}
            <div className="aop-dice-modal relative z-10 p-4">
              {/* Roll label — serif, above the tray */}
              <div className="mb-2 flex items-center justify-center gap-2 text-center">
                <Dices className="h-4 w-4 text-[#c9a868]" />
                <span className="font-serif text-sm font-semibold tracking-[0.12em] text-[#e0cfa0]">
                  {overlayLabel}
                </span>
                <span className="text-[10px] text-stone-500">{overlayNotation}</span>
              </div>

              {/* Near-black felt tray holding the tumbling 3D dice */}
              <div className="relative aspect-square w-[min(78vw,420px)] overflow-hidden rounded-sm border-2 border-[#70491d] bg-[#050504] shadow-[inset_0_0_0_2px_#0a0704,inset_0_0_48px_#000]">
                {/* Persistent 3D dice canvas mount (preloaded). */}
                <div
                  id={DICE_MOUNT_SELECTOR}
                  className="absolute inset-0 h-full w-full [&_canvas]:!absolute [&_canvas]:!inset-0 [&_canvas]:!h-full [&_canvas]:!w-full"
                />

                {/* Subtle amber rim light around the felt. */}
                <div className="pointer-events-none absolute inset-0 rounded-sm bg-[radial-gradient(circle_at_50%_38%,transparent_20%,rgba(100,20,13,0.08)_55%,rgba(0,0,0,0.72)_100%)] shadow-[inset_0_0_46px_rgba(212,142,58,0.18)]" />

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

      {/* Quiet status chip: only when the 3D renderer is down. Rolls still
          work (classic results); tapping re-kicks the engine by hand and
          resets the auto-retry budget. Sits above the status bar, below the
          roll overlay. */}
      {mounted &&
        diceFailed &&
        !diceReady &&
        createPortal(
          <button
            type="button"
            onClick={() => {
              autoRetryCountRef.current = 0
              initDice()
            }}
            className="fixed bottom-12 right-3 z-[90] flex items-center gap-1.5 rounded-[3px] border border-[#7a5f33]/70 bg-[#15110c]/95 px-2.5 py-1.5 text-[11px] text-[#d9bd7e] shadow-[0_2px_10px_rgba(0,0,0,0.5)] transition-colors hover:border-[#c9a868] hover:text-[#f0dba8]"
            title="The 3D dice renderer hasn't started (slow connection or WebGL unavailable). Rolls still work — tap to try starting the 3D dice again."
          >
            <Dices className="h-3.5 w-3.5 text-[#c9a868]" />
            3D dice off — tap to retry
          </button>,
          document.body,
        )}
    </DiceContext.Provider>
  )
}

// --- Shared helpers for roll announcements ----------------------------------

/** "Stealth: 14 (1d20+2 → [12] +2)" — the standard feed line for one roll. */
export function describeRoll(result: DiceResult): string {
  const notation = buildNotation({
    die: result.die,
    numDice: result.rolls.length,
    modifier: result.modifier,
    label: result.label,
  })
  const mod =
    result.modifier !== 0 ? (result.modifier > 0 ? ` +${result.modifier}` : ` ${result.modifier}`) : ""
  const flag = result.isCrit ? " — CRITICAL!" : result.isFail ? " — FUMBLE!" : ""
  return `${result.label || "Roll"}: ${result.total}${flag} (${notation} → [${result.rolls.join(", ")}]${mod})`
}

/** Parse a damage string like "1d8+3" / "2d6" into a RollSpec, or null for flat damage like "1+2". */
export function parseDamage(damage: string, label?: string): RollSpec | null {
  const m = /(\d+)\s*d\s*(\d+)\s*([+-]\s*\d+)?/i.exec(damage)
  if (!m) return null
  return {
    numDice: Math.max(1, Number.parseInt(m[1], 10)),
    die: `d${m[2]}`,
    modifier: m[3] ? Number.parseInt(m[3].replace(/\s+/g, ""), 10) : 0,
    label,
  }
}
