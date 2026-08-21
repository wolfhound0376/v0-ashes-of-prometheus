"use client"

// ============================================================================
// DM NARRATION — Malachar's voice, on a toggle.
//
// The lich voice already existed: /api/tts speaks through the custom
// ElevenLabs voice NiQt0cwFeLsVf6cAmcCp. What was missing was anything that
// STARTED it in the V4 dashboard. The only per-line speaker buttons lived in
// the v3 left column, which V4 keeps mounted at `display: none` — so the
// buttons were in the DOM but unreachable, and the status bar's "Mute
// Malachar voice" was muting something that never played.
//
// This is the switch. On, and every new Malachar line is spoken as it lands.
// Off, and the table reads.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"
import { sanitizeForTTS, canSpeak, setDmVoiceEnabled, setNpcVoiceEnabled, setPlayerVoiceEnabled, setKnownPlayerNames } from "@/lib/tts"
import { unlockSpeechAudio, type SpeechPlayback } from "@/lib/speech-playback"
import { speakBlob } from "@/lib/speech-queue"
// The speaker-attribution parser. It lives in the v3 center column today; when
// that tree is finally deleted this should move to lib/ rather than be rewritten
// — the quote-pairing and alias rules in it are hard-won.
import { segmentBySpeaker, setNpcTtsMuted } from "./center-column"

const DM_SPEAKER = "Malachar"
const DM_KEY = "dm-narration-enabled"
const NPC_KEY = "npc-voices-enabled"
const PLAYER_KEY = "player-voices-enabled"

/** Enough of an `npc_encounters` row to attribute a quote and voice it. */
export type VoiceNpc = {
  id: string
  name: string
  aliases?: string[] | null
  voice_id?: string | null
  voice_description?: string | null
}

/** One thing to say, and who says it. */
type Utterance =
  | { kind: "dm"; text: string }
  | { kind: "npc"; text: string; npc: VoiceNpc }
  | { kind: "player"; text: string; pc: VoiceNpc }

/**
 * Split one of Malachar's turns into an ordered run of utterances, casting
 * quoted speech to whichever NPC the attribution points at.
 *
 * `segmentBySpeaker` returns [] when there is nothing quotable in the line —
 * pure narration — so that case falls back to the whole line in the DM voice.
 * Any segment whose npcId is not in the live roster also falls back to the DM,
 * because a voice we cannot resolve should still be heard, just in his mouth.
 *
 * IMPORTANT: the segmenter does NOT promise to cover the whole line. It was
 * written to drive a sequence of speaking NPC portraits, so it returns the
 * quotes and their lead-ins and stops — the prose trailing the last quote comes
 * back in nothing. Read straight, that silently swallows narration: "…Jimjar
 * grins and says, 'Care to wager?' He does not wait for an answer." loses the
 * last sentence entirely. So the segments are used ONLY to decide who owns
 * which slice, and the gaps between and after them are walked back in as DM
 * narration. Every character of the line is spoken exactly once, in order.
 */
export function cast(line: string, npcs: VoiceNpc[]): Utterance[] {
  let segments: Array<{ npcId: string | null; line: string; raw?: string }> = []
  try {
    segments = segmentBySpeaker(line, npcs as never)
  } catch (err) {
    console.log("[v0] narration: speaker segmentation failed, using DM voice", err)
  }
  if (!segments.length) {
    const whole = sanitizeForTTS(line)
    return whole ? [{ kind: "dm", text: whole }] : []
  }

  const out: Utterance[] = []
  const pushDm = (slice: string) => {
    const text = sanitizeForTTS(slice)
    if (text) out.push({ kind: "dm", text })
  }

  let cursor = 0
  for (const segment of segments) {
    const raw = segment.raw || segment.line
    const at = raw ? line.indexOf(raw, cursor) : -1
    if (at === -1) {
      // Can't locate this segment in the source — take it at face value rather
      // than dropping it, and leave the cursor alone.
      const text = sanitizeForTTS(segment.line)
      const npc = segment.npcId ? npcs.find((n) => n.id === segment.npcId) : undefined
      if (text) out.push(npc ? { kind: "npc", text, npc } : { kind: "dm", text })
      continue
    }
    if (at > cursor) pushDm(line.slice(cursor, at))

    const text = sanitizeForTTS(segment.line)
    const npc = segment.npcId ? npcs.find((n) => n.id === segment.npcId) : undefined
    if (text) out.push(npc ? { kind: "npc", text, npc } : { kind: "dm", text })
    cursor = at + raw.length
  }
  pushDm(line.slice(cursor))

  if (out.length) return out
  const whole = sanitizeForTTS(line)
  return whole ? [{ kind: "dm", text: whole }] : []
}

