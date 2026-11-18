import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useData, useMisMovs } from '../data'
import { saldoCuenta } from '../lib/calc'
import { hoy, money, parseMonto, r2, sum } from '../lib/fmt'
import { errorMsg, supabase } from '../lib/supabase'
import type { Cuenta } from '../lib/types'
import { Btn, Input, Sheet, toast } from '../ui'

interface Fila { desc: string; mensualidad: string; faltan: string; total: string }
const vacia = (): Fila => ({ desc: '', mensualidad: '', faltan: '', total: '' })

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
  const validas = filas.map((f) => ({ desc: f.desc.trim(), mens: parseMonto(f.mensualidad), faltan: Math.round(Number(f.faltan)), total: Math.round(Number(f.total)) }))
    .filter((f) => f.mens > 0 && f.faltan >= 1)
  const totalMsi = sum(validas.map((f) => r2(f.mens * f.faltan)))
  const porCorte = sum(validas.map((f) => f.mens))
  const deudaActual = cuenta ? Math.max(0, -saldoCuenta(cuenta, movs.filter((m) => m.cuenta_id === cuenta.id || m.cuenta_destino_id === cuenta.id))) : 0

  async function guardar() {
    if (!cuenta) return
    if (!validas.length) return toast('Llena la mensualidad y cuántas te faltan', 'err')
    if (validas.some((f) => f.faltan > 48)) return toast('Máximo 48 mensualidades por compra', 'err')
    if (validas.some((f) => f.total && f.total < f.faltan)) return toast('Las que faltan no pueden ser más que el total de meses', 'err')
    if (incluido && totalMsi > -Number(cuenta.saldo_inicial) + 0.01) {
      return toast(`Tus MSI suman ${money(totalMsi)} pero la deuda que capturaste al registrar la tarjeta es ${money(Math.max(0, -Number(cuenta.saldo_inicial)))}. Revisa los montos o desmarca “ya está incluido”.`, 'err')
    }
    setBusy(true)
    try {
      const rows = validas.map((f) => ({
        tipo: 'gasto', monto: r2(f.mens * f.faltan), fecha: hoy(), cuenta_id: cuenta.id, categoria_id: null,
        nota: `${f.desc || 'Compra a meses'}${f.total ? ` (${f.total} meses)` : ''}`, msi_meses: f.faltan, es_saldo_inicial: true,
      }))
      for (const r of rows) {
        const { error } = await supabase.from('centavo_movimientos').insert(r)
        if (error) throw error
      }
      if (incluido) {
        const nuevoSaldo = r2(Number(cuenta.saldo_inicial) + totalMsi)
        const pendiente = Math.min(Number(cuenta.pendiente_inicial ?? 0), Math.max(0, -nuevoSaldo))
        const { error } = await supabase.from('centavo_cuentas').update({ saldo_inicial: nuevoSaldo, pendiente_inicial: pendiente }).eq('id', cuenta.id)
        if (error) throw error
      }
      await recargar('movimientos', 'cuentas')
      toast(`${rows.length} compra${rows.length > 1 ? 's' : ''} a meses agregada${rows.length > 1 ? 's' : ''}`)
      onClose()
    } catch (e) { toast(errorMsg(e), 'err') } finally { setBusy(false) }
  }

  return (
    <Sheet open={!!cuenta} onClose={onClose} title={`MSI que ya traes · ${cuenta?.nombre ?? ''}`}
      footer={<Btn className="w-full" onClick={guardar} disabled={busy || !validas.length}>{busy ? 'Guardando…' : validas.length ? `Guardar ${validas.length} compra${validas.length > 1 ? 's' : ''} · ${money(totalMsi)}` : 'Guardar'}</Btn>}>
      <p className="mb-3 text-sm text-slate-500">Copia de la app de tu banco cada compra a meses: lo que pagas al mes y cuántas mensualidades te faltan, contando la del próximo corte.</p>
      <div className="space-y-3">
        {filas.map((f, i) => (
          <div key={i} className="rounded-2xl border border-slate-100 p-3 dark:border-slate-800">
            <div className="mb-2 flex gap-2">
              <Input value={f.desc} onChange={(e) => set(i, 'desc', e.target.value)} placeholder="¿Qué compraste? (ej. Celular)" />
              {filas.length > 1 && <button onClick={() => setFilas(filas.filter((_, j) => j !== i))} className="px-2 text-slate-400 hover:text-rose-600" aria-label="Quitar"><Trash2 size={18} /></button>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs text-slate-500">Mensualidad<Input inputMode="decimal" value={f.mensualidad} onChange={(e) => set(i, 'mensualidad', e.target.value)} placeholder="0.00" className="mt-1" /></label>
              <label className="text-xs text-slate-500">Te faltan<Input type="number" inputMode="numeric" min={1} max={48} value={f.faltan} onChange={(e) => set(i, 'faltan', e.target.value)} placeholder="Ej. 8" className="mt-1" /></label>
              <label className="text-xs text-slate-500">De (opcional)<Input type="number" inputMode="numeric" min={1} max={48} value={f.total} onChange={(e) => set(i, 'total', e.target.value)} placeholder="Ej. 12" className="mt-1" /></label>
            </div>
            {parseMonto(f.mensualidad) > 0 && Number(f.faltan) > 0 && <p className="mt-1 text-xs text-slate-500">Te falta pagar {money(parseMonto(f.mensualidad) * Number(f.faltan))}</p>}
          </div>
        ))}
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
