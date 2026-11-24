// THE PLAYER PASS — who you are, kept by the server as well as the browser.
//
// Sam, 2026-11-23: the table "has to compensate for cache memory". Research doc of record:
// project doc claude/Tables_Invites_Saves_Research_2026-11-23.md (PR1 of six).
//
// WHY. Who a player is lives in localStorage (aop_character_id + aop_claim_token, read by ~80 files).
// localStorage is the most fragile place a browser keeps anything:
//   - Safari (every iPhone, and Macs) deletes ALL of a site's script-written storage after seven days of
//     Safari use without visiting it. A weekly game night is exactly that gap.
//   - "Clear browsing data", private windows, storage cleaners, and a new browser all lose it.
// Lose it and the game treats a regular player as a stranger at the door.
//
// WHAT. The pair is ALSO kept in an httpOnly cookie the server sets (Safari's seven-day rule is for
// script-written storage, not for a cookie the server sets). components/player-pass.tsx keeps the two in
// step:
//   - the browser has a hero the server has not heard of        → SAVE it to the server
//   - the browser's hero was cleared on purpose (leave, switch)  → FORGET it on the server too
//   - the browser lost everything but the server still has it    → RESTORE it, reload once
// The trick that tells "cleared on purpose" from "lost": a MIRROR of the last reconciled hero, kept in
// localStorage beside the keys. A deliberate clear removes the keys but leaves the mirror; a wipe takes
// both. So no page that writes or clears the keys had to change.
//
// The cookie carries the same claim token localStorage already carries; it is only ever set after the
// server has checked the pair against character_secrets, and re-checked on every read.
//
// Pure: no Next imports, so it can be unit-tested.

export const PASS_COOKIE = "aop_player"
export const PASS_DAYS = 180
/** localStorage: the last hero this browser and the server agreed on. */
export const MIRROR_KEY = "aop_pass_mirror"
/** sessionStorage: the hero restored in this tab, so a browser that cannot keep storage never reload-loops. */
export const RESTORED_KEY = "aop_pass_restored"

export const CHARACTER_LS_KEY = "aop_character_id"
export const TOKEN_LS_KEY = "aop_claim_token"
export const ROLE_LS_KEY = "aop_access_role"

export type Pass = { characterId: string; claimToken: string }

const ID = /^[A-Za-z0-9_-]{8,80}$/

/** A well-formed pass, or null. Anything else (junk, wrong types, odd characters) is no pass at all. */
export function cleanPass(raw: unknown): Pass | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const characterId = typeof r.characterId === "string" ? r.characterId.trim() : ""
  const claimToken = typeof r.claimToken === "string" ? r.claimToken.trim() : ""
  if (!ID.test(characterId) || !ID.test(claimToken)) return null
  return { characterId, claimToken }
}

/** The hero this browser holds, read through any getter (localStorage in the app, a map in tests). */
export function readPass(get: (key: string) => string | null): Pass | null {
  return cleanPass({ characterId: get(CHARACTER_LS_KEY) ?? "", claimToken: get(TOKEN_LS_KEY) ?? "" })
}

export function samePass(a: Pass | null | undefined, b: Pass | null | undefined): boolean {
  if (!a || !b) return !a && !b
  return a.characterId === b.characterId && a.claimToken === b.claimToken
}

export function encodePass(p: Pass): string {
  return Buffer.from(JSON.stringify({ c: p.characterId, k: p.claimToken }), "utf8").toString("base64url")
}

/** Browser-safe twin of encodePass for the mirror (no Buffer in the browser). Plain JSON is fine there. */
export function mirrorValue(p: Pass): string {
  return JSON.stringify({ characterId: p.characterId, claimToken: p.claimToken })
}

export function readMirror(raw: string | null | undefined): Pass | null {
  if (!raw) return null
  try { return cleanPass(JSON.parse(raw)) } catch { return null }
}

export function decodePass(value: string | null | undefined): Pass | null {
  if (!value) return null
  try {
    const j = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { c?: unknown; k?: unknown }
    return cleanPass({ characterId: j?.c, claimToken: j?.k })
  } catch {
    return null
  }
}

/** Pull the pass out of a raw Cookie header. */
export function passFromCookieHeader(header: string | null | undefined): Pass | null {
  if (!header) return null
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=")
    if (k === PASS_COOKIE) {
      try { return decodePass(decodeURIComponent(rest.join("="))) } catch { return null }
    }
  }
  return null
}

/** The Set-Cookie value that keeps a pass, or (null) clears it. Lax, not Strict: a player arriving from a
 *  link in a text message must still be recognised on that first page. */
export function passCookieHeader(p: Pass | null, secure = process.env.NODE_ENV === "production"): string {
  const base = `${PASS_COOKIE}=${p ? encodePass(p) : ""}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`
  return p ? `${base}; Max-Age=${PASS_DAYS * 24 * 3600}` : `${base}; Max-Age=0`
}

export type PassStep = "save" | "forget" | "restore" | "none"

/**
 * What to do, from three readings:
 *   local  — the hero in this browser's keys right now
 *   mirror — the last hero this browser and the server agreed on
 *   server — what the server's cookie holds; `undefined` when we have not asked (or could not)
 * Restoring is only ever decided from a real server answer, never from silence.
 */
export function passStep(local: Pass | null, mirror: Pass | null, server: Pass | null | undefined): PassStep {
  if (local) {
    if (!samePass(local, mirror)) return "save"
    if (server !== undefined && !samePass(local, server)) return "save"
    return "none"
  }
  if (mirror) return "forget" // the keys were cleared on purpose; the mirror survived
  if (server) return "restore" // keys and mirror both gone: the browser lost them
  return "none"
}