type PersistedSpeechSegment = { speaker: string; line: string; npc_id: string | null; voice_id: string | null }
type Line = {
  id?: string
  speaker: string
  text: string
  speech_segments?: PersistedSpeechSegment[] | null
  pending?: boolean
  turn_id?: string
  created_at?: string
}

function castPersisted(line: Line, npcs: VoiceNpc[]): Utterance[] {
  if (!line.speech_segments?.length) return cast(line.text, npcs)
  const out: Utterance[] = []
  let cursor = 0
  const pushDm = (text: string) => {
    const clean = sanitizeForTTS(text)
    if (clean) out.push({ kind: "dm", text: clean })
  }
  for (const segment of line.speech_segments) {
    const at = line.text.indexOf(segment.line, cursor)
    if (at < 0) continue
    pushDm(line.text.slice(cursor, at))
    const text = sanitizeForTTS(segment.line)
    const npc = segment.npc_id
      ? npcs.find((entry) => entry.id === segment.npc_id)
      : npcs.find((entry) => entry.name.toLowerCase() === segment.speaker.toLowerCase())
    if (text) out.push(npc ? { kind: "npc", text, npc } : { kind: "dm", text })
    cursor = at + segment.line.length
  }
  pushDm(line.text.slice(cursor))
  return out.length ? out : cast(line.text, npcs)
}

