import { useMemo, useState } from 'react'
import { useData, useMisMovs, useMontoStats } from '../data'
import { cuentaEnStats } from '../lib/calc'
import { hoy, mesKey, money, parseMonto, sum } from '../lib/fmt'
import { errorMsg, supabase } from '../lib/supabase'
import type { Categoria } from '../lib/types'
import { Bar, Btn, Card, cx, Field, Input, PageTitle, Sheet, toast } from '../ui'
import { MesNav } from './common'

export default function Presupuesto() {
  const { categorias, presupuestos, uid } = useData()
  const movs = useMisMovs()
  const ms = useMontoStats()
  const [mes, setMes] = useState(mesKey(hoy()))
  const [edit, setEdit] = useState<Categoria | null>(null)

  const filas = useMemo(() => {
    const gastosMes = movs.filter((m) => m.tipo === 'gasto' && mesKey(m.fecha) === mes && cuentaEnStats(m))
    return categorias.filter((c) => c.user_id === uid && c.tipo === 'gasto' && !c.archivada).map((c) => {
      const p = presupuestos.find((x) => x.user_id === uid && x.categoria_id === c.id)
      const gastado = sum(gastosMes.filter((m) => m.categoria_id === c.id).map(ms))
      const limite = p ? Number(p.monto) : 0
      return { c, limite, gastado, pct: limite ? gastado / limite : 0 }
    })
  }, [categorias, presupuestos, movs, mes, uid, ms])

  const con = filas.filter((f) => f.limite > 0).sort((a, b) => b.pct - a.pct)
  const sin = filas.filter((f) => f.limite === 0).sort((a, b) => b.gastado - a.gastado)
  const total = sum(con.map((f) => f.limite))
  const gastado = sum(con.map((f) => f.gastado))
  const sinPres = sum(sin.map((f) => f.gastado))
  const esActual = mes === mesKey(hoy())
  const [y, m] = mes.split('-').map(Number)
  const diasRest = esActual ? new Date(y, m, 0).getDate() - new Date().getDate() + 1 : 0
  const libre = total - gastado

  return (
    <div>
      <PageTitle title="Presupuesto" sub="Límite mensual por categoría" right={<MesNav mes={mes} setMes={setMes} />} />

      <Card className="mb-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-slate-500">{libre >= 0 ? 'Te queda' : 'Te pasaste por'}</p>
            <p className={cx('tabular text-3xl font-bold tracking-tight', libre < 0 && 'text-rose-600')}>{money(Math.abs(libre))}</p>
            <p className="text-sm text-slate-500">de {money(total)} presupuestados · quincena {money(total / 2)}</p>
          </div>
          {esActual && libre > 0 && diasRest > 0 && (
            <div className="text-right">
              <p className="text-xs text-slate-500">Puedes gastar al día</p>
              <p className="tabular text-lg font-bold text-emerald-600">{money(libre / diasRest)}</p>
              <p className="text-xs text-slate-500">{diasRest} días restantes</p>
            </div>
          )}
        </div>
        {total > 0 && <div className="mt-3"><Bar value={gastado / total} tone={gastado > total ? 'rose' : gastado / total > 0.8 ? 'amber' : 'emerald'} /></div>}
        {sinPres > 0 && <p className="mt-2 text-xs text-slate-500">Además gastaste {money(sinPres)} en categorías sin presupuesto.</p>}
      </Card>

      {con.length > 0 && (
        <Card className="mb-4">
          <div className="space-y-4">
            {con.map(({ c, limite, gastado, pct }) => (
              <button key={c.id} onClick={() => setEdit(c)} className="block w-full text-left">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium">{c.icono} {c.nombre}</span>
                  <span className="tabular text-sm"><span className={cx('font-semibold', pct > 1 && 'text-rose-600')}>{money(gastado)}</span><span className="text-slate-500"> / {money(limite)}</span></span>
                </div>
                <Bar value={pct} tone={pct > 1 ? 'rose' : pct > 0.8 ? 'amber' : 'emerald'} />
                <p className="mt-1 text-xs text-slate-500">{pct > 1 ? `Excedido por ${money(gastado - limite)}` : `Quedan ${money(limite - gastado)}`}</p>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <p className="mb-2 font-semibold">{con.length ? 'Sin presupuesto' : 'Toca una categoría para ponerle límite'}</p>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {sin.map(({ c, gastado }) => (
            <button key={c.id} onClick={() => setEdit(c)} className="flex w-full items-center justify-between py-2.5 text-left">
              <span>{c.icono} {c.nombre}</span>
              <span className="flex items-center gap-3"><span className="tabular text-sm text-slate-500">{gastado ? money(gastado) : ''}</span><span className="text-sm font-medium text-emerald-600">Definir</span></span>
            </button>
          ))}
        </div>
      </Card>

      <PresForm cat={edit} onClose={() => setEdit(null)} />
    </div>
  )
}

function PresForm({ cat, onClose }: { cat: Categoria | null; onClose: () => void }) {
  const { presupuestos, uid, recargar } = useData()
  const actual = cat ? presupuestos.find((p) => p.user_id === uid && p.categoria_id === cat.id) : undefined
  const [v, setV] = useState('')
  const [k, setK] = useState<string | null>(null)
  if (cat && k !== cat.id) { setK(cat.id); setV(actual ? String(actual.monto) : '') }
  if (!cat && k) setK(null)

  async function guardar(forzar?: number) {
    if (!cat) return
    const monto = forzar ?? parseMonto(v)
    const { error } = monto > 0
      ? await supabase.from('centavo_presupuestos').upsert({ user_id: uid, categoria_id: cat.id, monto }, { onConflict: 'user_id,categoria_id' })
      : await supabase.from('centavo_presupuestos').delete().eq('user_id', uid).eq('categoria_id', cat.id)
    if (error) return toast(errorMsg(error), 'err')
    await recargar('presupuestos'); toast(monto > 0 ? 'Presupuesto guardado' : 'Presupuesto quitado'); onClose()
  }

  return (
    <Sheet open={!!cat} onClose={onClose} title={cat ? `${cat.icono} ${cat.nombre}` : ''}
      footer={<div className="flex gap-2">{actual && <Btn variant="danger" onClick={() => guardar(0)}>Quitar</Btn>}<Btn className="flex-1" onClick={() => guardar()}>Guardar</Btn></div>}>
      <Field label="Límite mensual" hint="Se repite cada mes. Pon 0 para quitarlo.">
        <Input autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="0.00" onKeyDown={(e) => e.key === 'Enter' && guardar()} />
      </Field>
      {parseMonto(v) > 0 && <p className="text-sm text-slate-500">≈ {money(parseMonto(v) / 2)} por quincena · {money((parseMonto(v) * 12) / 365)} al día</p>}
    </Sheet>
  )
}
