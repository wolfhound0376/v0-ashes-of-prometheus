// Issue three fresh words for a hero waiting at the DM's door — shared by /api/forge/submit (a
// Forge hero) and /api/forge/claim-canon (a canon hero). Lifted out of the submit route on
// 2026-10-25 so both doors check the same three places and can never hand out a colliding code:
// character_secrets, forge_submissions and the env gate codes.

import type { SupabaseClient } from "@supabase/supabase-js"
import { generateClaimCode, normalizeCode, safeEquals } from "@/lib/access-code"

export async function freshClaimCode(admin: SupabaseClient, tag = "forge"): Promise<string | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = generateClaimCode()
    if (process.env.DM_ACCESS_CODE && safeEquals(candidate, normalizeCode(process.env.DM_ACCESS_CODE))) continue
    if (process.env.FORGE_ACCESS_CODE && safeEquals(candidate, normalizeCode(process.env.FORGE_ACCESS_CODE))) continue
    const [{ data: a, error: ea }, { data: b, error: eb }] = await Promise.all([
      admin.from("character_secrets").select("character_id").ilike("claim_code", candidate).limit(1).maybeSingle(),
      admin.from("forge_submissions").select("id").eq("claim_code", candidate).limit(1).maybeSingle(),
    ])
    if (ea || eb) { console.error(`[${tag}] code check failed:`, ea?.message ?? eb?.message); return null }
    if (a || b) continue
    return candidate
  }
  return null
}
