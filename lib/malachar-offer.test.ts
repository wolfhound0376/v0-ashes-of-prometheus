import { describe, it, expect } from "vitest"
import { offerPrompt, parseOffer, storyFor, OFFER_WORD_CAP, ANSWER_WORD_CAP } from "./malachar-offer"

const input = { act: 1, actLabel: "Act 1 — Escape Velkynvelve", where: "The rope bridge", heroes: ["Kenta", "Fifi"], others: ["Eldeth", "Ront"], story: ["Fifi picks the lock."], brief: "" }

describe("offerPrompt", () => {
  it("names the act, the people present and the story, and forbids invention and game words", () => {
    const p = offerPrompt(input)
    expect(p).toContain("Act 1 — Escape Velkynvelve is ending")
    expect(p).toContain("Kenta, Fifi")
    expect(p).toContain("Eldeth, Ront")
    expect(p).toContain("- Fifi picks the lock.")
    expect(p).toMatch(/Name no new person, place, item, spell or creature/)
    expect(p).toMatch(/No game words/)
  })
  it("reads a mid-Act call (act 0) as the party doing too well", () => {
    expect(offerPrompt({ ...input, act: 0 })).toMatch(/^The party is doing too well/)
  })
})

describe("parseOffer", () => {
  it("takes the JSON out of the reply and strips quotes", () => {
    const o = parseOffer('Here: {"words": "\\"Give me the dwarf.\\"", "accept": "Take her", "refuse": "Never"}')
    expect(o).toEqual({ words: "Give me the dwarf.", accept: "Take her", refuse: "Never" })
  })
  it("refuses a reply with game words in his mouth", () => {
    expect(parseOffer('{"words": "Give me ten hit points.", "accept": "Yes", "refuse": "No"}')).toBeNull()
    expect(parseOffer('{"words": "Roll for it.", "accept": "Yes", "refuse": "No"}')).toBeNull()
  })
  it("refuses missing or identical answers and junk", () => {
    expect(parseOffer('{"words": "x", "accept": "Yes", "refuse": "yes"}')).toBeNull()
    expect(parseOffer('{"words": "x", "accept": "Yes"}')).toBeNull()
    expect(parseOffer("no json")).toBeNull()
    expect(parseOffer(null)).toBeNull()
  })
  it("holds the words and the answers to their caps", () => {
    const long = Array.from({ length: 80 }, (_, i) => `w${i}`).join(" ")
    const o = parseOffer(JSON.stringify({ words: long, accept: long, refuse: "No" }))!
    expect(o.words.split(" ").length).toBe(OFFER_WORD_CAP)
    expect(o.accept.split(" ").length).toBe(ANSWER_WORD_CAP)
  })
})

describe("storyFor", () => {
  it("strips tags, drops repeats, keeps the newest lines oldest first", () => {
    const lines = ["<i>a</i>", "a", ...Array.from({ length: 40 }, (_, i) => `l${i}`)]
    const s = storyFor(lines)
    expect(s.length).toBe(30)
    expect(s[s.length - 1]).toBe("l39")
    expect(storyFor(["<b>x</b>", "x"])).toEqual(["x"])
  })
})
