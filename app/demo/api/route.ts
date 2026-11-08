// DEMO MODE — the browser demo client sends its queries here.
import { NextResponse, type NextRequest } from 'next/server'
import { DEMO_COOKIE } from '@/lib/demo/client'
import { runDemo } from '@/lib/demo/server'

export async function POST(request: NextRequest) {
  const id = request.cookies.get(DEMO_COOKIE)?.value
  if (!id) return NextResponse.json({ data: null, error: { message: 'No hay demo activa' } }, { status: 401 })
  const spec = await request.json()
  return NextResponse.json(runDemo(id, spec))
}
