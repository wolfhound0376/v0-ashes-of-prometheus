import { NextRequest, NextResponse } from 'next/server'

const RUNWAY_API_URL = 'https://api.dev.runwayml.com/v1'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params

    if (!process.env.RUNWAY_API_KEY) {
      return NextResponse.json({ error: 'Runway API key not configured' }, { status: 500 })
    }

    const response = await fetch(`${RUNWAY_API_URL}/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.RUNWAY_API_KEY}`,
        'X-Runway-Version': '2024-11-06',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Runway Status Error]', response.status, errorText)
      return NextResponse.json({ 
        error: 'Failed to check status', 
        details: errorText 
      }, { status: response.status })
    }

    const data = await response.json()
    
    return NextResponse.json({
      taskId: data.id,
      status: data.status, // PENDING, RUNNING, SUCCEEDED, FAILED
      progress: data.progress,
      output: data.output, // Array of video URLs when complete
      failure: data.failure,
      createdAt: data.createdAt,
    })

  } catch (error) {
    console.error('[Runway Status Error]', error)
    return NextResponse.json({ 
      error: 'Failed to check status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
