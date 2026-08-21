// One mouth for the whole table.
//
// THE BUG: every panel played its line the moment it had audio and stopped
// whatever was already speaking. Malachar narrating over Eldeth cut her off —
// and because the "played once" key was already spent, nothing replayed her.
// NPCs produced dialogue and stayed silent.
//
// Lines now take turns. One speaker at a time, in Sam's order of precedence:
//
//   1. PLAYER — a character's own voice. The person at the table wins.
//   2. DM     — Malachar's narration.
//   3. NPC    — everyone else in the scene.
//
// A higher rank arriving mid-line PAUSES the lower one and takes the floor; the
// paused line RESUMES where it was cut off once the floor is free. Same or
// lower rank queues behind.
//
// EXACTLY ONCE. The first version of this shipped with a loose guard and could
// fire a line's completion callback twice — once when it was paused, again when
// it finished. In center-column that callback advances the dialogue sequence,
// so a double fire skips a beat. Now: one entry object per utterance, a
// `settled` flag on it, and pausing re-queues THAT SAME OBJECT rather than a
// copy. onEnd cannot fire more than once per line. See speech-queue.test.mjs.

import { playSpeech, type SpeechEndReason, type SpeechPlayback } from "./speech-playback"

export type SpeechRank = "player" | "dm" | "npc"

const ORDER: Record<SpeechRank, number> = { player: 0, dm: 1, npc: 2 }

export interface SpeechRequest {
  rank: SpeechRank
  speaker?: string | null
  /** Fetches the audio, called only when the line reaches the floor — a line
   *  that is dropped before then never burns an ElevenLabs credit. */
  fetch: () => Promise<Blob | null>
  onStart?: () => void
  /** Fires exactly once, when the line is truly over. Never on a pause. */
  onEnd?: (reason: SpeechEndReason) => void
}

interface Entry extends SpeechRequest {
  id: number
  blob?: Blob
  /** Seconds already heard, so a resumed line does not start over. */
  offset: number
  /** Set while this entry is being paused for a higher rank. */
  pausing: boolean
  cancelled: boolean
  settled: boolean
}

type Player = (blob: Blob, offsetSeconds: number) => Promise<SpeechPlayback>

export function createSpeechQueue(play: Player) {
  let nextId = 1
  const waiting: Entry[] = []
  let current: (Entry & { playback: SpeechPlayback; startedAt: number }) | null = null
  let pumping = false

  const rankOf = (e: { rank: SpeechRank }) => ORDER[e.rank] ?? 99

  /** onEnd, guarded: one call per utterance, whatever happens to it. */
  function settle(entry: Entry, reason: SpeechEndReason) {
    if (entry.settled) return
    entry.settled = true
    entry.onEnd?.(reason)
  }

  function takeNext(): Entry | undefined {
    if (!waiting.length) return undefined
    let best = 0
    for (let i = 1; i < waiting.length; i++) {
      if (rankOf(waiting[i]) < rankOf(waiting[best])) best = i
    }
    return waiting.splice(best, 1)[0]
  }

  async function pump(): Promise<void> {
    if (pumping || current) return
    pumping = true
    try {
      for (;;) {
        const entry = takeNext()
        if (!entry) return
        if (entry.cancelled) {
          settle(entry, "stopped")
          continue
        }
        if (!entry.blob) {
          try {
            entry.blob = (await entry.fetch()) ?? undefined
          } catch {
            entry.blob = undefined
          }
        }
        if (!entry.blob) {
          settle(entry, "error")
          continue
        }
        const playback = await play(entry.blob, entry.offset)
        current = Object.assign(entry, { playback, startedAt: Date.now() })
        if (entry.offset === 0) entry.onStart?.()
        const reason = await playback.finished
        current = null
        // A pause is our own doing: the same entry is already back in the queue
        // waiting to resume, so it is NOT over and must not settle.
        if (entry.pausing) {
          entry.pausing = false
          continue
        }
        settle(entry, reason)
      }
    } finally {
      pumping = false
      if (!current && waiting.length) void pump()
    }
  }

  function speak(req: SpeechRequest): { cancel: () => void } {
    const entry: Entry = {
      ...req,
      id: nextId++,
      offset: 0,
      pausing: false,
      cancelled: false,
      settled: false,
    }

    // Someone lower down holds the floor and this line outranks them: pause
    // them mid-sentence, remember how far they got, and let this one through.
    if (current && rankOf(entry) < rankOf(current) && !current.pausing) {
      const heard = (Date.now() - current.startedAt) / 1000
      current.offset = current.offset + Math.max(0, heard - 0.25) // a beat of overlap
      current.pausing = true
      waiting.push(current)           // the SAME entry, not a copy
      current.playback.stop()
    }

    waiting.push(entry)
    void pump()
    return {
      cancel: () => {
        entry.cancelled = true
        const i = waiting.indexOf(entry)
        if (i >= 0) {
          waiting.splice(i, 1)
          settle(entry, "stopped")
        }
        if (current === entry) {
          current.playback.stop()
        }
      },
    }
  }

  function silenceAll(): void {
    for (const e of waiting.splice(0)) settle(e, "stopped")
    if (current) {
      current.cancelled = true
      current.playback.stop()
    }
  }

  return { speak, silenceAll, isSpeaking: () => current !== null }
}

const queue = createSpeechQueue(playSpeech)

export const speak = queue.speak
export const silenceAll = queue.silenceAll
export const isSpeaking = queue.isSpeaking

/**
 * Drop-in for `playSpeech` at call sites that already hold their audio: same
 * { finished, stop } shape, but the line takes its turn instead of cutting off
 * whoever is talking.
 */
export function speakBlob(
  rank: SpeechRank,
  blob: Blob,
  opts: { speaker?: string | null; onStart?: () => void } = {},
): SpeechPlayback {
  let settleFinished: (r: SpeechEndReason) => void = () => {}
  const finished = new Promise<SpeechEndReason>((resolve) => (settleFinished = resolve))
  const handle = speak({
    rank,
    speaker: opts.speaker,
    fetch: async () => blob,
    onStart: opts.onStart,
    onEnd: (reason) => settleFinished(reason),
  })
  return { finished, stop: () => handle.cancel() }
}
