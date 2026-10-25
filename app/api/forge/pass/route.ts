import { forgePassCookieHeader, mintForgePass } from "@/lib/forge-pass"

// POST /api/forge/pass — the Forge Your Own card on /choose asks for this before it opens /forge.
// It sets the short-lived signed cookie app/forge/layout.tsx and /api/forge/submit look for
// (lib/forge-pass.ts says why). No code required: the point is not secrecy but that the Forge has
// exactly one door for players, the chooser.

export const dynamic = "force-dynamic"

export async function POST() {
  const token = mintForgePass()
  if (!token) return Response.json({ ok: false, error: "The Forge is cold (server not configured)." }, { status: 500 })
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json", "Set-Cookie": forgePassCookieHeader(token) } })
}
