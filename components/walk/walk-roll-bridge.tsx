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
//
// HEROIC INSPIRATION (Sam, 2026-10-26; lib/heroic-inspiration.ts). A failed
// check by a character holding Inspiration offers "Reroll with Inspiration",
// the way BG3 does, when this browser may spend it (that character's own seat,
// or the DM). The spend goes to /api/inspiration/spend first; only once it is
// spent does the die roll again, and the new roll stands. The log and Malachar
// both get the reroll. In a rehearsal (?sandbox=1) nothing is spent.
// Requests from anywhere but the map's own frame, or for an action the closed
// table does not name, are ignored. One panel at a time.
// ============================================================================

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { describeRoll, useDice } from "@/components/dice/dice-provider"
import { createClient } from "@/lib/supabase/client"
import { dmHeaders } from "@/lib/dm-key"
import { offerReroll, rerollLogLine, rerollNote } from "@/lib/heroic-inspiration"
import { useLich } from "@/lib/hooks/use-lich"
import { RollPanel, type RollPanelPhase, type RollPanelReroll, type RollPanelResult } from "@/components/walk/roll-panel"
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
import { parseWalkActionRequest, type WalkActionReply } from "@/lib/walk-action"

/** How long the acting character's sheet may take to load before the roll is called off with a reason. */
const SHEET_READ_MS = 6000

function readSeat(): { characterId: string | null; claimToken: string | null } {
  try {
    return { characterId: localStorage.getItem("aop_character_id"), claimToken: localStorage.getItem("aop_claim_token") }
  } catch {
    return { characterId: null, claimToken: null }
  }
}

function isDmBrowser(): boolean {
  try { return localStorage.getItem("aop_access_role") === "dm" } catch { return false }
}

function isSandbox(): boolean {
  try { return new URL(window.location.href).searchParams.get("sandbox") === "1" } catch { return false }
}

interface Pending {
  id: string
  action: WalkActionKey
  frame: Window
  who: string
  /** For roll-changing traits (Halfling Luck): this roll is the hero's, not the dashboard's selection. */
  species: string | null
  characterId: string | null
  modifier: number
  parts: WalkModifierPart[]
  /** Holds Heroic Inspiration right now (characters.sheet_heroic_inspiration). */
  inspired: boolean
  /** This browser may spend it: the character's own seat, or the DM. The server decides for real. */
  canSpend: boolean
}

const NO_REROLL: RollPanelReroll = { offered: false, busy: false, firstNatural: null, note: null }

