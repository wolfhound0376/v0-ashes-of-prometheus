import { NextRequest, NextResponse } from 'next/server'

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1'

// Voice IDs for dark/sinister voices - using "Adam" as base, will apply settings for raspy effect
// You can change this to a custom cloned voice ID if you create one
const VECNA_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB' // Adam - deep male voice

// Voice settings for raspy, sinister effect
const VOICE_SETTINGS = {
  stability: 0.3,        // Lower = more variation, more dramatic
  similarity_boost: 0.7, // Higher = more consistent to voice
  style: 0.8,            // Higher = more expressive
  use_speaker_boost: true
}

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json()

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 })
    }

    // Generate speech with ElevenLabs
    const response = await fetch(
      `${ELEVENLABS_API_URL}/text-to-speech/${VECNA_VOICE_ID}/stream`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1', // or eleven_multilingual_v2 for more languages
          voice_settings: VOICE_SETTINGS,
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error('ElevenLabs error:', error)
      return NextResponse.json(
        { error: 'Failed to generate speech', details: error },
        { status: response.status }
      )
    }

    // Stream the audio back
    const audioBuffer = await response.arrayBuffer()
    
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    })
  } catch (error) {
    console.error('Speech generation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET endpoint to list available voices
export async function GET() {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 })
    }

    const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
      headers: {
        'xi-api-key': apiKey,
      },
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch voices' }, { status: response.status })
    }

    const data = await response.json()
    
    // Filter to show voices good for dark/sinister characters
    const recommendedVoices = data.voices
      .filter((v: any) => 
        v.labels?.accent === 'british' || 
        v.labels?.age === 'old' ||
        v.labels?.description?.toLowerCase().includes('deep') ||
        v.name.toLowerCase().includes('adam') ||
        v.name.toLowerCase().includes('arnold')
      )
      .map((v: any) => ({
        voice_id: v.voice_id,
        name: v.name,
        labels: v.labels,
        preview_url: v.preview_url,
      }))

    return NextResponse.json({
      current_voice_id: VECNA_VOICE_ID,
      recommended_voices: recommendedVoices,
      all_voices: data.voices.map((v: any) => ({
        voice_id: v.voice_id,
        name: v.name,
        labels: v.labels,
      })),
    })
  } catch (error) {
    console.error('Voice list error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
