import { useMemo, useState } from 'react'
import { Plus, Trash2, Users } from 'lucide-react'
import { useData, useMisCuentas } from '../data'
import { direccionPara, estadoPrestamo, pagoCalculado, tablaAmortizacion } from '../lib/calc'
import { fechaCorta, hoy, money, parseMonto, sum } from '../lib/fmt'
import { errorMsg, supabase } from '../lib/supabase'
import type { Frecuencia, Prestamo } from '../lib/types'
import { Bar, Btn, Card, cx, Empty, Field, Input, PageTitle, Seg, Select, Sheet, toast } from '../ui'

const FREC: Record<Frecuencia, string> = { semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual' }

export default function Prestamos() {
  const { prestamos, abonos, uid, nombreDe } = useData()
  const [filtro, setFiltro] = useState<'todos' | 'debo' | 'me_deben'>('todos')
  const [cerrados, setCerrados] = useState(false)
  const [nuevo, setNuevo] = useState(false)
  const [detalle, setDetalle] = useState<string | null>(null)

  const lista = useMemo(() => prestamos.map((p) => ({ p, e: estadoPrestamo(p, abonos), dir: direccionPara(p, uid) }))
    .filter((x) => (filtro === 'todos' || x.dir === filtro) && x.p.cerrado === cerrados)
    .sort((a, b) => (a.e.proximaFecha ?? '9').localeCompare(b.e.proximaFecha ?? '9')), [prestamos, abonos, uid, filtro, cerrados])

  const activos = prestamos.filter((p) => !p.cerrado).map((p) => ({ e: estadoPrestamo(p, abonos), dir: direccionPara(p, uid) }))
  const meDeben = sum(activos.filter((x) => x.dir === 'me_deben').map((x) => x.e.saldo))
  const debo = sum(activos.filter((x) => x.dir === 'debo').map((x) => x.e.saldo))
  const sel = prestamos.find((p) => p.id === detalle) ?? null

  return (
    <div>
      <PageTitle title="Préstamos y créditos" right={<Btn onClick={() => setNuevo(true)}><Plus size={18} /> Nuevo</Btn>} />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card><p className="text-xs text-slate-500">Te deben</p><p className="tabular text-2xl font-bold text-emerald-600">{money(meDeben)}</p></Card>
        <Card><p className="text-xs text-slate-500">Debes</p><p className="tabular text-2xl font-bold text-rose-600">{money(debo)}</p></Card>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex-1"><Seg value={filtro} onChange={setFiltro} options={[{ v: 'todos', label: 'Todos' }, { v: 'debo', label: 'Debo' }, { v: 'me_deben', label: 'Me deben' }]} /></div>
        <button onClick={() => setCerrados(!cerrados)} className={cx('rounded-xl px-3 py-2 text-sm font-medium', cerrados ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800')}>Liquidados</button>
      </div>

      {lista.length === 0 ? (
        <Card><Empty icon="🤝" title={cerrados ? 'No hay préstamos liquidados' : 'Sin préstamos activos'} text="Registra lo que debes (créditos, préstamos personales) y lo que te deben, con sus abonos." action={!cerrados && <Btn onClick={() => setNuevo(true)}>Registrar préstamo</Btn>} /></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {lista.map(({ p, e, dir }) => (
            <Card key={p.id} onClick={() => setDetalle(p.id)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.user_id === uid ? p.contraparte_nombre : nombreDe(p.user_id)}</p>
                  <p className="text-xs text-slate-500">
                    <span className={cx('font-semibold', dir === 'debo' ? 'text-rose-600' : 'text-emerald-600')}>{dir === 'debo' ? 'Debes' : 'Te debe'}</span>
                    {' · '}{p.tipo === 'credito' ? 'Crédito' : 'Personal'}{Number(p.tasa_anual) > 0 ? ` · ${Number(p.tasa_anual)}% anual` : ' · sin intereses'}
                    {(p.contraparte_id || p.user_id !== uid) && <> · <Users size={11} className="inline" /> compartido</>}
                  </p>
                </div>
                <p className="tabular shrink-0 text-lg font-bold">{money(e.saldo)}</p>
              </div>
              <div className="mt-3"><Bar value={e.progreso} tone={dir === 'debo' ? 'rose' : 'emerald'} /></div>
              <div className="mt-1 flex justify-between text-xs text-slate-500">
                <span>Pagado {money(e.capitalPagado)} de {money(p.monto)}</span>
                {e.proximaFecha && <span>{e.pago ? `${money(e.pago)} · ` : ''}{fechaCorta(e.proximaFecha)}</span>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <PrestamoForm open={nuevo} onClose={() => setNuevo(false)} />
      <Detalle p={sel} onClose={() => setDetalle(null)} />
    </div>
  )
}

function PrestamoForm({ open, onClose, edit }: { open: boolean; onClose: () => void; edit?: Prestamo | null }) {
  const { contactos, uid, nombreDe, recargar } = useData()
  const cuentas = useMisCuentas()
  const misContactos = [...new Set(contactos.filter((c) => c.user_id === uid).map((c) => c.contacto_id))]
  const [f, setF] = useState<Partial<Prestamo>>({})
  const [monto, setMonto] = useState('')
  const [cta, setCta] = useState('')
  const [k, setK] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [yaPagos, setYaPagos] = useState(false)
  const key = open ? (edit?.id ?? 'nuevo') : null
  if (key && k !== key) {
    setK(key)
    setF(edit ?? { direccion: 'debo', tipo: 'personal', frecuencia: 'mensual', fecha_inicio: hoy(), tasa_anual: 0, base_dias: 'periodo', iva_interes: false, pagos_previos: 0 })
    setMonto(edit ? String(edit.monto) : ''); setCta('')
    setYaPagos(!!edit && (edit.pagos_previos ?? 0) > 0)
  }
  if (!key && k) setK(null)
  const set = (kk: keyof Prestamo, v: unknown) => setF((p) => ({ ...p, [kk]: v }))

  const calc = {
    monto: parseMonto(monto), tasa_anual: Number(f.tasa_anual || 0), frecuencia: f.frecuencia ?? 'mensual', plazo: f.plazo ? Number(f.plazo) : null,
    fecha_inicio: f.fecha_inicio ?? hoy(), iva_interes: !!f.iva_interes, base_dias: f.base_dias ?? 'periodo',
    saldo_inicial: yaPagos && f.saldo_inicial ? parseMonto(String(f.saldo_inicial)) : null, pagos_previos: yaPagos ? Number(f.pagos_previos || 0) : 0,
  }
  const pago = pagoCalculado(calc)
  const pagoBanco = f.pago_fijo ? parseMonto(String(f.pago_fijo)) : 0
  const elegirTipo = (t: string) => setF((p) => ({ ...p, tipo: t as Prestamo['tipo'], ...(t === 'credito' && !edit ? { base_dias: '360', iva_interes: true } : {}) }))

  async function guardar() {
    const m = parseMonto(monto)
    const nombre = f.contraparte_id ? nombreDe(f.contraparte_id) : f.contraparte_nombre?.trim()
    if (!nombre) return toast('¿Con quién es el préstamo?', 'err')
    if (m <= 0) return toast('Escribe el monto', 'err')
    setBusy(true)
    try {
      const row = {
        direccion: f.direccion, contraparte_nombre: nombre, contraparte_id: f.contraparte_id || null, tipo: f.tipo,
        monto: m, tasa_anual: Number(f.tasa_anual || 0), plazo: f.plazo ? Number(f.plazo) : null,
        frecuencia: f.frecuencia, fecha_inicio: f.fecha_inicio, nota: f.nota?.trim() || null,
        pago_fijo: pagoBanco > 0 ? pagoBanco : null, iva_interes: !!f.iva_interes, base_dias: f.base_dias ?? 'periodo',
        pagos_previos: calc.pagos_previos, saldo_inicial: calc.pagos_previos > 0 ? calc.saldo_inicial : null,
      }
      if (calc.pagos_previos > 0 && !calc.saldo_inicial) throw new Error('Escribe el saldo que debes hoy (saldo insoluto)')
      if (calc.pagos_previos > 0 && f.plazo && calc.pagos_previos >= Number(f.plazo)) throw new Error('Los pagos hechos deben ser menos que el plazo')
      if (edit) {
        const { error } = await supabase.from('centavo_prestamos').update(row).eq('id', edit.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('centavo_prestamos').insert(row).select('id').single()
        if (error) throw error
        if (cta) {
          const { error: e2 } = await supabase.from('centavo_movimientos').insert({
            tipo: f.direccion === 'debo' ? 'ingreso' : 'gasto', monto: m, fecha: f.fecha_inicio, cuenta_id: cta,
            prestamo_id: data.id, nota: f.direccion === 'debo' ? `Préstamo de ${nombre}` : `Préstamo a ${nombre}`,
          })
          if (e2) throw e2
        }
      }
      await recargar('prestamos', 'movimientos')
      toast(edit ? 'Préstamo actualizado' : 'Préstamo registrado'); onClose()
    } catch (e) { toast(errorMsg(e), 'err') } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} title={edit ? 'Editar préstamo' : 'Nuevo préstamo o crédito'}
      footer={<Btn className="w-full" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Btn>}>
      <div className="mb-3"><Seg value={f.direccion ?? 'debo'} onChange={(v) => set('direccion', v)} options={[{ v: 'debo', label: 'Yo debo', cls: 'text-rose-600' }, { v: 'me_deben', label: 'Me deben', cls: 'text-emerald-600' }]} /></div>
      <Field label={f.direccion === 'me_deben' ? '¿Quién te debe?' : '¿A quién le debes?'}>
        {misContactos.length > 0 && (
          <Select className="mb-2" value={f.contraparte_id ?? ''} onChange={(e) => set('contraparte_id', e.target.value || null)}>
            <option value="">Otra persona o banco</option>
            {misContactos.map((id) => <option key={id} value={id}>{nombreDe(id)} (lo verá en su app)</option>)}
          </Select>
        )}
        {!f.contraparte_id && <Input value={f.contraparte_nombre ?? ''} onChange={(e) => set('contraparte_nombre', e.target.value)} placeholder="Ej. BBVA crédito auto, Juan" />}
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Monto prestado"><Input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" /></Field>
        <Field label="Tipo"><Select value={f.tipo ?? 'personal'} onChange={(e) => elegirTipo(e.target.value)}><option value="personal">Personal</option><option value="credito">Crédito bancario</option></Select></Field>
        <Field label="Tasa anual %" hint="0 si no cobra intereses"><Input inputMode="decimal" value={f.tasa_anual ?? ''} onChange={(e) => set('tasa_anual', e.target.value)} placeholder="0" /></Field>
        <Field label="Número de pagos" hint="Vacío si no hay plazo"><Input type="number" inputMode="numeric" min={1} value={f.plazo ?? ''} onChange={(e) => set('plazo', e.target.value)} placeholder="Ej. 12" /></Field>
        <Field label="Frecuencia"><Select value={f.frecuencia ?? 'mensual'} onChange={(e) => set('frecuencia', e.target.value)}>{Object.entries(FREC).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label={yaPagos ? 'Fecha de tu último pago' : 'Fecha de inicio'} hint={yaPagos ? 'El siguiente vence un periodo después' : 'El primer pago vence un periodo después'}><Input type="date" value={f.fecha_inicio ?? hoy()} onChange={(e) => set('fecha_inicio', e.target.value)} /></Field>
      </div>

      {Number(f.tasa_anual) > 0 && (
        <div className="mb-3 space-y-2 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <Field label="Cómo calcula el interés">
            <Select value={f.base_dias ?? 'periodo'} onChange={(e) => set('base_dias', e.target.value)}>
              <option value="360">Por días, año de 360 (bancos en México)</option>
              <option value="365">Por días, año de 365</option>
              <option value="periodo">Tasa ÷ número de pagos al año</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={!!f.iva_interes} onChange={(e) => set('iva_interes', e.target.checked)} /> Cobra IVA (16%) sobre los intereses</label>
        </div>
      )}

      <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={yaPagos} onChange={(e) => setYaPagos(e.target.checked)} /> Ya llevo pagos hechos</label>
      {yaPagos && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Pagos ya hechos"><Input type="number" inputMode="numeric" min={1} value={f.pagos_previos || ''} onChange={(e) => set('pagos_previos', e.target.value)} placeholder="Ej. 1" /></Field>
          <Field label="Saldo que debes hoy" hint="“Saldo insoluto” en tu tabla"><Input inputMode="decimal" value={f.saldo_inicial ?? ''} onChange={(e) => set('saldo_inicial', e.target.value)} placeholder="0.00" /></Field>
        </div>
      )}

      {f.plazo && Number(f.tasa_anual) >= 0 && (
        <Field label="Pago que te cobra el banco (opcional)" hint="Ponlo tal cual tu tabla para que todo cuadre exacto. Si lo dejas vacío, lo calculo.">
          <Input inputMode="decimal" value={f.pago_fijo ?? ''} onChange={(e) => set('pago_fijo', e.target.value)} placeholder={pago ? String(pago) : '0.00'} />
        </Field>
      )}
      {pago && (
        <p className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
          Pago {FREC[f.frecuencia ?? 'mensual'].toLowerCase()} calculado: <b className="tabular">{money(pago)}</b>{f.iva_interes ? ' (con IVA)' : ''}
          {pagoBanco > 0 && Math.abs(pagoBanco - pago) > 0.5 && <><br /><span className={Math.abs(pagoBanco - pago) / pago > 0.02 ? 'text-amber-600' : 'text-slate-500'}>Tu banco cobra {money(pagoBanco)} ({pagoBanco > pago ? '+' : ''}{money(pagoBanco - pago)}). {Math.abs(pagoBanco - pago) / pago > 0.02 ? 'Revisa tasa, IVA o cómo calcula el interés.' : 'Diferencia normal por redondeos; uso el de tu banco.'}</span></>}
        </p>
      )}
      <Field label="Nota (opcional)"><Input value={f.nota ?? ''} onChange={(e) => set('nota', e.target.value)} /></Field>
      {!edit && (
        <Field label={f.direccion === 'debo' ? '¿En qué cuenta te cayó el dinero?' : '¿De qué cuenta salió el dinero?'} hint="Opcional. Mueve el saldo de esa cuenta sin contarlo como gasto o ingreso.">
          <Select value={cta} onChange={(e) => setCta(e.target.value)}>
            <option value="">No registrar en cuentas</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
        </Field>
      )}
    </Sheet>
  )
}

function Detalle({ p, onClose }: { p: Prestamo | null; onClose: () => void }) {
  const { abonos, uid, nombreDe, recargar } = useData()
  const cuentas = useMisCuentas()
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [cta, setCta] = useState('')
  const [tabla, setTabla] = useState(false)
  const [editar, setEditar] = useState(false)
  const [k, setK] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const e = p ? estadoPrestamo(p, abonos) : null
  if (p && k !== p.id) { setK(p.id); setMonto(e?.pago ? String(Math.min(e.pago, e.saldo)) : ''); setFecha(hoy()); setCta(''); setTabla(false) }
  if (!p && k) setK(null)
  if (!p || !e) return null

  const dir = direccionPara(p, uid)
  const soyDueño = p.user_id === uid
  const nombre = soyDueño ? p.contraparte_nombre : nombreDe(p.user_id)
  const lista = abonos.filter((a) => a.prestamo_id === p.id).sort((a, b) => b.fecha.localeCompare(a.fecha))
  const filas = tabla ? tablaAmortizacion(p) : []

  async function abonar() {
    const m = parseMonto(monto)
    if (m <= 0) return toast('Escribe el monto del abono', 'err')
    setBusy(true)
    try {
      const { data, error } = await supabase.from('centavo_abonos').insert({ prestamo_id: p!.id, monto: m, fecha }).select('id').single()
      if (error) throw error
      if (cta) {
        const { error: e2 } = await supabase.from('centavo_movimientos').insert({
          tipo: dir === 'debo' ? 'gasto' : 'ingreso', monto: m, fecha, cuenta_id: cta, prestamo_id: p!.id, abono_id: data.id,
          nota: dir === 'debo' ? `Abono a ${nombre}` : `Abono de ${nombre}`,
        })
        if (e2) throw e2
      }
      const nuevoSaldo = estadoPrestamo(p!, [...abonos, { id: 'x', prestamo_id: p!.id, user_id: uid, monto: m, fecha, nota: null, created_at: new Date().toISOString() }]).saldo
      if (nuevoSaldo <= 0 && soyDueño) await supabase.from('centavo_prestamos').update({ cerrado: true }).eq('id', p!.id)
      await recargar('abonos', 'movimientos', 'prestamos')
      toast(nuevoSaldo <= 0 ? '¡Préstamo liquidado! 🎉' : `Abono de ${money(m)} registrado`)
      setMonto('')
    } catch (err) { toast(errorMsg(err), 'err') } finally { setBusy(false) }
  }

  async function borrarAbono(id: string) {
    if (!confirm('¿Borrar este abono?')) return
    const { error } = await supabase.from('centavo_abonos').delete().eq('id', id)
    if (error) return toast(errorMsg(error), 'err')
    if (p!.cerrado && soyDueño) await supabase.from('centavo_prestamos').update({ cerrado: false }).eq('id', p!.id)
    await recargar('abonos', 'movimientos', 'prestamos')
  }

  async function alternarCerrado() {
    const { error } = await supabase.from('centavo_prestamos').update({ cerrado: !p!.cerrado }).eq('id', p!.id)
    if (error) return toast(errorMsg(error), 'err')
    await recargar('prestamos'); toast(p!.cerrado ? 'Préstamo reabierto' : 'Marcado como liquidado'); onClose()
  }

  async function borrar() {
    if (!confirm('¿Borrar este préstamo y todos sus abonos?')) return
    const { error } = await supabase.from('centavo_prestamos').delete().eq('id', p!.id)
    if (error) return toast(errorMsg(error), 'err')
    await recargar('prestamos', 'abonos', 'movimientos'); toast('Préstamo borrado'); onClose()
  }

  return (
    <>
      <Sheet open={!!p && !editar} onClose={onClose} title={nombre}>
        <div className={cx('mb-4 rounded-2xl p-4', dir === 'debo' ? 'bg-rose-50 dark:bg-rose-950/40' : 'bg-emerald-50 dark:bg-emerald-950/40')}>
          <p className="text-sm text-slate-500">{dir === 'debo' ? 'Te falta pagar' : 'Te falta cobrar'}</p>
          <p className="tabular text-3xl font-bold">{money(e.saldo)}</p>
          <div className="mt-2"><Bar value={e.progreso} tone={dir === 'debo' ? 'rose' : 'emerald'} /></div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div><p className="text-xs text-slate-500">Prestado</p><p className="tabular font-semibold">{money(p.monto)}</p></div>
            <div><p className="text-xs text-slate-500">Abonado</p><p className="tabular font-semibold">{money(e.pagado)}</p></div>
            <div><p className="text-xs text-slate-500">Intereses{p.iva_interes ? ' + IVA' : ''}</p><p className="tabular font-semibold">{money(e.intereses + e.iva)}</p></div>
          </div>
          {e.totalRestante > e.saldo && <p className="mt-2 text-xs text-slate-500">Si sigues la tabla, todavía pagarás <b className="tabular">{money(e.totalRestante)}</b>: {money(e.saldo)} de capital y {money(e.interesesRestantes)} de intereses{p.iva_interes ? ' e IVA' : ''}.</p>}
          {e.proximaFecha && <p className="mt-2 text-sm">Siguiente pago: <b>{fechaCorta(e.proximaFecha)}</b>{e.pago ? <> · <b className="tabular">{money(e.pago)}</b></> : null} ({e.pagosHechos}/{p.plazo} pagos)</p>}
          {!soyDueño && <p className="mt-2 text-xs text-slate-500">Registrado por {nombreDe(p.user_id)}. Ambos pueden anotar abonos.</p>}
        </div>

        {!p.cerrado && (
          <div className="mb-4 rounded-2xl border border-slate-100 p-3 dark:border-slate-800">
            <p className="mb-2 font-semibold">Registrar abono</p>
            <div className="grid grid-cols-2 gap-2">
              <Input inputMode="decimal" value={monto} onChange={(ev) => setMonto(ev.target.value)} placeholder="Monto" />
              <Input type="date" value={fecha} onChange={(ev) => setFecha(ev.target.value)} />
            </div>
            <Select className="mt-2" value={cta} onChange={(ev) => setCta(ev.target.value)}>
              <option value="">No mover ninguna cuenta</option>
              {cuentas.map((c) => <option key={c.id} value={c.id}>{dir === 'debo' ? 'Pagado desde' : 'Recibido en'} {c.nombre}</option>)}
            </Select>
            <Btn className="mt-2 w-full" onClick={abonar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar abono'}</Btn>
          </div>
        )}

        <p className="mb-1 font-semibold">Abonos ({lista.length})</p>
        {lista.length === 0 ? <p className="mb-4 text-sm text-slate-500">Aún no hay abonos.</p> : (
          <div className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
            {lista.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2 text-sm">
                <span>{fechaCorta(a.fecha)} <span className="text-slate-500">· {nombreDe(a.user_id)}</span></span>
                <span className="flex items-center gap-2"><b className="tabular">{money(a.monto)}</b>
                  {a.user_id === uid && <button onClick={() => borrarAbono(a.id)} className="p-1 text-slate-400 hover:text-rose-600" aria-label="Borrar abono"><Trash2 size={14} /></button>}
                </span>
              </div>
            ))}
          </div>
        )}

        {p.plazo && (
          <div className="mb-4">
            <button onClick={() => setTabla(!tabla)} className="text-sm font-medium text-emerald-600">{tabla ? 'Ocultar' : 'Ver'} tabla de amortización</button>
            {tabla && (
              <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
                <table className="tabular w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800"><tr><th className="p-2 text-left">#</th><th className="p-2 text-left">Fecha</th><th className="p-2 text-right">Pago</th><th className="p-2 text-right">Capital</th><th className="p-2 text-right">Interés</th>{p.iva_interes && <th className="p-2 text-right">IVA</th>}<th className="p-2 text-right">Saldo</th></tr></thead>
                  <tbody>{filas.map((r) => (
                    <tr key={r.n} className={cx('border-t border-slate-100 dark:border-slate-800', r.n <= e.pagosHechos && 'text-slate-400 line-through')}>
                      <td className="p-2">{r.n}</td><td className="p-2">{fechaCorta(r.fecha)}</td><td className="p-2 text-right">{money(r.pago)}</td><td className="p-2 text-right">{money(r.capital)}</td><td className="p-2 text-right">{money(r.interes)}</td>{p.iva_interes && <td className="p-2 text-right">{money(r.iva)}</td>}<td className="p-2 text-right">{money(r.saldo)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {p.nota && <p className="mb-4 text-sm text-slate-500">📝 {p.nota}</p>}

        {soyDueño && (
          <div className="flex gap-2 pb-2">
            <Btn variant="ghost" className="flex-1" onClick={() => setEditar(true)}>Editar</Btn>
            <Btn variant="soft" className="flex-1" onClick={alternarCerrado}>{p.cerrado ? 'Reabrir' : 'Liquidado'}</Btn>
            <Btn variant="danger" onClick={borrar} aria-label="Borrar"><Trash2 size={18} /></Btn>
          </div>
        )}
      </Sheet>
      <PrestamoForm open={editar} edit={p} onClose={() => setEditar(false)} />
    </>
  )
}
