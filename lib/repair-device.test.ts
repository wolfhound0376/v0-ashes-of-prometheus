import { describe, expect, it } from "vitest"
import { REPAIR_KEEPS, forgetThisDevice, keysToForget, repairedUrl } from "./repair-device"

// A window with only what the forgetting touches.
function fakeWindow(local: Record<string, string>, session: Record<string, string>) {
  const store = (o: Record<string, string>) => ({
    get length() { return Object.keys(o).length },
    key: (i: number) => Object.keys(o)[i] ?? null,
    getItem: (k: string) => (k in o ? o[k] : null),
    setItem: (k: string, v: string) => { o[k] = v },
    removeItem: (k: string) => { delete o[k] },
    clear: () => { for (const k of Object.keys(o)) delete o[k] },
  })
  let replaced = ""
  const w = { localStorage: store(local), sessionStorage: store(session), navigator: {}, location: { href: "https://x.test/rehearsal", replace: (u: string) => { replaced = u } } }
  return { w: w as unknown as Window, replaced: () => replaced }
}

describe("what Repair and the Rehearsal door forget", () => {
  it("keeps who you are, the DM key and your choices; forgets the rest", () => {
    expect(keysToForget(["aop_forge_key", "aop_settings_v1", "aop_walk_cache", "aop_character_id"])).toEqual(["aop_walk_cache"])
    for (const k of ["aop_access_role", "aop_forge_key", "aop_music_off"]) expect(REPAIR_KEEPS).toContain(k)
  })
  it("forgetThisDevice clears the storage and the tab's session, and does NOT reload (Rehearsal leaves by its own page load)", async () => {
    const local = { aop_forge_key: "k", aop_access_role: "dm", aop_old_fight: "x", something_else: "y" }
    const session = { aop_walk_state: "{}", aop_door_next: "z" }
    const f = fakeWindow(local, session)
    expect(await forgetThisDevice(f.w)).toBe(2)
    expect(Object.keys(local).sort()).toEqual(["aop_access_role", "aop_forge_key"])
    expect(Object.keys(session)).toEqual([])
    expect(f.replaced()).toBe("")
  })
  it("the stamp on a repaired address", () => {
    expect(repairedUrl("https://x.test/intro", 5)).toBe("https://x.test/intro?repaired=5")
  })
})
