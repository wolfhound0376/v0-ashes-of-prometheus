import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

// Uploaded art displays at a few hundred px at most; 1600px keeps generous
// headroom (zoom, retina) while cutting multi-MB camera/AI exports down to
// size before they ever reach Blob storage. GIFs pass through untouched so
// animations survive.
const MAX_DIMENSION = 1600
const RESIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const folder = formData.get('folder') as string || 'assets'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP' }, { status: 400 })
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB' }, { status: 400 })
    }

    // Resize once at the door, at high quality, so Blob bandwidth stays sane.
    // Any failure here falls back to storing the original bytes untouched.
    let body: Buffer | File = file
    if (RESIZABLE.has(file.type)) {
      try {
        const input = Buffer.from(await file.arrayBuffer())
        const image = sharp(input).rotate() // honour EXIF orientation
        const meta = await image.metadata()
        const oversize = (meta.width ?? 0) > MAX_DIMENSION || (meta.height ?? 0) > MAX_DIMENSION
        const pipeline = oversize
          ? image.resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
          : image
        const optimized =
          file.type === 'image/png'
            ? await pipeline.png({ compressionLevel: 9 }).toBuffer() // keeps transparency
            : file.type === 'image/webp'
              ? await pipeline.webp({ quality: 92 }).toBuffer()
              : await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer()
        // Only keep the re-encode if it actually helped.
        body = optimized.length < file.size ? optimized : input
      } catch (resizeError) {
        console.error('[v0] upload: resize skipped, storing original:', resizeError)
        body = file
      }
    }

    // Generate safe filename
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const pathname = `${folder}/${timestamp}-${safeName}`

    // Upload to Blob storage with private access
    const blob = await put(pathname, body, {
      access: 'private',
    })

    // Return the pathname for use with the file proxy route
    return NextResponse.json({ 
      pathname: blob.pathname,
      url: `/api/file?pathname=${encodeURIComponent(blob.pathname)}`
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: (error as Error).message || 'Upload failed' },
      { status: 500 }
    )
  }
}
