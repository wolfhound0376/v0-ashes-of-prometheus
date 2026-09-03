// payFor must never be called before the variables it closes over exist.
// Run: node lib/__tests__/combat-payfor-order.test.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// THE BUG THIS EXISTS FOR.
//
// payFor is a closure declared near the top of the cast handler and called
// from four places. It referenced `sneak`, a `let` declared 300 lines further
// down beside the attack roll that assigns it. Three of the four call sites
// sit above that line, so calling payFor from them read `sneak` inside its
// temporal dead zone:
//
//   ReferenceError: Cannot access 'eu' before initialization
//
// Every no-dice spell (Sanctuary, Shield of Faith), every Mage Hand and every
// no-dice area spell crashed on payment. Attack spells worked, because the
// attack path calls payFor after the declaration — which is why it shipped:
// the one path anybody tested was the one path that could not fail.
//
// tsc cannot catch this. A closure over a later `let` is legal TypeScript,
// and the error only exists at runtime on the branch that runs first. So this
// reads the route and checks the ORDER.
const src = readFileSync(new URL("../../app/api/combat/route.ts", import.meta.url), "utf8")
const lines = src.split("\n")
const lineOf = (re) => { const i = lines.findIndex((l) => re.test(l)); return i < 0 ? null : i + 1 }
const linesOf = (re) => lines.map((l, i) => (re.test(l) ? i + 1 : null)).filter((n) => n !== null)

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }

console.log("\ncombat payFor order")

const payForDecl = lineOf(/^\s*const payFor = async \(\) =>/)
const payForCalls = linesOf(/^\s*await payFor\(\)/)

test("payFor is still where this test expects", () => {
  assert.ok(payForDecl, "const payFor = async () => ... is no longer findable")
  assert.ok(payForCalls.length >= 3, `expected several payFor() calls, found ${payForCalls.length}`)
})

test("EVERY let/const payFor CLOSES OVER IS DECLARED ABOVE IT", () => {
  // Read the body of payFor, find every identifier it uses that is declared
  // with let/const anywhere in the file, and insist each declaration comes
  // first. This is the general form of the sneak bug: it fails on `sneak`
  // today and on whatever somebody adds to payFor next year.
  const start = payForDecl - 1
  let depth = 0, end = start
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) { if (ch === "{") depth++; if (ch === "}") depth-- }
    if (depth === 0 && i > start) { end = i; break }
  }
  const body = lines.slice(start, end + 1).join("\n")
  const idents = new Set([...body.matchAll(/\b([a-zA-Z_$][\w$]*)\b/g)].map((m) => m[1]))

  // Only SIBLINGS count — declarations at payFor's own indentation, outside
  // its body. Two kinds of match are not the bug and must not be reported:
  // variables declared INSIDE payFor (slots, lvl, cur), and variables in
  // some other nested scope further down the file (max, to) which payFor
  // never actually reaches. Matching those turns a real signal into noise
  // nobody reads, which is how a failing test gets deleted.
  const indent = (lines[payForDecl - 1].match(/^\s*/) ?? [""])[0]
  const late = []
  for (const id of idents) {
    const decl = lineOf(new RegExp(`^${indent}(let|const)\\s+${id}\\b`))
    if (decl === null) continue
    const insidePayFor = decl > payForDecl && decl <= end + 1
    if (decl > payForDecl && !insidePayFor) late.push(`${id} (declared at line ${decl}, payFor at ${payForDecl})`)
  }
  assert.deepEqual(late, [], `payFor reads these before they exist: ${late.join("; ")}`)
})

test("sneak specifically is declared before payFor", () => {
  // The exact instance, named, so the failure message says what it was.
  const sneakDecl = lineOf(/^\s*let sneak: SneakAttackVerdict/)
  assert.ok(sneakDecl, "let sneak is no longer findable")
  assert.ok(sneakDecl < payForDecl, `let sneak (line ${sneakDecl}) is below payFor (line ${payForDecl}) again`)
})

test("the no-dice utility path still pays, and still calls payFor before returning", () => {
  // The path that crashed. It must keep paying - Sanctuary was free for
  // months once already - and the call it makes must be to the same payFor.
  const utility = lineOf(/note: "no dice to roll for this ability" \}\)$/)
  assert.ok(utility, "the utility early-return is no longer findable")
  const paidJustAbove = payForCalls.some((n) => n < utility && n > utility - 6)
  assert.ok(paidJustAbove, "the utility path no longer pays before returning")
})

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n")
process.exit(failures ? 1 : 0)
