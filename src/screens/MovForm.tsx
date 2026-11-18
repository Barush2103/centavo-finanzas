import { useEffect, useMemo, useState } from 'react'
import { Trash2, Users } from 'lucide-react'
import { useData, useMisCuentas, useMisMovs } from '../data'
import { hoy, iso, money, parseMonto, r2 } from '../lib/fmt'
import { errorMsg, supabase } from '../lib/supabase'
import type { Movimiento, TipoMov } from '../lib/types'
import { Btn, cx, Input, MontoInput, Seg, Sheet, toast } from '../ui'

export interface Preset { tipo?: TipoMov; monto?: number; cuenta_id?: string; cuenta_destino_id?: string; categoria_id?: string; nota?: string }

const LAST = 'centavo:ultimaCuenta'

export default function MovForm({ open, onClose, edit, preset }: { open: boolean; onClose: () => void; edit?: Movimiento | null; preset?: Preset | null }) {
  const { categorias, uid, recargar, contactos, nombreDe, cuenta } = useData()
  const cuentas = useMisCuentas()
  const movs = useMisMovs()

  const [tipo, setTipo] = useState<TipoMov>('gasto')
  const [monto, setMonto] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const [cta, setCta] = useState<string>('')
  const [dest, setDest] = useState<string>('')
  const [fecha, setFecha] = useState(hoy())
  const [nota, setNota] = useState('')
  const [msi, setMsi] = useState<number>(0)
  const [dividir, setDividir] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const misContactos = useMemo(() => [...new Set(contactos.filter((c) => c.user_id === uid).map((c) => c.contacto_id))], [contactos, uid])

  useEffect(() => {
    if (!open) return
    const last = localStorage.getItem(LAST)
    const def = cuentas.find((c) => c.id === last)?.id ?? cuentas[0]?.id ?? ''
    if (edit) {
      setTipo(edit.tipo); setMonto(String(edit.monto)); setCat(edit.categoria_id); setCta(edit.cuenta_id)
      setDest(edit.cuenta_destino_id ?? ''); setFecha(edit.fecha); setNota(edit.nota ?? ''); setMsi(edit.msi_meses ?? 0)
    } else {
      setTipo(preset?.tipo ?? 'gasto'); setMonto(preset?.monto ? String(preset.monto) : ''); setCat(preset?.categoria_id ?? null)
      setCta(preset?.cuenta_id ?? def); setDest(preset?.cuenta_destino_id ?? ''); setFecha(hoy()); setNota(preset?.nota ?? ''); setMsi(0)
    }
    setDividir([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, edit, preset])

  // Categorías ordenadas por uso
  const cats = useMemo(() => {
    const uso = new Map<string, number>()
    for (const m of movs) if (m.categoria_id) uso.set(m.categoria_id, (uso.get(m.categoria_id) ?? 0) + 1)
    return categorias
      .filter((c) => c.user_id === uid && !c.archivada && c.tipo === (tipo === 'ingreso' ? 'ingreso' : 'gasto'))
      .sort((a, b) => (uso.get(b.id) ?? 0) - (uso.get(a.id) ?? 0) || a.orden - b.orden)
  }, [categorias, movs, tipo, uid])

  const cuentaSel = cuenta(cta)
  const esCredito = cuentaSel?.tipo === 'credito'
  const valor = parseMonto(monto)

  async function guardar() {
    if (valor <= 0) return toast('Escribe un monto', 'err')
    if (!cta) return toast('Primero crea una cuenta en Más → Cuentas', 'err')
    if (tipo === 'transferencia' && (!dest || dest === cta)) return toast('Elige la cuenta destino', 'err')
    setBusy(true)
    try {
      let compartido_id: string | null = edit?.compartido_id ?? null
      if (!edit && tipo === 'gasto' && dividir.length) {
        const personas = [uid, ...dividir]
        const base = Math.floor((valor * 100) / personas.length) / 100
        const resto = r2(valor - base * personas.length)
        const partes = personas.map((p, i) => ({ user_id: p, monto: i === 0 ? r2(base + resto) : base }))
        const nombreCat = cats.find((c) => c.id === cat)?.nombre
        const { data, error } = await supabase.rpc('centavo_crear_compartido', {
          p_descripcion: nota.trim() || nombreCat || 'Gasto compartido', p_monto: valor, p_fecha: fecha, p_pagado_por: uid, p_partes: partes,
        })
        if (error) throw error
        compartido_id = data as string
      }
      const row = {
        tipo, monto: valor, fecha, cuenta_id: cta,
        cuenta_destino_id: tipo === 'transferencia' ? dest : null,
        categoria_id: tipo === 'transferencia' ? null : cat,
        nota: nota.trim() || null,
        msi_meses: tipo === 'gasto' && esCredito && msi >= 2 ? msi : null,
        compartido_id,
      }
      const { error } = edit
        ? await supabase.from('centavo_movimientos').update(row).eq('id', edit.id)
        : await supabase.from('centavo_movimientos').insert(row)
      if (error) throw error
      localStorage.setItem(LAST, cta)
      await recargar('movimientos', ...(compartido_id && !edit ? (['compartidos', 'partes'] as const) : []))
      toast(edit ? 'Movimiento actualizado' : tipo === 'gasto' ? `Gasto de ${money(valor)} guardado` : tipo === 'ingreso' ? `Ingreso de ${money(valor)} guardado` : 'Transferencia guardada')
      onClose()
    } catch (e) { toast(errorMsg(e), 'err') } finally { setBusy(false) }
  }

  async function borrar() {
    if (!edit || !confirm('¿Borrar este movimiento?')) return
    const { error } = await supabase.from('centavo_movimientos').delete().eq('id', edit.id)
    if (error) return toast(errorMsg(error), 'err')
    await recargar('movimientos')
    toast('Movimiento borrado'); onClose()
  }

  const tono = tipo === 'gasto' ? 'text-rose-600' : tipo === 'ingreso' ? 'text-emerald-600' : 'text-sky-600'
  const mostrarSinCat = tipo !== 'transferencia'

  return (
    <Sheet open={open} onClose={onClose} title={edit ? 'Editar movimiento' : 'Nuevo movimiento'}
      footer={
        <div className="flex gap-2">
          {edit && <Btn variant="danger" onClick={borrar} aria-label="Borrar"><Trash2 size={18} /></Btn>}
          <Btn className="flex-1" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Btn>
        </div>
      }>
      <Seg value={tipo} onChange={(v) => { setTipo(v); setCat(null) }} options={[
        { v: 'gasto', label: 'Gasto', cls: 'text-rose-600' },
        { v: 'ingreso', label: 'Ingreso', cls: 'text-emerald-600' },
        { v: 'transferencia', label: 'Transferir', cls: 'text-sky-600' },
      ]} />

      <MontoInput value={monto} onChange={setMonto} autoFocus={!edit} tone={tono} />

      {mostrarSinCat && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Categoría</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {cats.map((c) => (
              <button key={c.id} type="button" onClick={() => setCat(c.id === cat ? null : c.id)}
                className={cx('flex flex-col items-center gap-1 rounded-2xl border px-1 py-2 text-[11px] font-medium leading-tight transition',
                  cat === c.id ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950' : 'border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60')}>
                <span className="text-xl">{c.icono}</span>
                <span className="w-full truncate text-center">{c.nombre}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{tipo === 'transferencia' ? 'Desde' : tipo === 'ingreso' ? 'A la cuenta' : 'Pagado con'}</p>
      <Chips items={cuentas.map((c) => ({ id: c.id, label: c.nombre, color: c.color }))} value={cta} onChange={setCta} />

      {tipo === 'transferencia' && (
        <>
          <p className="mb-2 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Hacia</p>
          <Chips items={cuentas.filter((c) => c.id !== cta).map((c) => ({ id: c.id, label: c.nombre, color: c.color }))} value={dest} onChange={setDest} />
          {cuenta(dest)?.tipo === 'credito' && <p className="mt-2 text-xs text-slate-500">Se registra como pago a tu tarjeta.</p>}
        </>
      )}

      {tipo === 'gasto' && esCredito && (
        <div className="mt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Meses sin intereses</p>
          <Chips items={[0, 3, 6, 9, 12, 18, 24].map((n) => ({ id: String(n), label: n ? `${n} MSI` : 'Contado' }))} value={String(msi)} onChange={(v) => setMsi(Number(v))} />
          {msi >= 2 && valor > 0 && <p className="mt-2 text-xs text-slate-500">{msi} mensualidades de {money(valor / msi)}</p>}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="flex gap-1">
          {[{ l: 'Hoy', d: hoy() }, { l: 'Ayer', d: iso(new Date(Date.now() - 864e5)) }].map((x) => (
            <button key={x.l} type="button" onClick={() => setFecha(x.d)}
              className={cx('flex-1 rounded-xl px-2 py-2.5 text-sm font-medium', fecha === x.d ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800')}>{x.l}</button>
          ))}
        </div>
        <Input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} className="py-2" />
      </div>
      <Input className="mt-2" placeholder="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />

      {!edit && tipo === 'gasto' && misContactos.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400"><Users size={14} /> Dividir en partes iguales con</p>
          <div className="flex flex-wrap gap-2">
            {misContactos.map((id) => {
              const on = dividir.includes(id)
              return (
                <button key={id} type="button" onClick={() => setDividir(on ? dividir.filter((x) => x !== id) : [...dividir, id])}
                  className={cx('rounded-full px-3 py-1.5 text-sm font-medium', on ? 'bg-violet-600 text-white' : 'bg-slate-100 dark:bg-slate-800')}>{nombreDe(id)}</button>
              )
            })}
          </div>
          {dividir.length > 0 && valor > 0 && <p className="mt-2 text-xs text-slate-500">Cada quien pone {money(valor / (dividir.length + 1))}. Les aparecerá en Compartidos.</p>}
        </div>
      )}
    </Sheet>
  )
}

export function Chips({ items, value, onChange }: { items: { id: string; label: string; color?: string }[]; value: string; onChange: (v: string) => void }) {
  if (!items.length) return <p className="text-sm text-slate-500">No hay cuentas. Agrégalas en Más → Cuentas.</p>
  return (
    <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
      {items.map((it) => (
        <button key={it.id} type="button" onClick={() => onChange(it.id)}
          className={cx('flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition',
            value === it.id ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'border-slate-200 dark:border-slate-700')}>
          {it.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: it.color }} />}
          {it.label}
        </button>
      ))}
    </div>
  )
}