export function WalkRollBridge({ frameRef }: { frameRef: RefObject<HTMLIFrameElement | null> }) {
  const { roll } = useDice()
  const { sendMessage } = useLich()
  const [pending, setPending] = useState<Pending | null>(null)
  const [phase, setPhase] = useState<RollPanelPhase>("ready")
  const [result, setResult] = useState<RollPanelResult | null>(null)
  const [reroll, setReroll] = useState<RollPanelReroll>(NO_REROLL)
  const rerolledRef = useRef<{ firstText: string } | null>(null)
  const seen = useRef(new Set<string>())
  const pendingRef = useRef<Pending | null>(null)
  const outcomeRef = useRef<{ reply: Omit<WalkRollReply, "type" | "id">; text: string; success: boolean } | null>(null)
  pendingRef.current = pending

  const loadingRef = useRef<string | null>(null)
  const postTo = (frame: Window, msg: WalkRollReply | WalkRollAck) => {
    try { frame.postMessage(msg, window.location.origin) } catch { /* the map went away */ }
  }
  const post = (p: Pending, msg: WalkRollReply | WalkRollAck) => postTo(p.frame, msg)

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
      if (pendingRef.current || loadingRef.current) {
        try { frame.postMessage({ type: "aop:roll-result", id: req.id, ok: false, error: "Finish the roll in front of you first." } satisfies WalkRollReply, window.location.origin) } catch { /* gone */ }
        return
      }

      // "THE DICE DID NOT ANSWER. TRY AGAIN." (Sam, 2026-10-26: "It says try again but nothing is observed.")
      // The map gives up after 8 s without an ack, and the ack used to wait on the sheet read below — so a slow
      // or stuck read (or anything that threw before the ack) left the map with that toast and no dice at all.
      // Now the map hears "I have it" at once, the read has its own clock, and every way this can fail answers
      // the map with a reason instead of going silent.
      const holdId = req.id
      loadingRef.current = holdId   // one roll at a time from this moment, panel open or not
      postTo(frame, { type: "aop:roll-ack", id: holdId })
      const fail = (error: string) => {
        if (loadingRef.current === holdId) loadingRef.current = null
        postTo(frame, { type: "aop:roll-result", id: holdId, ok: false, error })
      }
      try {
        const action = WALK_ACTIONS[req.action]
        const seat = readSeat()
        const characterId = seat.characterId || req.characterId || null
        let row: Record<string, unknown> | null = null
        if (characterId) {
          const read = supabase.from("characters").select(WALK_ROLL_COLUMNS).eq("id", characterId).maybeSingle()
          const timedOut = new Promise<"timeout">((r) => window.setTimeout(() => r("timeout"), SHEET_READ_MS))
          const got = await Promise.race([read, timedOut])
          if (got === "timeout") {
            console.error(`[walk-roll] the sheet did not load in ${SHEET_READ_MS / 1000} s for`, characterId)
            // No sheet means no honest modifier, and a guessed one is never rolled.
            fail("Your character sheet did not load, so nothing was rolled. Try once more in a moment.")
            return
          }
          const { data, error } = got
          if (error) console.error("[walk-roll] could not read the sheet:", error)
          row = (data as Record<string, unknown> | null) ?? null
        }
        // No sheet means no modifier to apply — never a guessed one. The roll still happens.
        const mod = row ? walkCheckModifier(row, action.check) : { modifier: 0, parts: [] as WalkModifierPart[] }
        const who = (row && typeof row.name === "string" && row.name) || "Someone"

        const inspired = Boolean(row && row.sheet_heroic_inspiration === true)
        const canSpend = Boolean(characterId) && (isDmBrowser() || (Boolean(seat.claimToken) && seat.characterId === characterId))
        const species = row && typeof row.sheet_species === "string" ? row.sheet_species : null
        const p: Pending = { id: req.id, action: req.action, frame, who, species, characterId, modifier: mod.modifier, parts: mod.parts, inspired, canSpend }
        outcomeRef.current = null
        rerolledRef.current = null
        setReroll(NO_REROLL)
        setResult(null)
        setPhase("ready")
        if (loadingRef.current !== holdId) return   // superseded while the sheet loaded
        loadingRef.current = null
        pendingRef.current = p   // before the render lands, so a second request is still turned away
        setPending(p)
      } catch (err) {
        console.error("[walk-roll] the roll could not be set up:", err)
        fail("The dice could not be set up for that roll. Try once more.")
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [frameRef])

  // HAND-OFFS (lib/walk-action.ts). Listen, Search here, Look closer, Pray, Inspire: the map has rolled, Malachar
  // says what comes of it. Sent as a stage direction about the acting hero (`director`), so the mechanical line is
  // never logged as something the hero said; Malachar's narration lands in the log, where the map's own feed shows
  // it. A rehearsal writes no log, so the reply also goes straight back to the map, which shows it then.
  const actionSeen = useRef(new Set<string>())
  useEffect(() => {
    const onAction = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const frame = frameRef.current?.contentWindow
      if (!frame || e.source !== frame) return
      const req = parseWalkActionRequest(e.data)
      if (!req || actionSeen.current.has(req.id)) return
      actionSeen.current.add(req.id)
      const sandbox = isSandbox()
      const seat = readSeat()
      const mine = Boolean(req.characterId && seat.claimToken && seat.characterId === req.characterId)
      const reply = (msg: Omit<WalkActionReply, "type" | "id">) => {
        try { frame.postMessage({ type: "aop:action-reply", id: req.id, ...msg } satisfies WalkActionReply, window.location.origin) } catch { /* the map went away */ }
      }
      try {
        const res = await sendMessage(req.text, req.characterId ?? seat.characterId, mine ? seat.claimToken : null, { director: true, sandbox })
        reply({ ok: true, text: res.text, sandbox })
      } catch (err) {
        console.error("[walk-action] Malachar did not take the hand-off:", err)
        const named = err as { playerFacing?: boolean; message?: string }
        reply({ ok: false, error: named.playerFacing && named.message ? named.message : "Malachar did not answer. Try once more." })
      }
    }
    window.addEventListener("message", onAction)
    return () => window.removeEventListener("message", onAction)
  }, [frameRef, sendMessage])

  // 4: the player throws the die.
  const onRoll = useCallback(async () => {
    const p = pendingRef.current
    if (!p) return
    const action = WALK_ACTIONS[p.action]
    setPhase("rolling")
    let r
    try {
      r = await roll({ die: "d20", numDice: 1, modifier: p.modifier, label: action.check.label, roller: { name: p.who, species: p.species } })
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

  // Heroic Inspiration: spend it, then throw the die again. The new roll stands (SRD 5.2.1).
  const onReroll = useCallback(async () => {
    const p = pendingRef.current
    const first = outcomeRef.current
    if (!p || !first || rerolledRef.current || !p.characterId) return
    setReroll({ offered: false, busy: true, firstNatural: null, note: null })

    if (!isSandbox()) {
      const seat = readSeat()
      let res: Response | null = null
      try {
        res = await fetch("/api/inspiration/spend", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...dmHeaders() },
          body: JSON.stringify({ characterId: p.characterId, claimToken: seat.characterId === p.characterId ? seat.claimToken : null }),
        })
      } catch { res = null }
      if (!res || !res.ok) {
        const gone = res?.status === 409
        if (gone) setPending((cur) => (cur ? { ...cur, inspired: false } : cur))
        setReroll({
          offered: !gone,
          busy: false,
          firstNatural: null,
          note: gone ? "No Heroic Inspiration left. It was already spent." : "Inspiration could not be spent. Try again.",
        })
        return
      }
    }

    rerolledRef.current = { firstText: first.text }
    const firstNatural = first.reply.natural ?? null
    setPending((cur) => (cur ? { ...cur, inspired: false } : cur))
    setPhase("rolling")
    const action = WALK_ACTIONS[p.action]
    let r
    try {
      r = await roll({ die: "d20", numDice: 1, modifier: p.modifier, label: `${action.check.label} (Inspiration)`, roller: { name: p.who, species: p.species } })
    } catch (err) {
      // The Inspiration is spent; the first roll stands rather than a guessed one.
      console.error("[walk-roll] the reroll did not roll:", err)
      rerolledRef.current = null
      setReroll({ offered: false, busy: false, firstNatural: null, note: "The dice did not roll again. The first roll stands." })
      setPhase("done")
      return
    }
    const success = walkVerdict(action, r.total)
    const natural = r.keptRolls?.[0] ?? r.rolls[0]
    outcomeRef.current = { reply: { ok: true, success, total: r.total, natural }, text: describeRoll(r), success }
    setReroll({ offered: false, busy: false, firstNatural, note: null })
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
    const rerolled = rerolledRef.current
    rerolledRef.current = null
    const logText = rerolled ? rerollLogLine(rerolled.firstText, out.text) : out.text
    if (!sandbox) {
      const { error } = await supabase.from("dialogue").insert({ speaker: p.who, speaker_type: "player", channel: "dm", text: `🎲 ${logText}` })
      if (error) console.error("[walk-roll] failed to log the roll:", error)
    }
    // Malachar hears it as this character. Only a seated browser can speak as one; the DM narrates their own.
    const seat = readSeat()
    if (seat.characterId && seat.claimToken && seat.characterId === p.characterId) {
      try {
        const msg = walkRollMessage(p.who, action, out.text, out.success)
        await sendMessage(rerolled ? `${rerollNote(p.who)} ${msg}` : msg, seat.characterId, seat.claimToken, { sandbox })
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
      reroll={{
        ...reroll,
        offered: phase === "done" && !reroll.busy && offerReroll({
          hasInspiration: pending.inspired,
          success: Boolean(result?.success),
          rerolled: reroll.firstNatural != null,
          canSpend: pending.canSpend,
        }),
      }}
      onReroll={onReroll}
    />
  )
}
