// public/js/aop-one-world.js is lib/walk-world.ts bundled for the painted map.
// Rebuild it with `node scripts/build-one-world-js.mjs` whenever the lib changes — if the two ever disagree,
// the browser and the server would fingerprint the same world differently and the failsafe would fire for nothing.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("public/js/aop-one-world.js", () => {
  it("is up to date with lib/walk-world.ts", async () => {
    const { buildOneWorldJs } = await import("../scripts/build-one-world-js.mjs")
    const fresh = await buildOneWorldJs()
    const committed = readFileSync(join(__dirname, "..", "public", "js", "aop-one-world.js"), "utf8")
    expect(committed === fresh, "stale: run node scripts/build-one-world-js.mjs").toBe(true)
  }, 20000)
})
