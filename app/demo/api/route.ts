// DEMO MODE — the browser demo client sends its queries here.
import { NextResponse, type NextRequest } from 'next/server'
import { DEMO_COOKIE } from '@/lib/demo/client'
import { runDemo } from '@/lib/demo/server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BODY = 64 * 1024

const fail = (message: string, status: number) => NextResponse.json({ data: null, error: { message } }, { status })

export async function POST(request: NextRequest) {
  // Only session ids this server issued (see /demo), so nobody can create stores at will.
  const id = request.cookies.get(DEMO_COOKIE)?.value
  if (!id || !UUID.test(id)) return fail('No hay demo activa', 401)

  // Same-site requests only.
  const origin = request.headers.get('origin')
  if (origin && origin !== request.nextUrl.origin) return fail('Origen no permitido', 403)

  const raw = await request.text()
  if (raw.length > MAX_BODY) return fail('Solicitud demasiado grande', 413)

  let spec: unknown
  try { spec = JSON.parse(raw) } catch { return fail('Solicitud inválida', 400) }
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return fail('Solicitud inválida', 400)

  try {
    return NextResponse.json(runDemo(id, spec as Parameters<typeof runDemo>[1]))
  } catch {
    return fail('No se pudo procesar la solicitud', 400)
  }
}
