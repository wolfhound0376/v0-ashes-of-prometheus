import { describe, expect, it } from "vitest"
import { gateStateOf, watchAndGateTags, watchStateOf } from "./stage-roster"
import { directorPrompt, namesTaggedIn, parseDirector, wantsDirector, type DirectorInput } from "./stage-director"

const pen: DirectorInput = {
  narration: "The two guards on the bridge stiffen as boots ring on the tower stair. Their relief has come.",
  cast: [{ name: "Jorlan Duskryn", aliases: ["jorlan"] }, { name: "Drow Guard" }, { name: "Eldeth Feldrun" }, { name: "Topsy" }, { name: "Turvy" }],
  characters: ["Fifi of Copperas Cove", "Kenta", "Samson", "Scott"],
  watch: null,
  gate: null,
}
const none = { names: new Set<string>(), watch: false, gate: false }

describe("[WATCH:] and [GATE:] tags", () => {
  it("reads the words Malachar is likely to use", () => {
    expect(watchStateOf("change")).toBe("changing")
    expect(watchStateOf("shift change")).toBe("changing")
    expect(watchStateOf("Unattended")).toBe("unattended")
    expect(watchStateOf("posted")).toBe("posted")
    expect(gateStateOf("left unlocked")).toBe("unlocked")
    expect(gateStateOf("open")).toBe("open")
    expect(gateStateOf("locked")).toBe("locked")
  })
  it("drops a word it does not know rather than guessing", () => {
    expect(watchStateOf("sleepy")).toBeNull()
    expect(gateStateOf("rattling")).toBeNull()
    expect(watchAndGateTags("[WATCH: sleepy] [GATE: rattling]")).toEqual([])
  })
  it("keeps the order of the reply", () => {
    expect(watchAndGateTags("The relief is late.\n[WATCH: unattended]\n[GATE: unlocked]")).toEqual([
      { kind: "watch", state: "unattended" },
      { kind: "gate", state: "unlocked" },
    ])
  })
})

describe("the stage director", () => {
  it("only runs when there is something to direct", () => {
    expect(wantsDirector({ ...pen, narration: "Yes." })).toBe(false)
    expect(wantsDirector(pen)).toBe(true)
    expect(wantsDirector({ ...pen, cast: [], narration: "You sit in the dark and listen to the river for a long while." })).toBe(false)
    expect(wantsDirector({ ...pen, cast: [], narration: "Somewhere above, the guards change their watch with a muttered word." })).toBe(true)
  })
  it("tells the model plans are not facts", () => {
    expect(directorPrompt(pen)).toMatch(/at the next shift change I will leave it unlocked" is NOTHING/)
  })
  it("turns a guard change into one watch event", () => {
    expect(parseDirector('{"watch":"changing","gate":null,"moves":[],"leaves":[],"approaches":[]}', pen, none)).toEqual([{ kind: "watch", state: "changing" }])
  })
  it("empties the posts and unlocks the gate when the narration does", () => {
    const ev = parseDirector('```json\n{"watch":"unattended","gate":"unlocked","moves":[],"leaves":["Jorlan"],"approaches":[]}\n```', pen, none)
    expect(ev).toEqual([
      { kind: "watch", state: "unattended" },
      { kind: "gate", state: "unlocked" },
      { kind: "leave", name: "Jorlan Duskryn", dead: false },
    ])
  })
  it("walks a prisoner over to the character they talk to", () => {
    const ev = parseDirector('{"approaches":[{"name":"Eldeth","to":"Fifi"}]}', pen, none)
    expect(ev).toEqual([{ kind: "place", name: "Eldeth Feldrun", where: "beside Fifi of Copperas Cove" }])
  })
  it("never invents a creature or a character", () => {
    const ev = parseDirector('{"moves":[{"name":"Demogorgon","where":"on the bridge"}],"approaches":[{"name":"Topsy","to":"Gerald"}],"leaves":["Mystery Drow"]}', pen, none)
    expect(ev).toEqual([])
  })
  it("leaves alone whatever the reply already tagged", () => {
    const text = "Jorlan slips away. [NPC_LEAVE: Jorlan Duskryn] [WATCH: unattended]"
    const tagged = { names: namesTaggedIn(text), watch: true, gate: false }
    const ev = parseDirector('{"watch":"unattended","leaves":["Jorlan Duskryn"],"moves":[{"name":"Topsy","where":"at the bars"}]}', pen, tagged)
    expect(ev).toEqual([{ kind: "place", name: "Topsy", where: "at the bars" }])
  })
  it("says nothing when nothing changed", () => {
    expect(parseDirector('{"watch":"posted","gate":"locked","moves":[],"leaves":[],"approaches":[]}', pen, none)).toEqual([])
    expect(parseDirector("I could not tell.", pen, none)).toEqual([])
  })
  it("does not reopen a gate the story already holds open", () => {
    expect(parseDirector('{"gate":"open"}', { ...pen, gate: "open" }, none)).toEqual([])
  })
})
