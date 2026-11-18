import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useData, useMisMovs } from '../data'
import { estadoTarjeta, msiAvance, msiFacturadas, saldoCuenta, ultimoCorte } from '../lib/calc'
import { fechaCorta, hoy, money, parseMonto, r2, sum } from '../lib/fmt'
import { errorMsg, supabase } from '../lib/supabase'
import type { Cuenta, Movimiento } from '../lib/types'
import { Btn, Field, Input, Sheet, toast } from '../ui'

interface Fila { desc: string; mensualidad: string; numero: string; total: string }
const vacia = (): Fila => ({ desc: '', mensualidad: '', numero: '', total: '' })

function leer(f: Fila) {
  const mens = parseMonto(f.mensualidad), numero = Math.round(Number(f.numero)), total = Math.round(Number(f.total))
  const ok = mens > 0 && numero >= 1 && total >= 1 && numero <= total && total <= 48
  return { desc: f.desc.trim(), mens, numero, total, faltan: ok ? total - numero + 1 : 0, ok }
}

/** Captura de compras a meses sin intereses que ya venían en la tarjeta al registrarla */
export default function MsiPrevios({ cuenta, onClose }: { cuenta: Cuenta | null; onClose: () => void }) {
  const { recargar } = useData()
  const movs = useMisMovs()
  const [filas, setFilas] = useState<Fila[]>([vacia()])
  const [incluido, setIncluido] = useState(true)
  const [busy, setBusy] = useState(false)
  const [k, setK] = useState<string | null>(null)
  if (cuenta && k !== cuenta.id) { setK(cuenta.id); setFilas([vacia()]); setIncluido(true) }
  if (!cuenta && k) setK(null)

  const set = (i: number, campo: keyof Fila, v: string) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, [campo]: v } : f)))
  const leidas = filas.map(leer)
  const validas = leidas.filter((f) => f.ok)
  const totalMsi = sum(validas.map((f) => r2(f.mens * f.faltan)))
  const porCorte = sum(validas.map((f) => f.mens))
  const propios = cuenta ? movs.filter((m) => m.cuenta_id === cuenta.id || m.cuenta_destino_id === cuenta.id) : []
  const deudaActual = cuenta ? Math.max(0, -saldoCuenta(cuenta, propios)) : 0
  const proxCorte = cuenta ? estadoTarjeta(cuenta, propios).proximoCorte : null

  async function guardar() {
    if (!cuenta) return
    if (leidas.some((f, i) => !f.ok && (filas[i].mensualidad || filas[i].numero || filas[i].total))) return toast('Revisa: mensualidad, número de pago y de cuántos (el número no puede ser mayor que el total, máximo 48)', 'err')
    if (!validas.length) return toast('Llena la mensualidad y el número de pago', 'err')
    if (incluido && totalMsi > -Number(cuenta.saldo_inicial) + 0.01) {
      return toast(`Tus MSI suman ${money(totalMsi)} pero la deuda que capturaste al registrar la tarjeta es ${money(Math.max(0, -Number(cuenta.saldo_inicial)))}. Revisa los montos o desmarca “ya está incluido”.`, 'err')
    }
    setBusy(true)
    try {
      for (const f of validas) {
        const { error } = await supabase.from('centavo_movimientos').insert({
          tipo: 'gasto', monto: r2(f.mens * f.faltan), fecha: hoy(), cuenta_id: cuenta.id, categoria_id: null,
          nota: f.desc || 'Compra a meses', msi_meses: f.faltan, msi_total: f.total, es_saldo_inicial: true,
        })
        if (error) throw error
      }
      if (incluido) await ajustarSaldo(cuenta, totalMsi)
      await recargar('movimientos', 'cuentas')
      toast(`${validas.length} compra${validas.length > 1 ? 's' : ''} a meses agregada${validas.length > 1 ? 's' : ''}`)
      onClose()
    } catch (e) { toast(errorMsg(e), 'err') } finally { setBusy(false) }
  }

  return (
    <Sheet open={!!cuenta} onClose={onClose} title={`MSI que ya traes · ${cuenta?.nombre ?? ''}`}
      footer={<Btn className="w-full" onClick={guardar} disabled={busy || !validas.length}>{busy ? 'Guardando…' : validas.length ? `Guardar ${validas.length} compra${validas.length > 1 ? 's' : ''} · ${money(totalMsi)}` : 'Guardar'}</Btn>}>
      <p className="mb-3 text-sm text-slate-500">Cópialo de la app de tu banco. <b>Pago número</b> es el que te van a cobrar en tu próximo corte{proxCorte ? ` (${fechaCorta(proxCorte)})` : ''}.</p>
      <div className="space-y-3">
        {filas.map((f, i) => {
          const l = leidas[i]
          return (
            <div key={i} className="rounded-2xl border border-slate-100 p-3 dark:border-slate-800">
              <div className="mb-2 flex gap-2">
                <Input value={f.desc} onChange={(e) => set(i, 'desc', e.target.value)} placeholder="¿Qué compraste? (ej. Celular)" />
                {filas.length > 1 && <button onClick={() => setFilas(filas.filter((_, j) => j !== i))} className="px-2 text-slate-400 hover:text-rose-600" aria-label="Quitar"><Trash2 size={18} /></button>}
              </div>
              <CamposMsi f={f} set={(c, v) => set(i, c, v)} />
              {l.ok && <p className="mt-1 text-xs text-slate-500">Te faltan {l.faltan} pago{l.faltan > 1 ? 's' : ''} · {money(l.mens * l.faltan)}</p>}
              {!l.ok && l.numero > l.total && l.total > 0 && <p className="mt-1 text-xs text-rose-600">El número de pago no puede ser mayor que el total.</p>}
            </div>
          )
        })}
      </div>
      <Btn variant="ghost" className="mt-3 w-full" onClick={() => setFilas([...filas, vacia()])}><Plus size={18} /> Otra compra a meses</Btn>

      <label className="mt-4 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-600" checked={incluido} onChange={(e) => setIncluido(e.target.checked)} />
        <span>Ya está incluido en la deuda que capturé de esta tarjeta <span className="block text-xs text-slate-500">Lo separo de esa deuda para que no se cobre todo en el próximo pago.</span></span>
      </label>

      {validas.length > 0 && (
        <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
          <div className="flex justify-between"><span>Total pendiente en MSI</span><b className="tabular">{money(totalMsi)}</b></div>
          <div className="flex justify-between"><span>Se suma a cada corte</span><b className="tabular">{money(porCorte)}</b></div>
          {incluido && <div className="flex justify-between text-slate-500"><span>Tu deuda sin MSI queda en</span><span className="tabular">{money(Math.max(0, deudaActual - totalMsi))}</span></div>}
        </div>
      )}
    </Sheet>
  )
}

