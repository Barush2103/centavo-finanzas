import { useMemo, useState } from 'react'
import { Check, Plus, UserPlus } from 'lucide-react'
import { useData } from '../data'
import { direccionPara, estadoPrestamo } from '../lib/calc'
import { fechaCorta, hoy, money, parseMonto, r2, sum } from '../lib/fmt'
import { errorMsg, supabase } from '../lib/supabase'
import { Btn, Card, cx, Empty, Field, Input, PageTitle, Select, Sheet, toast } from '../ui'

export default function Compartidos() {
  const { contactos, compartidos, partes, prestamos, abonos, uid, nombreDe, perfiles, recargar } = useData()
  const [agregar, setAgregar] = useState(false)
  const [nuevo, setNuevo] = useState(false)
  const ids = useMemo(() => [...new Set(contactos.filter((c) => c.user_id === uid).map((c) => c.contacto_id))], [contactos, uid])

  const balances = useMemo(() => ids.map((id) => {
    let meDebe = 0, leDebo = 0
    for (const g of compartidos) {
      const ps = partes.filter((p) => p.compartido_id === g.id && !p.liquidado)
      if (g.pagado_por === uid) meDebe += sum(ps.filter((p) => p.user_id === id).map((p) => p.monto))
      if (g.pagado_por === id) leDebo += sum(ps.filter((p) => p.user_id === uid).map((p) => p.monto))
    }
    let prestNeto = 0
    for (const p of prestamos.filter((x) => !x.cerrado && ((x.user_id === uid && x.contraparte_id === id) || (x.user_id === id && x.contraparte_id === uid)))) {
      const s = estadoPrestamo(p, abonos).saldo
      prestNeto += direccionPara(p, uid) === 'me_deben' ? s : -s
    }
    return { id, meDebe: r2(meDebe), leDebo: r2(leDebo), prestNeto: r2(prestNeto), neto: r2(meDebe - leDebo + prestNeto) }
  }), [ids, compartidos, partes, prestamos, abonos, uid])

  const lista = [...compartidos].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at))

  async function liquidarCon(id: string) {
    const misGastos = compartidos.filter((g) => g.pagado_por === uid).map((g) => g.id)
    const pend = partes.filter((p) => misGastos.includes(p.compartido_id) && p.user_id === id && !p.liquidado).map((p) => p.id)
    if (!pend.length) return
    if (!confirm(`¿${nombreDe(id)} ya te pagó todo lo de gastos compartidos?`)) return
    const { error } = await supabase.from('centavo_compartidos_partes').update({ liquidado: true }).in('id', pend)
    if (error) return toast(errorMsg(error), 'err')
    await recargar('partes'); toast('Cuentas saldadas ✓')
  }

  async function marcar(parteId: string, v: boolean) {
    const { error } = await supabase.from('centavo_compartidos_partes').update({ liquidado: v }).eq('id', parteId)
    if (error) return toast(errorMsg(error), 'err')
    await recargar('partes')
  }

  async function borrar(id: string) {
    if (!confirm('¿Borrar este gasto compartido para todos?')) return
    const { error } = await supabase.from('centavo_compartidos').delete().eq('id', id)
    if (error) return toast(errorMsg(error), 'err')
    await recargar('compartidos', 'partes')
  }

  return (
    <div>
      <PageTitle title="Compartidos" sub="Cuentas claras con tu familia" right={<Btn variant="soft" onClick={() => setAgregar(true)}><UserPlus size={18} /> Agregar</Btn>} />

      {ids.length === 0 ? (
        <Card><Empty icon="👨‍👩‍👧‍👦" title="Agrega a tu familia" text="Cuando tu novia, hermanos o papás creen su cuenta, agrégalos con su correo. Así pueden dividir gastos y compartir préstamos. Nadie ve tus cuentas ni movimientos." action={<Btn onClick={() => setAgregar(true)}>Agregar por correo</Btn>} /></Card>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {balances.map((b) => (
              <Card key={b.id}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">{nombreDe(b.id).slice(0, 1).toUpperCase()}</div>
                    <div>
                      <p className="font-semibold">{nombreDe(b.id)}</p>
                      <p className="text-xs text-slate-500">{perfiles.find((p) => p.id === b.id)?.email}</p>
                    </div>
                  </div>
                </div>
                <p className={cx('tabular mt-3 text-xl font-bold', b.neto > 0 ? 'text-emerald-600' : b.neto < 0 ? 'text-rose-600' : 'text-slate-500')}>
                  {b.neto > 0 ? `Te debe ${money(b.neto)}` : b.neto < 0 ? `Le debes ${money(-b.neto)}` : 'Están a mano'}
                </p>
                {(b.meDebe > 0 || b.leDebo > 0 || b.prestNeto !== 0) && (
                  <p className="mt-1 text-xs text-slate-500">
                    {[b.meDebe > 0 && `gastos: te debe ${money(b.meDebe)}`, b.leDebo > 0 && `gastos: le debes ${money(b.leDebo)}`, b.prestNeto !== 0 && `préstamos: ${b.prestNeto > 0 ? 'te debe' : 'le debes'} ${money(Math.abs(b.prestNeto))}`].filter(Boolean).join(' · ')}
                  </p>
                )}
                {b.meDebe > 0 && <Btn variant="soft" className="mt-3 w-full py-2 text-sm" onClick={() => liquidarCon(b.id)}><Check size={16} /> Ya me pagó los gastos</Btn>}
              </Card>
            ))}
          </div>

          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold">Gastos compartidos</p>
            <Btn variant="ghost" className="py-2 text-sm" onClick={() => setNuevo(true)}><Plus size={16} /> Nuevo</Btn>
          </div>
          {lista.length === 0 ? (
            <Card><p className="text-sm text-slate-500">Al registrar un gasto con +, elige “Dividir con” para que aparezca aquí. También puedes anotar uno que pagó otra persona con “Nuevo”.</p></Card>
          ) : (
            <div className="space-y-2">
              {lista.map((g) => {
                const ps = partes.filter((p) => p.compartido_id === g.id)
                const yoPague = g.pagado_por === uid
                const miParte = ps.find((p) => p.user_id === uid)
                return (
                  <Card key={g.id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{g.descripcion}</p>
                        <p className="text-xs text-slate-500">{fechaCorta(g.fecha)} · pagó {nombreDe(g.pagado_por)} · total {money(g.monto_total)}</p>
                      </div>
                      {!yoPague && miParte && <span className={cx('shrink-0 rounded-full px-2 py-1 text-xs font-semibold', miParte.liquidado ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950' : 'bg-rose-50 text-rose-600 dark:bg-rose-950')}>{miParte.liquidado ? 'Pagado' : `Debes ${money(miParte.monto)}`}</span>}
                    </div>
                    {yoPague && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {ps.filter((p) => p.user_id !== uid).map((p) => (
                          <button key={p.id} onClick={() => marcar(p.id, !p.liquidado)}
                            className={cx('rounded-full px-3 py-1 text-xs font-semibold', p.liquidado ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300')}>
                            {p.liquidado ? '✓ ' : ''}{nombreDe(p.user_id)} · {money(p.monto)}
                          </button>
                        ))}
                        {g.creado_por === uid && <button onClick={() => borrar(g.id)} className="ml-auto text-xs text-slate-400 hover:text-rose-600">Borrar</button>}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      <AgregarContacto open={agregar} onClose={() => setAgregar(false)} />
      <NuevoCompartido open={nuevo} onClose={() => setNuevo(false)} ids={ids} />
    </div>
  )
}

function AgregarContacto({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { recargar } = useData()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  async function guardar() {
    setBusy(true)
    const { data, error } = await supabase.rpc('centavo_agregar_contacto', { correo: email })
    setBusy(false)
    if (error) return toast(errorMsg(error), 'err')
    await recargar('contactos', 'perfiles')
    const p = (data as { nombre: string }[])?.[0]
    toast(`${p?.nombre ?? 'Contacto'} agregado`); setEmail(''); onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title="Agregar familiar" footer={<Btn className="w-full" onClick={guardar} disabled={busy || !email.includes('@')}>Agregar</Btn>}>
      <Field label="Correo con el que se registró" hint="Primero debe crear su cuenta en esta app. Solo podrán ver lo que compartan entre ustedes.">
        <Input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@gmail.com" onKeyDown={(e) => e.key === 'Enter' && guardar()} />
      </Field>
    </Sheet>
  )
}

function NuevoCompartido({ open, onClose, ids }: { open: boolean; onClose: () => void; ids: string[] }) {
  const { uid, nombreDe, recargar } = useData()
  const [desc, setDesc] = useState('')
  const [monto, setMonto] = useState('')
  const [pago, setPago] = useState(uid)
  const [fecha, setFecha] = useState(hoy())
  const [quienes, setQuienes] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const todos = [uid, ...ids]
  const sel = quienes.length ? quienes : todos
  const v = parseMonto(monto)

  async function guardar() {
    if (!desc.trim() || v <= 0) return toast('Escribe descripción y monto', 'err')
    const personas = [...new Set([pago, ...sel])].filter((p) => sel.includes(p))
    if (personas.length < 2) return toast('Elige al menos a dos personas', 'err')
    const base = Math.floor((v * 100) / personas.length) / 100
    const resto = r2(v - base * personas.length)
    setBusy(true)
    const { error } = await supabase.rpc('centavo_crear_compartido', {
      p_descripcion: desc.trim(), p_monto: v, p_fecha: fecha, p_pagado_por: pago,
      p_partes: personas.map((p, i) => ({ user_id: p, monto: i === 0 ? r2(base + resto) : base })),
    })
    setBusy(false)
    if (error) return toast(errorMsg(error), 'err')
    await recargar('compartidos', 'partes'); toast('Gasto compartido guardado')
    setDesc(''); setMonto(''); setQuienes([]); onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Nuevo gasto compartido" footer={<Btn className="w-full" onClick={guardar} disabled={busy}>Guardar</Btn>}>
      <Field label="¿Qué fue?"><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ej. Cena, súper de la casa" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Total"><Input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" /></Field>
        <Field label="Fecha"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Field>
      </div>
      <Field label="¿Quién pagó?"><Select value={pago} onChange={(e) => setPago(e.target.value)}>{todos.map((id) => <option key={id} value={id}>{id === uid ? 'Yo' : nombreDe(id)}</option>)}</Select></Field>
      <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">Se divide entre</p>
      <div className="flex flex-wrap gap-2">
        {todos.map((id) => {
          const on = sel.includes(id)
          return <button key={id} type="button" onClick={() => setQuienes(on ? sel.filter((x) => x !== id) : [...sel, id])} className={cx('rounded-full px-3 py-1.5 text-sm font-medium', on ? 'bg-violet-600 text-white' : 'bg-slate-100 dark:bg-slate-800')}>{id === uid ? 'Yo' : nombreDe(id)}</button>
        })}
      </div>
      {v > 0 && sel.length > 0 && <p className="mt-3 text-sm text-slate-500">{money(v / sel.length)} por persona</p>}
    </Sheet>
  )
}
