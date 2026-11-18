import { useMemo, useState } from 'react'
import { CalendarClock, Plus } from 'lucide-react'
import { useApp } from '../appctx'
import { useMisCuentas, useMisMovs } from '../data'
import { estadoTarjeta } from '../lib/calc'
import { diasHasta, fechaCorta, money, sum } from '../lib/fmt'
import { Bar, Btn, Card, cx, Empty, PageTitle } from '../ui'
import MsiPrevios from './MsiPrevios'
import type { Cuenta } from '../lib/types'

export default function Tarjetas() {
  const { nuevo, go } = useApp()
  const cuentas = useMisCuentas()
  const movs = useMisMovs()
  const [msiDe, setMsiDe] = useState<Cuenta | null>(null)
  const debito = cuentas.find((c) => c.tipo === 'debito') ?? cuentas.find((c) => c.tipo !== 'credito')

  const tarjetas = useMemo(() => cuentas.filter((c) => c.tipo === 'credito').map((c) => ({ c, e: estadoTarjeta(c, movs) }))
    .sort((a, b) => (a.e.limite ?? '9').localeCompare(b.e.limite ?? '9')), [cuentas, movs])

  if (!tarjetas.length) {
    return (
      <div>
        <PageTitle title="Tarjetas de crédito" />
        <Card><Empty icon="💳" title="Aún no tienes tarjetas" text="Agrega tus tarjetas con su día de corte y de pago para saber exactamente cuánto pagar y no generar intereses." action={<Btn onClick={() => go('cuentas')}>Agregar tarjeta</Btn>} /></Card>
      </div>
    )
  }

  const totalDeuda = sum(tarjetas.map((t) => t.e.deuda))
  const totalPagar = sum(tarjetas.map((t) => t.e.pagoNoIntereses))
  const totalMsi = sum(tarjetas.map((t) => t.e.msiPendiente))

  return (
    <div>
      <PageTitle title="Tarjetas de crédito" />
      <Card className="mb-4">
        <div className="grid grid-cols-3 gap-2">
          <div><p className="text-xs text-slate-500">A pagar este ciclo</p><p className={cx('tabular text-lg font-bold', totalPagar > 0 ? 'text-rose-600' : 'text-emerald-600')}>{money(totalPagar)}</p></div>
          <div><p className="text-xs text-slate-500">Deuda total</p><p className="tabular text-lg font-bold">{money(totalDeuda)}</p></div>
          <div><p className="text-xs text-slate-500">MSI por venir</p><p className="tabular text-lg font-bold">{money(totalMsi)}</p></div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {tarjetas.map(({ c, e }) => {
          const d = e.limite ? diasHasta(e.limite) : null
          const uso = c.limite_credito ? e.deuda / Number(c.limite_credito) : 0
          return (
            <Card key={c.id} className="overflow-hidden p-0">
              <div className="p-4 text-white" style={{ background: `linear-gradient(135deg, ${c.color}, ${c.color}cc)` }}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm opacity-80">{c.nombre}</p>
                    <p className="tabular text-3xl font-bold tracking-tight">{money(e.deuda)}</p>
                    <p className="text-xs opacity-80">deuda total</p>
                  </div>
                  <span className="text-2xl">💳</span>
                </div>
                {c.limite_credito && (
                  <div className="mt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, uso * 100)}%` }} /></div>
                    <p className="mt-1 text-xs opacity-90">Disponible {money(e.disponible ?? 0)} de {money(Number(c.limite_credito))} · uso {Math.round(uso * 100)}%</p>
                  </div>
                )}
              </div>

              <div className="space-y-3 p-4">
                {e.limite ? (
                  <div className={cx('rounded-2xl p-3', e.pagoNoIntereses === 0 ? 'bg-emerald-50 dark:bg-emerald-950/50' : d! < 0 ? 'bg-rose-50 dark:bg-rose-950/50' : d! <= 5 ? 'bg-amber-50 dark:bg-amber-950/40' : 'bg-slate-50 dark:bg-slate-800/60')}>
                    <p className="text-xs font-medium text-slate-500">Pago para no generar intereses</p>
                    <p className="tabular text-2xl font-bold">{money(e.pagoNoIntereses)}</p>
                    <p className={cx('text-sm', e.pagoNoIntereses === 0 ? 'text-emerald-700 dark:text-emerald-300' : d! < 0 ? 'font-semibold text-rose-600' : d! <= 5 ? 'font-semibold text-amber-700' : 'text-slate-600 dark:text-slate-300')}>
                      {e.pagoNoIntereses === 0 ? '✓ Ya cubriste este estado de cuenta' : d! < 0 ? `Venció el ${fechaCorta(e.limite)}` : d === 0 ? 'Vence hoy' : `Fecha límite: ${fechaCorta(e.limite)} (faltan ${d} días)`}
                    </p>
                  </div>
                ) : <p className="text-sm text-amber-600">Configura día de corte y de pago en Cuentas para calcular tu pago.</p>}

                {e.proximoLimite && (e.proximoPago > 0 || e.pagoNoIntereses === 0) && (
                  <div className="flex items-center justify-between rounded-2xl border border-dashed border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                    <div><p className="font-medium">Siguiente pago</p><p className="text-xs text-slate-500">Corte {fechaCorta(e.proximoCorte!)} · límite {fechaCorta(e.proximoLimite)} · se va sumando</p></div>
                    <p className="tabular text-lg font-bold">{money(e.proximoPago)}</p>
                  </div>
                )}

                {e.corte && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <Linea l={`Saldo al corte (${fechaCorta(e.corte)})`} v={e.facturado} />
                    <Linea l="Pagado desde el corte" v={e.pagadoDesdeCorte} tone="text-emerald-600" />
                    <Linea l="Compras nuevas (sig. estado)" v={e.cargosPeriodo} />
                    <p className="flex items-center gap-1 text-slate-500"><CalendarClock size={14} /> Próximo corte {fechaCorta(e.proximoCorte!)}</p>
                  </div>
                )}

                {e.msi.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Meses sin intereses</p>
                    <div className="space-y-2">
                      {e.msi.map((x) => {
                        const tot = Number((x.mov.nota ?? '').match(/\((\d+) meses\)$/)?.[1] ?? 0)
                        const de = x.mov.es_saldo_inicial && tot >= x.mov.msi_meses! ? tot : x.mov.msi_meses!
                        const van = de - x.mov.msi_meses! + x.facturadas
                        const nombre = (x.mov.nota || 'Compra').replace(/ \(\d+ meses\)$/, '')
                        return (
                        <div key={x.mov.id}>
                          <div className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="min-w-0 truncate font-medium">{nombre}</span>
                            <span className="tabular shrink-0 text-xs text-slate-500">{van} de {de}</span>
                          </div>
                          <div className="flex justify-between text-xs text-slate-500">
                            <span className="tabular">{money(x.mensualidad)} al mes</span>
                            <span className="tabular">faltan {money(x.restante)}</span>
                          </div>
                          <Bar value={van / de} tone="sky" />
                        </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <button onClick={() => setMsiDe(c)} className="w-full rounded-2xl border border-dashed border-sky-300 py-2.5 text-sm font-semibold text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/40">
                  + MSI que ya traes {e.msi.length ? `(${e.msi.length} registrados)` : ''}
                </button>

                <div className="flex gap-2 pt-1">
                  <Btn className="flex-1" onClick={() => nuevo({ tipo: 'transferencia', cuenta_id: debito?.id, cuenta_destino_id: c.id, monto: e.pagoNoIntereses || undefined })}>Registrar pago</Btn>
                  <Btn variant="ghost" onClick={() => nuevo({ tipo: 'gasto', cuenta_id: c.id })}><Plus size={18} /> Compra</Btn>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
      <MsiPrevios cuenta={msiDe} onClose={() => setMsiDe(null)} />
      <p className="mt-4 text-xs text-slate-500">El cálculo usa tus movimientos registrados: saldo al corte (con solo la mensualidad de cada compra a MSI) menos lo que has pagado después del corte. No incluye intereses ni comisiones del banco; compáralo con tu estado de cuenta.</p>
    </div>
  )
}

function Linea({ l, v, tone }: { l: string; v: number; tone?: string }) {
  return <div><p className="text-xs text-slate-500">{l}</p><p className={cx('tabular font-semibold', tone)}>{money(v)}</p></div>
}
