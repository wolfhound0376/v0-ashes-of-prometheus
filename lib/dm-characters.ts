import { dmHeaders, ensureDmKey } from "@/lib/dm-key"

// Client-side helper for the DM-gated character CRUD route.
//
// All character WRITES go through /api/dm/characters with the service-role
// key on the server: the public "Allow all access to characters" RLS policy
// is gone (2026-08-20 security pass), so the browser's anon key can read
// characters but never write them.
export async function dmCharacters(body: {
  action: "create" | "update" | "archive" | "restore" | "delete"
  id?: string
  patch?: Record<string, unknown>
}): Promise<{ ok?: boolean; id?: string; error?: string }> {
  ensureDmKey("manage characters")
  try {
    const res = await fetch("/api/dm/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...dmHeaders() },
      body: JSON.stringify(body),
    })
    return (await res.json()) as { ok?: boolean; id?: string; error?: string }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Network error" }
  }
}
