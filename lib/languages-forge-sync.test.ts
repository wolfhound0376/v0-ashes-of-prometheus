// The Forge is a standalone static page (public/forge2014.html) and cannot
// import lib/languages.ts, so it carries its own copy of the language tables.
// This test fails the moment the two disagree.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import vm from "node:vm"
import { describe, expect, it } from "vitest"
import { BACKGROUND_LANGUAGE_CHOICES, CLASS_LANGUAGES, LANGUAGES, SPECIES_LANGUAGES } from "./languages"

const html = readFileSync(join(__dirname, "..", "public", "forge2014.html"), "utf8")
const start = html.indexOf("const LANGS=[")
const end = html.indexOf("function langGrant(c)")
const block = html.slice(start, end)
const ctx: Record<string, unknown> = {}
vm.runInNewContext(
  block.replace(/^const /gm, "var ") + "\nthis.out={LANGS,SPECIES_LANGS,BG_LANG_CHOICES,CLASS_LANGS};",
  ctx,
)
const forge = ctx.out as {
  LANGS: { n: string; t: string }[]
  SPECIES_LANGS: Record<string, { f: string[]; c: number }>
  BG_LANG_CHOICES: Record<string, number>
  CLASS_LANGS: Record<string, string[]>
}

describe("forge2014.html language tables match lib/languages.ts", () => {
  it("found the block", () => expect(start).toBeGreaterThan(0))
  it("same choosable languages and tiers", () => {
    const lib = LANGUAGES.filter((l) => l.tier !== "secret").map((l) => [l.name, l.tier])
    expect(forge.LANGS.map((l) => [l.n, l.t])).toEqual(lib)
  })
  it("same species grants", () => {
    const lib = Object.fromEntries(Object.entries(SPECIES_LANGUAGES).map(([k, v]) => [k, { f: v.fixed, c: v.choices }]))
    expect(forge.SPECIES_LANGS).toEqual(lib)
  })
  it("same background counts and class grants", () => {
    expect(forge.BG_LANG_CHOICES).toEqual(BACKGROUND_LANGUAGE_CHOICES)
    expect(forge.CLASS_LANGS).toEqual(CLASS_LANGUAGES)
  })
  it("every forge species has a language entry", () => {
    const species = [...html.matchAll(/^ "([A-Za-z -]+)":\{source:/gm)].map((m) => m[1])
    expect(species.length).toBeGreaterThan(10)
    for (const s of species) expect(forge.SPECIES_LANGS[s], s).toBeTruthy()
  })
  it("every forge background has a language count", () => {
    const bgBlock = html.slice(html.indexOf("const BACKGROUNDS={"), html.indexOf("/* ---", html.indexOf("const BACKGROUNDS={")))
    const bgs = [...bgBlock.matchAll(/^ "([A-Za-z ]+)":\{ab:/gm)].map((m) => m[1])
    expect(bgs.length).toBeGreaterThan(10)
    for (const b of bgs) expect(forge.BG_LANG_CHOICES[b], b).not.toBeUndefined()
  })
})
