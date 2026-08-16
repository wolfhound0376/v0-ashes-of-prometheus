#!/usr/bin/env node
/**
 * upload-media.mjs — Local media -> Vercel Blob + media_manifest.
 *
 * Runs on Sam's machine against the local media tree (C:\WolfDM by default).
 * Uploads each file to Vercel Blob (public) and upserts a row into the
 * media_manifest catalog. Idempotent: files whose checksum already matches the
 * manifest are skipped, so re-running is safe and cheap.
 *
 * ── Requirements ────────────────────────────────────────────────────────────
 *   Node 18+  (global fetch, ESM). Run from the repo root.
 *   Env vars (put them in .env.local, or export them in the shell):
 *     BLOB_READ_WRITE_TOKEN        — Vercel Blob read/write token
 *     NEXT_PUBLIC_SUPABASE_URL     — Supabase project URL
 *     SUPABASE_SERVICE_ROLE_KEY    — service role key (bypasses RLS)
 *   Deps are already in the repo: @vercel/blob, @supabase/supabase-js.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *   node --env-file-if-exists=.env.local scripts/upload-media.mjs --dry-run
 *   node --env-file-if-exists=.env.local scripts/upload-media.mjs
 *   node --env-file-if-exists=.env.local scripts/upload-media.mjs --root "D:\Media" --only music
 *
 *   --root <path>   media tree root       (default: env WOLFDM_ROOT or C:\WolfDM)
 *   --only <kind>   restrict to one kind  (music|npc_face|npc_idle|npc_talking|scene|voice|item_icon|fog)
 *   --dry-run       classify + report, upload/write NOTHING
 *   --prune         report manifest rows whose source file no longer exists (no delete)
 *
 * ── Expected folder layout (maps folder -> kind/pool/slot) ───────────────────
 *   music/<pool>/<slot>/*.mp3     e.g. music/underdark/base/foo.mp3
 *   music/<pool>/*.mp3            slot defaults to "base"
 *                                  pools: underdark, village, combat_default, neutral, ...
 *                                  slots: base | tense | combat
 *   npc/<slug>/face.(png|jpg|webp)
 *   npc/<slug>/idle.(mp4|webm)
 *   npc/<slug>/talking.(mp4|webm)
 *   scenes/<slug>.(png|jpg|webp)
 *   voices/<slug>.(mp3|wav|ogg)
 *   items/<slug>.(png|webp)
 *   fog/<name>.(png|webp)
 *
 * Adjust classify() below if the real C:\WolfDM tree differs.
 */

import { readdir, readFile, stat } from "node:fs/promises"
import { createHash } from "node:crypto"
import { join, relative, sep, extname, basename } from "node:path"
import { put } from "@vercel/blob"
import { createClient } from "@supabase/supabase-js"

// ── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
function flag(name) {
  return args.includes(`--${name}`)
}
function opt(name, fallback) {
  const i = args.indexOf(`--${name}`)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}

const ROOT = opt("root", process.env.WOLFDM_ROOT || "C:\\WolfDM")
const ONLY = opt("only", null)
const DRY_RUN = flag("dry-run")
const PRUNE = flag("prune")

const AUDIO_EXT = new Set([".mp3", ".wav", ".ogg", ".m4a"])
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"])
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov"])

const CONTENT_TYPES = {
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".m4a": "audio/mp4",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
}

// ── classify a file (relative path parts) into a manifest row spec ────────────
// Returns null to skip the file. `pathname` is the deterministic Blob key and
// the manifest idempotency key.
function classify(relPath) {
  const parts = relPath.split(sep)
  const top = (parts[0] || "").toLowerCase()
  const ext = extname(relPath).toLowerCase()
  const file = basename(relPath)
  const stem = file.replace(ext, "")

  if (top === "music" && AUDIO_EXT.has(ext)) {
    // music/<pool>/<slot?>/file  or  music/<pool>/file
    const pool = (parts[1] || "neutral").toLowerCase()
    const maybeSlot = (parts.length >= 4 ? parts[2] : "").toLowerCase()
    const slot = ["base", "tense", "combat"].includes(maybeSlot) ? maybeSlot : "base"
    return {
      kind: "music",
      pool,
      slot,
      name: prettify(stem),
      pathname: `music/${pool}/${slot}/${file}`,
      contentType: CONTENT_TYPES[ext],
    }
  }

  if (top === "npc" && parts.length >= 3) {
    const slug = parts[1].toLowerCase()
    const role = stem.toLowerCase()
    if (role === "face" && IMAGE_EXT.has(ext))
      return { kind: "npc_face", pool: slug, slot: null, name: `${prettify(slug)} face`, pathname: `npc/${slug}/face${ext}`, contentType: CONTENT_TYPES[ext] }
    if (role === "idle" && VIDEO_EXT.has(ext))
      return { kind: "npc_idle", pool: slug, slot: null, name: `${prettify(slug)} idle`, pathname: `npc/${slug}/idle${ext}`, contentType: CONTENT_TYPES[ext] }
    if (role === "talking" && VIDEO_EXT.has(ext))
      return { kind: "npc_talking", pool: slug, slot: null, name: `${prettify(slug)} talking`, pathname: `npc/${slug}/talking${ext}`, contentType: CONTENT_TYPES[ext] }
    return null
  }

  if (top === "scenes" && IMAGE_EXT.has(ext))
    return { kind: "scene", pool: stem.toLowerCase(), slot: null, name: prettify(stem), pathname: `scenes/${file}`, contentType: CONTENT_TYPES[ext] }

  if (top === "voices" && AUDIO_EXT.has(ext))
    return { kind: "voice", pool: stem.toLowerCase(), slot: null, name: prettify(stem), pathname: `voices/${file}`, contentType: CONTENT_TYPES[ext] }

  if (top === "items" && IMAGE_EXT.has(ext))
    return { kind: "item_icon", pool: stem.toLowerCase(), slot: null, name: prettify(stem), pathname: `items/${file}`, contentType: CONTENT_TYPES[ext] }

  if (top === "fog" && IMAGE_EXT.has(ext))
    return { kind: "fog", pool: stem.toLowerCase(), slot: null, name: prettify(stem), pathname: `fog/${file}`, contentType: CONTENT_TYPES[ext] }

  return null
}

