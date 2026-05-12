import { NextRequest, NextResponse } from 'next/server'
import type { TelemetryPayload, TelemetryResponse } from '@/lib/types/telemetry'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const GITHUB_REPO = process.env.GITHUB_REPO || 'wolfhound0376/v0-ashes-of-prometheus'
const TELEMETRY_PATH = 'data/telemetry/SESSION_STATE.json'

// GET - Fetch current telemetry state from GitHub
export async function GET(request: NextRequest) {
  if (!GITHUB_TOKEN) {
    return NextResponse.json({ 
      success: false, 
      message: 'GitHub token not configured' 
    }, { status: 500 })
  }

  try {
    const [owner, repo] = GITHUB_REPO.split('/')
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${TELEMETRY_PATH}`
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    })

    if (response.status === 404) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No telemetry file found',
      })
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`)
    }

    const data = await response.json()
    const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'))
    
    return NextResponse.json({
      success: true,
      data: content,
      sha: data.sha,
      message: 'Telemetry fetched successfully',
      timestamp: new Date().toISOString(),
    })

  } catch (error) {
    console.error('Error fetching telemetry:', error)
    return NextResponse.json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Failed to fetch telemetry' 
    }, { status: 500 })
  }
}

// POST - Push new telemetry state to GitHub
export async function POST(request: NextRequest) {
  if (!GITHUB_TOKEN) {
    return NextResponse.json({ 
      success: false, 
      message: 'GitHub token not configured. Set GITHUB_TOKEN environment variable.' 
    }, { status: 500 })
  }

  try {
    const payload: TelemetryPayload = await request.json()
    
    // Validate required fields
    if (!payload.active_character || !payload.timestamp) {
      return NextResponse.json({ 
        success: false, 
        message: 'Missing required fields: active_character, timestamp' 
      }, { status: 400 })
    }

    const [owner, repo] = GITHUB_REPO.split('/')
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${TELEMETRY_PATH}`

    // First, try to get the current file to get its SHA (needed for updates)
    let existingSha: string | undefined
    try {
      const getResponse = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })
      if (getResponse.ok) {
        const existingData = await getResponse.json()
        existingSha = existingData.sha
      }
    } catch {
      // File doesn't exist yet, that's fine
    }

    // Encode the payload as base64
    const content = Buffer.from(JSON.stringify(payload, null, 2)).toString('base64')

    // Create or update the file
    const updateResponse = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `[Telemetry] ${payload.active_character} - ${payload.action_type} @ ${payload.timestamp}`,
        content: content,
        sha: existingSha,
        branch: 'main',
      }),
    })

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json()
      throw new Error(`GitHub API error: ${JSON.stringify(errorData)}`)
    }

    const result = await updateResponse.json()

    const response: TelemetryResponse = {
      success: true,
      sha: result.content.sha,
      message: 'Telemetry pushed successfully',
      timestamp: new Date().toISOString(),
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Error pushing telemetry:', error)
    return NextResponse.json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Failed to push telemetry' 
    }, { status: 500 })
  }
}
