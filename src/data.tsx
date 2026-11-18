import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { fetchAll, supabase } from './lib/supabase'
import type { Abono, Categoria, Compartido, Contacto, Cuenta, Movimiento, Parte, Perfil, Presupuesto, Prestamo } from './lib/types'

export interface Datos {
  perfiles: Perfil[]
  contactos: Contacto[]
  cuentas: Cuenta[]
  categorias: Categoria[]
  movimientos: Movimiento[]
  presupuestos: Presupuesto[]
  prestamos: Prestamo[]
  abonos: Abono[]
  compartidos: Compartido[]
  partes: Parte[]
}

const vacio: Datos = { perfiles: [], contactos: [], cuentas: [], categorias: [], movimientos: [], presupuestos: [], prestamos: [], abonos: [], compartidos: [], partes: [] }

const tablas: Record<keyof Datos, [string, string]> = {
  perfiles: ['centavo_perfiles', 'created_at'],
  contactos: ['centavo_contactos', 'created_at'],
  cuentas: ['centavo_cuentas', 'orden'],
  categorias: ['centavo_categorias', 'orden'],
  movimientos: ['centavo_movimientos', 'fecha'],
  presupuestos: ['centavo_presupuestos', 'created_at'],
  prestamos: ['centavo_prestamos', 'created_at'],
  abonos: ['centavo_abonos', 'fecha'],
  compartidos: ['centavo_compartidos', 'fecha'],
  partes: ['centavo_compartidos_partes', 'id'],
}

interface Ctx extends Datos {
  session: Session | null
  uid: string
  yo: Perfil | null
  cargando: boolean
  error: string | null
  recargar: (...que: (keyof Datos)[]) => Promise<void>
  nombreDe: (id: string | null | undefined) => string
  cuenta: (id: string | null | undefined) => Cuenta | undefined
  categoria: (id: string | null | undefined) => Categoria | undefined
}

const DataCtx = createContext<Ctx | null>(null)

export function DataProvider({ session, children }: { session: Session; children: ReactNode }) {
  const [d, setD] = useState<Datos>(vacio)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const uid = session.user.id

  const recargar = useCallback(async (...que: (keyof Datos)[]) => {
    const keys = (que.length ? que : (Object.keys(tablas) as (keyof Datos)[]))
    try {
      const res = await Promise.all(keys.map((k) => fetchAll(tablas[k][0], tablas[k][1])))
      setD((prev) => {
        const next = { ...prev }
        keys.forEach((k, i) => { (next as Record<string, unknown>)[k] = res[i] })
        return next
      })
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    setCargando(true)
    recargar().finally(() => setCargando(false))
    const onFocus = () => { if (document.visibilityState === 'visible') recargar() }
    document.addEventListener('visibilitychange', onFocus)
    return () => document.removeEventListener('visibilitychange', onFocus)
  }, [recargar, uid])

  const value = useMemo<Ctx>(() => {
    const perf = new Map(d.perfiles.map((p) => [p.id, p]))
    const ctas = new Map(d.cuentas.map((c) => [c.id, c]))
    const cats = new Map(d.categorias.map((c) => [c.id, c]))
    return {
      ...d, session, uid, cargando, error, recargar,
      yo: perf.get(uid) ?? null,
      nombreDe: (id) => (!id ? '' : id === uid ? 'Tú' : perf.get(id)?.nombre || perf.get(id)?.email || 'Alguien'),
      cuenta: (id) => (id ? ctas.get(id) : undefined),
      categoria: (id) => (id ? cats.get(id) : undefined),
    }
  }, [d, session, uid, cargando, error, recargar])

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>
}

export function useData() {
  const c = useContext(DataCtx)
  if (!c) throw new Error('useData fuera de DataProvider')
  return c
}

/** Mis cuentas activas (no archivadas), ordenadas */
export function useMisCuentas() {
  const { cuentas, uid } = useData()
  return useMemo(() => cuentas.filter((c) => c.user_id === uid && !c.archivada).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)), [cuentas, uid])
}

export function useMisMovs() {
  const { movimientos, uid } = useData()
  return useMemo(() => movimientos.filter((m) => m.user_id === uid), [movimientos, uid])
}

/** Monto que cuenta en estadísticas: en gastos compartidos solo tu parte */
export function useMontoStats() {
  const { partes, uid } = useData()
  return useMemo(() => {
    const mia = new Map(partes.filter((p) => p.user_id === uid).map((p) => [p.compartido_id, Number(p.monto)]))
    return (m: Movimiento) => (m.tipo === 'gasto' && m.compartido_id && mia.has(m.compartido_id) ? mia.get(m.compartido_id)! : Number(m.monto))
  }, [partes, uid])
}

/** Saldo neto de gastos compartidos (positivo = te deben) */
export function useNetoCompartidos() {
  const { compartidos, partes, uid } = useData()
  return useMemo(() => {
    let n = 0
    for (const g of compartidos) for (const p of partes) {
      if (p.compartido_id !== g.id || p.liquidado) continue
      if (g.pagado_por === uid && p.user_id !== uid) n += Number(p.monto)
      if (g.pagado_por !== uid && p.user_id === uid) n -= Number(p.monto)
    }
    return Math.round(n * 100) / 100
  }, [compartidos, partes, uid])
}

export { supabase }
