import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'

// Use edge runtime which has no body size limit (up to 100MB)
export const runtime = 'edge'

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

    // Upload to blob storage with public access
    const blob = await put(filename, file, {
      access: 'public',
    })

    return NextResponse.json({ 
      url: blob.url,
      pathname: blob.pathname
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ 
      error: 'Upload failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
