// You cannot hide from something looking straight at you.
// Run: node lib/__tests__/hiding.test.mjs
import assert from "node:assert/strict"

// lib/hiding.ts, as implemented.
const stealthBonus = (h) => h.dexModifier + (h.stealth === "expertise" ? h.proficiencyBonus*2 : h.stealth === "proficient" ? h.proficiencyBonus : 0)
function resolveHide(hider, onlookers, roll) {
  const watchers = onlookers.filter(o => o.seesClearly)
  if (watchers.length) return { kind: "seen", by: watchers.map(o => o.label) }
  const total = roll + stealthBonus(hider)
  if (!onlookers.length) return { kind: "unopposed", roll, total }
  const keenest = onlookers.reduce((a,b) => b.passivePerception > a.passivePerception ? b : a)
  return { kind: "resolved", roll, total, dc: keenest.passivePerception, hidden: total > keenest.passivePerception, keenest: keenest.label }
}
const stealthProficiency = (sheet) => {
  if (!sheet) return "none"
  for (const [k,v] of Object.entries(sheet)) {
    if (k.trim().toLowerCase() !== "stealth") continue
    const val = String(v).trim().toLowerCase()
    return val === "expertise" ? "expertise" : val === "proficient" ? "proficient" : "none"
  }
  return "none"
}

// The live sheets, from Supabase.
const FIFI = { dexModifier: 3, proficiencyBonus: 2, stealth: "expertise" }   // +7
const KENTA = { dexModifier: 0, proficiencyBonus: 2, stealth: "proficient" } // +2
const SAMSON = { dexModifier: 2, proficiencyBonus: 2, stealth: "none" }      // +2
const drow = (seen=false) => ({ id:"d", label:"Drow", passivePerception:12, seesClearly:seen })
const priestess = (seen=false) => ({ id:"p", label:"Priestess of Lolth", passivePerception:16, seesClearly:seen })

let failures = 0
const test = (n,f) => { try { f(); console.log("  PASS ",n) } catch(e) { failures++; console.log("  FAIL ",n); console.log("        "+String(e.message).split("\n")[0]) } }

console.log("\nhiding")

test("a clear view stops the attempt before any dice", () => {
  // THE HALF OF THE RULE MOST OFTEN SKIPPED. Skipping it turns Hide into a
  // free invisibility button in an open room.
  const r = resolveHide(FIFI, [drow(true), priestess(false)], 20)
  assert.equal(r.kind, "seen")
  assert.deepEqual(r.by, ["Drow"])
})

test("the keenest eye sets the bar, not the nearest", () => {
  const r = resolveHide(FIFI, [drow(), priestess()], 10)
  assert.equal(r.dc, 16)              // the priestess, not the drow's 12
  assert.equal(r.keenest, "Priestess of Lolth")
  assert.equal(r.total, 17)           // 10 + 3 + (2 x 2 expertise)
  assert.equal(r.hidden, true)
})

test("expertise doubles proficiency; proficient does not", () => {
  assert.equal(stealthBonus(FIFI), 7)
  assert.equal(stealthBonus(KENTA), 2)
  assert.equal(stealthBonus(SAMSON), 2)
})

test("a tie goes to the observer", () => {
  // 5e contests are won by EXCEEDING. Meeting a passive score is not beating
  // it, and the same direction as every other tie in the file.
  const r = resolveHide(FIFI, [drow()], 5)   // 5 + 7 = 12 vs passive 12
  assert.equal(r.total, 12)
  assert.equal(r.hidden, false)
})

test("nobody to hide from is unopposed, not a win against DC 0", () => {
  const r = resolveHide(FIFI, [], 3)
  assert.equal(r.kind, "unopposed")
})

test("the sheet's inconsistent casing is read either way", () => {
  // Fifi's row says "stealth", Kenta's says "Stealth". Both are production.
  assert.equal(stealthProficiency({ stealth: "expertise" }), "expertise")
  assert.equal(stealthProficiency({ Stealth: "proficient" }), "proficient")
  assert.equal(stealthProficiency({ Athletics: "proficient" }), "none")
  assert.equal(stealthProficiency(null), "none")
})

test("Fifi usually vanishes from a drow; Samson usually does not", () => {
  // Not a rule, a sanity check on the numbers: a rogue with expertise should
  // beat passive 12 on most d20 faces and a cleric in mail should not.
  const fifi = [...Array(20)].filter((_,i) => resolveHide(FIFI,[drow()],i+1).hidden).length
  const sam  = [...Array(20)].filter((_,i) => resolveHide(SAMSON,[drow()],i+1).hidden).length
  assert.ok(fifi >= 15, `Fifi hid on ${fifi}/20`)
  assert.ok(sam <= 10, `Samson hid on ${sam}/20`)
})

function lineIsClear(from, to, walkable) {
  const dx=Math.abs(to.x-from.x), dy=Math.abs(to.y-from.y)
  const sx=from.x<to.x?1:-1, sy=from.y<to.y?1:-1
  let x=from.x,y=from.y,err=dx-dy
  for (let g=0; g<512; g++) {
    if (x===to.x && y===to.y) return true
    const e2=2*err
    if (e2>-dy) { err-=dy; x+=sx }
    if (e2<dx)  { err+=dx; y+=sy }
    if ((x===to.x&&y===to.y)||(x===from.x&&y===from.y)) continue
    if (!walkable.has(`${x},${y}`)) return false
  }
  return false
}
const openRoom = new Set()
for (let x=0;x<10;x++) for (let y=0;y<10;y++) openRoom.add(`${x},${y}`)

console.log("\nline of sight")

test("an open room is always clear", () => {
  assert.equal(lineIsClear({x:0,y:0},{x:9,y:9},openRoom), true)
  assert.equal(lineIsClear({x:0,y:5},{x:9,y:5},openRoom), true)
})

test("a wall between them blocks it", () => {
  const w = new Set(openRoom); w.delete("5,5")
  assert.equal(lineIsClear({x:0,y:5},{x:9,y:5},w), false)
})

test("a wall the line does not cross does not block it", () => {
  const w = new Set(openRoom); w.delete("5,9")
  assert.equal(lineIsClear({x:0,y:5},{x:9,y:5},w), true)
})

test("the creatures themselves are not cover", () => {
  // Both endpoints hold a body. If a token's own square counted as blocking,
  // nobody could ever see anybody.
  const w = new Set(openRoom); w.delete("0,0"); w.delete("4,4")
  assert.equal(lineIsClear({x:0,y:0},{x:4,y:4},w), true)
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
