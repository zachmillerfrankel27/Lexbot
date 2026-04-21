import { NextRequest, NextResponse } from 'next/server'

const VALID_CODES = (process.env.INVITE_CODES ?? '')
  .split(',')
  .map((c) => c.trim().toLowerCase())
  .filter(Boolean)

const COOKIE = 'orville-access'
// 90-day expiry — long enough that beta users aren't nagged
const MAX_AGE = 60 * 60 * 24 * 90

export async function POST(req: NextRequest) {
  const { code } = await req.json()

  if (!code || !VALID_CODES.includes(String(code).trim().toLowerCase())) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, String(code).trim().toLowerCase(), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  })
  return res
}
