import { redirect } from 'next/navigation'

// Supabase falls back to the Site URL (this page) when a redirect URL isn't
// allow-listed, so forward auth links to the callback instead of dropping them.
export default async function Home({ searchParams }: {
  searchParams: Promise<{ code?: string; token_hash?: string; type?: string; error_description?: string }>
}) {
  const sp = await searchParams
  if (sp.code || sp.token_hash || sp.error_description) {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(sp)) if (typeof v === 'string') params.set(k, v)
    redirect(`/auth/callback?${params.toString()}`)
  }
  redirect('/dashboard')
}
