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
  // Scheduling against a suspended context silently drops the sound on the
  // first click of a session, so wait for resume before playing.
  if (ac.state !== "running") {
    ac.resume().then(() => playTick(ac, strength)).catch(() => {})
    return
  }
  playTick(ac, strength)
}

function playTick(ac: AudioContext, strength: "soft" | "firm"): void {
  try {
    const firm = strength === "firm"
    const now = ac.currentTime + 0.001
    const dur = firm ? 0.045 : 0.03

    const out = ac.createGain()
    out.gain.value = firm ? 0.9 : 0.45
    out.connect(ac.destination)

    // Transient: a short, broad noise snap for the "tick".
    const frames = Math.max(1, Math.floor(ac.sampleRate * dur))
    const buf = ac.createBuffer(1, frames, ac.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 8)
    }
    const noise = ac.createBufferSource()
    noise.buffer = buf
    const hp = ac.createBiquadFilter()
    hp.type = "highpass"
    hp.frequency.value = 1500
    const noiseGain = ac.createGain()
    noiseGain.gain.setValueAtTime(0.6, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur)
    noise.connect(hp).connect(noiseGain).connect(out)
    noise.start(now)
    noise.stop(now + dur + 0.01)

    // Body: a fast pitch-dropping tone that gives the click weight so it is
    // audible on laptop speakers, not just headphones.
    const tone = ac.createOscillator()
    tone.type = "triangle"
    tone.frequency.setValueAtTime(firm ? 1800 : 2400, now)
    tone.frequency.exponentialRampToValueAtTime(firm ? 700 : 1100, now + 0.025)
    const toneGain = ac.createGain()
    toneGain.gain.setValueAtTime(0.0001, now)
    toneGain.gain.exponentialRampToValueAtTime(0.5, now + 0.002)
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03)
    tone.connect(toneGain).connect(out)
    tone.start(now)
    tone.stop(now + 0.04)
  } catch {
    // A click that cannot play is not worth an error. Silence is fine.
  }
}
