import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_KEY as string

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

/** Trae todas las filas de una consulta paginando de 1000 en 1000 */
export async function fetchAll<T>(table: string, order = 'created_at'): Promise<T[]> {
  const out: T[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from(table).select('*').order(order, { ascending: true }).range(from, from + page - 1)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < page) break
  }
  return out
}

export function errorMsg(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e)
  if (m.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (m.includes('User already registered')) return 'Ese correo ya tiene cuenta. Inicia sesión.'
  if (m.includes('Email not confirmed')) return 'Confirma tu correo: te enviamos un enlace.'
  if (m.includes('Password should be')) return 'La contraseña debe tener al menos 6 caracteres.'
  if (m.includes('rate limit')) return 'Demasiados intentos. Espera unos minutos.'
  return m
}
