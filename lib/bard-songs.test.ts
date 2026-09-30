import { describe, it, expect } from "vitest"
import { bardSongCue, carriesInstrument, UNACCOMPANIED, INSTRUMENT_SLUGS } from "./bard-songs"

/** Deterministic rng: replays the given fractions, then repeats the last. */
const script = (...vals: number[]): (() => number) => {
  let i = 0
  return () => vals[Math.min(i++, vals.length - 1)]
}

describe("carriesInstrument", () => {
  it("finds an instrument anywhere in the carried slugs", () => {
    expect(carriesInstrument(["rags", "tattered-journal", "lute"])).toBe(true)
  })

  it("is false for the prisoner's actual kit", () => {
    expect(carriesInstrument(["rags", "tattered-journal", "small-quill"])).toBe(false)
  })

  it("ignores nulls, blanks and casing rather than throwing on them", () => {
    expect(carriesInstrument([null, undefined, "", "  LUTE  "])).toBe(true)
    expect(carriesInstrument([null, undefined])).toBe(false)
  })

  it("does NOT count the Draakhorn — it is an artifact, not a bard's horn", () => {
    expect(carriesInstrument(["the-draakhorn"])).toBe(false)
    // ...while the mundane horn, which IS on the SRD instrument list, does.
    expect(carriesInstrument(["horn"])).toBe(true)
  })
})

describe("bardSongCue", () => {
  const empty: string[] = []

  it("plays nothing on a flat performance", () => {
    expect(bardSongCue("flat", empty, script(0))).toBeNull()
  })

  it("returns a warm song for a warm band", () => {
    expect(bardSongCue("warm", empty, script(0))).toBe("bard/sun-is-a-rumour")
  })

  it("returns a moving song for a moving band", () => {
    expect(bardSongCue("moving", empty, script(0))).toBe("bard/down-we-went")
  })

  it("never returns a moving song for a warm check, or the reverse", () => {
    for (const r of [0, 0.34, 0.5, 0.67, 0.99]) {
      const warm = bardSongCue("warm", empty, script(r))!
      const moving = bardSongCue("moving", empty, script(r))!
      expect(UNACCOMPANIED.warm).toContain(warm.replace("bard/", ""))
      expect(UNACCOMPANIED.moving).toContain(moving.replace("bard/", ""))
    }
  })

  it("stays silent when the bard is carrying an instrument — no accompanied take exists", () => {
    expect(bardSongCue("warm", ["lute"], script(0))).toBeNull()
    expect(bardSongCue("moving", ["rags", "flute"], script(0))).toBeNull()
  })

  it("reaches every song in each pool across the unit interval", () => {
    for (const band of ["warm", "moving"] as const) {
      const seen = new Set<string>()
      for (let i = 0; i < 100; i++) seen.add(bardSongCue(band, empty, script(i / 100))!)
      expect(seen.size).toBe(UNACCOMPANIED[band].length)
    }
  })

  it("cannot run off the end of the pool when rng returns exactly 1", () => {
    // Math.random() never returns 1, but a caller's rng might, and an
    // out-of-range index would emit `bard/undefined` — a cue that fails
    // silently in the browser and would be a nightmare to trace back here.
    for (const band of ["warm", "moving"] as const) {
      const cue = bardSongCue(band, empty, script(1))
      expect(cue).not.toBeNull()
      expect(cue).not.toContain("undefined")
      expect(UNACCOMPANIED[band]).toContain(cue!.replace("bard/", ""))
    }
  })

  it("defaults to Math.random without an injected rng", () => {
    const cue = bardSongCue("warm", empty)
    expect(cue).toMatch(/^bard\/[a-z0-9-]+$/)
  })
})

describe("the catalogue itself", () => {
  it("emits cues under the bard/ prefix so lib/sfx resolves them in the bucket", () => {
    expect(bardSongCue("warm", [], script(0))!.startsWith("bard/")).toBe(true)
  })

  it("names no song twice, and never the same song in both bands", () => {
    const all = [...UNACCOMPANIED.warm, ...UNACCOMPANIED.moving]
    expect(new Set(all).size).toBe(all.length)
  })

  it("uses base slugs with no file extension and no variant suffix", () => {
    // A `_2` or a `.ogg` here would defeat lib/sfx's pickVariant, which builds
    // the pool by appending `_2`..`_4` to whatever it is given.
    for (const slug of [...UNACCOMPANIED.warm, ...UNACCOMPANIED.moving]) {
      expect(slug).not.toMatch(/\.(ogg|mp3)$/)
      expect(slug).not.toMatch(/_\d+$/)
      expect(slug).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it("keeps every instrument slug in the lowercase-hyphen form the catalog uses", () => {
    for (const slug of INSTRUMENT_SLUGS) expect(slug).toMatch(/^[a-z0-9-]+$/)
  })
})
