// Media helpers shared by the dashboard and the DM asset panel.
//
// Assets are stored as bare URLs with no type column, so "is this a video?" is
// answered by the extension. Blob URLs go through /api/file?pathname=… so the
// extension sits inside a query parameter — the regex therefore has to tolerate
// a following & or end-of-string as well as ? and #.

/** MP4/WebM/MOV, whether the extension is in the path or a query parameter. */
export function isVideoUrl(u: string | null | undefined): boolean {
  if (!u) return false
  if (/\.(mp4|webm|mov)(%3F|%23|[?#&]|$)/i.test(u)) return true
  // decodeURIComponent throws URIError on a malformed escape (a stray "%" in a
  // filename is enough). This runs during render, so an uncaught throw takes the
  // whole tab down — fall back to "not a video" instead.
  try {
    return /\.(mp4|webm|mov)$/i.test(decodeURIComponent(u).split(/[?#]/)[0])
  } catch {
    return false
  }
}

/** What a media drop zone accepts: stills and loops together. */
export const MEDIA_ACCEPT = "image/*,video/mp4,video/webm"

/** Server-side allow list. MOV is deliberately absent — Seedance and Runway
 *  both export .mov, but browsers cannot play it reliably, so it must be
 *  transcoded to MP4 before upload rather than silently accepted here.
 *
 *  SVG is also deliberately absent. An SVG can carry <script>, and while it is
 *  inert inside the <img> tags this panel renders, opening the blob URL directly
 *  would execute it. Nothing in the panel needs vector art. */
export const ALLOWED_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
]

export const MAX_MEDIA_BYTES = 50 * 1024 * 1024

/** Filesystem-safe key fragment, matching the convention in /api/npc-video. */
export function slugify(raw: string, fallback = "asset"): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback
  )
}

export function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case "video/webm":
      return "webm"
    case "video/mp4":
      return "mp4"
    case "image/jpeg":
      return "jpg"
    case "image/webp":
      return "webp"
    case "image/gif":
      return "gif"
    case "image/svg+xml":
      return "svg"
    default:
      return "png"
  }
}
