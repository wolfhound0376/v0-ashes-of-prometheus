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

    const blob = await put(filename, file, {
      access: 'public',
    })

    return NextResponse.json({ 
      url: blob.url,
      pathname: blob.pathname 
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
