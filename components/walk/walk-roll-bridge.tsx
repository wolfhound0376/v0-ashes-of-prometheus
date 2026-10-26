"use client"

// ============================================================================
// WALK ROLL BRIDGE — the painted map asks, the dashboard's dice answer.
//
// Mounted by app/velkynvelve/page.tsx inside a DiceProvider, next to the map's
// iframe. When the map posts {type: "aop:roll", action} (lib/walk-roll.ts),
// this:
//   1. reads the acting character's row (this browser's own seat; the map's
//      guess only when there is no seat, i.e. the DM at the map),
//   2. works out the modifier with the dashboard's own maths,
//   3. rolls through the one dice engine, so the player sees the same 3D dice,
//      sound and result card the dashboard's sheet rolls use,
//   4. answers the map with the total and the verdict, so it can open the gate
//      or not,
//   5. writes the 🎲 line to the shared log, as every dashboard roll does,
//   6. sends Malachar the roll with the verdict, as this character.
// It renders nothing. Requests from anywhere but the map's own frame, or for
// an action the closed table does not name, are ignored.
// ============================================================================

import { useEffect, useRef, type RefObject } from "react"
import { describeRoll, useDice } from "@/components/dice/dice-provider"
import { createClient } from "@/lib/supabase/client"
import { useLich } from "@/lib/hooks/use-lich"
import {
  WALK_ACTIONS,
  WALK_ROLL_COLUMNS,
  parseWalkRollRequest,
  walkCheckModifier,
  walkRollMessage,
  walkVerdict,
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

export function WalkRollBridge({ frameRef }: { frameRef: RefObject<HTMLIFrameElement | null> }) {
  const { roll } = useDice()
  const { sendMessage } = useLich()
  const seen = useRef(new Set<string>())
  // Keep the latest roll/send in refs so the listener is attached once.
  const rollRef = useRef(roll)
  const sendRef = useRef(sendMessage)
  rollRef.current = roll
  sendRef.current = sendMessage

  useEffect(() => {
    const supabase = createClient()

    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const frame = frameRef.current?.contentWindow
      if (!frame || e.source !== frame) return
      const req = parseWalkRollRequest(e.data)
      if (!req || seen.current.has(req.id)) return
      seen.current.add(req.id)

      const reply = (r: Omit<WalkRollReply, "type" | "id">) => {
        try { frame.postMessage({ type: "aop:roll-result", id: req.id, ...r } satisfies WalkRollReply, window.location.origin) } catch { /* the map went away */ }
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
      const { modifier } = row ? walkCheckModifier(row, action.check) : { modifier: 0 }
      const who = (row && typeof row.name === "string" && row.name) || "Someone"

      let result
      try {
        result = await rollRef.current({ die: "d20", numDice: 1, modifier, label: action.check.label })
      } catch (err) {
        console.error("[walk-roll] the dice did not roll:", err)
        reply({ ok: false, error: "The dice did not roll." })
        return
      }
      const success = walkVerdict(action, result.total)
      const natural = result.keptRolls?.[0] ?? result.rolls[0]
      reply({ ok: true, success, total: result.total, natural })

      // The table's log, exactly as a dashboard roll writes it.
      const text = describeRoll(result)
      const sandbox = isSandbox()
      if (!sandbox) {
        const { error } = await supabase.from("dialogue").insert({ speaker: who, speaker_type: "player", channel: "dm", text: `🎲 ${text}` })
        if (error) console.error("[walk-roll] failed to log the roll:", error)
      }

      // Malachar hears it as this character. Only a seated browser can speak as one; the DM narrates their own.
      if (seat.characterId && seat.claimToken && seat.characterId === characterId) {
        try {
          await sendRef.current(walkRollMessage(who, action, text, success), seat.characterId, seat.claimToken, { sandbox })
        } catch (err) {
          console.error("[walk-roll] Malachar did not take the roll:", err)
        }
      }
    }

    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [frameRef])

  return null
}
