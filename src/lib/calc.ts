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
// Modelo bancario mexicano: interés = saldo × tasa ÷ base × días del periodo (o tasa ÷ periodos),
// IVA 16% sobre el interés, pago fijo; capital = pago − interés − IVA.
export const periodosAnio: Record<Frecuencia, number> = { semanal: 52, quincenal: 24, mensual: 12 }
export const IVA = 0.16

type PrestamoCalc = Pick<Prestamo, 'monto' | 'tasa_anual' | 'frecuencia' | 'plazo' | 'fecha_inicio'> &
  Partial<Pick<Prestamo, 'pago_fijo' | 'iva_interes' | 'base_dias' | 'saldo_inicial' | 'pagos_previos'>>

export function sumarPeriodos(fecha: string, f: Frecuencia, k: number): string {
  const d = parseISO(fecha)
  if (f === 'semanal') d.setDate(d.getDate() + 7 * k)
  else if (f === 'mensual') {
    const dia = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + k)
    d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
  } else { d.setMonth(d.getMonth() + Math.floor(k / 2)); if (k % 2) d.setDate(d.getDate() + 15) }
  return iso(d)
}

/** Saldo con el que arranca el cálculo y cuántos pagos faltan */
export function base(p: PrestamoCalc) {
  const previos = p.pagos_previos ?? 0
  const saldo = p.saldo_inicial != null && previos > 0 ? Number(p.saldo_inicial) : Number(p.monto)
  const restantes = p.plazo ? Math.max(1, p.plazo - (previos > 0 ? previos : 0)) : null
  return { saldo, previos: previos > 0 ? previos : 0, restantes }
}

/** Interés (sin IVA) de un periodo que va de fechaA a fechaB */
function interesPeriodo(p: PrestamoCalc, saldo: number, fechaA: string, fechaB: string) {
  const tasa = Number(p.tasa_anual) / 100
  if (!tasa) return 0
  if (p.base_dias === '360' || p.base_dias === '365') {
    const dias = Math.round((parseISO(fechaB).getTime() - parseISO(fechaA).getTime()) / 864e5)
    return r2((saldo * tasa * dias) / Number(p.base_dias))
  }
  return r2(saldo * (tasa / periodosAnio[p.frecuencia]))
}

export function tasaPeriodo(p: PrestamoCalc) {
  const tasa = Number(p.tasa_anual) / 100
  const i = p.base_dias === '360' || p.base_dias === '365' ? (tasa * (365 / periodosAnio[p.frecuencia])) / Number(p.base_dias) : tasa / periodosAnio[p.frecuencia]
  return i * (p.iva_interes ? 1 + IVA : 1)
}

/** Pago calculado (sin usar el que puso el usuario) */
export function pagoCalculado(p: PrestamoCalc): number | null {
  const { saldo, restantes } = base(p)
  if (!restantes) return null
  const i = tasaPeriodo(p)
  if (i === 0) return r2(saldo / restantes)
  return r2((saldo * i) / (1 - Math.pow(1 + i, -restantes)))
}

/** Pago periódico: el que dio el banco si lo capturaste, si no el calculado */
export function pagoFijo(p: PrestamoCalc): number | null {
  if (p.pago_fijo) return Number(p.pago_fijo)
  return pagoCalculado(p)
}

export interface FilaAmort { n: number; fecha: string; saldoInicial: number; pago: number; interes: number; iva: number; capital: number; saldo: number }

export function tablaAmortizacion(p: PrestamoCalc): FilaAmort[] {
  const pago = pagoFijo(p)
  const { saldo: s0, previos, restantes } = base(p)
  if (!pago || !restantes) return []
  let saldo = s0
  let anterior = p.fecha_inicio
  const filas: FilaAmort[] = []
  for (let k = 1; k <= restantes && saldo > 0; k++) {
    const fecha = sumarPeriodos(p.fecha_inicio, p.frecuencia, k)
    const interes = interesPeriodo(p, saldo, anterior, fecha)
    const iva = p.iva_interes ? r2(interes * IVA) : 0
    let capital = r2(pago - interes - iva)
    if (k === restantes || capital > saldo) capital = r2(saldo)
    filas.push({ n: previos + k, fecha, saldoInicial: saldo, pago: r2(capital + interes + iva), interes, iva, capital, saldo: r2(saldo - capital) })
    saldo = r2(saldo - capital)
    anterior = fecha
  }
  return filas
}

export interface EstadoPrestamo {
  saldo: number; pagado: number; intereses: number; iva: number; capitalPagado: number
  abonos: number; pagosHechos: number; pago: number | null; proximaFecha: string | null; progreso: number
  interesesRestantes: number; totalRestante: number
}

/** Cada abono se aplica al siguiente periodo de la tabla: primero interés e IVA, el resto a capital */
export function estadoPrestamo(p: Prestamo, abonos: Abono[]): EstadoPrestamo {
  const lista = abonos.filter((a) => a.prestamo_id === p.id).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.created_at.localeCompare(b.created_at))
  const { saldo: s0, previos } = base(p)
  let saldo = s0, intereses = 0, ivaTot = 0
  let anterior = p.fecha_inicio
  lista.forEach((a, idx) => {
    const fecha = p.plazo ? sumarPeriodos(p.fecha_inicio, p.frecuencia, idx + 1) : a.fecha
    const interes = interesPeriodo(p, saldo, anterior, fecha)
    const iva = p.iva_interes ? r2(interes * IVA) : 0
    const cargo = Math.min(Number(a.monto), r2(interes + iva))
    const parteInteres = interes + iva > 0 ? r2((cargo * interes) / (interes + iva)) : 0
    intereses = r2(intereses + parteInteres)
    ivaTot = r2(ivaTot + r2(cargo - parteInteres))
    saldo = r2(Math.max(0, saldo - Math.max(0, r2(Number(a.monto) - interes - iva))))
    anterior = fecha
  })
  const pagado = sum(lista.map((a) => a.monto))
  const capitalPagado = r2(Number(p.monto) - saldo)
  const pago = pagoFijo(p)
  // Lo que falta: proyecta la tabla desde el saldo actual
  let interesesRestantes = 0, totalRestante = saldo
  if (p.plazo && saldo > 0) {
    const resto = tablaAmortizacion({ ...p, saldo_inicial: saldo, pagos_previos: previos + lista.length, monto: p.monto, fecha_inicio: anterior, plazo: p.plazo })
    interesesRestantes = r2(sum(resto.map((f) => f.interes + f.iva)))
    totalRestante = r2(sum(resto.map((f) => f.pago)))
  }
  return {
    saldo, pagado, intereses, iva: ivaTot, capitalPagado, abonos: lista.length, pagosHechos: previos + lista.length, pago,
    proximaFecha: saldo > 0 && p.plazo ? sumarPeriodos(p.fecha_inicio, p.frecuencia, lista.length + 1) : null,
    progreso: Number(p.monto) > 0 ? Math.min(1, capitalPagado / Number(p.monto)) : 0,
    interesesRestantes, totalRestante,
  }
}

/** Dirección del préstamo vista por el usuario actual (si es la contraparte se invierte) */
export function direccionPara(p: Prestamo, uid: string): 'debo' | 'me_deben' {
  if (p.user_id === uid) return p.direccion
  return p.direccion === 'debo' ? 'me_deben' : 'debo'
}
