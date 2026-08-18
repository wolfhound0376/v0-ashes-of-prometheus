import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { ALLOWED_MEDIA_TYPES, MAX_MEDIA_BYTES, extensionFor, slugify } from "@/lib/media-url"

// /api/item-art — replace the artwork for an item, from wherever the DM is
// looking at it. (2026-08-18)
//
//   POST multipart: file, name           → upload art for an item BY NAME
//   POST multipart: file, inventoryItemId → same, name read from the row
//
// WHY THIS EXISTS ALONGSIDE /api/asset-media: that route updates a column on a
// row that must ALREADY EXIST, keyed by id. 44 of 53 inventory rows have no
// catalogue entry at all (Guard's Key, Tattered Journal, Small Quill…), so
// there was literally nothing to upload against — the Items tab could not even
// list them. This route is get-or-create: it resolves the catalogue row via the
// item_key registry and CREATES one when none exists, so any item a player is
// carrying can be given art without the DM first hand-building a catalogue row.
//
// CATALOGUE-LEVEL BY DESIGN: art is written to items.icon_url, so uploading a
// dagger icon once gives it to all five daggers across every character. The
// per-row override (inventory_items.icon_url) remains tier 1 of the resolver
// and is deliberately not written here.
//
// AUTHORIZATION mirrors /api/asset-media: x-dm-key must carry DM_ACCESS_CODE
// when that env var is set; with it unset the route stays open (fail-open, the
// same rule as the /join gate).

export const dynamic = "force-dynamic"
export const maxDuration = 60

function authorized(request: NextRequest): boolean {
  const dmCode = process.env.DM_ACCESS_CODE
  if (!dmCode) return true
  const supplied = normalizeCode(request.headers.get("x-dm-key"))
  return !!supplied && safeEquals(supplied, normalizeCode(dmCode))
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Not authorized" }, { status: 403 })

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error("[item-art] admin client unavailable:", e)
    return NextResponse.json({ error: "Server not configured" }, { status: 500 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 })
  }

  const file = form.get("file") as File | null
  const inventoryItemId = String(form.get("inventoryItemId") ?? "").trim()
  let name = String(form.get("name") ?? "").trim()

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

  // File validation happens BEFORE any row is created, so a rejected upload
  // never leaves an empty catalogue entry behind.
  if (!ALLOWED_MEDIA_TYPES.includes(file.type)) {
    return NextResponse.json(
      {
        error:
          file.type === "video/quicktime"
            ? "MOV is not supported — transcode to MP4 first."
            : `Unsupported file type: ${file.type || "unknown"}`,
      },
      { status: 400 },
    )
  }
  if (file.size > MAX_MEDIA_BYTES) {
    return NextResponse.json({ error: "File too large. Maximum size is 50MB" }, { status: 400 })
  }

  // Resolve the item's display name. An inventory row id is the friendlier
  // caller (the modal has one to hand); a bare name is accepted so the DM
  // panel can use the same endpoint.
  let inventoryRow: { name: string; item_type: string | null; equippable_slot: string | null } | null = null
  if (inventoryItemId) {
    const { data } = await admin
      .from("inventory_items")
      .select("name, item_type, equippable_slot")
      .eq("id", inventoryItemId)
      .maybeSingle()
    if (!data) return NextResponse.json({ error: "Inventory item not found" }, { status: 404 })
    inventoryRow = data as typeof inventoryRow
    if (!name) name = data.name as string
  }
  if (!name) return NextResponse.json({ error: "An item name is required" }, { status: 400 })

  // The key is derived by the SAME database function everything else uses —
  // never re-implemented in TypeScript, or the two would drift.
  const { data: keyData, error: keyError } = await admin.rpc("item_key", { p_name: name })
  const itemKey = (keyData as string | null) ?? null
  if (keyError || !itemKey) {
    console.error("[item-art] item_key rpc failed:", keyError?.message)
    return NextResponse.json({ error: "Could not derive the item key" }, { status: 500 })
  }

  // === GET OR CREATE the catalogue row ===
  // Matched through item_catalog_lookup so an alias or asset_name hit counts:
  // uploading art for "Dagger" updates the existing "Obsidian flake dagger"
  // rather than creating a rival row.
  const { data: existing } = await admin
    .from("item_catalog_lookup")
    .select("catalog_id, catalog_name")
    .eq("item_key", itemKey)
    .maybeSingle()

  let catalogId = (existing?.catalog_id as string | undefined) ?? null
  let catalogName = (existing?.catalog_name as string | undefined) ?? name
  let created = false

  if (!catalogId) {
    // Defensive: a catalogue row could exist whose SLUG matches the key even
    // though the lookup missed it (hand-entered slug, renamed row). Adopt it
    // rather than colliding with the UNIQUE(slug) constraint.
    const { data: bySlug } = await admin
      .from("items")
      .select("id, name")
      .eq("slug", itemKey)
      .maybeSingle()
    if (bySlug) {
      catalogId = bySlug.id as string
      catalogName = bySlug.name as string
    }
  }

  if (!catalogId) {
    // slug is UNIQUE and NOT NULL; item_key is a stable, already-unique-enough
    // slug for this purpose. Everything else has a sensible column default.
    const { data: inserted, error: insertError } = await admin
      .from("items")
      .insert({
        slug: itemKey,
        name,
        item_type: inventoryRow?.item_type ?? "misc",
        equippable_slot: inventoryRow?.equippable_slot ?? null,
        source: "dm-upload",
        description: `Catalogue entry created when art was uploaded for "${name}".`,
      })
      .select("id, name")
      .single()
    if (insertError || !inserted) {
      console.error("[item-art] catalogue insert failed:", insertError?.message)
      return NextResponse.json({ error: "Could not create the catalogue entry" }, { status: 500 })
    }
    catalogId = inserted.id as string
    catalogName = inserted.name as string
    created = true
  }

  // Deterministic path: re-uploading replaces the bytes in place rather than
  // accumulating orphans, the same house rule as /api/asset-media.
  const pathname = `items/${slugify(catalogName, "item")}-icon.${extensionFor(file.type)}`
  const blob = await put(pathname, file, {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
  })
  // Cache-bust: the blob path is stable by design, so without a changing query
  // the browser would keep showing the OLD art after a replacement.
  const url = `/api/file?pathname=${encodeURIComponent(blob.pathname)}&v=${Date.now()}`

  const { error: writeError } = await admin.from("items").update({ icon_url: url }).eq("id", catalogId)
  if (writeError) {
    console.error("[item-art] icon write failed:", writeError.message)
    return NextResponse.json({ error: writeError.message }, { status: 500 })
  }

  // Link any inventory rows that share this key but have no catalogue link yet,
  // so the art reaches them through the resolver's item_id tier immediately.
  const { error: linkError } = await admin
    .from("inventory_items")
    .update({ item_id: catalogId })
    .eq("item_key", itemKey)
    .is("item_id", null)
  if (linkError) console.error("[item-art] inventory link failed:", linkError.message)

  console.log(`[item-art] ${created ? "created" : "updated"} "${catalogName}" (${itemKey}) → ${blob.pathname}`)
  return NextResponse.json({ url, itemKey, catalogId, catalogName, created })
}
