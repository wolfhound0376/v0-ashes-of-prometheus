import { describe, it, expect } from "vitest"
import { tagLine, triggerOf, isSpecific } from "./dialogue-tags"

const HEROES = ["Fifi", "Kenta", "Samson", "Scott", "Lynkes", "Gandalf"]

describe("tagLine — who is never recycled", () => {
  it("never recycles Malachar, whatever he said", () => {
    const t = tagLine({ speaker: "Malachar", speaker_type: "dm", channel: "dm", text: "The dark is patient." })
    expect(t.kind).toBe("dm")
    expect(t.reusable).toBe(false)
    expect(t.reason).toMatch(/Malachar/)
  })

  it("knows Malachar by speaker_type even under another name", () => {
    expect(tagLine({ speaker: "The Narrator", speaker_type: "dm", text: "Stone sweats." }).reusable).toBe(false)
  })

  it("knows Malachar by name even when the type is missing", () => {
    expect(tagLine({ speaker: "Malachar", text: "Stone sweats." }).kind).toBe("dm")
  })

  it("never recycles a player's own words", () => {
    const t = tagLine({ speaker: "Fifi", speaker_type: "player", channel: "dm", text: "We go left." })
    expect(t.kind).toBe("player")
    expect(t.reusable).toBe(false)
  })

  it("never recycles a message between players", () => {
    const t = tagLine({ speaker: "Fifi", speaker_type: "player", channel: "direct", recipient: "Kenta", text: "now" })
    expect(t.kind).toBe("direct")
    expect(t.reusable).toBe(false)
  })

  it("never recycles the combat log", () => {
    expect(tagLine({ speaker: "Combat", channel: "dm", text: "A hit." }).kind).toBe("combat")
    expect(tagLine({ speaker: "Combat", channel: "dm", text: "A hit." }).reusable).toBe(false)
  })
})

describe("tagLine — what IS recycled", () => {
  it("recycles a guard's standing bark", () => {
    const t = tagLine({ speaker: "Drow Guard", speaker_type: "npc", channel: "dm", text: "Step back from the bars." }, HEROES)
    expect(t.kind).toBe("npc")
    expect(t.trigger).toBe("gate_warning")
    expect(t.reusable).toBe(true)
    expect(t.reason).toBe("")
  })

  it("recycles generic system flavour", () => {
    const t = tagLine({ speaker: "System", speaker_type: "system", channel: "dm", text: "Water drips somewhere behind the stone." }, HEROES)
    expect(t.kind).toBe("system")
    expect(t.reusable).toBe(true)
  })

  it("treats an unknown speaker_type as an NPC", () => {
    expect(tagLine({ speaker: "Ront", channel: "dm", text: "Orc not afraid." }, HEROES).kind).toBe("npc")
  })

  it("carries the speaker in the tags so a bark can be asked for by voice", () => {
    expect(tagLine({ speaker: "Drow Guard", speaker_type: "npc", text: "Step back." }, HEROES).tags).toContain(
      "speaker:Drow Guard",
    )
  })
})

describe("isSpecific — a line true for one moment only", () => {
  it("rejects anything with a number", () => {
    expect(isSpecific("Fifi takes 7 damage.")).toBe("contains a number")
  })

  it("rejects a roll", () => {
    expect(isSpecific("🎲 Stealth")).toBe("contains a roll")
    expect(isSpecific("[[1d20+3]]")).toBe("contains a roll")
  })

  it("rejects an engine tag", () => {
    expect(isSpecific("[CINEMATIC: pen-gate]")).toBe("contains a system tag")
  })

  it("rejects a line naming a hero from the roster it was given", () => {
    expect(isSpecific("Kenta reaches the gate.", HEROES)).toBe("names Kenta")
  })

  it("does not fire on a name the roster does not contain", () => {
    expect(isSpecific("Ilvara watches.", HEROES)).toBe("")
  })

  it("matches a name as a whole word, not inside another", () => {
    // "Scott" must not fire on "Scotts" is too cute to guarantee; what matters
    // is that a substring in an unrelated word does not count as the hero.
    expect(isSpecific("The mastiff barks.", ["Tiff"])).toBe("")
  })

  it("passes a plain generic line", () => {
    expect(isSpecific("The gate holds.", HEROES)).toBe("")
  })

  it("is case-insensitive about names", () => {
    expect(isSpecific("fifi is gone.", HEROES)).toBe("names Fifi")
  })
})

describe("triggerOf", () => {
  const cases: Array<[string, string]> = [
    ["Step back from the door.", "gate_warning"],
    ["Get to the work detail.", "labor"],
    ["The body lies where it fell.", "death"],
    ["She takes the dagger.", "loot"],
    ["The party makes camp.", "rest"],
    ["A drow enters the chamber.", "arrival"],
    ["Surface filth.", "taunt"],
    ["Hail, prisoner.", "greeting"],
    ["Dust settles on cold stone.", "flavour"],
  ]
  for (const [text, want] of cases) {
    it(`reads "${text}" as ${want}`, () => {
      expect(triggerOf(text)).toBe(want)
    })
  }
})

describe("edges", () => {
  it("an empty line is never reusable", () => {
    const t = tagLine({ speaker: "Drow Guard", speaker_type: "npc", text: "   " })
    expect(t.reusable).toBe(false)
    expect(t.trigger).toBe("unknown")
  })

  it("a specific NPC line is tagged and kept, just not reusable", () => {
    const t = tagLine({ speaker: "Drow Guard", speaker_type: "npc", text: "Kenta, step back." }, HEROES)
    expect(t.kind).toBe("npc")
    expect(t.trigger).toBe("gate_warning")
    expect(t.reusable).toBe(false)
    expect(t.reason).toBe("names Kenta")
  })

  it("no roster means names cannot be detected — numbers still can", () => {
    expect(tagLine({ speaker: "Drow Guard", speaker_type: "npc", text: "Kenta, step back." }).reusable).toBe(true)
    expect(tagLine({ speaker: "Drow Guard", speaker_type: "npc", text: "Take 3 of them." }).reusable).toBe(false)
  })
})
