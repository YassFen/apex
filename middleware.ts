import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // DEMO MODE: the demo runs on fake data, so there's no Supabase session to check.
  if (request.cookies.get('apex_demo')?.value) {
    if (request.nextUrl.pathname.startsWith('/auth') || request.nextUrl.pathname === '/welcome') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as any)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname.startsWith('/auth')
  const path = request.nextUrl.pathname
  const isPublic =
    path === '/' || path === '/welcome' || path.startsWith('/demo') ||
    path.startsWith('/athlete/')

  if (!user && !isAuthRoute && !isPublic) {
    // Opening the app cold shows the welcome screen; deep links go straight to the login form.
    return NextResponse.redirect(new URL(path === '/dashboard' ? '/welcome' : '/auth/login', request.url))
  }

  // The reset link signs the person in, and they still need the reset page to pick a new password.
  const isAuthFlow =
    request.nextUrl.pathname.startsWith('/auth/callback') ||
    request.nextUrl.pathname.startsWith('/auth/reset-password')

  if (user && isAuthRoute && !isAuthFlow) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons).*)'],
}
