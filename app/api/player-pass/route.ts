import { createAdminClient } from "@/lib/supabase/admin"
import { safeEquals } from "@/lib/access-code"
import { cleanPass, passCookieHeader, passFromCookieHeader, type Pass } from "@/lib/player-pass"

// /api/player-pass — the server's copy of who this browser is (lib/player-pass.ts has the why).
//
//   GET     → the pass in this browser's cookie, re-checked against character_secrets. A pass that no longer
//             checks out (the hero was removed, the token changed) is cleared and reported as none.
//   POST    → { characterId, claimToken }: checked, then kept in the cookie. A pair that does not check out
//             clears the cookie, so a stale hero can never be restored later.
//   DELETE  → forget it (the player left or switched hero on purpose).
//
// The claim token this returns is the one this same browser already held in localStorage; it is handed back
// only to a browser carrying the httpOnly cookie, and only after the server has re-checked it.

export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

async function check(p: Pass): Promise<{ ok: boolean; name: string | null }> {
  const admin = createAdminClient()
  const { data: secret } = await admin
    .from("character_secrets")
    .select("claim_token")
    .eq("character_id", p.characterId)
    .maybeSingle()
  const token = typeof secret?.claim_token === "string" ? secret.claim_token : ""
  if (!token || !safeEquals(token, p.claimToken)) return { ok: false, name: null }
  const { data: row } = await admin.from("characters").select("name").eq("id", p.characterId).maybeSingle()
  return { ok: true, name: typeof row?.name === "string" ? row.name : null }
}

function reply(body: unknown, pass: Pass | null | "keep") {
  const headers: Record<string, string> = { ...NO_STORE, "Content-Type": "application/json" }
  if (pass !== "keep") headers["Set-Cookie"] = passCookieHeader(pass)
  return new Response(JSON.stringify(body), { status: 200, headers })
}

export async function GET(req: Request) {
  const pass = passFromCookieHeader(req.headers.get("cookie"))
  if (!pass) return reply({ pass: null }, "keep")
  try {
    const { ok, name } = await check(pass)
    if (!ok) return reply({ pass: null }, null)
    return reply({ pass: { ...pass, name } }, "keep")
  } catch (e) {
    // The database is unreachable: say nothing either way, so the browser neither restores nor forgets.
    console.error("[player-pass] GET:", e)
    return new Response(JSON.stringify({ error: "server" }), { status: 503, headers: NO_STORE })
  }
}

export async function POST(req: Request) {
  let pass: Pass | null = null
  try { pass = cleanPass(await req.json()) } catch { pass = null }
  if (!pass) return reply({ ok: false }, null)
  try {
    const { ok } = await check(pass)
    return reply({ ok }, ok ? pass : null)
  } catch (e) {
    console.error("[player-pass] POST:", e)
    return new Response(JSON.stringify({ ok: false, error: "server" }), { status: 503, headers: NO_STORE })
  }
}

export async function DELETE() {
  return reply({ ok: true }, null)
}
