import { describe, expect, it } from "vitest"
import { DM_COOKIE, DM_SESSION_HOURS, dmCookieHeader, dmTokenFromCookieHeader, hasDmCookie, isDmRequest, mintDmToken, verifyDmToken } from "./dm-session"

const KEY = "test-secret"
const NOW = 1_800_000_000_000

describe("DM session token", () => {
  it("round-trips with the same key", () => {
    const t = mintDmToken(NOW, KEY)
    expect(t).toBeTruthy()
    expect(verifyDmToken(t, NOW, KEY)).toBe(true)
    expect(verifyDmToken(t, NOW + (DM_SESSION_HOURS * 3600 * 1000) - 1, KEY)).toBe(true)
  })

  it("expires", () => {
    const t = mintDmToken(NOW, KEY)
    expect(verifyDmToken(t, NOW + DM_SESSION_HOURS * 3600 * 1000 + 1, KEY)).toBe(false)
  })

  it("refuses a token signed with another key, a tampered expiry, and garbage", () => {
    const t = mintDmToken(NOW, KEY)!
    expect(verifyDmToken(t, NOW, "other")).toBe(false)
    const [exp, sig] = t.split(".")
    expect(verifyDmToken(`${Number(exp) + 999999}.${sig}`, NOW, KEY)).toBe(false)
    expect(verifyDmToken("", NOW, KEY)).toBe(false)
    expect(verifyDmToken("nodot", NOW, KEY)).toBe(false)
    expect(verifyDmToken(".sig", NOW, KEY)).toBe(false)
    expect(verifyDmToken(null, NOW, KEY)).toBe(false)
  })

  it("mints nothing without a key", () => {
    expect(mintDmToken(NOW, null)).toBeNull()
    expect(verifyDmToken("1.2", NOW, null)).toBe(false)
  })

  it("reads its cookie out of a Cookie header and leaves the rest alone", () => {
    expect(dmTokenFromCookieHeader(`a=1; ${DM_COOKIE}=${encodeURIComponent("123.ab=c")}; b=2`)).toBe("123.ab=c")
    expect(dmTokenFromCookieHeader("a=1; b=2")).toBeNull()
    expect(dmTokenFromCookieHeader(null)).toBeNull()
  })

  it("writes an httpOnly, strict cookie and a clearing cookie", () => {
    const set = dmCookieHeader("123.sig")
    expect(set).toMatch(/HttpOnly/)
    expect(set).toMatch(/SameSite=Strict/)
    expect(set).toMatch(/Max-Age=\d+/)
    expect(dmCookieHeader(null)).toMatch(/Max-Age=0/)
  })
})

describe("isDmRequest", () => {
  const normalize = (s: unknown) => (typeof s === "string" ? s.toLowerCase().trim() : "")
  const safeEquals = (a: string, b: string) => a === b
  const req = (h: Record<string, string>) => ({ headers: { get: (n: string) => h[n.toLowerCase()] ?? null } })

  it("fails closed with no DM code configured", () => {
    const prev = process.env.DM_ACCESS_CODE
    delete process.env.DM_ACCESS_CODE
    try {
      expect(isDmRequest(req({ "x-dm-key": "anything" }), normalize, safeEquals)).toBe(false)
    } finally { if (prev !== undefined) process.env.DM_ACCESS_CODE = prev }
  })

  it("accepts the cookie, accepts the header, refuses the rest", () => {
    const prevCode = process.env.DM_ACCESS_CODE, prevSecret = process.env.DM_SESSION_SECRET
    process.env.DM_ACCESS_CODE = "Open-Sesame"
    process.env.DM_SESSION_SECRET = KEY
    try {
      const t = mintDmToken(Date.now(), KEY)!
      expect(isDmRequest(req({ cookie: `${DM_COOKIE}=${encodeURIComponent(t)}` }), normalize, safeEquals)).toBe(true)
      expect(isDmRequest(req({ "x-dm-key": "open-sesame" }), normalize, safeEquals)).toBe(true)
      expect(isDmRequest(req({ "x-dm-key": "wrong" }), normalize, safeEquals)).toBe(false)
      expect(isDmRequest(req({}), normalize, safeEquals)).toBe(false)
    } finally {
      if (prevCode !== undefined) process.env.DM_ACCESS_CODE = prevCode; else delete process.env.DM_ACCESS_CODE
      if (prevSecret !== undefined) process.env.DM_SESSION_SECRET = prevSecret; else delete process.env.DM_SESSION_SECRET
    }
  })
})

// Sam, 2026-10-25: the DM door on the title screen is the ONLY way to open the table. Only the door's code
// field mints the cookie, so `open` checks the cookie and nothing else — the dashboard's x-dm-key cannot open.
describe("hasDmCookie (the table's open lock)", () => {
  const req = (h: Record<string, string>) => ({ headers: { get: (n: string) => h[n.toLowerCase()] ?? null } })

  it("accepts the door's cookie and refuses the x-dm-key header", () => {
    const prevCode = process.env.DM_ACCESS_CODE, prevSecret = process.env.DM_SESSION_SECRET
    process.env.DM_ACCESS_CODE = "Open-Sesame"
    process.env.DM_SESSION_SECRET = KEY
    try {
      const t = mintDmToken(Date.now(), KEY)!
      expect(hasDmCookie(req({ cookie: `${DM_COOKIE}=${encodeURIComponent(t)}` }))).toBe(true)
      expect(hasDmCookie(req({ "x-dm-key": "open-sesame" }))).toBe(false)
      expect(hasDmCookie(req({ cookie: `${DM_COOKIE}=forged.sig` }))).toBe(false)
      expect(hasDmCookie(req({}))).toBe(false)
    } finally {
      if (prevCode !== undefined) process.env.DM_ACCESS_CODE = prevCode; else delete process.env.DM_ACCESS_CODE
      if (prevSecret !== undefined) process.env.DM_SESSION_SECRET = prevSecret; else delete process.env.DM_SESSION_SECRET
    }
  })

  it("fails closed with no DM code configured", () => {
    const prev = process.env.DM_ACCESS_CODE
    delete process.env.DM_ACCESS_CODE
    try {
      const t = mintDmToken(Date.now(), KEY)!
      expect(hasDmCookie(req({ cookie: `${DM_COOKIE}=${encodeURIComponent(t)}` }))).toBe(false)
    } finally { if (prev !== undefined) process.env.DM_ACCESS_CODE = prev }
  })
})
