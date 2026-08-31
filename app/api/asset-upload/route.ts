import { type NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// ============================================================================
// THE WAY IN — uploads that land where the game actually looks.
//
// The board reads rigs from the `models` bucket and lib/sfx.ts resolves every
// cue name against `vtt-assets/sfx`. Both upload routes that predate this one
// (/api/upload, /api/music/upload) write to Vercel Blob instead, which nothing
// reads from — so anything they accepted still had to be moved by hand before
// it reached the table. This route writes to the Supabase buckets themselves.
//
// WHY A SIGNED URL AND NOT THE BYTES: a rigged, animated .glb runs to tens of
// megabytes and a serverless request body does not. So the client asks here for
// a signed URL, PUTs the file straight to Supabase, and comes back to `commit`
// to have the database column written. Nothing large ever passes through this
// function.
//
// Only the kinds with a `target` become live by writing a row. Sound, music and
// spell icons are indexed by a typed manifest in code (lib/sfx.ts,
// lib/music-library.ts), not by a table — for those, upload puts the file in
// the right place and the manifest still has to name it.
// ============================================================================

type Kind = 'token-model' | 'scene-vfx' | 'sfx' | 'music' | 'spell-icon'

interface KindSpec {
  bucket: string
  extensions: RegExp
  /** Folder inside the bucket. `group` is the school/category where one applies. */
  folder: (group?: string) => string
  /** Where the public URL is written so the game picks it up. Null: code manifest. */
  target: { table: string; column: string; labelColumn: string } | null
  /** Offered as `group` in the UI; empty when the kind has no subfolders. */
  groups: string[]
  hint: string
}

const KINDS: Record<Kind, KindSpec> = {
  'token-model': {
    bucket: 'models',
    extensions: /\.(glb|gltf)$/i,
    // Rigs are per-character: models/<slug>/rig.glb. Without a slug the file
    // lands in _incoming/, which is where loose uploads already collect.
    folder: (group) => (group ? group : '_incoming'),
    target: { table: 'vtt_tokens', column: 'model_url', labelColumn: 'label' },
    groups: [],
    hint: 'Goes live on the board as soon as the token row is written.',
  },
  'scene-vfx': {
    bucket: 'vtt-assets',
    extensions: /\.(png|webp|jpg|jpeg|gif|mp4|webm)$/i,
    folder: () => 'scene-vfx',
    target: { table: 'scene_effects', column: 'asset_url', labelColumn: 'name' },
    groups: [],
    hint: 'Composited over the stage using the row’s blend mode and trigger.',
  },
  sfx: {
    bucket: 'vtt-assets',
    extensions: /\.(mp3|wav|ogg|opus|webm|m4a)$/i,
    folder: (group) => `sfx/${group || 'ui'}`,
    target: null,
    groups: ['magic', 'combat', 'movement', 'creature', 'ui'],
    hint: 'lib/sfx.ts resolves cues by name — add the name there to play it.',
  },
  music: {
    bucket: 'vtt-assets',
    extensions: /\.(mp3|wav|ogg|opus|m4a)$/i,
    folder: (group) => `music/${group || 'ambient'}`,
    target: null,
    groups: ['combat', 'exploration', 'tension', 'dungeon', 'ambient'],
    hint: 'Declare the track in lib/music-library.ts for it to be selectable.',
  },
  'spell-icon': {
    bucket: 'vtt-assets',
    extensions: /\.(webp|png|svg)$/i,
    folder: () => 'spell-icons',
    target: null,
    groups: [],
    hint: 'Named by slug and looked up by the spellbook at render time.',
  },
}

function isKind(v: unknown): v is Kind {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(KINDS, v)
}

/** Storage keys are path segments; keep them boring so nothing needs escaping. */
function safeName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-{2,}/g, '-')
}

