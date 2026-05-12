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

    // Create a unique filename with folder prefix
    const timestamp = Date.now()
    const filename = `${folder}/${timestamp}-${file.name}`

    console.log('[v0] Uploading file:', filename, 'Size:', file.size)

    // Use private access since the blob store is configured as private
    const blob = await put(filename, file, {
      access: 'private',
    })

    console.log('[v0] Upload successful:', blob.pathname)

    // Return the pathname for use with our delivery route
    return NextResponse.json({ 
      url: `/api/file?pathname=${encodeURIComponent(blob.pathname)}`,
      pathname: blob.pathname,
      directUrl: blob.url
    })
  } catch (error) {
    console.error('[v0] Upload error:', error)
    return NextResponse.json({ 
      error: 'Upload failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
