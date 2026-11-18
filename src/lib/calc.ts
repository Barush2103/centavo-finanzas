import type { Abono, Cuenta, Frecuencia, Movimiento, Prestamo } from './types'
import { hoy, iso, parseISO, r2, sum } from './fmt'

/** Efecto de un movimiento sobre el saldo de una cuenta */
export function efecto(m: Movimiento, cuentaId: string): number {
  if (m.tipo === 'ingreso' && m.cuenta_id === cuentaId) return Number(m.monto)
  if (m.tipo === 'gasto' && m.cuenta_id === cuentaId) return -Number(m.monto)
  if (m.tipo === 'transferencia') {
    if (m.cuenta_id === cuentaId) return -Number(m.monto)
    if (m.cuenta_destino_id === cuentaId) return Number(m.monto)
  }
  return 0
}

export function saldoCuenta(c: Cuenta, movs: Movimiento[]): number {
  return r2(Number(c.saldo_inicial) + sum(movs.map((m) => efecto(m, c.id))))
}

/** Los movimientos ligados a préstamos mueven saldos pero no cuentan como gasto/ingreso */
export const cuentaEnStats = (m: Movimiento) => !m.prestamo_id

// ---------------- Tarjetas de crédito ----------------
const dim = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
const corteDelMes = (y: number, m: number, dia: number) => new Date(y, m, Math.min(dia, dim(y, m)))

export function ultimoCorte(diaCorte: number, ref = parseISO(hoy())): Date {
  const este = corteDelMes(ref.getFullYear(), ref.getMonth(), diaCorte)
  if (ref >= este) return este
  return corteDelMes(ref.getFullYear(), ref.getMonth() - 1, diaCorte)
}
export function siguienteCorte(diaCorte: number, ref = parseISO(hoy())): Date {
  const u = ultimoCorte(diaCorte, ref)
  return corteDelMes(u.getFullYear(), u.getMonth() + 1, diaCorte)
}
/** Fecha límite de pago del estado de cuenta que cerró en `corte` */
export function fechaLimite(corte: Date, diaCorte: number, diaPago: number): Date {
  const mismoMes = diaPago > diaCorte
  const y = corte.getFullYear(), m = corte.getMonth() + (mismoMes ? 0 : 1)
  return new Date(y, m, Math.min(diaPago, dim(y, m)))
}

/** Cuántas mensualidades de una compra a MSI ya se facturaron en cortes <= `corte` */
export function msiFacturadas(fechaCompra: string, meses: number, diaCorte: number, corte: Date): number {
  const d = parseISO(fechaCompra)
  let primero = corteDelMes(d.getFullYear(), d.getMonth(), diaCorte)
  if (primero < d) primero = corteDelMes(d.getFullYear(), d.getMonth() + 1, diaCorte)
  if (primero > corte) return 0
  const n = (corte.getFullYear() - primero.getFullYear()) * 12 + (corte.getMonth() - primero.getMonth()) + 1
  return Math.max(0, Math.min(meses, n))
}

export interface EstadoTarjeta {
  deuda: number                 // todo lo que debes hoy (incluye MSI futuros)
  disponible: number | null
  corte: string | null          // último corte
  limite: string | null         // fecha límite de pago de ese corte
  proximoCorte: string | null
  facturado: number             // saldo del estado de cuenta al corte
  pagadoDesdeCorte: number
  pagoNoIntereses: number       // lo que falta pagar antes de la fecha límite
  cargosPeriodo: number         // compras nuevas desde el corte (van al siguiente estado)
  msiPendiente: number          // capital de MSI aún no facturado
  msi: { mov: Movimiento; mensualidad: number; facturadas: number; restante: number }[]
  vencido: boolean
}

