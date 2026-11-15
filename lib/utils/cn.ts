import { clsx, type ClassValue } from 'clsx'
export function cn(...inputs: ClassValue[]) { return clsx(inputs) }

const ROLE_LABELS: Record<string, string> = { athlete: 'Atleta', coach: 'Coach', admin: 'Administrador' }
export const roleLabel = (role: string) => ROLE_LABELS[role] ?? role