function CamposMsi({ f, set }: { f: Fila; set: (c: keyof Fila, v: string) => void }) {
  return (
    <div className="grid grid-cols-[1.3fr_1fr_auto_1fr] items-end gap-2">
      <label className="text-xs text-slate-500">Mensualidad<Input inputMode="decimal" value={f.mensualidad} onChange={(e) => set('mensualidad', e.target.value)} placeholder="0.00" className="mt-1" /></label>
      <label className="text-xs text-slate-500">Pago número<Input type="number" inputMode="numeric" min={1} max={48} value={f.numero} onChange={(e) => set('numero', e.target.value)} placeholder="4" className="mt-1 text-center" /></label>
      <span className="pb-3 text-sm text-slate-500">de</span>
      <label className="text-xs text-slate-500">Total<Input type="number" inputMode="numeric" min={1} max={48} value={f.total} onChange={(e) => set('total', e.target.value)} placeholder="12" className="mt-1 text-center" /></label>
    </div>
  )
}

/** Sube/baja el saldo inicial para que la deuda total de la tarjeta no cambie */
async function ajustarSaldo(cuenta: Cuenta, delta: number) {
  const nuevoSaldo = r2(Number(cuenta.saldo_inicial) + delta)
  const pendiente = Math.min(Number(cuenta.pendiente_inicial ?? 0), Math.max(0, -nuevoSaldo))
  const { error } = await supabase.from('centavo_cuentas').update({ saldo_inicial: nuevoSaldo, pendiente_inicial: pendiente }).eq('id', cuenta.id)
  if (error) throw error
}

