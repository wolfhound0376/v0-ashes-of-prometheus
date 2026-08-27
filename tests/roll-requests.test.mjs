import test from "node:test"
import assert from "node:assert/strict"
import { parseRollRequest, rollMatchesRequest } from "../lib/roll-requests.ts"

test("parses and normalizes Malachar roll notation", () => {
  assert.deepEqual(parseRollRequest("Make a Stealth check [[ 1d20 + 7 ]] now."), {
    expression: "1d20+7",
    die: "d20",
    diceCount: 1,
    modifier: 7,
  })
  assert.deepEqual(parseRollRequest("Damage: [[2d6-1]]"), {
    expression: "2d6-1",
    die: "d6",
    diceCount: 2,
    modifier: -1,
  })
  assert.equal(parseRollRequest("No roll needed."), null)
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