export function estadoTarjeta(c: Cuenta, movs: Movimiento[]): EstadoTarjeta {
  const propios = movs.filter((m) => m.cuenta_id === c.id || m.cuenta_destino_id === c.id)
  const saldo = saldoCuenta(c, propios)
  const deuda = r2(Math.max(0, -saldo))
  const disponible = c.limite_credito != null ? r2(Number(c.limite_credito) - deuda) : null
  const msiMovs = propios.filter((m) => m.tipo === 'gasto' && m.cuenta_id === c.id && m.msi_meses)

  if (!c.dia_corte || !c.dia_pago) {
    return {
      deuda, disponible, corte: null, limite: null, proximoCorte: null, facturado: deuda,
      pagadoDesdeCorte: 0, pagoNoIntereses: deuda, cargosPeriodo: 0, msiPendiente: 0, msi: [], vencido: false,
    }
  }
  const corte = ultimoCorte(c.dia_corte)
  const corteS = iso(corte)
  const limite = fechaLimite(corte, c.dia_corte, c.dia_pago)

  // Saldo al corte: todo lo <= corte, pero cada MSI solo aporta las mensualidades ya facturadas
  let saldoCorte = Number(c.saldo_inicial)
  let pagadoDesde = 0
  let cargosPeriodo = 0
  for (const m of propios) {
    const e = efecto(m, c.id)
    if (m.fecha <= corteS) {
      if (m.msi_meses && m.tipo === 'gasto' && m.cuenta_id === c.id) {
        const k = msiFacturadas(m.fecha, m.msi_meses, c.dia_corte, corte)
        saldoCorte -= (Number(m.monto) / m.msi_meses) * k
      } else saldoCorte += e
    } else {
      if (e > 0) pagadoDesde += e
      else if (!m.msi_meses) cargosPeriodo += -e
    }
  }
  const facturado = r2(Math.max(0, -saldoCorte))
  pagadoDesde = r2(pagadoDesde)
  const pagoNoIntereses = r2(Math.max(0, facturado - pagadoDesde))

  const msi = msiMovs.map((m) => {
    const n = m.msi_meses!
    const k = msiFacturadas(m.fecha, n, c.dia_corte!, corte)
    const mensualidad = r2(Number(m.monto) / n)
    return { mov: m, mensualidad, facturadas: k, restante: r2(Number(m.monto) - mensualidad * k) }
  }).filter((x) => x.facturadas < x.mov.msi_meses!)
  const msiPendiente = sum(msi.map((x) => x.restante))

  return {
    deuda, disponible, corte: corteS, limite: iso(limite), proximoCorte: iso(siguienteCorte(c.dia_corte)),
    facturado, pagadoDesdeCorte: pagadoDesde, pagoNoIntereses, cargosPeriodo: r2(cargosPeriodo),
    msiPendiente, msi, vencido: pagoNoIntereses > 0 && iso(limite) < hoy(),
  }
}

// ---------------- Préstamos ----------------
export const periodosAnio: Record<Frecuencia, number> = { semanal: 52, quincenal: 24, mensual: 12 }

export function tasaPeriodo(p: Pick<Prestamo, 'tasa_anual' | 'frecuencia'>) {
  return Number(p.tasa_anual) / 100 / periodosAnio[p.frecuencia]
}

export function pagoFijo(p: Pick<Prestamo, 'monto' | 'tasa_anual' | 'frecuencia' | 'plazo'>): number | null {
  if (!p.plazo) return null
  const P = Number(p.monto), i = tasaPeriodo(p), n = p.plazo
  if (i === 0) return r2(P / n)
  return r2((P * i) / (1 - Math.pow(1 + i, -n)))
}

export function sumarPeriodos(fecha: string, f: Frecuencia, k: number): string {
  const d = parseISO(fecha)
  if (f === 'semanal') d.setDate(d.getDate() + 7 * k)
  else if (f === 'mensual') d.setMonth(d.getMonth() + k)
  else { d.setMonth(d.getMonth() + Math.floor(k / 2)); if (k % 2) d.setDate(d.getDate() + 15) }
  return iso(d)
}

export interface FilaAmort { n: number; fecha: string; pago: number; interes: number; capital: number; saldo: number }

export function tablaAmortizacion(p: Prestamo): FilaAmort[] {
  const pago = pagoFijo(p)
  if (!pago || !p.plazo) return []
  const i = tasaPeriodo(p)
  let saldo = Number(p.monto)
  const filas: FilaAmort[] = []
  for (let k = 1; k <= p.plazo; k++) {
    const interes = r2(saldo * i)
    let capital = r2(pago - interes)
    if (k === p.plazo || capital > saldo) capital = r2(saldo)
    saldo = r2(saldo - capital)
    filas.push({ n: k, fecha: sumarPeriodos(p.fecha_inicio, p.frecuencia, k), pago: r2(capital + interes), interes, capital, saldo })
  }
  return filas
}

export interface EstadoPrestamo {
  saldo: number; pagado: number; intereses: number; capitalPagado: number
  abonos: number; pago: number | null; proximaFecha: string | null; progreso: number
}

export function estadoPrestamo(p: Prestamo, abonos: Abono[]): EstadoPrestamo {
  const lista = abonos.filter((a) => a.prestamo_id === p.id).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.created_at.localeCompare(b.created_at))
  const i = tasaPeriodo(p)
  let saldo = Number(p.monto), intereses = 0
  for (const a of lista) {
    const interes = r2(saldo * i)
    const capital = Math.min(saldo, r2(Number(a.monto) - interes))
    intereses = r2(intereses + Math.min(interes, Number(a.monto)))
    saldo = r2(Math.max(0, saldo - Math.max(0, capital)))
  }
  const pagado = sum(lista.map((a) => a.monto))
  const capitalPagado = r2(Number(p.monto) - saldo)
  return {
    saldo, pagado, intereses, capitalPagado, abonos: lista.length, pago: pagoFijo(p),
    proximaFecha: saldo > 0 && p.plazo ? sumarPeriodos(p.fecha_inicio, p.frecuencia, lista.length + 1) : null,
    progreso: Number(p.monto) > 0 ? Math.min(1, capitalPagado / Number(p.monto)) : 0,
  }
}

/** Dirección del préstamo vista por el usuario actual (si es la contraparte se invierte) */
export function direccionPara(p: Prestamo, uid: string): 'debo' | 'me_deben' {
  if (p.user_id === uid) return p.direccion
  return p.direccion === 'debo' ? 'me_deben' : 'debo'
}
