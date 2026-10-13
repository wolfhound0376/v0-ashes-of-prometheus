// The rapport treatment: a voice heard in your own head, in a cave (lib/rapport.ts has the ruling).
//
// Built from plain WebAudio so it runs anywhere a line is played: the dashboard's speech queue and
// the painted map. The chain, from one input:
//   dry      — low-passed (the air of a thought, no sibilance), a touch quieter than normal speech
//   doubles  — two copies a few milliseconds late, detuned a few cents each way by a slow LFO, so the
//              voice is recognisably the listener's own but not quite theirs ("altered")
//   cave     — a convolver with a synthesised 2.6-second stone-chamber tail, low-passed, under it all
// Everything is deterministic (the tail is seeded), so the same line sounds the same twice.

export type RapportChain = { input: AudioNode; dispose: () => void }

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

export function rapportChain(ctx: AudioContext, destination: AudioNode = ctx.destination): RapportChain {
  const input = ctx.createGain(); input.gain.value = 1

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

  const dispose = () => {
    try { lfo.stop() } catch { /* already stopped */ }
    for (const node of [input, dryLp, dry, conv, wetLp, pre, wet, lfo, ...doubles]) { try { node.disconnect() } catch { /* torn down */ } }
  }
  return { input, dispose }
}