function publicUrlFor(bucket: string, path: string): string {
  return supabaseAdmin.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

// ---------------------------------------------------------------------------
// GET — what is still missing, so the page can list it rather than ask Sam to
// remember. Only meaningful for kinds backed by a table.
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get('kind')

  if (!isKind(kind)) {
    return NextResponse.json(
      { error: `Unknown asset kind. Expected one of: ${Object.keys(KINDS).join(', ')}` },
      { status: 400 },
    )
  }

  const spec = KINDS[kind]
  if (!spec.target) {
    return NextResponse.json({ kind, rows: [], manifestOnly: true, hint: spec.hint })
  }

  const { table, column, labelColumn } = spec.target
  // A template-literal column list defeats supabase-js's select parser, which
  // types the result from the literal. The tables here are small, so ask for
  // everything and pick the three fields out by hand.
  const { data, error } = await supabaseAdmin
    .from(table)
    .select('*')
    .order(labelColumn, { ascending: true })

  if (error) {
    console.error('[asset-upload] listing failed:', error.message)
    return NextResponse.json({ error: `Could not read ${table}: ${error.message}` }, { status: 500 })
  }

  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    label: String(row[labelColumn] ?? '(unnamed)'),
    url: (row[column] as string | null) || null,
  }))

  return NextResponse.json({
    kind,
    manifestOnly: false,
    hint: spec.hint,
    rows,
    missing: rows.filter((r) => !r.url).length,
  })
}

// ---------------------------------------------------------------------------
// POST — two steps: `sign` hands back a URL to upload to, `commit` writes the
// row that makes the uploaded file live.
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const action = body.action
  if (action === 'sign') return sign(body)
  if (action === 'commit') return commit(body)
  return NextResponse.json({ error: 'action must be "sign" or "commit".' }, { status: 400 })
}

async function sign(body: Record<string, unknown>) {
  const { kind, filename } = body
  const group = typeof body.group === 'string' ? safeName(body.group) : undefined

  if (!isKind(kind)) {
    return NextResponse.json({ error: 'Unknown asset kind.' }, { status: 400 })
  }
  if (typeof filename !== 'string' || !filename.trim()) {
    return NextResponse.json({ error: 'A filename is required.' }, { status: 400 })
  }

  const spec = KINDS[kind]
  if (!spec.extensions.test(filename)) {
    return NextResponse.json(
      { error: `That file type is not accepted for ${kind}. Expected ${spec.extensions.source}.` },
      { status: 400 },
    )
  }

  const path = `${spec.folder(group)}/${safeName(filename)}`

  // upsert so re-uploading a corrected file replaces it rather than piling up
  // near-duplicates the manifest would then have to choose between.
  const { data, error } = await supabaseAdmin.storage
    .from(spec.bucket)
    .createSignedUploadUrl(path, { upsert: true })

  if (error || !data) {
    console.error('[asset-upload] could not sign:', error?.message)
    return NextResponse.json(
      { error: `Storage would not issue an upload URL: ${error?.message ?? 'unknown reason'}` },
      { status: 500 },
    )
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    bucket: spec.bucket,
    path,
    publicUrl: publicUrlFor(spec.bucket, path),
    writesRow: Boolean(spec.target),
    hint: spec.hint,
  })
}

async function commit(body: Record<string, unknown>) {
  const { kind, rowId, publicUrl } = body

  if (!isKind(kind)) {
    return NextResponse.json({ error: 'Unknown asset kind.' }, { status: 400 })
  }
  const spec = KINDS[kind]
  if (!spec.target) {
    return NextResponse.json(
      { error: `${kind} is indexed by a manifest in code, so there is no row to write.` },
      { status: 400 },
    )
  }
  if (typeof rowId !== 'string' || !rowId) {
    return NextResponse.json({ error: 'rowId is required to write the asset onto a row.' }, { status: 400 })
  }
  if (typeof publicUrl !== 'string' || !publicUrl.startsWith('http')) {
    return NextResponse.json({ error: 'publicUrl is required and must be a URL.' }, { status: 400 })
  }

  const { table, column, labelColumn } = spec.target
  const { data, error } = await supabaseAdmin
    .from(table)
    .update({ [column]: publicUrl })
    .eq('id', rowId)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[asset-upload] commit failed:', error.message)
    return NextResponse.json({ error: `Could not write ${table}.${column}: ${error.message}` }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: `No ${table} row with that id.` }, { status: 404 })
  }

  const row = data as unknown as Record<string, unknown>
  return NextResponse.json({
    id: String(row.id),
    label: String(row[labelColumn] ?? '(unnamed)'),
    url: String(row[column] ?? ''),
  })
}
