import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// Animated talking-head uploader used by /admin/npc-assets. Stores a looping
// face video (idle or talking) at a DETERMINISTIC path so re-uploads overwrite
// the previous clip, then sets idle_url/talking_url on EVERY npc_encounters row
// sharing the same name (mirrors the canon-face uploader in npc-face/route.ts).
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const npcName = ((formData.get("npcName") as string) || "").trim()
    const kind = ((formData.get("kind") as string) || "").trim() // "idle" | "talking"

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }
    if (!npcName) {
      return NextResponse.json({ error: "Missing npcName" }, { status: 400 })
    }
    if (kind !== "idle" && kind !== "talking") {
      return NextResponse.json({ error: "kind must be 'idle' or 'talking'" }, { status: 400 })
    }

    const allowedTypes = ["video/mp4", "video/webm"]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Allowed: MP4, WebM" }, { status: 400 })
    }
    // Face-loop clips are short; cap at 50MB to keep the letterboxed frame snappy.
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File too large. Maximum size is 50MB" }, { status: 400 })
    }

    // Slugify the NPC name for a stable, filesystem-safe blob key.
    const slug =
      npcName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "npc"
    const ext = file.type === "video/webm" ? "webm" : "mp4"
    const pathname = `videos/${slug}-${kind}.${ext}`

    // allowOverwrite so re-uploading replaces the prior clip at the same path.
    const blob = await put(pathname, file, {
      access: "private",
      allowOverwrite: true,
      contentType: file.type,
    })

    const videoUrl = `/api/file?pathname=${encodeURIComponent(blob.pathname)}`
    const column = kind === "idle" ? "idle_url" : "talking_url"

    // Update the matching column on ALL rows sharing this NPC name.
    const supabase = createAdminClient()
    const { data: updated, error } = await supabase
      .from("npc_encounters")
      .update({ [column]: videoUrl })
      .eq("name", npcName)
      .select("id")

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      videoUrl,
      column,
      pathname: blob.pathname,
      updatedCount: updated?.length ?? 0,
    })
  } catch (error) {
    console.error("[v0] npc-video upload error:", error)
    return NextResponse.json({ error: (error as Error).message || "Upload failed" }, { status: 500 })
  }
}
