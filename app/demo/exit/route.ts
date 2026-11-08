// DEMO MODE — leave the demo.
import { NextResponse, type NextRequest } from 'next/server'
import { DEMO_COOKIE } from '@/lib/demo/client'

export function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL('/welcome', request.url))
  res.cookies.delete(DEMO_COOKIE)
  return res
}
