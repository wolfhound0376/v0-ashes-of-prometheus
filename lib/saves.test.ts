import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  CHARACTER_STATE_COLUMNS, LIBRARY_TABLES, MIXED_TABLES, WHOLE_TABLES,
  cannotLoad, cleanSaveName, isSavesMissing, newSaveName, saveActionAllowed,
} from "./saves"
import { BASELINE_COLUMNS } from "./hero-baseline"

const ROOT = join(__dirname, "..")
const MIGRATION = readFileSync(join(ROOT, "migrations/20261110230000_campaign_saves.sql"), "utf8")

/** The text[] a migration function returns, by function name. */
function sqlArray(fn: string): string[] {
  const body = MIGRATION.slice(MIGRATION.indexOf(`function public.${fn}(`))
  const arr = body.slice(body.indexOf("array["), body.indexOf("]::text[]"))
  return [...arr.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
}

describe("the table lists match the migration", () => {
  it("whole tables, in the same order", () => { expect(sqlArray("campaign_save_whole_tables")).toEqual([...WHOLE_TABLES]) })
  it("hero state columns", () => { expect(sqlArray("campaign_save_character_columns")).toEqual([...CHARACTER_STATE_COLUMNS]) })
  it("a hero's save covers everything a New Game resets (lib/hero-baseline.ts)", () => {
    for (const c of BASELINE_COLUMNS) expect(CHARACTER_STATE_COLUMNS).toContain(c)
  })
  it("no hero art, voice or claim is ever saved (ruling 2)", () => {
    for (const c of ["voice_id", "portrait_image_url", "avatar_image_url", "face_image_url", "idle_url", "talking_url", "seat_id", "name"]) {
      expect(CHARACTER_STATE_COLUMNS as readonly string[]).not.toContain(c)
    }
  })
  it("no table is in two lists", () => {
    const all = [...WHOLE_TABLES, ...MIXED_TABLES, ...LIBRARY_TABLES]
    expect(new Set(all).size).toBe(all.length)
  })
})

describe("every table the code touches is classified", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      if (f === "node_modules" || f.startsWith(".")) return []
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
    })
  }
  it("is in WHOLE_TABLES, MIXED_TABLES or LIBRARY_TABLES (lib/saves.ts)", () => {
    const used = new Set<string>()
    for (const dir of ["app", "lib", "components"]) {
      for (const f of files(join(ROOT, dir))) for (const m of readFileSync(f, "utf8").matchAll(/\.from\("([a-z_]+)"\)/g)) used.add(m[1])
    }
    const known = new Set<string>([...WHOLE_TABLES, ...MIXED_TABLES, ...LIBRARY_TABLES])
    const unclassified = [...used].filter((t) => !known.has(t)).sort()
    expect(unclassified, "a new table must be classified: does a saved game keep it (state) or share it (library)?").toEqual([])
  })
})

describe("who may use the shelf", () => {
  const host = { dm: false, dmCookie: false, host: true }
  const nobody = { dm: false, dmCookie: false, host: false }
  const dmCookie = { dm: true, dmCookie: true, host: false }
  const dmHeader = { dm: true, dmCookie: false, host: false }
  it("the host lists, loads and renames without a code", () => {
    for (const a of ["list", "load", "rename"]) expect(saveActionAllowed(a, host)).toBe(true)
  })
  it("only the DM door's cookie deletes", () => {
    expect(saveActionAllowed("delete", host)).not.toBe(true)
    expect(saveActionAllowed("delete", dmHeader)).not.toBe(true)
    expect(saveActionAllowed("delete", dmCookie)).toBe(true)
  })
  it("a player who is not the host cannot", () => {
    for (const a of ["list", "load", "rename", "delete"]) expect(saveActionAllowed(a, nobody)).not.toBe(true)
  })
})

describe("cannotLoad", () => {
  it("refuses while the table is open or live", () => {
    expect(cannotLoad("lobby", { is_loaded: false })).toMatch(/close the table/)
    expect(cannotLoad("live", { is_loaded: false })).toMatch(/close the table/)
  })
  it("allows a dark table", () => { expect(cannotLoad("closed", { is_loaded: false })).toBeNull() })
  it("refuses a save that does not exist", () => { expect(cannotLoad("closed", null)).toBeTruthy() })
})

describe("names and errors", () => {
  it("cleans a name", () => {
    expect(cleanSaveName("  The   long  night ")).toBe("The long night")
    expect(cleanSaveName("")).toBeNull()
    expect(cleanSaveName(5)).toBeNull()
    expect(cleanSaveName("x".repeat(90))).toHaveLength(60)
  })
  it("names a new game by date", () => { expect(newSaveName(new Date("2026-11-11T02:00:00Z"))).toBe("Out of the Abyss — Nov 10") })
  it("knows a missing migration from a real failure", () => {
    expect(isSavesMissing({ code: "PGRST202", message: "Could not find the function public.campaign_save" })).toBe(true)
    expect(isSavesMissing({ code: "42883", message: "function public.campaign_save(uuid) does not exist" })).toBe(true)
    expect(isSavesMissing({ code: "23503", message: "violates foreign key constraint" })).toBe(false)
    expect(isSavesMissing(null)).toBe(false)
  })
})
