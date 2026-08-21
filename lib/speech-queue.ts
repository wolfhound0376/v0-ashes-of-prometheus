// One mouth for the whole table.
//
// THE BUG THIS FIXES: every panel played its own line the moment it had audio,
// and stopped whatever was already talking. So when Malachar narrated over
// Eldeth, her line was cut and simply never returned — the "played once" key
// had already been consumed, so nothing replayed it. NPCs went silent and it
// looked like their voice was broken.
//
// Lines now take turns. There is exactly one speaker at a time; anyone else
// waits. Sam's order of precedence, highest first:
//
//   1. PLAYER  — a character's own voice. Never interrupted; the person at the
//                table is speaking.
//   2. DM      — Malachar's narration.
//   3. NPC     — everyone else in the scene.
//
// A higher rank arriving mid-line PAUSES the lower one and takes the floor;
// the paused line resumes from where it was cut off once the floor is free, so
// an interrupted NPC finishes her sentence instead of losing it. Same-or-lower
// rank simply queues behind.

import { playSpeech, type SpeechEndReason, type SpeechPlayback } from "./speech-playback"

export type SpeechRank = "player" | "dm" | "npc"

const ORDER: Record<SpeechRank, number> = { player: 0, dm: 1, npc: 2 }

export interface SpeechRequest {
  rank: SpeechRank
  /** Who is talking, for logs and de-duping. */
  speaker?: string | null
  /** Fetches the audio. Called only when the line actually gets the floor, so
   *  a queued line that is later dropped never burns an ElevenLabs credit. */
  fetch: () => Promise<Blob | null>
  onStart?: () => void
  onEnd?: (reason: SpeechEndReason) => void
}

interface Entry extends SpeechRequest {
  id: number
  /** Audio already fetched — set when a line is paused and must resume. */
  blob?: Blob
  /** Seconds already heard, so a resumed line does not start over. */
  offset?: number
}

let nextId = 1
const waiting: Entry[] = []
let current: (Entry & { playback: SpeechPlayback; startedAt: number }) | null = null
let pumping = false

function rankOf(e: { rank: SpeechRank }) {
  return ORDER[e.rank] ?? 99
}

/** Highest-priority waiting line, FIFO within a rank. */
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
      let blob = entry.blob
      if (!blob) {
        try {
          blob = (await entry.fetch()) ?? undefined
        } catch {
          blob = undefined
        }
      }
      if (!blob) {
        entry.onEnd?.("error")
        continue
      }
      const playback = await playSpeech(blob, entry.offset ?? 0)
      current = { ...entry, blob, playback, startedAt: Date.now() }
      entry.onStart?.()
      const reason = await playback.finished
      const finished = current
      current = null
      // "paused" is our own doing — the entry is already back in the queue.
      if (reason !== "stopped" || !finished?.blob || finished.offset === undefined) {
        entry.onEnd?.(reason)
      }
    }
  } finally {
    pumping = false
    if (!current && waiting.length) void pump()
  }
}

/**
 * Ask for the floor. Returns a handle that can drop the line if the caller
 * unmounts. The queue decides when (and whether) it is heard.
 */
export function speak(req: SpeechRequest): { cancel: () => void } {
  const entry: Entry = { ...req, id: nextId++ }

  // Someone lower down is talking and this line outranks them: pause them,
  // keep their remaining audio, and let this one through.
  if (current && rankOf(entry) < rankOf(current)) {
    const heard = (Date.now() - current.startedAt) / 1000
    const paused: Entry = {
      ...current,
      offset: (current.offset ?? 0) + Math.max(0, heard - 0.25), // a beat of overlap
    }
    current.playback.stop()
    waiting.push(paused)
  }

  waiting.push(entry)
  void pump()
  return {
    cancel: () => {
      const i = waiting.findIndex((w) => w.id === entry.id)
      if (i >= 0) waiting.splice(i, 1)
      if (current?.id === entry.id) {
        current.playback.stop()
        current = null
      }
    },
  }
}

/** Silence everything — panel unmounts, campaign restart, mute. */
export function silenceAll(): void {
  waiting.length = 0
  if (current) {
    current.playback.stop()
    current = null
  }
}

/** Whether anything is currently speaking (for a "speaking" indicator). */
export function isSpeaking(): boolean {
  return current !== null
}

/**
 * Drop-in for `playSpeech` at call sites that have already fetched their audio:
 * same { finished, stop } shape, but the line takes its turn in the queue
 * instead of cutting off whoever is talking.
 */
export function speakBlob(
  rank: SpeechRank,
  blob: Blob,
  opts: { speaker?: string | null; onStart?: () => void } = {},
): SpeechPlayback {
  let settle: (r: SpeechEndReason) => void = () => {}
  const finished = new Promise<SpeechEndReason>((resolve) => (settle = resolve))
  const handle = speak({
    rank,
    speaker: opts.speaker,
    fetch: async () => blob,
    onStart: opts.onStart,
    onEnd: (reason) => settle(reason),
  })
  return {
    finished,
    stop: () => {
      handle.cancel()
      settle("stopped")
    },
  }
}
