import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'

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

    // Generate safe filename
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const pathname = `${folder}/${timestamp}-${safeName}`

    // Upload to Blob storage with private access
    const blob = await put(pathname, file, {
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
