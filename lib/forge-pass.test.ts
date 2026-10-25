import { describe, expect, it } from "vitest"
import { FORGE_PASS_COOKIE, FORGE_PASS_HOURS, forgePassCookieHeader, forgePassFromCookieHeader, mintForgePass, verifyForgePass } from "./forge-pass"
import { mintDmToken, verifyDmToken } from "./dm-session"

const KEY = "test-secret"
const NOW = 1_800_000_000_000

describe("forge pass", () => {
  it("mints a pass that verifies until it expires", () => {
    const t = mintForgePass(NOW, KEY)!
    expect(verifyForgePass(t, NOW + 1000, KEY)).toBe(true)
    expect(verifyForgePass(t, NOW + FORGE_PASS_HOURS * 3600 * 1000 - 1, KEY)).toBe(true)
    expect(verifyForgePass(t, NOW + FORGE_PASS_HOURS * 3600 * 1000 + 1, KEY)).toBe(false)
  })

  it("fails closed with no secret, a wrong secret, or junk", () => {
    expect(mintForgePass(NOW, null)).toBeNull()
    const t = mintForgePass(NOW, KEY)!
    expect(verifyForgePass(t, NOW, null)).toBe(false)
    expect(verifyForgePass(t, NOW, "other")).toBe(false)
    expect(verifyForgePass("", NOW, KEY)).toBe(false)
    expect(verifyForgePass("abc.def", NOW, KEY)).toBe(false)
    expect(verifyForgePass(`${NOW + 99999}.forged`, NOW, KEY)).toBe(false)
  })

  it("a pass is never a DM session, and a DM session is never a pass", () => {
    const pass = mintForgePass(NOW, KEY)!
    const dm = mintDmToken(NOW, KEY)!
    expect(verifyDmToken(pass, NOW, KEY)).toBe(false)
    expect(verifyForgePass(dm, NOW, KEY)).toBe(false)
  })

  it("reads its own cookie out of a header and writes an httpOnly one", () => {
    const t = mintForgePass(NOW, KEY)!
    expect(forgePassFromCookieHeader(`a=1; ${FORGE_PASS_COOKIE}=${encodeURIComponent(t)}; b=2`)).toBe(t)
    expect(forgePassFromCookieHeader("a=1")).toBeNull()
    expect(forgePassCookieHeader(t)).toMatch(/HttpOnly/)
    expect(forgePassCookieHeader(t)).toMatch(new RegExp(`Max-Age=${FORGE_PASS_HOURS * 3600}`))
  })
})
