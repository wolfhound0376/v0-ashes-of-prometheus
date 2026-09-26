import test from "node:test"
import assert from "node:assert/strict"
import { parseRollRequest, rollMatchesRequest, stripRollRequestExtras } from "../lib/roll-requests.ts"

test("parses and normalizes Malachar roll notation", () => {
  assert.deepEqual(parseRollRequest("Make a Stealth check [[ 1d20 + 7 ]] now."), {
    expression: "1d20+7",
    die: "d20",
    diceCount: 1,
    modifier: 7,
    skill: null,
    dc: null,
  })
  assert.deepEqual(parseRollRequest("Damage: [[2d6-1]]"), {
    expression: "2d6-1",
    die: "d6",
    diceCount: 2,
    modifier: -1,
    skill: null,
    dc: null,
  })
  assert.equal(parseRollRequest("No roll needed."), null)
})

// docs/claude_Earned_Proficiency.md §2: the tag may carry the skill and the DC
// so a check is legible to the engine. Both optional, order-free, and every
// bare [[1d20+3]] written before this shipped still parses exactly as it did.
test("reads the optional skill and DC out of the extended tag", () => {
  const stealth = parseRollRequest("Quiet now. Roll Stealth. [[1d20+7 | stealth | DC 15]]")
  assert.equal(stealth.expression, "1d20+7")
  assert.equal(stealth.skill, "stealth")
  assert.equal(stealth.dc, 15)

  // Any spelling of the skill, either order, "DC15" or "DC: 12".
  const beast = parseRollRequest("[[1d20+1 | DC: 12 | Animal Handling]]")
  assert.equal(beast.skill, "animal_handling")
  assert.equal(beast.dc, 12)
  assert.equal(parseRollRequest("[[1d20 | Sleight-of-Hand | dc15]]").skill, "sleight_of_hand")
  assert.equal(parseRollRequest("[[1d20 | Sleight-of-Hand | dc15]]").dc, 15)

  // Skill without DC, DC without skill, and an unknown "skill": nothing is guessed.
  assert.deepEqual([parseRollRequest("[[1d20+2 | perception]]").skill, parseRollRequest("[[1d20+2 | perception]]").dc], ["perception", null])
  assert.deepEqual([parseRollRequest("[[1d20+2 | DC 10]]").skill, parseRollRequest("[[1d20+2 | DC 10]]").dc], [null, 10])
  assert.deepEqual([parseRollRequest("[[1d20+2 | lockpicking | DC 10]]").skill, parseRollRequest("[[1d20+2 | lockpicking | DC 10]]").dc], [null, 10])

  // An absurd DC is dropped, the roll is still a roll.
  const silly = parseRollRequest("[[1d20+2 | stealth | DC 900]]")
  assert.equal(silly.dc, null)
  assert.equal(silly.skill, "stealth")
  assert.equal(silly.expression, "1d20+2")
})

test("the table only ever sees the bare dice", () => {
  assert.equal(
    stripRollRequestExtras("Quiet now. Roll Stealth. [[1d20+7 | stealth | DC 15]] Then wait."),
    "Quiet now. Roll Stealth. [[1d20+7]] Then wait.",
  )
  // Two tags in one turn, both cut; the untouched one is byte-for-byte the same.
  assert.equal(
    stripRollRequestExtras("[[ 1d20 + 3 | perception | DC 13 ]] and [[2d6+2]] and [[1d4|DC 5]]"),
    "[[1d20+3]] and [[2d6+2]] and [[1d4]]",
  )
  assert.equal(stripRollRequestExtras("No extras here [[1d20+5]]."), "No extras here [[1d20+5]].")
  assert.equal(stripRollRequestExtras("plain prose"), "plain prose")
})

test("accepts only the exact requested dice, modifier, bounds, and total", () => {
  const request = {
    id: "00000000-0000-4000-8000-000000000001",
    correlationId: "00000000-0000-4000-8000-000000000002",
    expression: "1d20+7",
    die: "d20",
    diceCount: 1,
    modifier: 7,
    status: "pending",
  }
  const valid = { die: "d20", rolls: [13], modifier: 7, total: 20, rollMode: "normal" }
  assert.equal(rollMatchesRequest(request, valid), true)
  assert.equal(rollMatchesRequest(request, { ...valid, die: "d12" }), false)
  assert.equal(rollMatchesRequest(request, { ...valid, modifier: 0, total: 13 }), false)
  assert.equal(rollMatchesRequest(request, { ...valid, rolls: [21], total: 28 }), false)
  assert.equal(rollMatchesRequest(request, { ...valid, total: 19 }), false)
  assert.equal(rollMatchesRequest(request, { ...valid, rolls: [8, 13], total: 28 }), false)
  assert.equal(rollMatchesRequest(request, { ...valid, rolls: [8, 13], total: 20, rollMode: "advantage" }), false)
})

test("ten consecutive requested-result handoffs preserve their exact totals", () => {
  for (let index = 1; index <= 10; index += 1) {
    const modifier = index - 5
    const face = (index * 7) % 20 + 1
    const request = {
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      correlationId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      expression: `1d20${modifier >= 0 ? `+${modifier}` : modifier}`,
      die: "d20",
      diceCount: 1,
      modifier,
      status: "pending",
    }
    assert.equal(
      rollMatchesRequest(request, { die: "d20", rolls: [face], modifier, total: face + modifier }),
      true,
      `handoff ${index} should validate`,
    )
  }
})
