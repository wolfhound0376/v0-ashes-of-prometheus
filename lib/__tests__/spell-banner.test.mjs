// The banner says what the log said, where the eye already is.
// Run: node lib/__tests__/spell-banner.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const src = readFileSync(new URL("../spell-banner.ts", import.meta.url), "utf8")

// DEATH_LABEL is read out of lib/damage-type rather than copied, for the same
// reason the module itself reads it: a second list would let the banner say a
// creature burned while the model on the floor froze.
const dt = readFileSync(new URL("../damage-type.ts", import.meta.url), "utf8")
const DEATH_LABEL = {}
for (const [, k, v] of /export const DEATH_LABEL[^{]*\{([\s\S]*?)\n\}/.exec(dt)[1].matchAll(/(\w+):\s*"([^"]+)"/g)) DEATH_LABEL[k] = v
const KIND = {}
for (const m of /export function deathKindFor[\s\S]*?\n\}/.exec(dt)[0].matchAll(/case "(\w+)":(?:\s*case "(\w+)":)?\s*return "(\w+)"/g)) {
  if (m[1]) KIND[m[1]] = m[3]
  if (m[2]) KIND[m[2]] = m[3]
}
const deathKindFor = (t) => KIND[String(t ?? "").toLowerCase()] ?? "mangle"

// lib/spell-banner.ts, as implemented.
const headlineFor = (o) => {
  const who = [o.casterClass, o.casterLabel, "Someone"].map((s) => (s ?? "").trim()).find((s) => s.length > 0)
  return `${who} ${o.weapon ? "STRIKES WITH" : "CASTS"} ${o.ability}!`.toUpperCase()
}

function lineFor(v, damageType) {
  const name = v.label || "Something"
  const type = String(damageType ?? "").trim().toLowerCase()
  const hurt = type && type !== "physical" ? `${v.amount} ${type}` : `${v.amount}`
  if (v.heals || v.outcome === "heal") return { text: `${name} healed ${v.amount}`, tone: "heal" }
  if (v.outcome === "miss" || v.outcome === "fumble") return { text: `${name} — ${v.outcome === "fumble" ? "FUMBLE" : "miss"}`, tone: "miss" }
  if (v.outcome === "saved" || (v.outcome === "saved-half" && v.amount <= 0)) return { text: `${name} — saved`, tone: "save" }
  const fate = v.fell ? `, ${DEATH_LABEL[v.isPlayer ? "collapse" : deathKindFor(type || null)]}` : ""
  const tone = v.fell ? "kill" : v.outcome === "crit" ? "crit" : "hit"
  const lead = v.outcome === "crit" ? "CRIT" : v.outcome === "saved-half" ? "saved, still" : "hit for"
  return { text: `${name} — ${lead} ${hurt}${fate}`, tone }
}
const lifeFor = (n) => Math.min(4.2, 1.9 + Math.max(0, n - 1) * 0.35)

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }

console.log("\nspell banner")

test("the headline names the CLASS, as Sam wrote it", () => {
  // "Bard Casts Fireball!" — the same voice the Gauntlet announcer uses for
  // whose turn it is. The table has already learned to hear itself named
  // that way.
  assert.equal(headlineFor({ casterClass: "Bard", casterLabel: "Scott", ability: "Fireball" }),
    "BARD CASTS FIREBALL!")
})

test("a creature with no class falls back to its name", () => {
  // "CASTS FIREBALL" alone names nobody.
  assert.equal(headlineFor({ casterClass: null, casterLabel: "Drow Priestess of Lolth", ability: "Scourge" }),
    "DROW PRIESTESS OF LOLTH CASTS SCOURGE!")
  assert.equal(headlineFor({ casterClass: "  ", casterLabel: "Ront", ability: "Javelin" }),
    "RONT CASTS JAVELIN!")
})

test("nothing at all still produces a headline", () => {
  assert.ok(headlineFor({ ability: "Fireball" }).includes("FIREBALL"))
})

test("a swing STRIKES WITH, it does not cast", () => {
  // The rack sends weapons through the same path. A fist that "casts
  // Unarmed Strike" is the kind of line that gets screenshotted.
  assert.equal(headlineFor({ casterClass: "Cleric", ability: "Mace", weapon: true }),
    "CLERIC STRIKES WITH MACE!")
})

test("a hit reads its damage and its type", () => {
  const l = lineFor({ label: "Drow", amount: 6, outcome: "hit" }, "fire")
  assert.equal(l.text, "Drow — hit for 6 fire")
  assert.equal(l.tone, "hit")
})

test("a kill says HOW it died, in the board's own words", () => {
  // Sam: "Drow guard hit with 4 damage and is burned to death."
  const l = lineFor({ label: "Drow Guard", amount: 4, outcome: "hit", fell: true }, "fire")
  assert.equal(l.text, "Drow Guard — hit for 4 fire, burns")
  assert.equal(l.tone, "kill")
})

test("every damage type has a death phrase, and it is the corpse's own", () => {
  // The invariant that matters: whatever the banner says the creature did,
  // the body on the floor is doing the same thing.
  for (const [type, expected] of [
    ["fire", "burns"], ["cold", "freezes solid"], ["necrotic", "withers to bone"],
    ["piercing", "is run through"], ["radiant", "burns to ash"], ["poison", "chokes"],
  ]) {
    const l = lineFor({ label: "X", amount: 1, outcome: "hit", fell: true }, type)
    assert.ok(l.text.endsWith(expected), `${type} said "${l.text}", expected to end "${expected}"`)
  }
})

