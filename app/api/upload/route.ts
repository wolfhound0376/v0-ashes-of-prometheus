import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { type NextRequest, NextResponse } from 'next/server'

// This route handles client-side upload token generation
// The actual file upload goes directly to Blob storage, bypassing this server
export async function POST(request: NextRequest) {
  const body = await request.json() as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Validate and authorize the upload
        // You can add authentication checks here
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
          maximumSizeInBytes: 10 * 1024 * 1024, // 10MB
          tokenPayload: JSON.stringify({
            uploadedAt: Date.now(),
          }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Called after upload is complete
        // You can update your database here
        console.log('Upload completed:', blob.pathname)
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    )
  }
}
