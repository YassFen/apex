// DEMO MODE — /demo starts a demo session (cookie) and opens the app with fake data.
import { NextResponse, type NextRequest } from 'next/server'
import { DEMO_COOKIE } from '@/lib/demo/client'

export function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL('/dashboard', request.url))
  // Every visit to /demo starts from fresh demo data.
  const id = crypto.randomUUID()
  res.cookies.set(DEMO_COOKIE, id, { path: '/', maxAge: 60 * 60 * 6, sameSite: 'lax' })
  return res
}
