import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { DEMO_COOKIE } from "@/lib/demo/client"
import { createDemoServerClient } from "@/lib/demo/server"

export async function createClient() {
  const cookieStore = await cookies()
  // DEMO MODE: visitors with the demo cookie get fake in-memory data instead of Supabase.
  const demo = cookieStore.get(DEMO_COOKIE)?.value
  if (demo) return createDemoServerClient(demo) as ReturnType<typeof createServerClient>
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: any[]) {
          try { cookiesToSet.forEach(({ name, value, options }: any) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )
}
