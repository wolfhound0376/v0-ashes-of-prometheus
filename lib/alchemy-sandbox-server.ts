// Server half of the alchemy sandbox (lib/alchemy-sandbox.ts).
//
// The practice character is DM-only for the same reason /api/alchemy/bench
// is: a character anyone could brew with is a free way to try every
// combination and read the grid. The gate is the house one (/api/combat,
// /api/ground-items, /api/alchemy/bench): x-dm-key must equal DM_ACCESS_CODE,
// and an open table with no code set stays open.

import { NextResponse, type NextRequest } from "next/server"
import { normalizeCode, safeEquals } from "./access-code"
import { isSandboxCharacter } from "./alchemy-sandbox"

export function dmAuthorized(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  if (!required) return true
  return safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

/** A 403 when a non-DM reaches for the practice character, else null. */
export function sandboxRefused(req: NextRequest, characterId: unknown): NextResponse | null {
  if (!isSandboxCharacter(characterId) || dmAuthorized(req)) return null
  return NextResponse.json({ error: "the alchemy sandbox is the DM's", reason: "sandbox_dm_only" }, { status: 403 })
}

/** The practice character never speaks into the shared game log. */
export function quiet(characterId: unknown): boolean {
  return isSandboxCharacter(characterId)
}