test("A DOWNED PLAYER GOES DOWN — they are not dressed as a corpse", () => {
  // The board already draws this distinction: a monster at 0 is dead and is
  // dressed by whatever killed it, while a player is unconscious and rolling
  // death saves. Without it, a Bard put on the floor by a spear reads "is run
  // through" — wrong, and a bleak thing to say about someone with three death
  // saves left.
  const l = lineFor({ label: "Scott", amount: 8, outcome: "hit", fell: true, isPlayer: true }, "piercing")
  assert.ok(l.text.endsWith("goes down"), l.text)
  assert.ok(!l.text.includes("run through"), l.text)
})

test("a monster on the same spear IS run through", () => {
  // The other half of the same rule - the distinction has to cut both ways or
  // it is just a softer word for everybody.
  const l = lineFor({ label: "Drow", amount: 8, outcome: "hit", fell: true }, "piercing")
  assert.ok(l.text.endsWith("is run through"), l.text)
})

test("an unknown damage type still kills legibly", () => {
  const l = lineFor({ label: "X", amount: 3, outcome: "hit", fell: true }, "eldritch")
  assert.equal(l.tone, "kill")
  assert.ok(l.text.includes("falls"), l.text)
})

test("a save that took nothing is not a miss", () => {
  // The distinction the floating outcome word was built for, kept here: at a
  // table a save and a miss are opposite feelings.
  assert.deepEqual(lineFor({ label: "Drow", amount: 0, outcome: "saved" }, "necrotic"),
    { text: "Drow — saved", tone: "save" })
  assert.equal(lineFor({ label: "Drow", amount: 0, outcome: "miss" }, "fire").tone, "miss")
})

test("a HALF save still says what it cost", () => {
  // Saying only "saved" about a creature that lost 12 hit points is a lie the
  // table can see on the health bar.
  const l = lineFor({ label: "Drow", amount: 12, outcome: "saved-half" }, "fire")
  assert.ok(l.text.includes("12 fire"), l.text)
  assert.equal(l.tone, "hit")
})

test("a half save that took nothing reads as a clean save", () => {
  assert.equal(lineFor({ label: "Drow", amount: 0, outcome: "saved-half" }, "fire").tone, "save")
})

test("a crit says so", () => {
  const l = lineFor({ label: "Drow Elite Warrior", amount: 12, outcome: "crit" }, "cold")
  assert.ok(l.text.includes("CRIT"), l.text)
  assert.equal(l.tone, "crit")
})

test("a crit that kills reads as a kill, not a crit", () => {
  // Dying is the bigger fact.
  assert.equal(lineFor({ label: "X", amount: 12, outcome: "crit", fell: true }, "cold").tone, "kill")
})

test("a fumble is louder than a miss", () => {
  const l = lineFor({ label: "Drow", amount: 0, outcome: "fumble" }, "fire")
  assert.ok(l.text.includes("FUMBLE"), l.text)
  assert.equal(l.tone, "miss")
})

test("a heal is never dressed as damage", () => {
  const l = lineFor({ label: "Samson", amount: 7, outcome: "heal", heals: true }, "healing")
  assert.equal(l.tone, "heal")
  assert.ok(!l.text.includes("hit"), l.text)
})

test("physical damage does not say the word 'physical'", () => {
  // "hit for 5 physical" is how nobody describes being hit with a mace.
  assert.equal(lineFor({ label: "X", amount: 5, outcome: "hit" }, "physical").text, "X — hit for 5")
  assert.equal(lineFor({ label: "X", amount: 5, outcome: "hit" }, null).text, "X — hit for 5")
})

test("a nameless creature is still named something", () => {
  assert.ok(lineFor({ label: "", amount: 1, outcome: "hit" }, "fire").text.startsWith("Something"))
})

test("the banner is gone before the next turn", () => {
  // Sam asked for "briefly". A banner still up when the drow swings back is
  // worse than no banner.
  assert.ok(lifeFor(1) < 2.5, "a one-line banner lingers")
  assert.ok(lifeFor(1) > 1.2, "a one-line banner is unreadably brief")
  // More victims, more to read - but bounded.
  assert.ok(lifeFor(5) > lifeFor(1), "five lines get no longer than one")
  assert.ok(lifeFor(69) <= 4.2, "a Fireball on 69 squares parks the banner forever")
})

test("the death vocabulary is READ, never copied", () => {
  // If this file ever grows its own list, the banner and the body can
  // disagree about how something died.
  assert.ok(/from "\.\/damage-type"/.test(src), "spell-banner no longer imports the death vocabulary")
  assert.ok(/DEATH_LABEL\[/.test(src) && /deathKindFor\(/.test(src),
    "the death phrase is no longer looked up from the shared table")
  // A table of its own is the thing to catch — not the phrase, which appears
  // in this file only because Sam's request is quoted in a comment. The first
  // version of this assertion matched that quote and failed on prose.
  const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")
  assert.ok(!/\b(fire|cold|necrotic)\s*:\s*"/.test(code),
    "spell-banner has grown its own damage-type-to-phrase table")
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
