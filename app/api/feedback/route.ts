import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { lastResponse, note, mode, timestamp } = await req.json()
    // Logged to Vercel function output — visible in the Vercel dashboard under Logs
    console.log('[Orville Feedback]', JSON.stringify({
      timestamp,
      mode,
      note: note?.trim() || '(no note)',
      lastResponse: lastResponse?.slice(0, 300),
    }, null, 2))
    return NextResponse.json({ ok: true })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Feedback log error:', msg)
    return NextResponse.json({ error: 'Failed to log feedback' }, { status: 500 })
  }
}
