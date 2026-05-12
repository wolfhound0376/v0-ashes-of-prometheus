import { NextRequest, NextResponse } from 'next/server'

const RUNWAY_API_URL = 'https://api.dev.runwayml.com/v1'

export async function POST(request: NextRequest) {
  try {
    const { prompt, animationState, referenceImage } = await request.json()

    if (!process.env.RUNWAY_API_KEY) {
      return NextResponse.json({ error: 'Runway API key not configured' }, { status: 500 })
    }

    // Build the prompt based on animation state
    const statePrompts: Record<string, string> = {
      idle: 'A skeletal lich in dark robes sits motionless on a gothic throne, subtle breathing movement, glowing purple eyes pulsing slowly, dark castle background with floating candles, cinematic lighting',
      speaking: 'A skeletal lich in dark robes speaks with menacing gestures, jaw moving, glowing purple eyes intensifying, ethereal energy wisps around hands, dark castle throne room, dramatic lighting',
      thinking: 'A skeletal lich in dark robes contemplates deeply, head tilted, fingers steepled, glowing purple eyes dimming then brightening, arcane symbols floating nearby, dark atmospheric lighting',
      casting: 'A skeletal lich in dark robes channels powerful magic, arms raised, intense purple and green energy swirling, glowing eyes blazing bright, magical runes appearing, dramatic spell effects',
      laughing: 'A skeletal lich in dark robes laughs menacingly, shoulders shaking, jaw open wide, glowing purple eyes flickering with amusement, dark castle background, eerie green light',
    }

    const fullPrompt = prompt || statePrompts[animationState] || statePrompts.idle

    // Start a generation task with Runway Gen-3 Alpha Turbo
    const response = await fetch(`${RUNWAY_API_URL}/image_to_video`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RUNWAY_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Runway-Version': '2024-11-06',
      },
      body: JSON.stringify({
        model: 'gen3a_turbo',
        promptImage: referenceImage || undefined,
        promptText: fullPrompt,
        duration: 5, // 5 or 10 seconds
        ratio: '16:9',
        watermark: false,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Runway API Error]', response.status, errorText)
      return NextResponse.json({ 
        error: 'Runway API error', 
        details: errorText,
        status: response.status 
      }, { status: response.status })
    }

    const data = await response.json()
    
    return NextResponse.json({
      taskId: data.id,
      status: 'PENDING',
    })

  } catch (error) {
    console.error('[Runway Generate Error]', error)
    return NextResponse.json({ 
      error: 'Failed to start generation',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
