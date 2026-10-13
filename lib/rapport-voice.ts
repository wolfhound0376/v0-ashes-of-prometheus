// The rapport treatment: a voice heard in your own head, in a cave (lib/rapport.ts has the ruling).
//
// Built from plain WebAudio so it runs anywhere a line is played: the dashboard's speech queue and
// the painted map. The chain, from one input:
//   dry      — low-passed (the air of a thought, no sibilance), a touch quieter than normal speech
//   doubles  — two copies a few milliseconds late, detuned a few cents each way by a slow LFO, so the
//              voice is recognisably the listener's own but not quite theirs ("altered")
//   cave     — a convolver with a synthesised 2.6-second stone-chamber tail, low-passed, under it all
//   dream    — Sam, 2026-10-13 ("an altered feel as if it were dreamlike"): the whole voice drifts
//              slowly in pitch (a 0.11 Hz wobble through a modulated delay), a soft reversed swell
//              rises just before each sound (a pre-echo tail), and wide slow echoes drift left and
//              right behind it, breathing with a slow tremolo
// Everything is deterministic (the tails are seeded), so the same line sounds the same twice.

export type RapportChain = { input: AudioNode; dispose: () => void; /** play the source slower/deeper through this chain */ playbackRate?: number }

const tails = new WeakMap<AudioContext, AudioBuffer>()

function caveTail(ctx: AudioContext): AudioBuffer {
  const have = tails.get(ctx)
  if (have) return have
  const seconds = 2.6, rate = ctx.sampleRate, n = Math.floor(seconds * rate)
  const buf = ctx.createBuffer(2, n, rate)
  let seed = 0x9e3779b1
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 4294967296) * 2 - 1 }
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    // early stone reflections, then an exponential tail; the tail decays faster above ~2 kHz
    const taps = [0.011, 0.023, 0.037, 0.052, 0.071, 0.094]
    for (let i = 0; i < n; i++) {
      const t = i / rate
      let v = rnd() * Math.exp(-3.1 * t) * 0.6
      for (const tap of taps) if (Math.abs(t - tap) < 0.0006) v += (ch ? -0.5 : 0.5) * Math.exp(-6 * tap)
      d[i] = v
    }
    // a cheap one-pole low-pass so the tail is dark, like rock
    let acc = 0
    for (let i = 0; i < n; i++) { acc += (d[i] - acc) * 0.18; d[i] = acc }
  }
  tails.set(ctx, buf)
  return buf
}

const swells = new WeakMap<AudioContext, AudioBuffer>()
/** A tail that rises instead of falling: played through a convolver it puts a soft swell BEFORE each sound. */
function dreamSwell(ctx: AudioContext): AudioBuffer {
  const have = swells.get(ctx)
  if (have) return have
  const seconds = 0.9, rate = ctx.sampleRate, n = Math.floor(seconds * rate)
  const buf = ctx.createBuffer(2, n, rate)
  let seed = 0x2545f491
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 4294967296) * 2 - 1 }
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < n; i++) { const k = i / n; d[i] = rnd() * k * k * 0.5 }
    let acc = 0
    for (let i = 0; i < n; i++) { acc += (d[i] - acc) * 0.12; d[i] = acc }
  }
  swells.set(ctx, buf)
  return buf
}

