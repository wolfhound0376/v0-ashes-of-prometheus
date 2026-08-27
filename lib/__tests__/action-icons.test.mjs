// Icon resolution against the party's REAL spell lists, so a gap is a
// reported gap rather than a blank button discovered at the table.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const out = mkdtempSync(join(tmpdir(), "icons-"))
const bundle = join(out, "i.mjs")
execFileSync(process.env.ESBUILD || "esbuild",
  ["lib/action-icons.ts", "--bundle", "--format=esm", "--platform=neutral", "--outfile=" + bundle],
  { stdio: "inherit" })
const { iconFor } = await import(bundle)

// Exactly what the character sheets carry today.
const PARTY = {
  Samson: ["Guidance", "Toll the Dead", "Thaumaturgy", "Sanctuary", "Healing Word", "Guiding Bolt", "Shield of Faith"],
  Kenta: ["Ray of Frost", "Shocking Grasp", "Minor Illusion", "Chill Touch", "Disguise Self", "Fog Cloud"],
  Scott: ["Mage Hand", "Vicious Mockery", "Healing Word", "Faerie Fire", "Sleep", "Dissonant Whispers"],
}

let failures = 0
const test = (n, f) => { try { f(); console.log("  PASS ", n) } catch (e) { failures++; console.log("  FAIL ", n); console.log("        " + String(e.message).split("\n")[0]) } }

console.log("\naction & spell icons")

test("commissioned spell art resolves by name", () => {
  assert.match(iconFor("Eldritch Blast"), /spell-icons\/eldritch-blast\.webp$/)
  assert.match(iconFor("Healing Word"), /spell-icons\/healing-word\.webp$/)
  assert.match(iconFor("Vicious Mockery"), /spell-icons\/vicious-mockery\.webp$/)
})

test("apostrophes and case do not break the lookup", () => {
  assert.match(iconFor("Hunter's Mark"), /hunters-mark\.webp$/)
  assert.match(iconFor("hunters mark"), /hunters-mark\.webp$/)
  assert.match(iconFor("BLESS"), /bless\.webp$/)
})

test("universal actions still resolve to the action art", () => {
  assert.match(iconFor("Attack"), /action-icons\/attack\.webp$/)
  assert.match(iconFor("Dodge"), /action-icons\/dodge\.webp$/)
})

test("a spell with no art returns null rather than a broken image", () => {
  assert.equal(iconFor("Toll the Dead"), null)
  assert.equal(iconFor("Completely Made Up Spell"), null)
})

test("REPORT: which of the party's actual spells still lack art", () => {
  const missing = []
  for (const [who, spells] of Object.entries(PARTY))
    for (const s of spells) if (!iconFor(s)) missing.push(`${who}: ${s}`)
  console.log("        " + (missing.length ? missing.join("\n        ") : "none — full coverage"))
  // Not an assertion. Missing art is a commissioning task, not a bug.
})

console.log(failures ? "\n" + failures + " broken\n" : "\nall icon expectations hold\n")
process.exit(failures ? 1 : 0)
