// The floor's rules, checked without a board: what counts as within reach,
// what a pickup costs on your turn, and that the wire cannot hand the board
// a pile it should not draw.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const out = mkdtempSync(join(tmpdir(), "ground-"))
const bundle = join(out, "g.mjs")
execFileSync(process.env.ESBUILD || "esbuild",
  ["lib/ground-items.ts", "--bundle", "--format=esm", "--platform=neutral", "--outfile=" + bundle],
  { stdio: "inherit" })
const { withinReach, interactionCost, handlingCost, normaliseGroundItems, describePile } =
  await import(pathToFileURL(bundle).href)

// WHAT EACH HANDLING COSTS — Sam's ruling, not the SRD's: "picking up doesn't
// cost anything. equipping or throwing does." This is the whole reason the
// pickup branch of the route asks nobody for permission to spend anything.
assert.equal(handlingCost("pickup"), "none", "bending down is not a turn")
assert.equal(handlingCost("drop"), "none", "letting go is free in the book too")
assert.equal(handlingCost("equip"), "free", "drawing a weapon is the free interaction")
assert.equal(handlingCost("throw"), "action", "a throw is an action")

// The route reads this to price a pickup, so a change of heart in the switch
// must not silently start charging for one.
{
  const src = readFileSync("lib/ground-items.ts", "utf8")
  const arm = src.match(/case "pickup":\s*return "([a-z]+)"/)
  assert.ok(arm, "the pickup arm must stay readable from the source")
  assert.equal(arm[1], "none", "picking up costs nothing — Sam, 4 Sep 2026")
}

// REACH: five feet is one square, diagonals included; two squares is not.
assert.equal(withinReach({ x: 4, y: 6 }, { x: 4, y: 6 }), true, "the same square")
assert.equal(withinReach({ x: 4, y: 6 }, { x: 3, y: 7 }), true, "one diagonal step")
assert.equal(withinReach({ x: 4, y: 6 }, { x: 5, y: 6 }), true, "one orthogonal step")
assert.equal(withinReach({ x: 4, y: 6 }, { x: 4, y: 8 }), false, "two squares away")
assert.equal(withinReach({ x: 4, y: 6 }, { x: 6, y: 8 }), false, "two diagonal squares away")

// THE SRD LADDER still exists, and /api/equipment still uses it: putting gear
// ON is the free object interaction, and a second thing in the same turn costs
// the action. Only picking up was let off.
{
  // Fresh turn: the free interaction.
  const first = interactionCost({ action: false, interacted: false }, "the shard")
  assert.equal(first.ok, true)
  assert.equal(first.cost, "free")
  assert.deepEqual(first.next, { action: false, interacted: true })

  // Second thing this turn: Use an Object, which is the action.
  const second = interactionCost(first.next, "the key")
  assert.equal(second.ok, true)
  assert.equal(second.cost, "action")
  assert.equal(second.next.action, true)
  assert.equal(second.next.interacted, true)

  // Third: nothing left.
  const third = interactionCost(second.next, "the rope")
  assert.equal(third.ok, false)
  assert.match(third.reason, /rope/)

  // An action already spent on a swing still leaves the free interaction.
  const swung = interactionCost({ action: true }, "the shard")
  assert.equal(swung.ok, true)
  assert.equal(swung.cost, "free")

  // The free one gone and the action gone: refused.
  const spent = interactionCost({ action: true, interacted: true }, "the shard")
  assert.equal(spent.ok, false)

  // The verdict never mutates what it was given.
  const econ = { action: false, interacted: false }
  interactionCost(econ, "x")
  assert.deepEqual(econ, { action: false, interacted: false })
}

// THE WIRE: taken piles are not drawn, junk is dropped, quantity is sane.
{
  const rows = normaliseGroundItems([
    { id: "a", map_id: "m", item_id: "i", name: "Obsidian Shard", quantity: 1, grid_x: 3, grid_y: 7 },
    { id: "b", map_id: "m", item_id: "i", name: "Taken", quantity: 1, grid_x: 1, grid_y: 1, picked_up_at: "2026-09-02T00:00:00Z" },
    { id: "c", map_id: "m", item_id: "i", name: "No square", quantity: 1 },
    { id: "d", map_id: "m", item_id: "i", name: "Zero", quantity: 0, grid_x: "2", grid_y: "2" },
    null,
    { name: "no id" },
  ])
  assert.deepEqual(rows.map((r) => r.id), ["a", "d"])
  assert.equal(rows[1].quantity, 1, "a quantity of zero on the floor is one thing")
  assert.equal(rows[1].grid_x, 2, "numeric strings are squares")
  assert.deepEqual(normaliseGroundItems(null), [])
  assert.deepEqual(normaliseGroundItems("nope"), [])
}

// THE LOG LINE.
assert.equal(describePile("Obsidian Shard", 1), "an Obsidian Shard")
assert.equal(describePile("Dagger", 1), "a Dagger")
assert.equal(describePile("Arrows", 12), "12 Arrows")

console.log("ground-items: ok")