function prettify(stem) {
  return stem.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim()
}

async function* walk(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile()) yield full
  }
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex")
}

async function main() {
  console.log(`\n[upload-media] root=${ROOT} dry-run=${DRY_RUN} only=${ONLY ?? "(all)"}\n`)

  // Verify root exists.
  try {
    const s = await stat(ROOT)
    if (!s.isDirectory()) throw new Error("not a directory")
  } catch {
    console.error(`ERROR: media root not found or not a directory: ${ROOT}`)
    console.error(`Pass --root "<path>" or set WOLFDM_ROOT.`)
    process.exit(1)
  }

  const requireEnv = (k) => {
    if (!process.env[k]) {
      console.error(`ERROR: missing env var ${k}`)
      process.exit(1)
    }
    return process.env[k]
  }

  let supabase = null
  let blobToken = null
  if (!DRY_RUN) {
    blobToken = requireEnv("BLOB_READ_WRITE_TOKEN")
    const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
    const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
    supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  }

  // Preload existing manifest (pathname -> checksum) for idempotency.
  const existing = new Map()
  if (supabase) {
    const { data, error } = await supabase.from("media_manifest").select("pathname, checksum")
    if (error) {
      console.error(`ERROR reading media_manifest (is the migration applied?): ${error.message}`)
      process.exit(1)
    }
    for (const row of data ?? []) existing.set(row.pathname, row.checksum)
  }

  const stats = { scanned: 0, skippedUnclassified: 0, skippedUnchanged: 0, uploaded: 0, updated: 0, errors: 0 }
  const seenPathnames = new Set()

  for await (const full of walk(ROOT)) {
    stats.scanned++
    const rel = relative(ROOT, full)
    const spec = classify(rel)
    if (!spec) {
      stats.skippedUnclassified++
      continue
    }
    if (ONLY && spec.kind !== ONLY) continue

    seenPathnames.add(spec.pathname)
    const buf = await readFile(full)
    const checksum = sha256(buf)

    if (existing.has(spec.pathname) && existing.get(spec.pathname) === checksum) {
      stats.skippedUnchanged++
      continue
    }

    const isUpdate = existing.has(spec.pathname)
    if (DRY_RUN) {
      console.log(`${isUpdate ? "UPDATE" : "UPLOAD"}  ${spec.kind.padEnd(12)} ${spec.pathname}`)
      isUpdate ? stats.updated++ : stats.uploaded++
      continue
    }

    try {
      const { url } = await put(spec.pathname, buf, {
        access: "public",
        addRandomSuffix: false, // deterministic pathname == stable idempotency key
        contentType: spec.contentType,
        token: blobToken,
      })

      const { error } = await supabase.from("media_manifest").upsert(
        {
          kind: spec.kind,
          pool: spec.pool,
          slot: spec.slot,
          name: spec.name,
          url,
          pathname: spec.pathname,
          content_type: spec.contentType,
          size: buf.length,
          checksum,
        },
        { onConflict: "pathname" },
      )
      if (error) throw new Error(error.message)

      console.log(`${isUpdate ? "UPDATED" : "UPLOADED"} ${spec.kind.padEnd(12)} ${spec.pathname}`)
      isUpdate ? stats.updated++ : stats.uploaded++
    } catch (err) {
      stats.errors++
      console.error(`FAILED  ${spec.pathname}: ${err.message}`)
    }
  }

  // Optional: report manifest rows with no matching source file (never deletes).
  if (PRUNE && supabase) {
    const orphans = [...existing.keys()].filter((p) => !seenPathnames.has(p))
    if (orphans.length) {
      console.log(`\n[prune] ${orphans.length} manifest row(s) have no source file under ${ROOT}:`)
      for (const p of orphans) console.log(`  orphan  ${p}`)
      console.log(`[prune] review-only; delete manually if intended.`)
    } else {
      console.log(`\n[prune] no orphaned manifest rows.`)
    }
  }

  console.log(
    `\n[upload-media] done. scanned=${stats.scanned} uploaded=${stats.uploaded} updated=${stats.updated} ` +
      `unchanged=${stats.skippedUnchanged} unclassified=${stats.skippedUnclassified} errors=${stats.errors}\n`,
  )
  if (stats.errors) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
