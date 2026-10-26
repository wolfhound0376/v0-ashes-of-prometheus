// The DM's session: a signed, httpOnly cookie minted by POST /api/dm/login when the DM code checks
// out, so the code itself never has to sit in the browser for the new DM routes.
//
// WHY A COOKIE AND NOT THE CODE IN localStorage. lib/dm-key.ts keeps the DM code in localStorage
// and sends it as `x-dm-key` on every DM write. That is how the dashboard's existing DM tools work
// and this lane does NOT rip that out (app/page.tsx and a dozen routes read it; see the PR). But the
// new DM door, the seating screen and the Forge activation route authorise with this cookie instead:
// httpOnly (no script can read it), Secure, SameSite=Strict, signed with DM_SESSION_SECRET (falling
// back to the DM code itself when the secret is unset, so nothing has to change in Vercel to try it),
// and it expires. Moving the older routes over is a follow-up, one route at a time.
//
// Pure: no Next imports, so the signing and checking can be unit-tested.

import { createHmac, timingSafeEqual } from "crypto"

export const DM_COOKIE = "aop_dm"
export const DM_SESSION_HOURS = 14 // one long game night, then it asks again

function secret(): string | null {
  return process.env.DM_SESSION_SECRET || process.env.DM_ACCESS_CODE || null
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url")
}

/** A fresh token: `<expires-at-ms>.<signature>`. Null when the server has nothing to sign with. */
export function mintDmToken(now = Date.now(), key = secret()): string | null {
  if (!key) return null
  const exp = String(now + DM_SESSION_HOURS * 3600 * 1000)
  return `${exp}.${sign(exp, key)}`
}

/** True when the token was signed by this server and has not expired. */
export function verifyDmToken(token: string | undefined | null, now = Date.now(), key = secret()): boolean {
  if (!token || !key) return false
  const dot = token.indexOf(".")
  if (dot <= 0) return false
  const exp = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!/^\d{10,16}$/.test(exp) || !sig) return false
  if (Number(exp) < now) return false
  const expected = sign(exp, key)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Pull our cookie out of a raw Cookie header. */
export function dmTokenFromCookieHeader(header: string | null | undefined): string | null {
  if (!header) return null
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=")
    if (k === DM_COOKIE) return decodeURIComponent(rest.join("="))
  }
  return null
}

/** The Set-Cookie value for a fresh session, or for clearing it. */
export function dmCookieHeader(token: string | null): string {
  const base = `${DM_COOKIE}=${token ? encodeURIComponent(token) : ""}; Path=/; HttpOnly; SameSite=Strict`
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""
  return token ? `${base}${secure}; Max-Age=${DM_SESSION_HOURS * 3600}` : `${base}${secure}; Max-Age=0`
}

/** Does this request carry the DM session COOKIE (minted only by the DM door's code field)? The
 *  x-dm-key header does not count here. Used where only the DM door may act — opening the table
 *  (lib/dm-door.ts). FAILS CLOSED without a DM code. */
export function hasDmCookie(req: { headers: { get(name: string): string | null } }): boolean {
  if (!process.env.DM_ACCESS_CODE) return false
  return verifyDmToken(dmTokenFromCookieHeader(req.headers.get("cookie")))
}

/** Is this request the DM? The cookie wins; `x-dm-key` (the older header) is honoured too, so the
 *  existing dashboard tools keep working while routes move over. FAILS CLOSED without a DM code. */
export function isDmRequest(req: { headers: { get(name: string): string | null } }, normalize: (s: unknown) => string, safeEquals: (a: string, b: string) => boolean): boolean {
  const code = process.env.DM_ACCESS_CODE
  if (!code) return false
  if (verifyDmToken(dmTokenFromCookieHeader(req.headers.get("cookie")))) return true
  const supplied = normalize(req.headers.get("x-dm-key") ?? "")
  return Boolean(supplied) && safeEquals(supplied, normalize(code))
}