export function DmNarration({ dialogue, npcs = [], players = [], onSpeakingChange, className }: {
  dialogue: Line[]
  npcs?: VoiceNpc[]
  /** Player characters, same shape — their typed lines speak in their chosen
   *  voice when the Player Voices toggle is on. */
  players?: VoiceNpc[]
  /** Fires with the NPC or player character currently speaking, or null when
   *  it is the DM or nobody. The queue is the only thing that knows who holds
   *  the floor, so the portrait is driven from here rather than guessed. */
  onSpeakingChange?: (npc: VoiceNpc | null) => void
  className?: string
}) {
  const [dmOn, setDmOn] = useState(false)
  const [npcOn, setNpcOn] = useState(false)
  const [playersOn, setPlayersOn] = useState(false)
  const enabled = dmOn || npcOn || playersOn
  const [status, setStatus] = useState<"idle" | "loading" | "speaking" | "blocked">("idle")

  const audioRef = useRef<SpeechPlayback | null>(null)
  const queueRef = useRef<Utterance[]>([])
  // Kept in a ref so the feed effect can read the current roster without
  // re-running (and re-speaking) every time an NPC's HP ticks.
  const npcsRef = useRef<VoiceNpc[]>(npcs)
  useEffect(() => { npcsRef.current = npcs }, [npcs])
  const playersRef = useRef<VoiceNpc[]>(players)
  useEffect(() => {
    playersRef.current = players
    // Registered so lib/tts can classify a player line wherever TTS is gated.
    setKnownPlayerNames(players.map((p) => p.name))
  }, [players])
  const onSpeakingChangeRef = useRef(onSpeakingChange)
  useEffect(() => { onSpeakingChangeRef.current = onSpeakingChange }, [onSpeakingChange])
  const setFloor = useCallback((npc: VoiceNpc | null) => { onSpeakingChangeRef.current?.(npc) }, [])
  const drainingRef = useRef(false)
  // Keyed by the SANITISED TEXT, not the row id. The dashboard inserts an
  // optimistic entry with a temp id and then merges the real Supabase row over
  // it — same words, different id. Keying on id would speak every line twice.
  const spokenRef = useRef<Set<string>>(new Set())
  const enabledRef = useRef(false)
  const dmOnRef = useRef(false)
  const npcOnRef = useRef(false)
  // False until the first feed snapshot has been taken with narration on. Stops
  // the existing transcript being read out when the toggle is restored from
  // localStorage on page load.
  const primedRef = useRef(false)
  const hydratedRef = useRef(false)

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.stop()
      audioRef.current = null
    }
  }, [])

  // Speak one utterance, start to finish. Resolves when the audio ends (or
  // fails), so the drain loop below never overlaps two of them.
  //
  // The DM and the NPCs go to DIFFERENT endpoints on purpose. /api/tts is
  // Malachar's fixed lich voice; /api/npc-tts resolves and persists a distinct
  // voice per NPC row, so Eldeth does not sound like Jimjar.
  const speak = useCallback(async (u: Utterance) => {
    setStatus("loading")
    const [endpoint, payload] = u.kind === "dm"
      ? ["/api/tts", { text: u.text, voice: "onyx" }]
      : u.kind === "player"
      ? ["/api/npc-tts", {
          text: u.text,
          // Player voices: an explicit id is used verbatim, else the
          // description resolves one. Deliberately NO npcName/npcId — canon
          // name matching and the npc_encounters write-back are NPC machinery
          // and must never touch a player character.
          voiceId: u.pc.voice_id ?? undefined,
          voiceDescription: u.pc.voice_id ? undefined : u.pc.voice_description ?? undefined,
        }]
      : ["/api/npc-tts", {
          text: u.text,
          // An explicit voice if the row already has one, otherwise the
          // description so the route can resolve one. npcId scopes the
          // write-back so a resolved voice is never smeared onto another NPC.
          voiceId: u.npc.voice_id ?? undefined,
          voiceDescription: u.npc.voice_id ? undefined : u.npc.voice_description ?? undefined,
          npcName: u.npc.name,
          npcId: u.npc.id,
        }]
    let res: Response
    try {
      res = await fetch(endpoint as string, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    } catch (err) {
      console.log("[v0] narration fetch error:", err)
      setStatus("idle")
      return
    }
    if (!res.ok) {
      console.log("[v0] narration TTS failed:", endpoint, res.status)
      setStatus("idle")
      return
    }
    // The toggle may have been switched off while the audio was downloading.
    if (!enabledRef.current) { setStatus("idle"); return }

    // The shared helper decodes the MP3 and plays it through WebAudio. Going
    // through an <audio> element instead is silently mute in some Chromium
    // builds — play() resolves and currentTime advances with no sound.
    const playback = speakBlob(
      u.kind === "player" ? "player" : u.kind === "npc" ? "npc" : "dm",
      await res.blob(),
      { speaker: u.kind === "npc" ? u.npc : u.kind === "player" ? u.pc : "Malachar" },
    )
    audioRef.current = playback
    setStatus("speaking")
    // NPCs and players alike hold the floor while their line plays; the
    // window swaps to whoever is speaking. Only pure DM narration clears it.
    setFloor(u.kind === "npc" ? u.npc : u.kind === "player" ? u.pc : null)

    const reason = await playback.finished
    if (audioRef.current === playback) audioRef.current = null
    if (reason === "blocked") {
      // Autoplay policy. The toggle click is a user gesture so this is rare,
      // but say so plainly rather than sitting there mute.
      console.log("[v0] DM narration blocked by autoplay policy")
      setStatus("blocked")
    } else if (reason === "error") {
      console.log("[v0] DM narration playback failed")
    }
    setFloor(null)
    if (enabledRef.current && reason !== "blocked") setStatus("idle")
  }, [setFloor])

  const drain = useCallback(async () => {
    if (drainingRef.current) return
    drainingRef.current = true
    while (enabledRef.current && queueRef.current.length) {
      const next = queueRef.current.shift()
      if (next) await speak(next)
    }
    drainingRef.current = false
    setFloor(null)
    if (!enabledRef.current) setStatus("idle")
  }, [speak, setFloor])

  // Restore the saved preference after mount, so SSR and the first client
  // render agree (localStorage during render is a hydration mismatch).
  useEffect(() => {
    // DEFAULT ON. The key is written only once a preference exists, so an
    // absent key means "never chosen" — and a table that has never chosen
    // should hear the game rather than sit in silence wondering why nobody
    // is speaking. Only an explicit "false" turns a voice off, the same shape
    // as lib/audio-prefs.ts.
    const on = (key: string) => localStorage.getItem(key) !== "false"
    setDmOn(on(DM_KEY))
    setNpcOn(on(NPC_KEY))
    setPlayersOn(on(PLAYER_KEY))
    hydratedRef.current = true
  }, [])

  // Persist it — but only once the value above has been read back, or the
  // initial `false` would overwrite a saved `true` before restore runs.
  useEffect(() => {
    if (!hydratedRef.current) return
    localStorage.setItem(DM_KEY, String(dmOn))
    localStorage.setItem(NPC_KEY, String(npcOn))
    localStorage.setItem(PLAYER_KEY, String(playersOn))
  }, [dmOn, npcOn, playersOn])

  useEffect(() => {
    enabledRef.current = enabled
    dmOnRef.current = dmOn
    npcOnRef.current = npcOn
    // Mirror both toggles into lib/tts so every other TTS entry point routes
    // through the same canSpeak() gate and can never drift out of sync.
    setDmVoiceEnabled(dmOn)
    setNpcVoiceEnabled(npcOn)
    setPlayerVoiceEnabled(playersOn)
    // While this control is on it is the ONLY thing speaking: it voices
    // Malachar and the NPCs from one queue, in narrative order. The legacy v3
    // auto-play would otherwise repeat every quoted line out of sequence.
    setNpcTtsMuted(true)
    if (!enabled) {
      queueRef.current = []
      stopAudio()
      setFloor(null)
      setStatus("idle")
    }
  }, [enabled, dmOn, npcOn, playersOn, stopAudio])

  useEffect(() => stopAudio, [stopAudio])

  // Watch the feed and speak what is genuinely NEW.
  //
  // The hard part here is telling a fresh narration beat apart from a bulk
  // load. The dialogue feed arrives asynchronously and is refetched on
  // reconnect, so a naive "speak anything I have not heard" reads the whole
  // session aloud the moment the page is refreshed with the toggle already on.
  //
  // Malachar narrates ONE line per turn. Any change that brings in more than
  // one unheard line is therefore a load, not a beat: mark it heard, say
  // nothing. That single rule covers first paint, refetch, reconnect and
  // switching the toggle on mid-session.
  useEffect(() => {
    // RAW text, deliberately not sanitised yet. sanitizeForTTS strips quote
    // characters, and quotes are precisely how speaker attribution finds who is
    // talking — sanitising first left the segmenter nothing to pair and made
    // Malachar read every NPC's dialogue himself. Each segment is sanitised
    // after the split instead, inside cast().
    const voicedLines = dialogue
      .filter((entry) => entry.speaker === DM_SPEAKER || npcsRef.current.some((npc) => npc.name.toLowerCase() === entry.speaker.toLowerCase()) || playersRef.current.some((pc) => pc.name.toLowerCase() === entry.speaker.toLowerCase()))
      .filter((entry) => Boolean(entry.text))
    const lineKey = (entry: Line) => `${entry.speaker.toLowerCase()}\u0000${entry.text}`
    const voicedKeys = voicedLines.map(lineKey)

    if (!enabled) {
      // Off: everything on screen counts as heard, so switching on later does
      // not read the backlog.
      spokenRef.current = new Set(voicedKeys)
      primedRef.current = false
      return
    }

    const unheard = voicedLines.filter((line) => !spokenRef.current.has(lineKey(line)))
    // Whatever happens, none of these get spoken twice.
    for (const line of voicedLines) spokenRef.current.add(lineKey(line))

    if (!primedRef.current) {
      // Don't burn the priming pass on an empty first paint.
      if (voicedLines.length === 0) return
      primedRef.current = true
      return
    }
    if (!unheard.length) return
    // A Malachar turn is no longer one row. `app/api/chat/route.ts` splits it
    // into ordered DM/NPC records written in a single insert, so a turn where
    // an NPC speaks legitimately arrives as several unheard lines at once. The
    // old `unheard.length > 1` rule read that as a page load and stayed silent,
    // which is why the NPCs went quiet.
    //
    // Rows of the same turn share a turn key: the client-stamped `turn_id` on
    // the optimistic path, the shared `created_at` of the batch insert
    // otherwise. Several rows from ONE turn: speak them, in order. Rows from
    // MORE than one turn: that is a refetch, a reconnect or first paint —
    // stay silent, exactly as before.
    const turnKey = (line: Line) => line.turn_id ?? line.created_at ?? line.id ?? line.text
    const turns = new Set(unheard.map(turnKey))
    if (turns.size > 1) {
      console.log("[v0] narration: bulk load spanning", turns.size, "turns — not speaking")
      return
    }
    // Belt and braces: no single turn is ever this long. Anything bigger is a
    // load that happened to share a key.
    if (unheard.length > 12) {
      console.log("[v0] narration: implausible turn of", unheard.length, "lines — not speaking")
      return
    }

    // Malachar's turn is not one voice. He narrates, an NPC speaks in quotes,
    // he narrates again. Split the line on speaker attribution and cast each
    // piece, so the dwarf answers in her own voice inside his narration
    // instead of him doing all the parts.
    const wanted = unheard.flatMap((line) => {
      if (line.speaker === DM_SPEAKER) return castPersisted(line, npcsRef.current)
      const npc = npcsRef.current.find((entry) => entry.name.toLowerCase() === line.speaker.toLowerCase())
      const text = sanitizeForTTS(line.text)
      if (npc && text) return [{ kind: "npc" as const, text, npc }]
      // A player character's own typed line, in their chosen voice. Dice-roll
      // announcements stay silent — the table already watched the dice land.
      const pc = playersRef.current.find((entry) => entry.name.toLowerCase() === line.speaker.toLowerCase())
      const isRollLine = line.text.trimStart().startsWith("🎲") || line.text.includes("[Dice Roll]")
      return pc && text && !isRollLine ? [{ kind: "player" as const, text, pc }] : []
    })
      // One gate for both paths: DM utterances follow DM Voice, NPC utterances
      // follow NPC Voices. canSpeak classifies by speaker name so the Lich is
      // always the DM's and every named NPC is the NPC toggle's.
      .filter((u) => canSpeak(u.kind === "dm" ? DM_SPEAKER : u.kind === "npc" ? u.npc.name : u.pc.name))
    if (!wanted.length) return
    queueRef.current.push(...wanted)
    void drain()
  }, [dialogue, enabled, drain])

  const busyLabel = status === "loading" ? " — fetching voice…" : status === "speaking" ? " — speaking" : status === "blocked" ? " — browser blocked the audio, click off and on" : ""

  const Switch = ({ on, set, label, title }: { on: boolean; set: (v: boolean) => void; label: string; title: string }) => (
    <button
      type="button"
      onClick={() => {
        if (!on) {
          // Unlock audio while we still have the click, so the first line is
          // not blocked by autoplay policy.
          unlockSpeechAudio()
          setStatus("idle")
        }
        set(!on)
      }}
      title={title + busyLabel}
      aria-label={title + busyLabel}
      aria-pressed={on}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[9px] transition-colors",
        on ? "border border-[#a88745] bg-[#241a08] text-[#ead39e]"
           : "border border-[#4b3a19] text-[#8f8061] hover:border-[#8a6f3c] hover:text-[#cdb276]",
      )}
    >
      {status === "loading" && on ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
        : on ? <Volume2 className={cn("h-2.5 w-2.5", status === "speaking" && "animate-pulse")} />
        : <VolumeX className="h-2.5 w-2.5" />}
      {label}
    </button>
  )

  return (
    <span className={cn("flex items-center gap-1", className)}>
      <Switch on={dmOn} set={setDmOn} label="DM Voice"
        title={dmOn ? "DM Voice on — Malachar narrates aloud" : "DM Voice off — click to hear Malachar narrate"} />
      <Switch on={npcOn} set={setNpcOn} label="NPC Voices"
        title={npcOn ? "NPC Voices on — each NPC speaks in their own voice" : "NPC Voices off — click to hear the NPCs speak"} />
      <Switch on={playersOn} set={setPlayersOn} label="Player Voices"
        title={playersOn ? "Player Voices on — typed player lines speak in each character's voice" : "Player Voices off — click to hear player lines aloud"} />
    </span>
  )
}
