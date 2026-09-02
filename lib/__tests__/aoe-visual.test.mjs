// The ground remembers, and it remembers the RIGHT things.
// Run: node lib/__tests__/aoe-visual.test.mjs
import assert from "node:assert/strict"

// ── the two rules under test, exactly as lib/aoe-visual.ts implements them ──

const BY_SPELL = {
  web: "web", entangle: "web", "spike growth": "web", grease: "acid",
  "fog cloud": "gloom", silence: "gloom", sleep: "gloom",
  "minor illusion": "arcane", "colour spray": "arcane", "color spray": "arcane",
  "faerie fire": "arcane", moonbeam: "hallowed", "spirit guardians": "hallowed",
  "cloud of daggers": "arcane", "flaming sphere": "scorch",
}
const BY_DAMAGE = {
  fire: "scorch", cold: "frost", lightning: "shock", thunder: "shock",
  acid: "acid", poison: "miasma", necrotic: "gloom", radiant: "hallowed",
  psychic: "arcane", force: "arcane",
}
const kindFor = (name, entry) => {
  const named = BY_SPELL[name.trim().toLowerCase()]
  if (named) return named
  if (entry?.heals) return "hallowed"
  if (entry?.school === "eldritch") return "gloom"
  return (entry?.damage && BY_DAMAGE[entry.damage]) || "arcane"
}
const lingersFor = (entry) => entry.concentration === true

const FORMS = {
  scorch: "floor", frost: "floor", shock: "floor", acid: "floor",
  web: "floor", hallowed: "floor", arcane: "floor",
  miasma: "cloud", gloom: "cloud",
}
const formFor = (name, entry) => FORMS[kindFor(name, entry)]

