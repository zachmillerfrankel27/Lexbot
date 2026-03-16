import { NextRequest, NextResponse } from 'next/server'

const VALID_CODES = (process.env.INVITE_CODES ?? '')
  .split(',')
  .map((c) => c.trim().toLowerCase())
  .filter(Boolean)

const COOKIE = 'lexbot-access'
const UNLOCK_PATH = '/unlock'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Always allow the unlock page and its API handler
  if (pathname.startsWith(UNLOCK_PATH) || pathname.startsWith('/api/unlock')) {
    return NextResponse.next()
  }

  // If no invite codes are configured, allow everything (dev mode)
  if (VALID_CODES.length === 0) return NextResponse.next()

  const cookie = req.cookies.get(COOKIE)?.value ?? ''
  if (VALID_CODES.includes(cookie)) return NextResponse.next()

  // Redirect to unlock page, preserving the intended destination
  const url = req.nextUrl.clone()
  url.pathname = UNLOCK_PATH
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimisation)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
