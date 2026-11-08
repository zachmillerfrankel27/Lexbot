import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { event, mode, level } = await req.json()

    const inviteCode = req.cookies.get('orville-access')?.value ?? 'unknown'
    const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
    // Truncate IP to first two octets for privacy
    const ip = rawIp.split('.').slice(0, 2).join('.') + '.x.x'

    console.log(
      JSON.stringify({
        event: event ?? 'session_start',
        mode,
        level: level || null,
        code: inviteCode,
        ip,
        ts: new Date().toISOString(),
      })
    )
  } catch {
    // Best-effort — never fail the client over analytics
  }

  return new NextResponse(null, { status: 204 })
}
