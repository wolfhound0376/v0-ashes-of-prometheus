// ============================================================================
// UI TICK — the click a target makes when you pick it.
//
// Sam: "an audible click (like what you might hear from an iPhone
// number/letter selection)".
//
// SYNTHESISED, NOT SAMPLED, and the reason is latency. A targeting tick has
// to land on the same frame as the click or it stops being feedback and
// becomes an echo. A sampled clip means a fetch, a decode, and a cache that
// is cold exactly once — on the first target of the session, which is the
// one that matters most. This is four oscillator-free lines of WebAudio: a
// short filtered noise burst with a hard envelope. It is ready the instant
// the audio context is, costs no network, and never misses.
//
// It also sits outside lib/sfx.ts deliberately. That module is the CAMPAIGN's
// sound — spell schools, impacts, footsteps, things the fiction can hear.
// This is the interface clicking under the player's hand, which the fiction
// cannot hear and should never be mixed with.
// ============================================================================

let ctx: AudioContext | null = null

/** Lazily made, and only ever after a real gesture, per browser autoplay rules. */
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    // A context can be suspended by the browser between interactions.
    if (ctx.state === "suspended") void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/**
 * A dry, high, very short tick.
 *
 * `strength` nudges brightness and level: a hover is a whisper, a commit is
 * the real click. Keeping them the same sound at two weights means the ear
 * reads them as one system rather than two unrelated noises.
 */
export function uiTick(strength: "soft" | "firm" = "firm"): void {
  const ac = audio()
  if (!ac) return
  try {
    const firm = strength === "firm"
    const dur = firm ? 0.035 : 0.022

    // Filtered noise rather than a tone: a pure sine reads as a beep, and a
    // beep belongs to a machine. Noise through a tight band-pass is what a
    // physical key sounds like.
    const frames = Math.max(1, Math.floor(ac.sampleRate * dur))
    const buf = ac.createBuffer(1, frames, ac.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < frames; i++) {
      // Decaying noise — the tail is gone almost before it starts.
      const t = i / frames
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 6)
    }

    const src = ac.createBufferSource()
    src.buffer = buf

    const band = ac.createBiquadFilter()
    band.type = "bandpass"
    band.frequency.value = firm ? 2600 : 3400
    band.Q.value = firm ? 1.6 : 2.4

    const gain = ac.createGain()
    const peak = firm ? 0.16 : 0.07
    gain.gain.setValueAtTime(0.0001, ac.currentTime)
    gain.gain.exponentialRampToValueAtTime(peak, ac.currentTime + 0.003)
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur)

    src.connect(band).connect(gain).connect(ac.destination)
    src.start()
    src.stop(ac.currentTime + dur + 0.01)
  } catch {
    // A click that cannot play is not worth an error. Silence is fine.
  }
}
