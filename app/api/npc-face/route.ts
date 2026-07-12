import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// Canon face uploader endpoint used by /admin/npc-assets.
// Stores the image at a DETERMINISTIC path (faces/<slug>.png) so re-uploads
// overwrite the previous canon face, then sets face_url on EVERY npc_encounters
// row sharing the same name.
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const npcName = ((formData.get("npcName") as string) || "").trim()

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }
    if (!npcName) {
      return NextResponse.json({ error: "Missing npcName" }, { status: 400 })
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Allowed: JPEG, PNG, GIF, WebP" }, { status: 400 })
    }
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File too large. Maximum size is 10MB" }, { status: 400 })
    }

    // Slugify the NPC name for a stable, filesystem-safe blob key.
    const slug = npcName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "npc"
    const pathname = `faces/${slug}.png`

    // allowOverwrite so re-uploading a canon face replaces the prior one.
    const blob = await put(pathname, file, {
      access: "private",
      allowOverwrite: true,
      contentType: file.type,
    })

    const faceUrl = `/api/file?pathname=${encodeURIComponent(blob.pathname)}`

    // Update face_url on ALL rows sharing this NPC name.
    const supabase = createAdminClient()
    const { data: updated, error } = await supabase
      .from("npc_encounters")
      .update({ face_url: faceUrl })
      .eq("name", npcName)
      .select("id")

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      faceUrl,
      pathname: blob.pathname,
      updatedCount: updated?.length ?? 0,
    })
  } catch (error) {
    console.error("[v0] npc-face upload error:", error)
    return NextResponse.json({ error: (error as Error).message || "Upload failed" }, { status: 500 })
  }
}
