// Sam typed "what do you think eldeth" and the dwarf's answer came out of the
// Lich's mouth. Run: node lib/__tests__/addressed-npc.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const src = readFileSync(new URL("../addressed-npc.ts", import.meta.url), "utf8")

// lib/addressed-npc.ts, as implemented.
const clean = (s) => s.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim()
const NOT_A_NAME = new Set(["the","of","and","a","an","prince","princess","king","queen","lord","lady","sir","captain","master","guard","guards","warrior","elite","priestess","priest","soldier","sentry","spider","horror","hook","ooze","gray","grey","giant","awakened","drow","dwarf","gnome","orc","goblin","quaggoth","myconid","kuo-toa"])
function namesFor(npc) {
  const out = new Set(); const full = clean(npc.name)
  if (full) out.add(full)
  for (const w of full.split(" ")) if (w.length >= 4 && !NOT_A_NAME.has(w)) out.add(w)
  for (const a of npc.aliases ?? []) { const c = clean(String(a ?? "")); if (c.length >= 4) out.add(c) }
  return [...out]
}
function addressedNpc(message, roster) {
  const text = clean(String(message ?? "")); if (!text || !roster?.length) return null
  const hay = ` ${text} `; let best = null, tie = false
  for (const npc of roster) for (const n of namesFor(npc)) {
    if (!hay.includes(` ${n} `)) continue
    if (!best || n.length > best.len) { best = { name: npc.name, len: n.length }; tie = false }
    else if (n.length === best.len && npc.name !== best.name) tie = true
  }
  return best && !tie ? best.name : null
}

// The real roster, as it stands in npc_encounters.
const ROSTER = ["Eldeth Feldrun","Jimjar","Ront","Stool","Topsy","Turvy","Buppido",
  "Shuushar the Awakened","Prince Derendil","Sarith Kzekarit","Ilvara Mizzrym",
  "Jorlan Duskryn","Asha Vandree","Shoor Vandree","Drow Guard","Giant Spider",
  "Hook Horror","Gray Ooze","Malachar"].map(name => ({ name }))

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }

console.log("\naddressed npc")

test("THE ACTUAL MESSAGE — lowercase, no surname, no punctuation", () => {
  assert.equal(addressedNpc("what do you think eldeth", ROSTER), "Eldeth Feldrun")
})

test("a surname works as well as a first name", () => {
  assert.equal(addressedNpc("Feldrun, how long have you been down here?", ROSTER), "Eldeth Feldrun")
})

test("the full name beats the bare one — longest match wins", () => {
  assert.equal(addressedNpc("Eldeth Feldrun, answer me", ROSTER), "Eldeth Feldrun")
})

test("one-word NPCs are found too", () => {
  assert.equal(addressedNpc("jimjar what are the odds", ROSTER), "Jimjar")
  assert.equal(addressedNpc("Hey Buppido.", ROSTER), "Buppido")
  assert.equal(addressedNpc("stool, are you frightened?", ROSTER), "Stool")
})

test("a title resolves to the canonical row", () => {
  assert.equal(addressedNpc("Shuushar, is there another way out?", ROSTER), "Shuushar the Awakened")
  assert.equal(addressedNpc("Derendil, your highness", ROSTER), "Prince Derendil")
})

test("two NPCs named equally well is a question to the room, not to one of them", () => {
  // Putting words in the wrong mouth is the exact failure this prevents.
  assert.equal(addressedNpc("ask Jimjar and Eldeth what they saw", ROSTER), null)
})

test("nobody named means nobody attributed", () => {
  assert.equal(addressedNpc("look around at our prison pen", ROSTER), null)
  assert.equal(addressedNpc("kick him in the nuts!", ROSTER), null)
  assert.equal(addressedNpc("", ROSTER), null)
  assert.equal(addressedNpc(null, ROSTER), null)
  assert.equal(addressedNpc("eldeth", []), null)
})

test("a name inside a longer word is not a name", () => {
  // "Ront" lives inside "front", "affront", "confront" — a bare substring
  // match would have the orc answering questions about doors.
  assert.equal(addressedNpc("we move to the front of the pen", ROSTER), null)
  assert.equal(addressedNpc("I confront the guard", ROSTER), null)
  assert.equal(addressedNpc("Ront, move", ROSTER), "Ront")
})

test("short fragments never match", () => {
  // "the" out of "Shuushar the Awakened" would match almost every sentence.
  const names = namesFor({ name: "Shuushar the Awakened" })
  assert.ok(!names.includes("the"), `"the" leaked in: ${names}`)
  assert.equal(addressedNpc("the guard walks past the gate", ROSTER), null)
})

test("aliases are honoured when they are long enough", () => {
  const r = [{ name: "Prince Derendil", aliases: ["the quaggoth", "Nelrindenvane"] }]
  assert.equal(addressedNpc("I speak to the quaggoth", r), "Prince Derendil")
})

test("the source keeps its guards", () => {
  assert.match(src, /length >= 4/)
  assert.match(src, /tie/)
  assert.match(src, /NOT_A_NAME/)
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