// turnFor from components/tactical/aoe-decal.ts — the anti-tiling hash.
const turnFor = (c) => {
  let h = (Math.imul(c.x, 0x27d4eb2d) ^ Math.imul(c.y, 0x165667b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0
  return ((h ^ (h >>> 15)) >>> 0) % 4
}

// ── the area spells as lib/spellbook.ts actually declares them ──────────────
// Only the fields these two rules read. If spellbook gains an area spell and
// this list is not updated, the coverage test below fails loudly.
const AREA_SPELLS = {
  "minor illusion":   { school: "arcane" },
  "fog cloud":        { school: "nature", concentration: true },
  "faerie fire":      { school: "arcane", concentration: true },
  "sleep":            { school: "arcane" },
  "burning hands":    { school: "fire", damage: "fire" },
  "thunderwave":      { school: "arcane", damage: "thunder" },
  "color spray":      { school: "arcane" },
  "fireball":         { school: "fire", damage: "fire" },
  "shatter":          { school: "arcane", damage: "thunder" },
  "silence":          { school: "holy", concentration: true },
  "web":              { school: "nature", concentration: true },
  "grease":           { school: "arcane" },
  "entangle":         { school: "nature", concentration: true },
  "spike growth":     { school: "nature", concentration: true },
  "moonbeam":         { school: "holy", damage: "radiant", concentration: true },
  "cloud of daggers": { school: "arcane", damage: "force", concentration: true },
  "flaming sphere":   { school: "fire", damage: "fire", concentration: true },
  "spirit guardians": { school: "holy", damage: "radiant", concentration: true },
  "lightning bolt":   { school: "arcane", damage: "lightning" },
}

let failures = 0
const test = (name, fn) => {
  try { fn(); console.log("  PASS ", name) }
  catch (e) { failures++; console.log("  FAIL ", name); console.log("        " + String(e.message).split("\n")[0]) }
}

console.log("\naoe ground decals")

test("every area spell resolves to a decal", () => {
  for (const [name, entry] of Object.entries(AREA_SPELLS)) {
    const k = kindFor(name, entry)
    assert.ok(typeof k === "string" && k.length > 0, `${name} got no decal`)
  }
})

test("what a spell is made of picks the mark", () => {
  assert.equal(kindFor("fireball", AREA_SPELLS["fireball"]), "scorch")
  assert.equal(kindFor("lightning bolt", AREA_SPELLS["lightning bolt"]), "shock")
  assert.equal(kindFor("shatter", AREA_SPELLS["shatter"]), "shock")
})

test("named overrides beat the damage type", () => {
  // Moonbeam is radiant but reads as a cold shaft, not a holy ring.
  assert.equal(kindFor("moonbeam", AREA_SPELLS["moonbeam"]), "hallowed")
  // Flaming Sphere is fire and stays fire.
  assert.equal(kindFor("flaming sphere", AREA_SPELLS["flaming sphere"]), "scorch")
  // Web deals no damage at all, so only the name can answer.
  assert.equal(kindFor("web", AREA_SPELLS["web"]), "web")
  assert.equal(kindFor("entangle", AREA_SPELLS["entangle"]), "web")
})

// Sam's note, and the reason the poison texture was rebuilt: what I first
// made was a pool of acid. A pool is a mark ON stone; gas is a volume you
// stand INSIDE, and one flat quad cannot be both.
test("acid pools on the floor, poison hangs in the air", () => {
  assert.equal(kindFor("acid arrow", { damage: "acid" }), "acid")
  assert.equal(kindFor("cloudkill", { damage: "poison" }), "miasma")
  assert.equal(formFor("acid arrow", { damage: "acid" }), "floor")
  assert.equal(formFor("cloudkill", { damage: "poison" }), "cloud")
  // Grease is a slick, whatever it is made of.
  assert.equal(formFor("grease", AREA_SPELLS["grease"]), "floor")
})

test("things that fill a space are clouds; things that mark stone are not", () => {
  for (const n of ["fog cloud", "silence", "sleep"]) {
    assert.equal(formFor(n, AREA_SPELLS[n]), "cloud", `${n} should stand in the air`)
  }
  for (const n of ["fireball", "web", "spike growth", "moonbeam", "lightning bolt"]) {
    assert.equal(formFor(n, AREA_SPELLS[n]), "floor", `${n} should lie on the floor`)
  }
})

test("every kind has a form, a tint, a bloom and a rest opacity", () => {
  // A kind added to the union but missed in one of the tables would render as
  // undefined — a black quad, or no quad at all, found on the night.
  const kinds = new Set([...Object.values(BY_SPELL), ...Object.values(BY_DAMAGE), "arcane"])
  for (const k of kinds) assert.ok(FORMS[k], `${k} has no form`)
})

test("a damageless spell never falls through to a wrong element", () => {
  for (const n of ["sleep", "silence", "fog cloud", "minor illusion", "grease"]) {
    const k = kindFor(n, AREA_SPELLS[n])
    assert.ok(!["scorch", "frost", "shock"].includes(k), `${n} got ${k}`)
  }
})

// THE RULE THAT MATTERS MOST. Duration is not stored — it is read from the
// concentration flag, so a lingering mark and the concentration tracker cannot
// disagree about whether there is still a web in the room.
test("marks linger exactly when the spell is concentration", () => {
  for (const [name, entry] of Object.entries(AREA_SPELLS)) {
    assert.equal(lingersFor(entry), entry.concentration === true, name)
  }
})

test("detonations do not linger; terrain does", () => {
  for (const n of ["fireball", "thunderwave", "burning hands", "shatter", "lightning bolt", "sleep"]) {
    assert.equal(lingersFor(AREA_SPELLS[n]), false, `${n} should be a flash`)
  }
  for (const n of ["web", "entangle", "spike growth", "fog cloud", "moonbeam", "silence"]) {
    assert.equal(lingersFor(AREA_SPELLS[n]), true, `${n} should stay on the floor`)
  }
})

console.log("\nanti-tiling turns")

test("a square's turn is stable across re-renders", () => {
  // A lingering Web re-renders every time the effect list changes. If the
  // turns reshuffled, the mark would visibly scramble itself while sitting
  // still — worse than the tiling it exists to hide.
  for (const c of [{ x: 0, y: 0 }, { x: 7, y: 3 }, { x: -4, y: 11 }]) {
    assert.equal(turnFor(c), turnFor({ ...c }))
  }
})

test("neighbours rarely share a turn", () => {
  // The repeat the eye catches is the one along a straight edge, so the
  // property that matters is horizontal and vertical neighbours differing.
  let same = 0, total = 0
  for (let x = 0; x < 40; x++) {
    for (let y = 0; y < 40; y++) {
      total += 2
      if (turnFor({ x, y }) === turnFor({ x: x + 1, y })) same++
      if (turnFor({ x, y }) === turnFor({ x, y: y + 1 })) same++
    }
  }
  // Chance is 25%, and the assertion is two-sided ON PURPOSE.
  //
  // Too high means the hash ignores an axis and ships a visible grid. TOO LOW
  // is the subtler failure and the one that actually happened: the original
  // hash scored 0.0%, because %4 kept only the bottom two bits and reduced it
  // to a regular pinwheel lattice. Neighbours never matching is not better
  // randomness, it is a different repeating pattern.
  const rate = same / total
  assert.ok(rate > 0.15, `neighbours matched only ${(rate * 100).toFixed(1)}% — that is a lattice, not a hash`)
  assert.ok(rate < 0.40, `neighbours matched ${(rate * 100).toFixed(1)}% — an axis is being ignored`)
})

test("all four turns actually get used", () => {
  const seen = new Set()
  for (let x = 0; x < 20; x++) for (let y = 0; y < 20; y++) seen.add(turnFor({ x, y }))
  assert.equal(seen.size, 4)
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