/** Editar o borrar una compra a meses que ya traías */
export function MsiEditar({ item, onClose }: { item: { mov: Movimiento; cuenta: Cuenta; facturadas: number } | null; onClose: () => void }) {
  const { recargar } = useData()
  const [f, setF] = useState<Fila>(vacia())
  const [mantener, setMantener] = useState(true)
  const [busy, setBusy] = useState(false)
  const [k, setK] = useState<string | null>(null)
  if (item && k !== item.mov.id) {
    const a = msiAvance(item.mov, item.facturadas)
    setK(item.mov.id); setMantener(true)
    setF({ desc: item.mov.nota ?? '', mensualidad: String(r2(Number(item.mov.monto) / (item.mov.msi_meses ?? 1))), numero: String(a.proximo), total: String(a.de) })
  }
  if (!item && k) setK(null)
  const l = leer(f)

  async function guardar() {
    if (!item) return
    if (!l.ok) return toast('Revisa: mensualidad, número de pago y de cuántos', 'err')
    const { mov, cuenta } = item
    // Mensualidades ya cobradas desde la fecha de registro hasta el último corte (se conservan)
    const cobradas = cuenta.dia_corte ? msiFacturadas(mov.fecha, 48, cuenta.dia_corte, ultimoCorte(cuenta.dia_corte)) : 0
    const msiMeses = Math.min(48, l.faltan + cobradas)
    const monto = r2(l.mens * msiMeses)
    setBusy(true)
    try {
      const { error } = await supabase.from('centavo_movimientos').update({ nota: l.desc || 'Compra a meses', monto, msi_meses: msiMeses, msi_total: Math.max(l.total, msiMeses) }).eq('id', mov.id)
      if (error) throw error
      if (mantener) await ajustarSaldo(cuenta, r2(monto - Number(mov.monto)))
      await recargar('movimientos', 'cuentas'); toast('Compra a meses actualizada'); onClose()
    } catch (e) { toast(errorMsg(e), 'err') } finally { setBusy(false) }
  }

  async function borrar() {
    if (!item || !confirm('¿Borrar esta compra a meses?')) return
    setBusy(true)
    try {
      const { error } = await supabase.from('centavo_movimientos').delete().eq('id', item.mov.id)
      if (error) throw error
      if (mantener) await ajustarSaldo(item.cuenta, -Number(item.mov.monto))
      await recargar('movimientos', 'cuentas'); toast('Compra a meses borrada'); onClose()
    } catch (e) { toast(errorMsg(e), 'err') } finally { setBusy(false) }
  }

  return (
    <Sheet open={!!item} onClose={onClose} title="Editar compra a meses"
      footer={<div className="flex gap-2"><Btn variant="danger" onClick={borrar} disabled={busy} aria-label="Borrar"><Trash2 size={18} /></Btn><Btn className="flex-1" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Btn></div>}>
      <Field label="¿Qué compraste?"><Input value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} /></Field>
      <CamposMsi f={f} set={(c, v) => setF({ ...f, [c]: v })} />
      <p className="mt-2 text-xs text-slate-500">Pago número = el que te cobran en tu próximo corte.</p>
      {l.ok && <p className="mt-1 text-sm">Te faltan <b>{l.faltan}</b> pago{l.faltan > 1 ? 's' : ''} · <b className="tabular">{money(l.mens * l.faltan)}</b></p>}
      <label className="mt-4 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-600" checked={mantener} onChange={(e) => setMantener(e.target.checked)} />
        <span>Mantener igual la deuda total de la tarjeta <span className="block text-xs text-slate-500">Lo que cambie aquí se compensa en tu deuda sin MSI. Desmárcalo si la deuda total también estaba mal.</span></span>
      </label>
    </Sheet>
  )
}
