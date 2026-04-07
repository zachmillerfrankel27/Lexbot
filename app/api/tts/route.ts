import { NextRequest, NextResponse } from 'next/server'

const ELEVEN_BASE = 'https://api.elevenlabs.io/v1'

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    // Signal the client to fall back to browser speech synthesis
    return NextResponse.json({ error: 'No ElevenLabs key configured' }, { status: 503 })
  }

  try {
    const { text } = await req.json()
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    const voiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'

    const response = await fetch(`${ELEVEN_BASE}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.60,
          similarity_boost: 0.85,
          style: 0.0,
          use_speaker_boost: true,
          speed: 0.9,
        },
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('ElevenLabs error:', response.status, errText)
      return NextResponse.json(
        { error: 'ElevenLabs request failed' },
        { status: 502 }
      )
    }

    const audioBuffer = await response.arrayBuffer()

    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audioBuffer.byteLength),
        // Allow the client to play the audio immediately
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('TTS route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
