import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useApp } from '../appctx'
import { useData, useMisCuentas, useMisMovs, useMontoStats } from '../data'
import { cuentaEnStats } from '../lib/calc'
import { fechaLarga, hoy, mesKey, money, sum } from '../lib/fmt'
import type { TipoMov } from '../lib/types'
import { Card, cx, Empty, Input, PageTitle, Select } from '../ui'
import { MesNav, MovRow } from './common'

export default function Movimientos() {
  const { editar } = useApp()
  const { categorias, uid } = useData()
  const cuentas = useMisCuentas()
  const movs = useMisMovs()
  const mstat = useMontoStats()
  const [mes, setMes] = useState(mesKey(hoy()))
  const [tipo, setTipo] = useState<TipoMov | 'todos'>('todos')
  const [cta, setCta] = useState('')
  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    return movs
      .filter((m) => mesKey(m.fecha) === mes)
      .filter((m) => tipo === 'todos' || m.tipo === tipo)
      .filter((m) => !cta || m.cuenta_id === cta || m.cuenta_destino_id === cta)
      .filter((m) => !cat || m.categoria_id === cat)
      .filter((m) => !t || (m.nota ?? '').toLowerCase().includes(t) || (categorias.find((c) => c.id === m.categoria_id)?.nombre ?? '').toLowerCase().includes(t) || String(m.monto).includes(t))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at))
  }, [movs, mes, tipo, cta, cat, q, categorias])

  const grupos = useMemo(() => {
    const g = new Map<string, typeof lista>()
    for (const m of lista) g.set(m.fecha, [...(g.get(m.fecha) ?? []), m])
    return [...g.entries()]
  }, [lista])

  const ing = sum(lista.filter((m) => m.tipo === 'ingreso' && cuentaEnStats(m)).map((m) => m.monto))
  const gas = sum(lista.filter((m) => m.tipo === 'gasto' && cuentaEnStats(m)).map(mstat))

  return (
    <div>
      <PageTitle title="Movimientos" right={<MesNav mes={mes} setMes={setMes} />} />

      <div className="mb-3 grid grid-cols-3 gap-2">
        {([['ingreso', 'Ingresos', ing, 'text-emerald-600'], ['gasto', 'Gastos', gas, 'text-rose-600'], ['todos', 'Balance', ing - gas, '']] as const).map(([k, l, v, t]) => (
          <button key={k} onClick={() => setTipo(tipo === k ? 'todos' : k)}
            className={cx('rounded-2xl bg-white p-3 text-left shadow-sm dark:bg-slate-900', tipo === k && k !== 'todos' && 'ring-2 ring-emerald-500')}>
            <p className="text-xs text-slate-500">{l}</p>
            <p className={cx('tabular text-sm font-bold sm:text-base', t)}>{money(v)}</p>
          </button>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="relative col-span-2">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Buscar nota, categoría o monto" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={cta} onChange={(e) => setCta(e.target.value)}>
          <option value="">Todas las cuentas</option>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </Select>
        <Select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categorias.filter((c) => c.user_id === uid).map((c) => <option key={c.id} value={c.id}>{c.icono} {c.nombre}</option>)}
        </Select>
      </div>

      {grupos.length === 0 ? (
        <Card><Empty icon="🔍" title="No hay movimientos" text="Cambia el mes o los filtros, o registra uno con +." /></Card>
      ) : (
        <div className="space-y-3">
          {grupos.map(([f, ms]) => {
            const neto = sum(ms.filter(cuentaEnStats).map((m) => (m.tipo === 'ingreso' ? Number(m.monto) : m.tipo === 'gasto' ? -mstat(m) : 0)))
            return (
              <Card key={f} className="p-2">
                <div className="flex justify-between px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <span>{fechaLarga(f)}</span>
                  <span className="tabular">{neto > 0 ? '+' : ''}{money(neto)}</span>
                </div>
                {ms.map((m) => <MovRow key={m.id} m={m} onClick={() => editar(m)} />)}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
