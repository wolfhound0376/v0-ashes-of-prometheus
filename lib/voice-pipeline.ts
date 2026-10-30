// ============================================================================
// THE VOICE PIPELINE — make the next line while this one is still playing.
//
// Sam, 2026-10-30: "There was a long delay or no audio when talking to Ront on
// the dashboard UI."
//
// MEASURED, not inferred (Vercel runtime logs, 2026-10-30 15:51–15:53, each
// request's start stamp against its route's own "spoke with" line):
//   /api/npc-tts   2.1 – 2.9 s a line
//   /api/tts       6.1 – 6.2 s a line
// and zero TTS errors in that window. The audio was LATE, not missing.
//
// The delay was the shape of the loop, not the model. A line's audio was only
// REQUESTED once the line before it had finished PLAYING, so every utterance
// paid for its own synthesis in dead air. One Ront beat is Malachar's lead-in
// plus Ront's answer: about six seconds of silence, the narration, then two
// and a half more before the orc opens his mouth.
//
// This loop keeps a few lines in flight at once. The first line of a turn
// still costs one synthesis — nothing can be played before it exists — and
// every line after it is already made by the time the one before it ends.
//
// WHY A LOOKAHEAD AND NOT "FETCH EVERYTHING": a line that is never played
// still burned an ElevenLabs credit, so the old queue deliberately fetched
// only at the last moment. Two ahead is enough to cover a 6 s synthesis behind
// a 6 s line, and caps what a turn switched off mid-sentence can waste.
//
// ORDER IS THE CONTRACT. Lines are taken in the order `take` hands them over
// and played in that same order, however the fetches resolve — a reordered
// turn would have Ront answering before Malachar asks.
// ============================================================================

export interface VoicePipelineIO<Line, Audio> {
  /** The next line waiting to be spoken, or undefined when none is. */
  take: () => Line | undefined
  /** Start making this line's audio. Null means it could not be made. */
  fetchVoice: (line: Line) => Promise<Audio | null>
  /** Play it. Resolves when the audio is over (or immediately, if there is none). */
  play: (line: Line, audio: Audio | null) => Promise<void>
  /** False the moment the table turns the voices off. Checked every pass. */
  enabled: () => boolean
  /** Fired when the pipeline has nothing ready and is waiting on synthesis. */
  onWaiting?: () => void
  /** Lines beyond the one playing that may be in synthesis at once. */
  lookahead?: number
}

export const DEFAULT_LOOKAHEAD = 2

/**
 * Drain lines until there are none left or the voices are switched off.
 * Resolves when the last line has finished playing.
 */
export async function runVoicePipeline<Line, Audio>(io: VoicePipelineIO<Line, Audio>): Promise<void> {
  const lookahead = Math.max(0, io.lookahead ?? DEFAULT_LOOKAHEAD)
  // Lines whose audio is already on its way, in the order they will be heard.
  // Taking them off the queue here is what holds that order: a line in flight
  // is no longer up for grabs.
  //
  // `ready` is what the spinner reads. A line whose audio landed while the one
  // before it was playing is not a wait, and showing "fetching voice…" over it
  // would be a lie about where the time went — which is the exact confusion
  // this whole change exists to clear up.
  type InFlight = { line: Line; audio: Promise<Audio | null>; ready: boolean }
  const ahead: InFlight[] = []

  const start = (line: Line): InFlight => {
    const entry: InFlight = { line, ready: false, audio: Promise.resolve(null) }
    // A fetch that THROWS is a line that cannot be said, not a dead pipeline:
    // the turn carries on in the voices that did come back.
    entry.audio = Promise.resolve(io.fetchVoice(line))
      .catch(() => null)
      .then((audio) => { entry.ready = true; return audio })
    return entry
  }

  const fill = () => {
    while (io.enabled() && ahead.length <= lookahead) {
      const line = io.take()
      if (line === undefined) return
      ahead.push(start(line))
    }
  }

  while (io.enabled()) {
    fill()
    const next = ahead.shift()
    if (!next) return
    if (!next.ready) io.onWaiting?.()
    const audio = await next.audio
    fill()                     // anything that landed while we waited joins the pipeline
    await io.play(next.line, audio)
  }
}
