import { describe, expect, it } from "vitest"
import {
  CHARACTER_LS_KEY, PASS_COOKIE, TOKEN_LS_KEY,
  cleanPass, decodePass, encodePass, mirrorValue, passCookieHeader, passFromCookieHeader, passStep, readMirror, readPass, samePass,
  type Pass,
} from "./player-pass"

const A: Pass = { characterId: "d00aa5b8-ced1-477d-9ec8-0861cca55498", claimToken: "0f3c2a1e-9b7d-4c55-8e21-7a6b5c4d3e2f" }
const B: Pass = { characterId: "a1b2c3d4-0000-4000-8000-123456789abc", claimToken: "ffffeeee-dddd-4ccc-8bbb-aaaa99998888" }

describe("cleanPass / readPass", () => {
  it("keeps a well-formed pair and refuses junk", () => {
    expect(cleanPass(A)).toEqual(A)
    expect(cleanPass({ characterId: A.characterId })).toBeNull()
    expect(cleanPass({ characterId: "x", claimToken: A.claimToken })).toBeNull()
    expect(cleanPass({ characterId: "a;b=c d", claimToken: A.claimToken })).toBeNull()
    expect(cleanPass(null)).toBeNull()
    expect(cleanPass("nope")).toBeNull()
  })
  it("reads the two localStorage keys", () => {
    const m = new Map([[CHARACTER_LS_KEY, A.characterId], [TOKEN_LS_KEY, A.claimToken]])
    expect(readPass((k) => m.get(k) ?? null)).toEqual(A)
    expect(readPass(() => null)).toBeNull()
  })
})

describe("cookie", () => {
  it("round-trips through the Set-Cookie value and a Cookie header", () => {
    expect(decodePass(encodePass(A))).toEqual(A)
    const set = passCookieHeader(A, true)
    expect(set).toContain(`${PASS_COOKIE}=`)
    expect(set).toContain("HttpOnly")
    expect(set).toContain("Secure")
    expect(set).toContain("SameSite=Lax")
    expect(set).toMatch(/Max-Age=\d{6,}/)
    const value = set.split(";")[0].split("=").slice(1).join("=")
    expect(passFromCookieHeader(`other=1; ${PASS_COOKIE}=${value}; x=y`)).toEqual(A)
  })
  it("clearing expires it at once", () => {
    expect(passCookieHeader(null, false)).toMatch(/Max-Age=0$/)
    expect(passCookieHeader(null, false)).not.toContain("Secure")
  })
  it("a tampered or absent cookie is no pass", () => {
    expect(passFromCookieHeader(`${PASS_COOKIE}=garbage`)).toBeNull()
    expect(passFromCookieHeader("")).toBeNull()
    expect(passFromCookieHeader(null)).toBeNull()
  })
  it("the mirror is plain JSON and round-trips", () => {
    expect(readMirror(mirrorValue(A))).toEqual(A)
    expect(readMirror("{bad")).toBeNull()
    expect(readMirror(null)).toBeNull()
  })
})

describe("passStep", () => {
  it("in step: nothing to do", () => {
    expect(passStep(A, A, A)).toBe("none")
    expect(passStep(A, A, undefined)).toBe("none")
    expect(passStep(null, null, null)).toBe("none")
  })
  it("a hero chosen or switched in this browser is saved", () => {
    expect(passStep(A, null, undefined)).toBe("save")
    expect(passStep(B, A, A)).toBe("save")
    expect(passStep(B, A, undefined)).toBe("save")
  })
  it("a browser the server has not heard of yet (first night after this ships) is saved", () => {
    expect(passStep(A, A, null)).toBe("save")
    expect(passStep(A, null, null)).toBe("save")
  })
  it("a hero cleared on purpose is forgotten on the server too", () => {
    expect(passStep(null, A, A)).toBe("forget")
    expect(passStep(null, A, undefined)).toBe("forget")
  })
  it("a browser that lost everything gets its hero back — but only on a real server answer", () => {
    expect(passStep(null, null, A)).toBe("restore")
    expect(passStep(null, null, undefined)).toBe("none")
  })
  it("samePass", () => {
    expect(samePass(A, { ...A })).toBe(true)
    expect(samePass(A, B)).toBe(false)
    expect(samePass(null, undefined)).toBe(true)
    expect(samePass(A, null)).toBe(false)
  })
})
