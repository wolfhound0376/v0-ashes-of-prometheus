"use client"

// ============================================================================
// WALK ROLL BRIDGE — the painted map asks, the dashboard's dice answer.
//
// Mounted by app/velkynvelve/page.tsx inside a DiceProvider, next to the map's
// iframe. When the map posts {type: "aop:roll", action} (lib/walk-roll.ts),
// this:
//   1. reads the acting character's row (this browser's own seat; the map's
//      guess only when there is no seat, i.e. the DM at the map),
//   2. works out the modifier with the dashboard's own maths, itemised,
//   3. opens the roll panel (components/walk/roll-panel.tsx — Sam, 2026-10-25:
//      "Make it like BG3 and make it look good") and tells the map it is open,
//   4. when the player clicks the die, rolls through the one dice engine, so
//      the same 3D dice, sound and result card the dashboard's sheet uses,
//   5. shows the total and the verdict, then answers the map so it can open the
//      gate or not, writes the 🎲 line to the shared log, and sends Malachar the
//      roll and verdict as this character.
// Stepping back from the panel rolls nothing and tells nobody.
// Requests from anywhere but the map's own frame, or for an action the closed
// table does not name, are ignored. One panel at a time.
// ============================================================================

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { describeRoll, useDice } from "@/components/dice/dice-provider"
import { createClient } from "@/lib/supabase/client"
import { useLich } from "@/lib/hooks/use-lich"
import { RollPanel, type RollPanelPhase, type RollPanelResult } from "@/components/walk/roll-panel"
import {
  WALK_ACTIONS,
  WALK_ROLL_COLUMNS,
  difficultyWord,
  parseWalkRollRequest,
  walkCheckModifier,
  walkRollMessage,
  walkVerdict,
  type WalkActionKey,
  type WalkModifierPart,
  type WalkRollAck,
  type WalkRollReply,
} from "@/lib/walk-roll"

function readSeat(): { characterId: string | null; claimToken: string | null } {
  try {
    return { characterId: localStorage.getItem("aop_character_id"), claimToken: localStorage.getItem("aop_claim_token") }
  } catch {
    return { characterId: null, claimToken: null }
  }
}

function isSandbox(): boolean {
  try { return new URL(window.location.href).searchParams.get("sandbox") === "1" } catch { return false }
}

interface Pending {
  id: string
  action: WalkActionKey
  frame: Window
  who: string
  characterId: string | null
  modifier: number
  parts: WalkModifierPart[]
}

export function WalkRollBridge({ frameRef }: { frameRef: RefObject<HTMLIFrameElement | null> }) {
  const { roll } = useDice()
  const { sendMessage } = useLich()
  const [pending, setPending] = useState<Pending | null>(null)
  const [phase, setPhase] = useState<RollPanelPhase>("ready")
  const [result, setResult] = useState<RollPanelResult | null>(null)
  const seen = useRef(new Set<string>())
  const pendingRef = useRef<Pending | null>(null)
  const outcomeRef = useRef<{ reply: Omit<WalkRollReply, "type" | "id">; text: string; success: boolean } | null>(null)
  pendingRef.current = pending

  const post = (p: Pending, msg: WalkRollReply | WalkRollAck) => {
    try { p.frame.postMessage(msg, window.location.origin) } catch { /* the map went away */ }
  }

  // 1–3: hear the map, read the sheet, open the panel.
  useEffect(() => {
    const supabase = createClient()
    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const frame = frameRef.current?.contentWindow
      if (!frame || e.source !== frame) return
      const req = parseWalkRollRequest(e.data)
      if (!req || seen.current.has(req.id)) return
      seen.current.add(req.id)
      if (pendingRef.current) {
        try { frame.postMessage({ type: "aop:roll-result", id: req.id, ok: false, error: "Finish the roll in front of you first." } satisfies WalkRollReply, window.location.origin) } catch { /* gone */ }
        return
      }

      const action = WALK_ACTIONS[req.action]
      const seat = readSeat()
      const characterId = seat.characterId || req.characterId || null
      let row: Record<string, unknown> | null = null
      if (characterId) {
        const { data, error } = await supabase.from("characters").select(WALK_ROLL_COLUMNS).eq("id", characterId).maybeSingle()
        if (error) console.error("[walk-roll] could not read the sheet:", error)
        row = (data as Record<string, unknown> | null) ?? null
      }
      // No sheet means no modifier to apply — never a guessed one. The roll still happens.
      const mod = row ? walkCheckModifier(row, action.check) : { modifier: 0, parts: [] as WalkModifierPart[] }
      const who = (row && typeof row.name === "string" && row.name) || "Someone"

      const p: Pending = { id: req.id, action: req.action, frame, who, characterId, modifier: mod.modifier, parts: mod.parts }
      outcomeRef.current = null
      setResult(null)
      setPhase("ready")
      setPending(p)
      post(p, { type: "aop:roll-ack", id: p.id })
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [frameRef])

  // 4: the player throws the die.
  const onRoll = useCallback(async () => {
    const p = pendingRef.current
    if (!p) return
    const action = WALK_ACTIONS[p.action]
    setPhase("rolling")
    let r
    try {
      r = await roll({ die: "d20", numDice: 1, modifier: p.modifier, label: action.check.label })
    } catch (err) {
      console.error("[walk-roll] the dice did not roll:", err)
      post(p, { type: "aop:roll-result", id: p.id, ok: false, error: "The dice did not roll." })
      setPending(null)
      return
    }
    const success = walkVerdict(action, r.total)
    const natural = r.keptRolls?.[0] ?? r.rolls[0]
    outcomeRef.current = { reply: { ok: true, success, total: r.total, natural }, text: describeRoll(r), success }
    setResult({ natural, total: r.total, success })
    setPhase("done")
  }, [roll])

  // 5: the verdict has landed — the map plays it, the log records it, Malachar narrates it.
  const onDone = useCallback(async () => {
    const p = pendingRef.current
    const out = outcomeRef.current
    if (!p || !out) return
    outcomeRef.current = null
    setPending(null)
    post(p, { type: "aop:roll-result", id: p.id, ...out.reply })

    const action = WALK_ACTIONS[p.action]
    const sandbox = isSandbox()
    const supabase = createClient()
    if (!sandbox) {
      const { error } = await supabase.from("dialogue").insert({ speaker: p.who, speaker_type: "player", channel: "dm", text: `🎲 ${out.text}` })
      if (error) console.error("[walk-roll] failed to log the roll:", error)
    }
    // Malachar hears it as this character. Only a seated browser can speak as one; the DM narrates their own.
    const seat = readSeat()
    if (seat.characterId && seat.claimToken && seat.characterId === p.characterId) {
      try {
        await sendMessage(walkRollMessage(p.who, action, out.text, out.success), seat.characterId, seat.claimToken, { sandbox })
      } catch (err) {
        console.error("[walk-roll] Malachar did not take the roll:", err)
      }
    }
  }, [sendMessage])

  const onCancel = useCallback(() => {
    const p = pendingRef.current
    if (!p) return
    setPending(null)
    post(p, { type: "aop:roll-result", id: p.id, ok: false, cancelled: true })
  }, [])

  if (!pending) return null
  const action = WALK_ACTIONS[pending.action]
  return (
    <RollPanel
      who={pending.who}
      title={action.title}
      checkLabel={action.check.label}
      difficulty={difficultyWord(action.dc)}
      parts={pending.parts}
      modifier={pending.modifier}
      phase={phase}
      result={result}
      onRoll={onRoll}
      onCancel={onCancel}
      onDone={onDone}
    />
  )
}
