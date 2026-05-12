import { NextRequest, NextResponse } from "next/server"

interface TelemetryPayload {
  character: string
  telemetry: {
    hp?: { current: number; max: number }
    location?: string
    level?: number
    xp?: number
    inventory?: Array<{ id: string; name: string; quantity: number }>
    resources?: {
      action?: number
      bonusAction?: number
      reaction?: number
      spellSlots?: number
    }
    [key: string]: unknown
  }
  intent: string
  currentSha?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: TelemetryPayload = await request.json()
    const { character, telemetry, intent, currentSha } = body

    if (!character || !telemetry) {
      return NextResponse.json(
        { error: "Missing required fields: character and telemetry" },
        { status: 400 }
      )
    }

    const githubToken = process.env.GITHUB_TOKEN
    const repoOwner = process.env.GITHUB_REPO_OWNER
    const repoName = process.env.GITHUB_REPO_NAME

    if (!githubToken || !repoOwner || !repoName) {
      return NextResponse.json(
        { error: "GitHub configuration missing" },
        { status: 500 }
      )
    }

    const filePath = `data/telemetry/${character}_STATUS.json`
    const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`

    // Get current file SHA if not provided
    let sha = currentSha
    if (!sha) {
      try {
        const getResponse = await fetch(apiUrl, {
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        })
        if (getResponse.ok) {
          const fileData = await getResponse.json()
          sha = fileData.sha
        }
      } catch {
        // File doesn't exist yet, which is fine
      }
    }

    const statusData = {
      character,
      telemetry,
      intent,
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    }

    const content = Buffer.from(
      JSON.stringify(statusData, null, 2)
    ).toString("base64")

    const updateBody: {
      message: string
      content: string
      sha?: string
    } = {
      message: `Artifact OS: ${character} - ${intent}`,
      content,
    }

    if (sha) {
      updateBody.sha = sha
    }

    const response = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify(updateBody),
    })

    if (!response.ok) {
      const errorData = await response.json()
      return NextResponse.json(
        { error: "Failed to sync to GitHub", details: errorData },
        { status: response.status }
      )
    }

    const result = await response.json()

    return NextResponse.json({
      status: "Throne Synchronized",
      commit: result.commit?.sha,
      timestamp: statusData.timestamp,
    })
  } catch (error) {
    console.error("Telemetry update error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const character = searchParams.get("character")

  if (!character) {
    return NextResponse.json(
      { error: "Missing character parameter" },
      { status: 400 }
    )
  }

  const githubToken = process.env.GITHUB_TOKEN
  const repoOwner = process.env.GITHUB_REPO_OWNER
  const repoName = process.env.GITHUB_REPO_NAME

  if (!githubToken || !repoOwner || !repoName) {
    return NextResponse.json(
      { error: "GitHub configuration missing" },
      { status: 500 }
    )
  }

  const filePath = `data/telemetry/${character}_STATUS.json`
  const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`

  try {
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Character telemetry not found" },
          { status: 404 }
        )
      }
      return NextResponse.json(
        { error: "Failed to fetch telemetry" },
        { status: response.status }
      )
    }

    const fileData = await response.json()
    const content = Buffer.from(fileData.content, "base64").toString("utf-8")
    const telemetry = JSON.parse(content)

    return NextResponse.json({
      ...telemetry,
      sha: fileData.sha,
    })
  } catch (error) {
    console.error("Telemetry fetch error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
