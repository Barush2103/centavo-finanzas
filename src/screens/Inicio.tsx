import { useMemo } from 'react'
import { AlertTriangle, ChevronRight, CreditCard, HandCoins, PiggyBank, Wallet } from 'lucide-react'
import { useApp } from '../appctx'
import { useData, useMisCuentas, useMisMovs, useMontoStats, useNetoCompartidos } from '../data'
import { cuentaEnStats, direccionPara, estadoPrestamo, estadoTarjeta, saldoCuenta } from '../lib/calc'
import { diasHasta, fechaCorta, hoy, mesKey, money, nombreMes, sum } from '../lib/fmt'
import { Bar, Card, cx, Empty, Btn } from '../ui'
import { MovRow, Stat } from './common'

export default function Inicio() {
  const { yo, prestamos, abonos, uid, presupuestos, categoria, nombreDe } = useData()
  const { go, editar, nuevo } = useApp()
  const cuentas = useMisCuentas()
  const movs = useMisMovs()
  const mes = mesKey(hoy())
  const ms = useMontoStats()
  const netoComp = useNetoCompartidos()

  const r = useMemo(() => {
    const saldos = cuentas.map((c) => ({ c, s: saldoCuenta(c, movs) }))
    const liquidez = sum(saldos.filter((x) => ['efectivo', 'debito', 'ahorro'].includes(x.c.tipo)).map((x) => x.s))
    const inversiones = sum(saldos.filter((x) => x.c.tipo === 'inversion').map((x) => x.s))
    const tarjetas = cuentas.filter((c) => c.tipo === 'credito').map((c) => ({ c, e: estadoTarjeta(c, movs) }))
    const deudaTarjetas = sum(tarjetas.map((t) => t.e.deuda))
    const prest = prestamos.filter((p) => !p.cerrado).map((p) => ({ p, e: estadoPrestamo(p, abonos), dir: direccionPara(p, uid) }))
    const meDeben = sum(prest.filter((x) => x.dir === 'me_deben').map((x) => x.e.saldo))
    const debo = sum(prest.filter((x) => x.dir === 'debo').map((x) => x.e.saldo))
    const delMes = movs.filter((m) => mesKey(m.fecha) === mes && cuentaEnStats(m))
    const ingresos = sum(delMes.filter((m) => m.tipo === 'ingreso').map((m) => m.monto))
    const gastos = sum(delMes.filter((m) => m.tipo === 'gasto').map(ms))
    const patrimonio = sum([liquidez, inversiones, -deudaTarjetas, meDeben, -debo, netoComp])
    const pagos = tarjetas.filter((t) => t.e.pagoNoIntereses > 0 && t.e.limite).sort((a, b) => a.e.limite!.localeCompare(b.e.limite!))
    const proximos = tarjetas.filter((t) => t.e.pagoNoIntereses === 0 && t.e.proximoPago > 0 && t.e.proximoLimite).sort((a, b) => a.e.proximoLimite!.localeCompare(b.e.proximoLimite!))
    const pres = presupuestos.filter((p) => p.user_id === uid && Number(p.monto) > 0).map((p) => {
      const gastado = sum(delMes.filter((m) => m.tipo === 'gasto' && m.categoria_id === p.categoria_id).map(ms))
      return { p, gastado, pct: gastado / Number(p.monto) }
    }).sort((a, b) => b.pct - a.pct).slice(0, 4)
    const presTotal = sum(presupuestos.filter((p) => p.user_id === uid).map((p) => p.monto))
    const presGastado = sum(delMes.filter((m) => m.tipo === 'gasto' && presupuestos.some((p) => p.user_id === uid && p.categoria_id === m.categoria_id)).map(ms))
    const proxPrest = prest.filter((x) => x.e.proximaFecha).sort((a, b) => a.e.proximaFecha!.localeCompare(b.e.proximaFecha!)).slice(0, 3)
    return { proximos, liquidez, inversiones, deudaTarjetas, meDeben, debo, ingresos, gastos, patrimonio, pagos, pres, presTotal, presGastado, proxPrest }
  }, [cuentas, movs, prestamos, abonos, uid, presupuestos, mes, ms, netoComp])

  const recientes = [...movs].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at)).slice(0, 6)
  const saludo = new Date().getHours() < 12 ? 'Buenos días' : new Date().getHours() < 19 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-500">{saludo}{yo?.nombre ? `, ${yo.nombre}` : ''}</p>
        <h1 className="text-2xl font-bold capitalize tracking-tight">{nombreMes(mes)}</h1>
      </div>

      <div className="rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 p-5 text-white shadow-lg shadow-emerald-900/20">
        <p className="text-sm text-emerald-100">Dinero disponible</p>
        <p className="tabular text-4xl font-bold tracking-tight">{money(r.liquidez)}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-white/10 px-3 py-2">
            <p className="text-emerald-100">Deuda en tarjetas</p>
            <p className="tabular font-semibold">{money(r.deudaTarjetas)}</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-2">
            <p className="text-emerald-100">Patrimonio neto</p>
            <p className="tabular font-semibold">{money(r.patrimonio)}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold">Este mes</p>
            <button onClick={() => go('movimientos')} className="text-sm font-medium text-emerald-600">Ver todo</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Ingresos" value={r.ingresos} tone="text-emerald-600" small />
            <Stat label="Gastos" value={r.gastos} tone="text-rose-600" small />
            <Stat label="Te queda" value={r.ingresos - r.gastos} tone={r.ingresos - r.gastos >= 0 ? '' : 'text-rose-600'} small />
          </div>
          {r.ingresos > 0 && (
            <div className="mt-3">
              <Bar value={r.gastos / r.ingresos} tone={r.gastos > r.ingresos ? 'rose' : r.gastos / r.ingresos > 0.85 ? 'amber' : 'emerald'} />
              <p className="mt-1 text-xs text-slate-500">Has gastado el {Math.round((r.gastos / r.ingresos) * 100)}% de lo que entró</p>
            </div>
          )}
        </Card>

        <Card onClick={() => go('tarjetas')}>
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-2 font-semibold"><CreditCard size={18} /> Pagos de tarjeta</p>
            <ChevronRight size={18} className="text-slate-400" />
          </div>
          {r.pagos.length === 0 && r.proximos.length === 0 && <p className="py-2 text-sm text-slate-500">Nada pendiente para no generar intereses.</p>}
          {r.pagos.map(({ c, e }) => {
            const d = diasHasta(e.limite!)
            return (
              <div key={c.id} className="flex items-center justify-between border-t border-slate-100 py-2 first:border-0 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />
                  <div>
                    <p className="font-medium">{c.nombre}</p>
                    <p className={cx('text-xs', d < 0 ? 'font-semibold text-rose-600' : d <= 3 ? 'font-semibold text-amber-600' : 'text-slate-500')}>
                      {d < 0 ? `Venció el ${fechaCorta(e.limite!)}` : d === 0 ? 'Vence hoy' : `Paga antes del ${fechaCorta(e.limite!)} · ${d} días`}
                    </p>
                  </div>
                </div>
                <p className="tabular font-semibold">{money(e.pagoNoIntereses)}</p>
              </div>
            )
          })}
          {r.proximos.map(({ c, e }) => (
            <div key={c.id} className="flex items-center justify-between border-t border-slate-100 py-2 first:border-0 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />
                <div>
                  <p className="font-medium">{c.nombre} <span className="text-xs font-normal text-emerald-600">✓ al corriente</span></p>
                  <p className="text-xs text-slate-500">Llevas para el {fechaCorta(e.proximoLimite!)} · corte {fechaCorta(e.proximoCorte!)}</p>
                </div>
              </div>
              <p className="tabular font-medium text-slate-500">{money(e.proximoPago)}</p>
            </div>
          ))}
        </Card>

        <Card onClick={() => go('presupuesto')}>
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-2 font-semibold"><PiggyBank size={18} /> Presupuesto</p>
            <ChevronRight size={18} className="text-slate-400" />
          </div>
          {r.pres.length === 0 ? (
            <p className="py-2 text-sm text-slate-500">Define cuánto quieres gastar por categoría.</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-slate-500"><span className="tabular font-semibold text-slate-900 dark:text-slate-100">{money(r.presTotal - r.presGastado)}</span> libres de {money(r.presTotal)}</p>
              <div className="space-y-2.5">
                {r.pres.map(({ p, gastado, pct }) => {
                  const c = categoria(p.categoria_id)
                  return (
                    <div key={p.id}>
                      <div className="mb-1 flex justify-between text-sm"><span>{c?.icono} {c?.nombre}</span><span className="tabular text-slate-500">{money(gastado)} / {money(p.monto)}</span></div>
                      <Bar value={pct} tone={pct > 1 ? 'rose' : pct > 0.8 ? 'amber' : 'emerald'} />
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </Card>

        <Card onClick={() => go('prestamos')}>
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-2 font-semibold"><HandCoins size={18} /> Préstamos y créditos</p>
            <ChevronRight size={18} className="text-slate-400" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Te deben" value={r.meDeben} tone="text-emerald-600" small />
            <Stat label="Debes" value={r.debo} tone="text-rose-600" small />
          </div>
          {r.proxPrest.map(({ p, e, dir }) => (
            <div key={p.id} className="mt-2 flex items-center justify-between text-sm">
              <span className="truncate text-slate-500">{dir === 'debo' ? 'Pagar a' : 'Cobrar a'} {p.user_id === uid ? p.contraparte_nombre : nombreDe(p.user_id)} · {fechaCorta(e.proximaFecha!)}</span>
              {e.pago && <span className="tabular font-medium">{money(e.pago)}</span>}
            </div>
          ))}
        </Card>
      </div>

      {cuentas.length <= 1 && movs.length === 0 && (
        <Card className="border-dashed">
          <div className="flex items-start gap-3">
            <Wallet className="mt-0.5 shrink-0 text-emerald-600" />
            <div className="flex-1">
              <p className="font-semibold">Empieza en 2 minutos</p>
              <p className="mt-1 text-sm text-slate-500">Da de alta tus cuentas y tarjetas con su saldo de hoy. Luego registra cada gasto con el botón +.</p>
              <Btn variant="soft" className="mt-3" onClick={(e) => { e.stopPropagation(); go('cuentas') }}>Agregar mis cuentas</Btn>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="mb-1 flex items-center justify-between">
          <p className="font-semibold">Últimos movimientos</p>
          <button onClick={() => go('movimientos')} className="text-sm font-medium text-emerald-600">Ver todo</button>
        </div>
        {recientes.length === 0
          ? <Empty icon="🧾" title="Sin movimientos aún" text="Toca + para registrar tu primer gasto o ingreso." action={<Btn onClick={() => nuevo()}>Registrar</Btn>} />
          : <div className="-mx-2">{recientes.map((m) => <MovRow key={m.id} m={m} onClick={() => editar(m)} />)}</div>}
      </Card>

      {r.pagos.some((x) => x.e.vencido) && (
        <p className="flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          <AlertTriangle size={16} /> Tienes un pago de tarjeta vencido: si ya lo hiciste, regístralo como transferencia a la tarjeta.
        </p>
      )}
    </div>
  )
}
