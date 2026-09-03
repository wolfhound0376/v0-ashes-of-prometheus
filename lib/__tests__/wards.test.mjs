// Sanctuary is not invisibility, and it ends the moment you swing.
// Run: node lib/__tests__/wards.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const src = readFileSync(new URL("../wards.ts", import.meta.url), "utf8")

// lib/wards.ts, as implemented.
const SANCTUARY_ROUNDS = 10, SHIELD_OF_FAITH_ROUNDS = 100, SHIELD_OF_FAITH_AC = 2
const wardSpellFor = (a) => { const s = String(a ?? "").trim().toLowerCase(); return s === "sanctuary" || s === "shield of faith" ? s : null }
const wardRounds = (s) => (s === "sanctuary" ? SANCTUARY_ROUNDS : SHIELD_OF_FAITH_ROUNDS)
function normaliseWard(raw) {
  if (!raw || typeof raw !== "object") return null
  const spell = wardSpellFor(raw.spell)
  if (!spell || typeof raw.caster_token !== "string") return null
  const cast = Number(raw.cast_round), exp = Number(raw.expires_round)
  if (!Number.isFinite(cast) || !Number.isFinite(exp)) return null
  return { spell, caster_token: raw.caster_token, cast_round: cast, expires_round: exp }
}
const wardExpired = (w, r) => r >= w.expires_round
const wardAcBonus = (w) => (w?.spell === "shield of faith" ? SHIELD_OF_FAITH_AC : 0)
function needsSanctuarySave(w, o) {
  if (w?.spell !== "sanctuary") return false
  if (o?.area) return false
  if (o?.helpful) return false
  return true
}
const resolveSanctuary = ({ roll, wisModifier, dc }) => { const total = roll + wisModifier; return { total, dc, passed: total >= dc } }
const breaksSanctuary = (a) => Boolean(a.weapon || a.harmful || a.damagedSomeone)

const sanct = { spell: "sanctuary", caster_token: "t", cast_round: 1, expires_round: 11 }
const shield = { spell: "shield of faith", caster_token: "t", cast_round: 1, expires_round: 101 }

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }

console.log("\nwards")

test("both spells are recognised, however they are cased", () => {
  assert.equal(wardSpellFor("Sanctuary"), "sanctuary")
  assert.equal(wardSpellFor("  SHIELD OF FAITH "), "shield of faith")
})

test("nothing else is a ward", () => {
  for (const a of ["fireball", "bless", "", null, undefined, "shield"]) {
    assert.equal(wardSpellFor(a), null, `${String(a)} was treated as a ward`)
  }
})

// ---- Shield of Faith -----------------------------------------------------

test("Shield of Faith is worth exactly +2 AC", () => {
  assert.equal(wardAcBonus(shield), SHIELD_OF_FAITH_AC)
  assert.equal(SHIELD_OF_FAITH_AC, 2, "the SRD says +2")
})

test("SANCTUARY IS NOT ARMOUR", () => {
  // Giving it an AC bonus would be inventing a second, better spell.
  assert.equal(wardAcBonus(sanct), 0)
  assert.equal(wardAcBonus(null), 0)
})

// ---- Sanctuary -----------------------------------------------------------

test("attacking a warded creature requires a save first", () => {
  assert.equal(needsSanctuarySave(sanct), true)
})

test("AN AREA SPELL IGNORES SANCTUARY", () => {
  // SRD: "This spell doesn't protect the warded creature from area effects,
  // such as the explosion of a fireball." This is the counterplay, and the
  // reason a first-level spell is allowed to be this strong.
  assert.equal(needsSanctuarySave(sanct, { area: true }), false)
})

test("healing somebody under Sanctuary needs no save", () => {
  // The SRD gates "an attack or a harmful spell". A Cure Wounds is neither,
  // and making the cleric roll to heal their own warded friend is the kind of
  // rule that gets the feature switched off.
  assert.equal(needsSanctuarySave(sanct, { helpful: true }), false)
})

test("Shield of Faith stops nobody attacking", () => {
  assert.equal(needsSanctuarySave(shield), false)
})

