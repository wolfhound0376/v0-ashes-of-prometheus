import { describe, expect, test } from "vitest"
import { isRollLine, stripRollTalk } from "./speech-notation"

// Sam, 2026-10-26: "rolls, types of checks (insight, stealth) are not used as dialogue in bubbles, speech,
// in the pixel map as speech or the dashboard UI".
describe("isRollLine", () => {
  test("the walk's and the dashboard's roll rows", () => {
    expect(isRollLine("🎲 Thieves' tools: 15 (1d20+5 → [10] +5)")).toBe(true)
    expect(isRollLine("[Dice Roll] Lynkes — Picking the pen gate's lock (Thieves' tools). Against DC 20 this FAILS")).toBe(true)
    expect(isRollLine("[ROLL_RESULT:abc] [Dice Roll] Stealth: 14")).toBe(true)
  })
  test("ordinary speech is not a roll line", () => {
    expect(isRollLine("Let me out of here.")).toBe(false)
    expect(isRollLine("")).toBe(false)
  })
})

describe("stripRollTalk", () => {
  test("a check call is cut, the story stays", () => {
    expect(stripRollTalk("The guard narrows his eyes. Make a Wisdom (Insight) check. [[1d20+2]]")).toBe("The guard narrows his eyes.")
    expect(stripRollTalk("Roll for Stealth as you creep past. The bridge creaks.")).toBe("The bridge creaks.")
    expect(stripRollTalk("Give me a Dexterity saving throw! The floor gives way.")).toBe("The floor gives way.")
    expect(stripRollTalk("You slip past the sentry (Stealth 17) and reach the ladder.")).toBe("You slip past the sentry and reach the ladder.")
    expect(stripRollTalk("The lock is stiff, DC 20 at least. You feel the pins.")).toBe("You feel the pins.")
  })
  test("a line of nothing but mechanics comes back empty", () => {
    expect(stripRollTalk("Perception check.")).toBe("")
    expect(stripRollTalk("🎲 Insight: 12")).toBe("")
    expect(stripRollTalk("[[1d20+3]]")).toBe("")
  })
  test("words that merely look like checks survive", () => {
    expect(stripRollTalk("Save me, please. Check the door.")).toBe("Save me, please. Check the door.")
    expect(stripRollTalk("Roll the barrel over here.")).toBe("Roll the barrel over here.")
    expect(stripRollTalk("Your history with the drow will not save you.")).toBe("Your history with the drow will not save you.")
  })
})
