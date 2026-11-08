// Turns Supabase / network errors into Spanish messages a person can act on.
export function friendlyError(raw: string | undefined | null): string {
  const msg = raw ?? ''
  if (/failed to fetch|networkerror|load failed/i.test(msg))
    return 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.'
  if (msg.includes('Invalid login credentials'))
    return 'Email o contraseña incorrectos. Si te registraste hace poco, primero confirma tu correo.'
  if (msg.includes('Email not confirmed'))
    return 'Tu correo aún no está confirmado. Revisa tu bandeja de entrada (y spam) o reenvía el correo abajo.'
  if (/already registered|already been registered/i.test(msg))
    return 'Ya existe una cuenta con ese email. Inicia sesión o recupera tu contraseña.'
  if (/password should be at least|weak password/i.test(msg))
    return 'La contraseña es muy corta o débil. Usa al menos 8 caracteres.'
  const wait = msg.match(/only request this after (\d+) seconds/i)
  if (wait)
    return `Por seguridad, espera ${wait[1]} segundos antes de pedir otro correo.`
  if (/email rate limit/i.test(msg))
    return 'Se enviaron demasiados correos en poco tiempo. Espera una hora e inténtalo de nuevo; revisa también si ya te llegó uno (y la carpeta de spam).'
  if (/rate limit|too many requests/i.test(msg))
    return 'Demasiados intentos seguidos. Espera unos minutos e inténtalo de nuevo.'
  if (/invalid email|unable to validate email/i.test(msg))
    return 'Ese email no parece válido. Revísalo.'
  if (msg.includes('pr_records_metric_check'))
    return 'Ese tipo de récord aún no está habilitado en el servidor. Pide al administrador aplicar la migración 004.'
  if (/column .* does not exist|could not find the .* column/i.test(msg))
    return 'El servidor no está actualizado para guardar esto. Falta aplicar la migración 004 en Supabase.'
  if (/row-level security|permission denied/i.test(msg))
    return 'No tienes permiso para hacer esto.'
  return msg || 'Algo salió mal. Inténtalo de nuevo.'
}

/** True when PostgREST rejected a write because a column is missing (schema not migrated). */
export function isMissingColumn(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  return err.code === '42703' || err.code === 'PGRST204' || /column .* (does not exist|of .* in the schema cache)/i.test(err.message ?? '')
}

/** True when the query failed because a table doesn't exist yet (migration not run). */
export function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  return err.code === '42P01' || err.code === 'PGRST205' || /(relation|table) .* (does not exist|in the schema cache)/i.test(err.message ?? '')
}
