import { ArrowLeftRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { useData } from '../data'
import { money, nombreMes, sumarMeses } from '../lib/fmt'
import type { Movimiento } from '../lib/types'
import { cx } from '../ui'

export function MovRow({ m, onClick }: { m: Movimiento; onClick?: () => void }) {
  const { categoria, cuenta } = useData()
  const cat = categoria(m.categoria_id)
  const c = cuenta(m.cuenta_id)
  const d = cuenta(m.cuenta_destino_id)
  const signo = m.tipo === 'ingreso' ? '+' : m.tipo === 'gasto' ? '−' : ''
  const tono = m.tipo === 'ingreso' ? 'text-emerald-600' : m.tipo === 'gasto' ? 'text-slate-900 dark:text-slate-100' : 'text-sky-600'
  const titulo = m.tipo === 'transferencia'
    ? (d?.tipo === 'credito' ? `Pago a ${d.nombre}` : `${c?.nombre ?? ''} → ${d?.nombre ?? ''}`)
    : (m.nota || cat?.nombre || (m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'))
  const sub = [
    m.tipo !== 'transferencia' && m.nota ? cat?.nombre : null,
    m.tipo !== 'transferencia' ? c?.nombre : null,
    m.msi_meses ? `${m.msi_meses} MSI` : null,
    m.compartido_id ? 'Compartido' : null,
    m.prestamo_id ? 'Préstamo' : null,
    m.es_saldo_inicial ? 'MSI previo' : null,
  ].filter(Boolean).join(' · ')
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-slate-800/60">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg" style={{ background: (cat?.color ?? '#0ea5e9') + '1f' }}>
        {m.tipo === 'transferencia' ? <ArrowLeftRight size={18} className="text-sky-600" /> : cat?.icono ?? '•'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{titulo}</p>
        {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
      </div>
      <p className={cx('tabular shrink-0 font-semibold', tono)}>{signo}{money(m.monto)}</p>
    </button>
  )
}

export function MesNav({ mes, setMes }: { mes: string; setMes: (m: string) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-2xl bg-white p-1 shadow-sm dark:bg-slate-900">
      <button onClick={() => setMes(sumarMeses(mes, -1))} className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Mes anterior"><ChevronLeft size={18} /></button>
      <span className="min-w-[8.5rem] text-center text-sm font-semibold capitalize">{nombreMes(mes)}</span>
      <button onClick={() => setMes(sumarMeses(mes, 1))} className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Mes siguiente"><ChevronRight size={18} /></button>
    </div>
  )
}

export function Stat({ label, value, tone, small }: { label: string; value: number; tone?: string; small?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cx('tabular font-bold tracking-tight', small ? 'text-lg' : 'text-2xl', tone)}>{money(value)}</p>
    </div>
  )
}
