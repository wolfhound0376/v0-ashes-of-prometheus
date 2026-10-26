// public/js/aop-languages.js is lib/languages.ts bundled for the static pages.
// Rebuild it with `node scripts/build-languages-js.mjs` whenever the lib changes.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("public/js/aop-languages.js", () => {
  it("is up to date with lib/languages.ts", async () => {
    const { buildLanguagesJs } = await import("../scripts/build-languages-js.mjs")
    const fresh = await buildLanguagesJs()
    const committed = readFileSync(join(__dirname, "..", "public", "js", "aop-languages.js"), "utf8")
    expect(committed === fresh, "stale: run node scripts/build-languages-js.mjs").toBe(true)
  }, 20000)
})
