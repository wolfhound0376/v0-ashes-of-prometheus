import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { ALLOWED_MEDIA_TYPES, MAX_MEDIA_BYTES, extensionFor, slugify } from "@/lib/media-url"

// /api/asset-media — one endpoint for every DM-managed asset that is not an NPC.
//
//   POST   multipart: file, target, id            → upload, then set the column
//   DELETE json:      { target, id }              → clear the column (file kept)
//
// Accepts IMAGES AND VIDEO alike. Until now nothing outside /api/npc-video could
// hold a loop: image-uploader.tsx hardcoded accept="image/*" and assets-panel
// rendered every asset through <img>, so a scene background could only ever be
// a still. Environments, overlays, item icons and the generic library can now
// all take an MP4.
//
// WHY A TARGET WHITELIST: the caller names a table and a column. Without a fixed
// allow list this would be an arbitrary-write primitive against any table the
// service-role key can reach. TARGETS is exhaustive and closed; unknown targets
// are rejected before anything is read, uploaded or written.
//
// CLEAR REMOVES THE REFERENCE, NOT THE FILE — same rule as /api/npc-asset. Blob
// objects are shared between rows (a fog overlay reused across environments, a
// curated background referenced by dashboard_assets and by an environment), so
// destroying bytes could silently break an unrelated row and cannot be undone.
// Re-uploading overwrites at the same deterministic path, so nothing accumulates
// through normal use.
//
// AUTHORIZATION mirrors /api/npc-asset and forge/import: x-dm-key must carry
// DM_ACCESS_CODE when that env var is set; with it unset the route stays open,
// the same fail-open rule as the /join gate.

export const dynamic = "force-dynamic"
export const maxDuration = 60

interface TargetSpec {
  table: string
  column: string
  /** Blob folder for uploads against this target. */
  folder: string
  /** Column read to build a stable, human-readable blob key. */
  labelColumn: string
}

const TARGETS: Record<string, TargetSpec> = {
  "environment.background": {
    table: "environments",
    column: "background_image_url",
    folder: "scenes",
    labelColumn: "name",
  },
  "environment.fog": {
    table: "environments",
    column: "fog_overlay_url",
    folder: "overlays",
    labelColumn: "name",
  },
  "item.icon": {
    table: "items",
    column: "icon_url",
    folder: "items",
    labelColumn: "slug",
  },
  "asset.file": {
    table: "dashboard_assets",
    column: "file_url",
    folder: "library",
    labelColumn: "name",
  },
  "asset.thumbnail": {
    table: "dashboard_assets",
    column: "thumbnail_url",
    folder: "library",
    labelColumn: "name",
  },
  // Layer 2: a player character's animated idle/talking loop, keyed by id.
  "character.idle": {
    table: "characters",
    column: "idle_url",
    folder: "characters",
    labelColumn: "name",
  },
  "character.talking": {
    table: "characters",
    column: "talking_url",
    folder: "characters",
    labelColumn: "name",
  },
  // PR-4: a cinematic clip's rendered video, keyed by clip row id.
  "cinematic.video": {
    table: "cinematic_clips",
    column: "video_url",
    folder: "cinematics",
    labelColumn: "location",
  },
}

function authorized(request: NextRequest): boolean {
  const dmCode = process.env.DM_ACCESS_CODE
  if (!dmCode) return true
  const supplied = normalizeCode(request.headers.get("x-dm-key"))
  return !!supplied && safeEquals(supplied, normalizeCode(dmCode))
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error("[v0] asset-media: admin client unavailable:", e)
    return NextResponse.json({ error: "Server not configured" }, { status: 500 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 })
  }

  const file = form.get("file") as File | null
  const target = String(form.get("target") ?? "")
  const id = String(form.get("id") ?? "")

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const spec = TARGETS[target]
  if (!spec) {
    return NextResponse.json(
      { error: `Unknown target. Allowed: ${Object.keys(TARGETS).join(", ")}` },
      { status: 400 },
    )
  }

  if (!ALLOWED_MEDIA_TYPES.includes(file.type)) {
    return NextResponse.json(
      {
        error:
          file.type === "video/quicktime"
            ? "MOV is not supported — transcode to MP4 first (browsers cannot play MOV reliably)."
            : `Unsupported file type: ${file.type || "unknown"}`,
      },
      { status: 400 },
    )
  }
  if (file.size > MAX_MEDIA_BYTES) {
    return NextResponse.json({ error: "File too large. Maximum size is 50MB" }, { status: 400 })
  }

  // Read the row's label so the blob key is readable rather than a bare UUID.
  const { data: row, error: readError } = await admin
    .from(spec.table)
    .select(spec.labelColumn)
    .eq("id", id)
    .maybeSingle()

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 })
  }
  if (!row) {
    return NextResponse.json({ error: "Row not found" }, { status: 404 })
  }

  const label = slugify(String((row as unknown as Record<string, unknown>)[spec.labelColumn] ?? ""), "asset")
  const suffix = spec.column.replace(/_url$/, "").replace(/_/g, "-")
  const pathname = `${spec.folder}/${label}-${suffix}.${extensionFor(file.type)}`

  const blob = await put(pathname, file, {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
  })
  const url = `/api/file?pathname=${encodeURIComponent(blob.pathname)}`

  const { error: writeError } = await admin
    .from(spec.table)
    .update({ [spec.column]: url })
    .eq("id", id)

  if (writeError) {
    return NextResponse.json({ error: writeError.message }, { status: 500 })
  }

  console.log(`[v0] asset-media set ${spec.table}.${spec.column} for ${id} → ${blob.pathname}`)
  return NextResponse.json({ url, pathname: blob.pathname, target, id })
}

export async function DELETE(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error("[v0] asset-media: admin client unavailable:", e)
    return NextResponse.json({ error: "Server not configured" }, { status: 500 })
  }

  let target = ""
  let id = ""
  try {
    const body = await request.json()
    target = typeof body?.target === "string" ? body.target : ""
    id = typeof body?.id === "string" ? body.id : ""
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const spec = TARGETS[target]
  if (!spec) {
    return NextResponse.json(
      { error: `Unknown target. Allowed: ${Object.keys(TARGETS).join(", ")}` },
      { status: 400 },
    )
  }
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const { error } = await admin
    .from(spec.table)
    .update({ [spec.column]: null })
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log(`[v0] asset-media cleared ${spec.table}.${spec.column} for ${id}`)
  return NextResponse.json({ cleared: spec.column, target, id })
}
