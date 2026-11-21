import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// The sound rules live in public/test-copy-silence.js and only bind a page that loads it. The Pit shipped
// without it (found 2026-11-20), so its music ignored all of them. Every static page that can make a sound
// must load the script, and load it before any other script.
const TAG = '<script src="/test-copy-silence.js"></script>'
const MAKES_SOUND = /new Audio\(|AudioContext|<audio|<video/

function pages(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "vendor" || name === "node_modules") continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) pages(p, out)
    else if (name.endsWith(".html")) out.push(p)
  }
  return out
}

describe("the sound rules", () => {
  const loud = pages("public").filter((p) => MAKES_SOUND.test(readFileSync(p, "utf8")))

  it("finds the pages it is meant to guard", () => {
    expect(loud).toContain(join("public", "pit-arena", "index.html"))
    expect(loud).toContain(join("public", "velkynvelve-walk", "index.html"))
  })

  it.each(loud)("%s loads the silence script before any other script", (p) => {
    const html = readFileSync(p, "utf8")
    const at = html.indexOf(TAG)
    expect(at, "missing " + TAG).toBeGreaterThan(-1)
    expect(html.search(/<script[\s>]/), "another script runs first").toBe(at)
  })

  it("the script carries all three rules", () => {
    const js = readFileSync(join("public", "test-copy-silence.js"), "utf8")
    expect(js).toContain("RULE 1: TEST COPIES ARE SILENT")
    expect(js).toContain("RULE 2: A HIDDEN PAGE IS SILENT")
    expect(js).toContain("RULE 3: A PAGE NOBODY IS USING IS SILENT")
    expect(js).toContain("window.top.document.hasFocus()")
  })
})
