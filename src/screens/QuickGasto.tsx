import { useCallback, useEffect, useMemo, useState } from 'react'
import { Delete, SlidersHorizontal, Zap } from 'lucide-react'
import { useData, useMisCuentas, useMisMovs, useMontoStats } from '../data'
import { saldoCuenta } from '../lib/calc'
import { hoy, money, r2, sum } from '../lib/fmt'
import { errorMsg, supabase } from '../lib/supabase'
import type { TipoCuenta } from '../lib/types'
import { cx, Sheet, toast } from '../ui'
import type { Preset } from './MovForm'

const LAST = 'centavo:ultimaCuenta'
type Metodo = 'efectivo' | 'debito' | 'credito'
const METODOS: { m: Metodo; label: string; icon: string; tipos: TipoCuenta[] }[] = [
  { m: 'efectivo', label: 'Efectivo', icon: '💵', tipos: ['efectivo'] },
  { m: 'debito', label: 'Débito', icon: '🏦', tipos: ['debito', 'ahorro'] },
  { m: 'credito', label: 'Crédito', icon: '💳', tipos: ['credito'] },
]
const metodoDe = (t?: TipoCuenta): Metodo => (t === 'credito' ? 'credito' : t === 'efectivo' ? 'efectivo' : 'debito')

export default function QuickGasto({ open, onClose, onAvanzado }: { open: boolean; onClose: () => void; onAvanzado: (p: Preset) => void }) {
  const { categorias, uid, recargar, cuenta } = useData()
  const cuentas = useMisCuentas()
  const movs = useMisMovs()
  const ms = useMontoStats()

  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState<Metodo>('efectivo')
  const [cta, setCta] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const [catManual, setCatManual] = useState(false)
  const [nota, setNota] = useState('')
  const [todas, setTodas] = useState(false)
  const [busy, setBusy] = useState(false)

  // Al abrir: última cuenta usada
  useEffect(() => {
    if (!open) return
    const last = cuentas.find((c) => c.id === localStorage.getItem(LAST)) ?? cuentas.find((c) => c.tipo === 'efectivo') ?? cuentas[0]
    setMonto(''); setCat(null); setCatManual(false); setNota(''); setTodas(false)
    setCta(last?.id ?? ''); setMetodo(metodoDe(last?.tipo))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const gastosMios = useMemo(() => movs.filter((m) => m.tipo === 'gasto' && !m.prestamo_id), [movs])

  const catsGasto = useMemo(() => {
    const uso = new Map<string, number>()
    for (const m of gastosMios) if (m.categoria_id) uso.set(m.categoria_id, (uso.get(m.categoria_id) ?? 0) + 1)
    return categorias.filter((c) => c.user_id === uid && c.tipo === 'gasto' && !c.archivada)
      .sort((a, b) => (uso.get(b.id) ?? 0) - (uso.get(a.id) ?? 0) || a.orden - b.orden)
  }, [categorias, gastosMios, uid])

  // Frecuentes: misma nota + categoría + cuenta, al menos 2 veces en los últimos 90 días
  const frecuentes = useMemo(() => {
    const desde = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
    const g = new Map<string, { n: number; nota: string; cat: string | null; cta: string; monto: number; fecha: string }>()
    for (const m of gastosMios) {
      if (m.fecha < desde || !cuenta(m.cuenta_id) || cuenta(m.cuenta_id)?.archivada) continue
      const k = `${(m.nota ?? '').trim().toLowerCase()}|${m.categoria_id}|${m.cuenta_id}`
      const prev = g.get(k)
      if (!prev) g.set(k, { n: 1, nota: (m.nota ?? '').trim(), cat: m.categoria_id, cta: m.cuenta_id, monto: Number(m.monto), fecha: m.fecha })
      else { prev.n++; if (m.fecha >= prev.fecha) { prev.monto = Number(m.monto); prev.fecha = m.fecha } }
    }
    return [...g.values()].filter((x) => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 8)
  }, [gastosMios, cuenta])

  // Sugerir categoría según la nota (lo que usaste antes con esa palabra)
  useEffect(() => {
    if (catManual) return
    const t = nota.trim().toLowerCase()
    if (t.length < 3) return
    const hit = [...gastosMios].sort((a, b) => b.fecha.localeCompare(a.fecha)).find((m) => m.categoria_id && (m.nota ?? '').toLowerCase().includes(t))
    if (hit) setCat(hit.categoria_id)
  }, [nota, catManual, gastosMios])

  const cuentasMetodo = cuentas.filter((c) => METODOS.find((x) => x.m === metodo)!.tipos.includes(c.tipo))
  const valor = r2(Number(monto || '0'))
  const hoyGastado = sum(gastosMios.filter((m) => m.fecha === hoy()).map(ms))
  const sel = cuenta(cta)

  function elegirMetodo(m: Metodo) {
    setMetodo(m)
    const lista = cuentas.filter((c) => METODOS.find((x) => x.m === m)!.tipos.includes(c.tipo))
    if (!lista.some((c) => c.id === cta)) setCta(lista[0]?.id ?? '')
  }

  const tecla = useCallback((k: string) => {
    setMonto((v) => {
      if (k === 'del') return v.slice(0, -1)
      if (k === '.') return v.includes('.') ? v : (v || '0') + '.'
      if (v.includes('.') && v.split('.')[1].length >= 2) return v
      if (v.replace('.', '').length >= 9) return v
      if (v === '0') return k
      return v + k
    })
  }, [])

  async function guardar(over?: { monto: number; cta: string; cat: string | null; nota: string }) {
    const m = over?.monto ?? valor
    const c = over?.cta ?? cta
    if (m <= 0) return toast('Escribe cuánto gastaste', 'err')
    if (!c) return toast(`No tienes cuenta de ${METODOS.find((x) => x.m === metodo)!.label.toLowerCase()}. Agrégala en Más → Cuentas`, 'err')
    setBusy(true)
    const row = { tipo: 'gasto', monto: m, fecha: hoy(), cuenta_id: c, categoria_id: over ? over.cat : cat, nota: (over ? over.nota : nota).trim() || null }
    const { error } = await supabase.from('centavo_movimientos').insert(row)
    setBusy(false)
    if (error) return toast(errorMsg(error), 'err')
    localStorage.setItem(LAST, c)
    if (navigator.vibrate) navigator.vibrate(15)
    toast(`✓ ${money(m)} con ${cuenta(c)?.nombre ?? ''}`)
    await recargar('movimientos')
    onClose()
  }

  // Teclado físico (computadora)
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') { if (e.key === 'Enter') guardar(); return }
      if (/^[0-9]$/.test(e.key)) tecla(e.key)
      else if (e.key === '.' || e.key === ',') tecla('.')
      else if (e.key === 'Backspace') tecla('del')
      else if (e.key === 'Enter') guardar()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  const avanzado = () => onAvanzado({ tipo: 'gasto', monto: valor || undefined, cuenta_id: cta, categoria_id: cat ?? undefined, nota })
  const disponible = sel && sel.tipo !== 'credito' ? saldoCuenta(sel, movs) : null

  return (
    <Sheet open={open} onClose={onClose} title="Gasto rápido"
      footer={
        <button onClick={() => guardar()} disabled={busy || valor <= 0}
          className="w-full rounded-2xl bg-rose-600 py-4 text-lg font-bold text-white transition active:scale-[.98] disabled:bg-slate-300 dark:disabled:bg-slate-700">
          {busy ? 'Guardando…' : valor > 0 ? `Guardar ${money(valor)}${sel ? ` · ${sel.nombre}` : ''}` : 'Escribe el monto'}
        </button>
      }>
      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
        <span>Hoy llevas <b className="tabular text-slate-700 dark:text-slate-200">{money(hoyGastado)}</b></span>
        <button onClick={avanzado} className="flex items-center gap-1 font-medium text-emerald-600"><SlidersHorizontal size={14} /> Ingreso, MSI, fecha…</button>
      </div>

      {frecuentes.length > 0 && (
        <div className="no-scrollbar -mx-5 mb-2 flex gap-2 overflow-x-auto px-5 pb-1">
          {frecuentes.map((f, i) => {
            const c = catsGasto.find((x) => x.id === f.cat)
            return (
              <button key={i} disabled={busy} onClick={() => guardar({ monto: f.monto, cta: f.cta, cat: f.cat, nota: f.nota })}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 active:scale-95 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                <Zap size={13} /> {c?.icono} {f.nota || c?.nombre} <span className="tabular">{money(f.monto)}</span> <span className="text-xs opacity-70">· {cuenta(f.cta)?.nombre}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Monto */}
      <div className="flex items-baseline justify-center gap-1 py-1">
        <span className="text-3xl font-semibold text-rose-400">$</span>
        <span className={cx('tabular text-6xl font-bold tracking-tight', monto ? 'text-rose-600' : 'text-slate-300 dark:text-slate-600')}>{monto || '0'}</span>
      </div>

      {/* Con qué pagaste */}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {METODOS.map((x) => {
          const hay = cuentas.some((c) => x.tipos.includes(c.tipo))
          return (
            <button key={x.m} type="button" onClick={() => elegirMetodo(x.m)}
              className={cx('flex flex-col items-center rounded-2xl border-2 py-2 text-sm font-semibold transition active:scale-95',
                metodo === x.m ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60',
                !hay && 'opacity-40')}>
              <span className="text-2xl leading-none">{x.icon}</span>{x.label}
            </button>
          )
        })}
      </div>
      {cuentasMetodo.length > 1 && (
        <div className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5">
          {cuentasMetodo.map((c) => (
            <button key={c.id} onClick={() => setCta(c.id)}
              className={cx('flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium', cta === c.id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800')}>
              <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />{c.nombre}
            </button>
          ))}
        </div>
      )}
      {cuentasMetodo.length === 0 && <p className="mt-2 text-center text-xs text-amber-600">No tienes cuentas de este tipo. Agrégalas en Más → Cuentas.</p>}
      {disponible != null && valor > 0 && valor > disponible && <p className="mt-1 text-center text-xs text-amber-600">Solo tienes {money(disponible)} registrados en {sel?.nombre}.</p>}

      {/* Categoría */}
      <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
        {(todas ? catsGasto : catsGasto.slice(0, 7)).map((c) => (
          <button key={c.id} onClick={() => { setCat(c.id === cat ? null : c.id); setCatManual(true) }}
            className={cx('flex w-16 shrink-0 flex-col items-center rounded-2xl py-1.5 text-[11px] font-medium leading-tight', cat === c.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800')}>
            <span className="text-xl">{c.icono}</span><span className="w-full truncate px-1 text-center">{c.nombre}</span>
          </button>
        ))}
        {!todas && catsGasto.length > 7 && (
          <button onClick={() => setTodas(true)} className="flex w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-slate-100 text-[11px] font-medium dark:bg-slate-800"><span className="text-xl">⋯</span>Más</button>
        )}
      </div>

      <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="¿En qué? (opcional: tacos, uber, súper…)"
        className="mt-2 w-full rounded-xl bg-slate-100 px-3 py-2.5 text-[15px] outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500/30 dark:bg-slate-800" />

      {/* Teclado numérico */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => (
          <button key={k} type="button" onClick={() => tecla(k)}
            className="flex h-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl font-semibold transition active:scale-95 active:bg-slate-200 dark:bg-slate-800 dark:active:bg-slate-700"
            aria-label={k === 'del' ? 'Borrar' : k}>
            {k === 'del' ? <Delete size={24} /> : k}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
