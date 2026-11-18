import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useData, useMisMovs } from '../data'
import { efecto, saldoCuenta } from '../lib/calc'
import { money, parseMonto, r2, sum } from '../lib/fmt'
import { errorMsg, supabase } from '../lib/supabase'
import type { Cuenta, TipoCuenta } from '../lib/types'
import { Btn, Card, cx, Field, Input, PageTitle, Select, Sheet, toast } from '../ui'

export const TIPOS: Record<TipoCuenta, { label: string; icon: string }> = {
  efectivo: { label: 'Efectivo', icon: '💵' },
  debito: { label: 'Débito / Nómina', icon: '🏦' },
  ahorro: { label: 'Ahorro', icon: '🐷' },
  inversion: { label: 'Inversión', icon: '📈' },
  credito: { label: 'Tarjeta de crédito', icon: '💳' },
}
const COLORES = ['#10b981', '#0ea5e9', '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#14b8a6', '#64748b', '#0f172a', '#7c3aed']

export default function Cuentas() {
  const { cuentas, uid } = useData()
  const movs = useMisMovs()
  const [form, setForm] = useState<Partial<Cuenta> | null>(null)
  const mias = cuentas.filter((c) => c.user_id === uid).sort((a, b) => Number(a.archivada) - Number(b.archivada) || a.orden - b.orden || a.nombre.localeCompare(b.nombre))

  return (
    <div>
      <PageTitle title="Cuentas" sub="Efectivo, bancos, ahorro, inversiones y tarjetas" right={<Btn onClick={() => setForm({ tipo: 'debito' })}><Plus size={18} /> Nueva</Btn>} />
      <div className="grid gap-3 md:grid-cols-2">
        {(Object.keys(TIPOS) as TipoCuenta[]).map((t) => {
          const del = mias.filter((c) => c.tipo === t)
          if (!del.length) return null
          const total = sum(del.filter((c) => !c.archivada).map((c) => saldoCuenta(c, movs)))
          return (
            <Card key={t}>
              <div className="mb-1 flex items-center justify-between">
                <p className="font-semibold">{TIPOS[t].icon} {TIPOS[t].label}</p>
                <p className={cx('tabular text-sm font-semibold', total < 0 && 'text-rose-600')}>{t === 'credito' ? `Debes ${money(-total)}` : money(total)}</p>
              </div>
              {del.map((c) => {
                const s = saldoCuenta(c, movs)
                return (
                  <button key={c.id} onClick={() => setForm(c)} className={cx('flex w-full items-center justify-between rounded-2xl px-2 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60', c.archivada && 'opacity-50')}>
                    <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: c.color }} />{c.nombre}{c.archivada && ' (archivada)'}</span>
                    <span className={cx('tabular font-medium', s < 0 && t !== 'credito' && 'text-rose-600')}>{t === 'credito' ? money(Math.max(0, -s)) : money(s)}</span>
                  </button>
                )
              })}
            </Card>
          )
        })}
      </div>
      <CuentaForm cuenta={form} onClose={() => setForm(null)} />
    </div>
  )
}

