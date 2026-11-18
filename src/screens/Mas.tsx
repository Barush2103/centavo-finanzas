import { useState } from 'react'
import { ChevronRight, Download, HandCoins, LogOut, PiggyBank, Smartphone, Tags, User, Users, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { useApp } from '../appctx'
import { useData, useMisMovs } from '../data'
import { errorMsg, supabase } from '../lib/supabase'
import type { Categoria } from '../lib/types'
import { Btn, Card, cx, Field, Input, PageTitle, Seg, Sheet, toast } from '../ui'

export default function Mas() {
  const { go } = useApp()
  const { yo } = useData()
  const [cats, setCats] = useState(false)
  const [perfil, setPerfil] = useState(false)
  const [instalar, setInstalar] = useState(false)
  const exportar = useExport()

  return (
    <div>
      <PageTitle title="Más" sub={yo?.email} />
      <Card className="mb-4 p-2">
        <Item icon={<PiggyBank />} label="Presupuesto" onClick={() => go('presupuesto')} />
        <Item icon={<HandCoins />} label="Préstamos y créditos" onClick={() => go('prestamos')} />
        <Item icon={<Users />} label="Compartidos con familia" onClick={() => go('compartidos')} />
        <Item icon={<Wallet />} label="Cuentas y tarjetas" onClick={() => go('cuentas')} />
        <Item icon={<Tags />} label="Categorías" onClick={() => setCats(true)} />
      </Card>
      <Card className="mb-4 p-2">
        <Item icon={<User />} label="Mi perfil" onClick={() => setPerfil(true)} />
        <Item icon={<Smartphone />} label="Instalar en el celular" onClick={() => setInstalar(true)} />
        <Item icon={<Download />} label="Exportar movimientos (CSV)" onClick={exportar} />
        <Item icon={<LogOut />} label="Cerrar sesión" danger onClick={() => supabase.auth.signOut()} />
      </Card>
      <Categorias open={cats} onClose={() => setCats(false)} />
      <Perfil open={perfil} onClose={() => setPerfil(false)} />
      <Sheet open={instalar} onClose={() => setInstalar(false)} title="Instalar como app">
        <div className="space-y-4 pb-4 text-sm">
          <div><p className="font-semibold">iPhone (Safari)</p><p className="text-slate-500">Toca el botón Compartir (cuadro con flecha) → “Agregar a inicio”.</p></div>
          <div><p className="font-semibold">Android (Chrome)</p><p className="text-slate-500">Toca los tres puntos ⋮ → “Instalar app” o “Agregar a pantalla principal”.</p></div>
          <div><p className="font-semibold">Computadora</p><p className="text-slate-500">En Chrome o Edge, el ícono de instalar aparece a la derecha de la barra de direcciones.</p></div>
        </div>
      </Sheet>
    </div>
  )
}

function Item({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cx('flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60', danger && 'text-rose-600')}>
      <span className={cx('[&>svg]:h-5 [&>svg]:w-5', danger ? 'text-rose-500' : 'text-emerald-600')}>{icon}</span>
      <span className="flex-1 font-medium">{label}</span>
      {!danger && <ChevronRight size={18} className="text-slate-300" />}
    </button>
  )
}

function useExport() {
  const { categoria, cuenta } = useData()
  const movs = useMisMovs()
  return () => {
    const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`
    const filas = [['Fecha', 'Tipo', 'Monto', 'Cuenta', 'Cuenta destino', 'Categoría', 'Nota', 'MSI']]
    for (const m of [...movs].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
      filas.push([m.fecha, m.tipo, String(m.monto), cuenta(m.cuenta_id)?.nombre ?? '', cuenta(m.cuenta_destino_id)?.nombre ?? '', categoria(m.categoria_id)?.nombre ?? '', m.nota ?? '', m.msi_meses ? String(m.msi_meses) : ''])
    }
    const blob = new Blob(['﻿' + filas.map((f) => f.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `movimientos-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }
}

function Perfil({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { yo, uid, recargar } = useData()
  const [nombre, setNombre] = useState('')
  const [pass, setPass] = useState('')
  const [k, setK] = useState(false)
  if (open && !k) { setK(true); setNombre(yo?.nombre ?? ''); setPass('') }
  if (!open && k) setK(false)
  async function guardar() {
    const { error } = await supabase.from('centavo_perfiles').update({ nombre: nombre.trim() }).eq('id', uid)
    if (error) return toast(errorMsg(error), 'err')
    if (pass) {
      const { error: e2 } = await supabase.auth.updateUser({ password: pass })
      if (e2) return toast(errorMsg(e2), 'err')
    }
    await recargar('perfiles'); toast('Perfil actualizado'); onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title="Mi perfil" footer={<Btn className="w-full" onClick={guardar}>Guardar</Btn>}>
      <Field label="Nombre (así te ve tu familia)"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
      <Field label="Nueva contraseña" hint="Déjalo vacío para no cambiarla"><Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" minLength={6} /></Field>
    </Sheet>
  )
}

function Categorias({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { categorias, uid, recargar } = useData()
  const [tipo, setTipo] = useState<'gasto' | 'ingreso'>('gasto')
  const [edit, setEdit] = useState<Partial<Categoria> | null>(null)
  const lista = categorias.filter((c) => c.user_id === uid && c.tipo === tipo).sort((a, b) => Number(a.archivada) - Number(b.archivada) || a.orden - b.orden)

  async function guardar() {
    if (!edit?.nombre?.trim()) return toast('Ponle nombre', 'err')
    const row = { nombre: edit.nombre.trim(), icono: edit.icono?.trim() || '•', tipo: edit.tipo ?? tipo, color: edit.color ?? '#64748b', archivada: !!edit.archivada, orden: edit.orden ?? lista.length + 1 }
    const { error } = edit.id ? await supabase.from('centavo_categorias').update(row).eq('id', edit.id) : await supabase.from('centavo_categorias').insert(row)
    if (error) return toast(errorMsg(error), 'err')
    await recargar('categorias'); setEdit(null)
  }

  return (
    <>
      <Sheet open={open && !edit} onClose={onClose} title="Categorías" footer={<Btn className="w-full" onClick={() => setEdit({ tipo, icono: '' })}>Nueva categoría</Btn>}>
        <div className="mb-3"><Seg value={tipo} onChange={setTipo} options={[{ v: 'gasto', label: 'Gastos' }, { v: 'ingreso', label: 'Ingresos' }]} /></div>
        {lista.map((c) => (
          <button key={c.id} onClick={() => setEdit(c)} className={cx('flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800', c.archivada && 'opacity-40')}>
            <span className="text-xl">{c.icono}</span><span className="flex-1">{c.nombre}</span>{c.archivada && <span className="text-xs">oculta</span>}
          </button>
        ))}
      </Sheet>
      <Sheet open={open && !!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar categoría' : 'Nueva categoría'} footer={<Btn className="w-full" onClick={guardar}>Guardar</Btn>}>
        <div className="grid grid-cols-[5rem_1fr] gap-2">
          <Field label="Ícono"><Input value={edit?.icono ?? ''} onChange={(e) => setEdit({ ...edit, icono: e.target.value })} placeholder="🙂" className="text-center text-xl" /></Field>
          <Field label="Nombre"><Input value={edit?.nombre ?? ''} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} /></Field>
        </div>
        {edit?.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={!!edit.archivada} onChange={(e) => setEdit({ ...edit, archivada: e.target.checked })} /> Ocultar (conserva el historial)</label>}
      </Sheet>
    </>
  )
}
