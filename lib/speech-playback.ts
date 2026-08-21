// Shared playback for every spoken line in the game — Malachar's narration,
// NPC voices, player voices, and the per-line "hear this" buttons.
//
// WHY THIS EXISTS
//
// Every TTS route hands back an MP3, and the obvious way to play one is
// `new Audio(URL.createObjectURL(blob)).play()`. That is what all three call
// sites used to do, and it is silently broken in some Chromium builds: the
// element reports readyState 4, play() resolves, currentTime advances to the
// end of the clip — and nothing comes out of the speakers. No error, no
// rejected promise, nothing to catch. Diagnosed on Sam's machine in the Ace
// browser, where a WAV tone through the same element WAS audible while every
// ElevenLabs MP3 was mute; decoding the identical bytes through WebAudio and
// playing them through an AudioBufferSourceNode was audible immediately.
//
// So the primary path decodes the audio ourselves and plays the samples
// through an AudioContext, which does not depend on the element's media
// pipeline. The element path is kept as a fallback for anything that cannot
// decode (an unexpected codec, a browser with no AudioContext), so the worst
// case is exactly the behaviour we had before.
//
// Callers get one shape back for both paths: a promise that settles when the
// line is over, and a stop() for interrupting it.

/** How a spoken line finished. */
export type SpeechEndReason =
  /** Played all the way through. */
  | "ended"
  /** Decode or playback failed; nothing was heard. */
  | "error"
  /** stop() was called — a new line interrupted this one, or the panel unmounted. */
  | "stopped"
  /** The browser's autoplay policy refused it; needs a user gesture first. */
  | "blocked"

export interface SpeechPlayback {
  /** Settles once the line is over, however it ended. Never rejects. */
  finished: Promise<SpeechEndReason>
  /** Cut the line off now. Safe to call after it has already finished. */
  stop: () => void
}

type ContextCtor = typeof AudioContext

function contextCtor(): ContextCtor | null {
  if (typeof window === "undefined") return null
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: ContextCtor }).webkitAudioContext ?? null
}

// One context for the whole app. Browsers cap how many can exist, and every
// spoken line would otherwise leak one.
let sharedContext: AudioContext | null = null

function getContext(): AudioContext | null {
  if (sharedContext) return sharedContext
  const Ctor = contextCtor()
  if (!Ctor) return null
  try {
    sharedContext = new Ctor()
  } catch {
    sharedContext = null
  }
  return sharedContext
}

// A valid zero-sample WAV. Playing one inside a click handler marks the
// document user-activated for audio, so the first real line does not get
// swallowed by autoplay policy.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="

/**
 * Call from a user gesture (a toggle click) to unlock audio ahead of the first
 * spoken line. Unlocks BOTH paths: resumes the AudioContext and pokes the
 * element pipeline. Cheap, idempotent, never throws.
 */
export function unlockSpeechAudio(): void {
  const ctx = getContext()
  if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {})
  try {
    void new Audio(SILENT_WAV).play().catch(() => {})
  } catch {
    // Nothing to do — the WebAudio unlock above is the one that matters.
  }
}

/**
 * Play one spoken line. Resolves once playback has STARTED (or has failed to);
 * await the returned `finished` to know when the line is over.
 */
export async function playSpeech(blob: Blob, offsetSeconds = 0): Promise<SpeechPlayback> {
  let bytes: ArrayBuffer
  try {
    bytes = await blob.arrayBuffer()
  } catch {
    return { finished: Promise.resolve<SpeechEndReason>("error"), stop: () => {} }
  }

  const viaWebAudio = await playViaWebAudio(bytes, offsetSeconds)
  if (viaWebAudio) return viaWebAudio

  // decodeAudioData refused it, or there is no AudioContext at all.
  return playViaElement(blob, offsetSeconds)
}

/** Returns null when WebAudio can't handle it, so the caller can fall back. */
async function playViaWebAudio(bytes: ArrayBuffer, offsetSeconds = 0): Promise<SpeechPlayback | null> {
  const ctx = getContext()
  if (!ctx) return null

  if (ctx.state === "suspended") {
    try {
      await ctx.resume()
    } catch {
      // Still suspended below — fall through to the element path, which
      // surfaces autoplay refusal as "blocked" the way callers expect.
    }
  }
  if (ctx.state !== "running") return null

  let decoded: AudioBuffer
  try {
    // decodeAudioData detaches the buffer it is given, so hand it a copy —
    // the element fallback needs the original bytes intact.
    decoded = await ctx.decodeAudioData(bytes.slice(0))
  } catch {
    return null
  }

  const source = ctx.createBufferSource()
  source.buffer = decoded
  source.connect(ctx.destination)

  let settle: (reason: SpeechEndReason) => void = () => {}
  let done = false
  const finished = new Promise<SpeechEndReason>((resolve) => {
    settle = (reason) => {
      if (done) return
      done = true
      try {
        source.disconnect()
      } catch {
        // Already torn down.
      }
      resolve(reason)
    }
  })

  let stopped = false
  source.onended = () => settle(stopped ? "stopped" : "ended")

  try {
    // Resume where the line was interrupted, clamped inside the clip.
    source.start(0, Math.max(0, Math.min(offsetSeconds, Math.max(0, decoded.duration - 0.05))))
  } catch {
    settle("error")
    return { finished, stop: () => {} }
  }

  return {
    finished,
    stop: () => {
      if (done) return
      stopped = true
      try {
        source.stop()
      } catch {
        // Never started, or already stopped; onended still settles it.
      }
      settle("stopped")
    },
  }
}

/** The original element-based path, kept as the fallback. */
function playViaElement(blob: Blob, offsetSeconds = 0): SpeechPlayback {
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)

  let settle: (reason: SpeechEndReason) => void = () => {}
  let done = false
  const finished = new Promise<SpeechEndReason>((resolve) => {
    settle = (reason) => {
      if (done) return
      done = true
      URL.revokeObjectURL(url)
      resolve(reason)
    }
  })

  audio.onended = () => settle("ended")
  audio.onerror = () => settle("error")

  if (offsetSeconds > 0) {
    const seek = () => {
      try {
        audio.currentTime = Math.min(offsetSeconds, Math.max(0, (audio.duration || 0) - 0.05))
      } catch {
        // Not seekable — plays from the top, which beats silence.
      }
    }
    if (audio.readyState >= 1) seek()
    else audio.addEventListener("loadedmetadata", seek, { once: true })
  }

  void audio.play().catch(() => settle("blocked"))

  return {
    finished,
    stop: () => {
      if (done) return
      audio.pause()
      audio.src = ""
      settle("stopped")
    },
  }
}