function CuentaForm({ cuenta, onClose }: { cuenta: Partial<Cuenta> | null; onClose: () => void }) {
  const { recargar, cuentas, uid } = useData()
  const movs = useMisMovs()
  const open = !!cuenta
  const editando = !!cuenta?.id
  const [f, setF] = useState<Partial<Cuenta>>({})
  const [saldo, setSaldo] = useState('')
  const [busy, setBusy] = useState(false)
  const [abierto, setAbierto] = useState<string | null>(null)

  const key = cuenta ? (cuenta.id ?? 'nueva') : null
  if (open && abierto !== key) {
    setAbierto(key)
    setF({ color: COLORES[cuentas.length % COLORES.length], ...cuenta })
    if (cuenta?.id) {
      const s = saldoCuenta(cuenta as Cuenta, movs)
      setSaldo(String(cuenta.tipo === 'credito' ? r2(Math.max(0, -s)) : s))
    } else setSaldo('')
  }
  if (!open && abierto) setAbierto(null)

  const credito = f.tipo === 'credito'
  const set = (k: keyof Cuenta, v: unknown) => setF((p) => ({ ...p, [k]: v }))

  async function guardar() {
    if (!f.nombre?.trim()) return toast('Ponle nombre a la cuenta', 'err')
    if (credito && (!f.dia_corte || !f.dia_pago)) return toast('Pon el día de corte y el día límite de pago', 'err')
    setBusy(true)
    try {
      const objetivo = parseMonto(saldo) * (credito ? -1 : 1)
      const movsCta = editando ? movs.filter((m) => m.cuenta_id === f.id || m.cuenta_destino_id === f.id) : []
      const saldo_inicial = r2(objetivo - sum(movsCta.map((m) => efecto(m, f.id!))))
      const row = {
        nombre: f.nombre.trim(), tipo: f.tipo, color: f.color, saldo_inicial,
        limite_credito: credito && f.limite_credito ? Number(f.limite_credito) : null,
        dia_corte: credito ? Number(f.dia_corte) : null, dia_pago: credito ? Number(f.dia_pago) : null,
        archivada: !!f.archivada,
        orden: f.orden ?? cuentas.filter((c) => c.user_id === uid).length,
      }
      const { error } = editando ? await supabase.from('centavo_cuentas').update(row).eq('id', f.id!) : await supabase.from('centavo_cuentas').insert(row)
      if (error) throw error
      await recargar('cuentas')
      toast(editando ? 'Cuenta actualizada' : 'Cuenta creada'); onClose()
    } catch (e) { toast(errorMsg(e), 'err') } finally { setBusy(false) }
  }

  async function borrar() {
    const n = movs.filter((m) => m.cuenta_id === f.id || m.cuenta_destino_id === f.id).length
    if (!confirm(n ? `Esta cuenta tiene ${n} movimientos que también se borrarán. Mejor archívala si solo ya no la usas. ¿Borrar de todos modos?` : '¿Borrar esta cuenta?')) return
    const { error } = await supabase.from('centavo_cuentas').delete().eq('id', f.id!)
    if (error) return toast(errorMsg(error), 'err')
    await recargar('cuentas', 'movimientos'); toast('Cuenta borrada'); onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={editando ? 'Editar cuenta' : 'Nueva cuenta'}
      footer={<div className="flex gap-2">
        {editando && <Btn variant="danger" onClick={borrar}>Borrar</Btn>}
        <Btn className="flex-1" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Btn>
      </div>}>
      <Field label="Tipo">
        <Select value={f.tipo ?? 'debito'} onChange={(e) => set('tipo', e.target.value)}>
          {(Object.keys(TIPOS) as TipoCuenta[]).map((t) => <option key={t} value={t}>{TIPOS[t].icon} {TIPOS[t].label}</option>)}
        </Select>
      </Field>
      <Field label="Nombre"><Input value={f.nombre ?? ''} onChange={(e) => set('nombre', e.target.value)} placeholder={credito ? 'Ej. Nu, BBVA Azul' : 'Ej. BBVA Nómina, Cartera'} /></Field>
      <Field label={credito ? 'Deuda actual (lo que debes hoy)' : 'Saldo actual'} hint={editando ? 'Si lo cambias, se ajusta el saldo sin tocar tus movimientos.' : credito ? 'Incluye compras a MSI pendientes. Pon 0 si no debes nada.' : undefined}>
        <Input inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} placeholder="0.00" />
      </Field>
      {credito && (
        <>
          <Field label="Límite de crédito (opcional)"><Input inputMode="decimal" value={f.limite_credito ?? ''} onChange={(e) => set('limite_credito', e.target.value)} placeholder="0.00" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Día de corte"><Input type="number" min={1} max={31} inputMode="numeric" value={f.dia_corte ?? ''} onChange={(e) => set('dia_corte', e.target.value)} placeholder="Ej. 25" /></Field>
            <Field label="Día límite de pago"><Input type="number" min={1} max={31} inputMode="numeric" value={f.dia_pago ?? ''} onChange={(e) => set('dia_pago', e.target.value)} placeholder="Ej. 15" /></Field>
          </div>
        </>
      )}
      <Field label="Color">
        <div className="flex flex-wrap gap-2">
          {COLORES.map((c) => (
            <button key={c} type="button" onClick={() => set('color', c)} className={cx('h-8 w-8 rounded-full ring-offset-2 dark:ring-offset-slate-900', f.color === c && 'ring-2 ring-slate-900 dark:ring-white')} style={{ background: c }} aria-label={c} />
          ))}
        </div>
      </Field>
      {editando && (
        <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.archivada} onChange={(e) => set('archivada', e.target.checked)} className="h-4 w-4 accent-emerald-600" /> Archivar (ocultarla sin perder historial)</label>
      )}
    </Sheet>
  )
}