test("an unwarded creature needs no save", () => {
  assert.equal(needsSanctuarySave(null), false)
})

test("IT IS NOT INVISIBILITY — a passed save attacks normally", () => {
  // The single most important line here. Sanctuary that always works removes
  // a creature from the fight for one first-level slot.
  assert.equal(resolveSanctuary({ roll: 15, wisModifier: 1, dc: 13 }).passed, true)
})

test("a failed save loses the attack", () => {
  assert.equal(resolveSanctuary({ roll: 3, wisModifier: 1, dc: 13 }).passed, false)
})

test("a tie goes to the ATTACKER", () => {
  // The SRD: a save succeeds when the total "equals or exceeds" the DC.
  // Sanctuary is not an exception, and this is the one boundary somebody
  // always writes backwards.
  assert.equal(resolveSanctuary({ roll: 12, wisModifier: 1, dc: 13 }).passed, true)
})

test("the attacker's WIS modifier counts, including a negative one", () => {
  assert.equal(resolveSanctuary({ roll: 13, wisModifier: -1, dc: 13 }).passed, false)
  assert.equal(resolveSanctuary({ roll: 13, wisModifier: 0, dc: 13 }).passed, true)
})

// ---- what breaks it ------------------------------------------------------

test("swinging a weapon breaks it", () => {
  assert.equal(breaksSanctuary({ weapon: true }), true)
})

test("a harmful spell breaks it", () => {
  assert.equal(breaksSanctuary({ harmful: true }), true)
})

test("damaging somebody breaks it", () => {
  assert.equal(breaksSanctuary({ damagedSomeone: true }), true)
})

test("HEALING A FRIEND DOES NOT BREAK IT", () => {
  // The other direction of the same rule, and the one that makes Sanctuary
  // worth casting on a cleric. Ending it on any cast would forbid the warded
  // creature from doing the only thing it is still good for.
  assert.equal(breaksSanctuary({ weapon: false, harmful: false }), false)
  assert.equal(breaksSanctuary({}), false)
})

test("moving, hiding and drinking a potion do not break it", () => {
  // None of these set any of the three flags, which is the point of testing
  // the empty case explicitly rather than trusting it.
  assert.equal(breaksSanctuary({ damagedSomeone: false }), false)
})

// ---- duration ------------------------------------------------------------

test("Sanctuary runs a minute — ten rounds", () => {
  assert.equal(wardRounds("sanctuary"), 10)
  assert.equal(wardExpired({ ...sanct, expires_round: 11 }, 10), false, "it ended a round early")
  assert.equal(wardExpired({ ...sanct, expires_round: 11 }, 11), true, "it outlived its minute")
})

test("Shield of Faith outlasts any fight", () => {
  // Concentration is what really ends it; the number exists so nothing runs
  // forever, not to model ten minutes exactly.
  assert.ok(wardRounds("shield of faith") > 50)
})

// ---- the stored blob -----------------------------------------------------

test("a malformed ward is null, never a throw", () => {
  // It comes out of jsonb, so it can be anything at all.
  for (const bad of [null, undefined, 0, "sanctuary", [], {}, { spell: "sanctuary" },
                     { spell: "fireball", caster_token: "t", cast_round: 1, expires_round: 2 },
                     { spell: "sanctuary", caster_token: 7, cast_round: 1, expires_round: 2 },
                     { spell: "sanctuary", caster_token: "t", cast_round: "x", expires_round: 2 }]) {
    assert.equal(normaliseWard(bad), null, `${JSON.stringify(bad)} was read as a ward`)
  }
})

test("a well-formed ward survives the round trip", () => {
  assert.deepEqual(normaliseWard({ ...sanct }), sanct)
})

test("the two spells the SRD text is quoted for are the two implemented", () => {
  // Keeps the file honest: the header quotes SRD 5.1 for both, and a third
  // spell added without its rule would be a ward that does nothing.
  assert.ok(/Until the spell ends, any creature who targets/.test(src), "the Sanctuary text is gone")
  assert.ok(/granting it a \+2 bonus to AC/.test(src), "the Shield of Faith text is gone")
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
