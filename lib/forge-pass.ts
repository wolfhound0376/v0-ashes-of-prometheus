// THE FORGE PASS — the only way into /forge that isn't the Dungeon Master.
//
// Sam, 2026-10-25: players choose one of the four canon heroes "OR they may create their own
// character. THIS IS THE ONLY WAY TO THE FORGE OUTSIDE THE DM CREATING ONE HIMSELF."
//
// So the Forge Your Own card on /choose asks POST /api/forge/pass for a short-lived, signed,
// httpOnly cookie, and app/forge/layout.tsx turns away any visit to /forge, /forge/builder or
// /forge/import that carries neither this pass nor the DM's session cookie (lib/dm-session.ts).
// The submit route checks the same, so a hero cannot be handed in from outside the door either.
//
// Signed with the same secret as the DM session (DM_SESSION_SECRET, falling back to the DM code),
// under a different label so a pass can never be replayed as a DM session. FAILS CLOSED: with no
// secret on the server nobody gets a pass, and only a DM session would open the Forge — which
// also fails closed. Pure: no Next imports, so it can be unit-tested.

import { createHmac, timingSafeEqual } from "crypto"

export const FORGE_PASS_COOKIE = "aop_forge_pass"
/** Long enough to forge a hero slowly (sheet, look, voice, photos), short enough to go stale. */
export const FORGE_PASS_HOURS = 3

function secret(): string | null {
  return process.env.DM_SESSION_SECRET || process.env.DM_ACCESS_CODE || null
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(`forge-pass:${payload}`).digest("base64url")
}

/** A fresh pass: `<expires-at-ms>.<signature>`. Null when the server has nothing to sign with. */
export function mintForgePass(now = Date.now(), key = secret()): string | null {
  if (!key) return null
  const exp = String(now + FORGE_PASS_HOURS * 3600 * 1000)
  return `${exp}.${sign(exp, key)}`
}

export function verifyForgePass(token: string | undefined | null, now = Date.now(), key = secret()): boolean {
  if (!token || !key) return false
  const dot = token.indexOf(".")
  if (dot <= 0) return false
  const exp = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!/^\d{10,16}$/.test(exp) || !sig) return false
  if (Number(exp) < now) return false
  const a = Buffer.from(sig)
  const b = Buffer.from(sign(exp, key))
  return a.length === b.length && timingSafeEqual(a, b)
}

export function forgePassFromCookieHeader(header: string | null | undefined): string | null {
  if (!header) return null
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=")
    if (k === FORGE_PASS_COOKIE) return decodeURIComponent(rest.join("="))
  }
  return null
}

export function forgePassCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""
  return `${FORGE_PASS_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${FORGE_PASS_HOURS * 3600}`
}