export function rapportChain(ctx: AudioContext, destination: AudioNode = ctx.destination): RapportChain {
  const raw = ctx.createGain(); raw.gain.value = 1
  // dream: everything below hears a voice whose pitch drifts slowly, the way a voice does in sleep
  const drift = ctx.createDelay(0.2); drift.delayTime.value = 0.03
  const driftLfo = ctx.createOscillator(); driftLfo.type = "sine"; driftLfo.frequency.value = 0.11
  const driftDepth = ctx.createGain(); driftDepth.gain.value = 0.012      // ±12 ms at 0.11 Hz ≈ a slow ±1.5 % pitch wander
  driftLfo.connect(driftDepth).connect(drift.delayTime); driftLfo.start()
  const input = ctx.createGain(); input.gain.value = 1
  raw.connect(drift).connect(input)

  // dry
  const dryLp = ctx.createBiquadFilter(); dryLp.type = "lowpass"; dryLp.frequency.value = 3600; dryLp.Q.value = 0.6
  const dry = ctx.createGain(); dry.gain.value = 0.55
  input.connect(dryLp).connect(dry).connect(destination)

  // doubles, detuned against each other
  const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.35
  const doubles: AudioNode[] = []
  for (const [ms, cents, phase] of [[14, +7, 1], [27, -9, -1]] as const) {
    const delay = ctx.createDelay(0.1); delay.delayTime.value = ms / 1000
    const depth = ctx.createGain(); depth.gain.value = (cents / 1200) * (ms / 1000) * 0.9 * phase   // tiny delay wobble == a few cents of pitch
    lfo.connect(depth).connect(delay.delayTime)
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2800
    const g = ctx.createGain(); g.gain.value = 0.32
    input.connect(delay).connect(lp).connect(g).connect(destination)
    doubles.push(delay, lp, g, depth)
  }
  lfo.start()

  // the cave
  const conv = ctx.createConvolver(); conv.buffer = caveTail(ctx)
  const wetLp = ctx.createBiquadFilter(); wetLp.type = "lowpass"; wetLp.frequency.value = 2400
  const pre = ctx.createDelay(0.1); pre.delayTime.value = 0.018
  const wet = ctx.createGain(); wet.gain.value = 0.5
  input.connect(pre).connect(conv).connect(wetLp).connect(wet).connect(destination)

  // dream: a soft swell rising before each sound, and wide slow echoes that breathe
  const swell = ctx.createConvolver(); swell.buffer = dreamSwell(ctx)
  const swellLp = ctx.createBiquadFilter(); swellLp.type = "lowpass"; swellLp.frequency.value = 1800
  const swellG = ctx.createGain(); swellG.gain.value = 0.22
  input.connect(swell).connect(swellLp).connect(swellG).connect(destination)
  const breathe = ctx.createGain(); breathe.gain.value = 0.26
  const breatheLfo = ctx.createOscillator(); breatheLfo.frequency.value = 0.21
  const breatheDepth = ctx.createGain(); breatheDepth.gain.value = 0.09
  breatheLfo.connect(breatheDepth).connect(breathe.gain); breatheLfo.start()
  const pan = [ctx.createStereoPanner(), ctx.createStereoPanner()]; pan[0].pan.value = -0.7; pan[1].pan.value = 0.7
  const echoes: AudioNode[] = []
  for (const [i, ms] of [[0, 310], [1, 470]] as const) {
    const d = ctx.createDelay(1); d.delayTime.value = ms / 1000
    const fb = ctx.createGain(); fb.gain.value = 0.28
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1600
    input.connect(d).connect(lp).connect(fb).connect(d)          // feedback loop, darker each time round
    lp.connect(pan[i]).connect(breathe)
    echoes.push(d, fb, lp)
  }
  breathe.connect(destination)

  const dispose = () => {
    for (const o of [lfo, driftLfo, breatheLfo]) { try { o.stop() } catch { /* already stopped */ } }
    for (const node of [raw, drift, driftDepth, input, dryLp, dry, conv, wetLp, pre, wet, lfo, swell, swellLp, swellG, breathe, breatheDepth, ...pan, ...echoes, ...doubles]) { try { node.disconnect() } catch { /* torn down */ } }
  }
  return { input: raw, dispose }
}

// The kuo-toa throat (lib/rapport.ts CROAK): setting B of the three Sam auditioned on 2026-10-13.
// The caller plays the source at `playbackRate` (deeper and slower); the chain adds a gurgle (the
// voice ring-modulated against a 31 Hz tone), a 13 Hz flutter in the throat, a short hollow
// resonance (a 9 ms comb), and rolls the top off at 2.1 kHz.
export function croakChain(ctx: AudioContext, destination: AudioNode = ctx.destination): RapportChain {
  const input = ctx.createGain(); input.gain.value = 1
  const ring = ctx.createGain(); ring.gain.value = 0
  const osc = ctx.createOscillator(); osc.frequency.value = 31; osc.connect(ring.gain); osc.start()
  const ringMix = ctx.createGain(); ringMix.gain.value = 0.5
  input.connect(ring).connect(ringMix)
  const dry = ctx.createGain(); dry.gain.value = 0.7
  input.connect(dry)
  const sum = ctx.createGain(); ringMix.connect(sum); dry.connect(sum)
  const trem = ctx.createGain(); trem.gain.value = 0.6
  const tl = ctx.createOscillator(); tl.frequency.value = 13
  const td = ctx.createGain(); td.gain.value = 0.4
  tl.connect(td).connect(trem.gain); tl.start()
  sum.connect(trem)
  const comb = ctx.createDelay(0.05); comb.delayTime.value = 0.009
  const fb = ctx.createGain(); fb.gain.value = 0.45
  trem.connect(comb).connect(fb).connect(comb)
  const mix = ctx.createGain(); mix.gain.value = 0.6
  comb.connect(mix)
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2100
  trem.connect(lp); mix.connect(lp)
  const out = ctx.createGain(); out.gain.value = 0.9
  lp.connect(out).connect(destination)
  const dispose = () => {
    for (const o of [osc, tl]) { try { o.stop() } catch { /* already stopped */ } }
    for (const node of [input, ring, ringMix, dry, sum, trem, td, comb, fb, mix, lp, out]) { try { node.disconnect() } catch { /* torn down */ } }
  }
  return { input, dispose, playbackRate: 0.8 }
}
