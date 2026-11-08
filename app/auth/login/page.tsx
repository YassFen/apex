export const dynamic = 'force-dynamic'

import { LoginForm } from './LoginForm'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ confirmed?: string; error?: string; email?: string }> }) {
  const sp = await searchParams
  return <LoginForm confirmed={sp.confirmed === '1'} initialError={sp.error ?? ''} initialEmail={sp.email ?? ''} />
}
