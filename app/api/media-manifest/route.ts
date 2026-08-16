import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// Read-only view over media_manifest. Degrades to an empty list (never 500s)
// so the dashboard falls back to the hardcoded MUSIC_LIBRARY when the table
// hasn't been created or seeded yet.
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const kind = searchParams.get("kind") // e.g. 'music'; omit for everything

  try {
    const supabase = createAdminClient()
    let query = supabase
      .from("media_manifest")
      .select("id, kind, pool, slot, name, url, mood")
      .order("pool", { ascending: true })

    if (kind) query = query.eq("kind", kind)

    const { data, error } = await query

    if (error) {
      // Missing table / not migrated yet -> empty catalog, let the client fall back.
      console.log("[v0] media-manifest read failed, returning empty:", error.message)
      return NextResponse.json({ items: [] })
    }

    return NextResponse.json({ items: data ?? [] })
  } catch (err) {
    console.log("[v0] media-manifest route error:", (err as Error).message)
    return NextResponse.json({ items: [] })
  }
}
