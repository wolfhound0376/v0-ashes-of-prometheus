import { list } from '@vercel/blob'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const { blobs } = await list({ prefix: 'music/' })

    const tracks = blobs
      .filter(blob => blob.pathname.match(/\.(mp3|wav|ogg)$/i))
      .map((blob) => {
        const parts = blob.pathname.split('/')
        const filename = parts.pop() || 'unknown'
        const category = parts.length > 1 ? parts[1] : 'ambient'
        
        return {
          url: blob.url,
          pathname: blob.pathname,
          filename: filename.replace(/\.(mp3|wav|ogg)$/i, ''),
          category,
          size: blob.size,
          uploadedAt: blob.uploadedAt
        }
      })

    // Group by category
    const grouped = tracks.reduce((acc, track) => {
      if (!acc[track.category]) acc[track.category] = []
      acc[track.category].push(track)
      return acc
    }, {} as Record<string, typeof tracks>)

    return NextResponse.json({ tracks, grouped })
  } catch (error) {
    console.error('Error listing music:', error)
    return NextResponse.json({ error: 'Failed to list music' }, { status: 500 })
  }
}
