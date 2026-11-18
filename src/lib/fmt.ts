const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const mxn0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 })

/** Redondeo a centavos sin errores de punto flotante */
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export const money = (n: number) => mxn.format(r2(n) === 0 ? 0 : r2(n))
export const money0 = (n: number) => mxn0.format(Math.round(n) === 0 ? 0 : n)

/** Suma exacta en centavos */
export const sum = (xs: number[]) => xs.reduce((a, b) => a + Math.round(Number(b) * 100), 0) / 100

/** Fecha local YYYY-MM-DD (sin desfase UTC) */
export function iso(d: Date) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
export const hoy = () => iso(new Date())
export function parseISO(s: string) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const mesKey = (s: string) => s.slice(0, 7)

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export const nombreMes = (key: string) => { const [y, m] = key.split('-').map(Number); return `${MESES[m - 1]} ${y}` }
export const fechaCorta = (s: string) => { const d = parseISO(s); return `${d.getDate()} ${MESES3[d.getMonth()]}` }
export function fechaLarga(s: string) {
  const d = parseISO(s)
  const h = hoy()
  const ayer = iso(new Date(Date.now() - 864e5))
  if (s === h) return 'Hoy'
  if (s === ayer) return 'Ayer'
  const base = `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`
}
export function diasHasta(s: string) {
  const a = parseISO(hoy()).getTime(), b = parseISO(s).getTime()
  return Math.round((b - a) / 864e5)
}
export function sumarMeses(key: string, n: number) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Convierte texto del usuario ("1,250.5" / "1250,50") a número */
export function parseMonto(s: string): number {
  if (!s) return 0
  let t = s.replace(/[^\d.,-]/g, '')
  if (t.includes(',') && !t.includes('.')) t = t.replace(',', '.')
  else t = t.replace(/,/g, '')
  const n = Number(t)
  return Number.isFinite(n) ? r2(n) : 0
}
