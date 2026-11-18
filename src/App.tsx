import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { CreditCard, HandCoins, Home, LayoutGrid, List, PiggyBank, Plus, Users, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { AppContext } from './appctx'
import type { Tab } from './appctx'
import { DataProvider, useData } from './data'
import { errorMsg, supabase } from './lib/supabase'
import type { Movimiento } from './lib/types'
import Auth from './screens/Auth'
import Compartidos from './screens/Compartidos'
import Cuentas from './screens/Cuentas'
import Inicio from './screens/Inicio'
import Mas from './screens/Mas'
import MovForm from './screens/MovForm'
import type { Preset } from './screens/MovForm'
import Movimientos from './screens/Movimientos'
import Presupuesto from './screens/Presupuesto'
import QuickGasto from './screens/QuickGasto'
import Prestamos from './screens/Prestamos'
import Tarjetas from './screens/Tarjetas'
import { Btn, cx, Field, Input, Sheet, Toaster, toast } from './ui'

const TABS: Tab[] = ['inicio', 'movimientos', 'tarjetas', 'presupuesto', 'prestamos', 'compartidos', 'cuentas', 'mas']
const leerHash = (): Tab => { const h = window.location.hash.slice(1) as Tab; return TABS.includes(h) ? h : 'inicio' }

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((ev, s) => {
      setSession(s)
      if (ev === 'PASSWORD_RECOVERY') setRecovery(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <Splash />
  return (
    <>
      <Toaster />
      {session ? <DataProvider session={session}><Shell /></DataProvider> : <Auth />}
      <NuevaPass open={recovery} onClose={() => setRecovery(false)} />
    </>
  )
}

function Splash() {
  return <div className="flex min-h-dvh items-center justify-center"><img src="/icon.svg" alt="" className="h-14 w-14 animate-pulse rounded-2xl" /></div>
}

function Shell() {
  const { cargando, error, recargar } = useData()
  const [tab, setTab] = useState<Tab>(leerHash)
  const [form, setForm] = useState<{ edit?: Movimiento; preset?: Preset } | null>(null)
  const [rapido, setRapido] = useState(() => window.location.hash === '#gasto')

  useEffect(() => {
    const f = () => {
      if (window.location.hash === '#gasto') { setRapido(true); history.replaceState(null, '', '#inicio'); setTab('inicio'); return }
      setTab(leerHash())
    }
    if (window.location.hash === '#gasto') history.replaceState(null, '', '#inicio')
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])

  const go = useCallback((t: Tab) => { window.location.hash = t; setTab(t); window.scrollTo({ top: 0 }) }, [])
  const ctx = useMemo(() => ({ go, nuevo: (p?: Preset) => (p ? setForm({ preset: p }) : setRapido(true)), editar: (m: Movimiento) => setForm({ edit: m }) }), [go])

  const screen: Record<Tab, ReactNode> = {
    inicio: <Inicio />, movimientos: <Movimientos />, tarjetas: <Tarjetas />, presupuesto: <Presupuesto />,
    prestamos: <Prestamos />, compartidos: <Compartidos />, cuentas: <Cuentas />, mas: <Mas />,
  }

  const side: { t: Tab; label: string; icon: ReactNode }[] = [
    { t: 'inicio', label: 'Inicio', icon: <Home size={20} /> },
    { t: 'movimientos', label: 'Movimientos', icon: <List size={20} /> },
    { t: 'tarjetas', label: 'Tarjetas', icon: <CreditCard size={20} /> },
    { t: 'presupuesto', label: 'Presupuesto', icon: <PiggyBank size={20} /> },
    { t: 'prestamos', label: 'Préstamos', icon: <HandCoins size={20} /> },
    { t: 'compartidos', label: 'Compartidos', icon: <Users size={20} /> },
    { t: 'cuentas', label: 'Cuentas', icon: <Wallet size={20} /> },
    { t: 'mas', label: 'Más', icon: <LayoutGrid size={20} /> },
  ]
  const bottom: { t: Tab; label: string; icon: ReactNode }[] = [side[0], side[1], side[2], side[7]]
  const enMas = !['inicio', 'movimientos', 'tarjetas'].includes(tab)

  return (
    <AppContext.Provider value={ctx}>
      <div className="md:flex">
        {/* Barra lateral (computadora) */}
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-6 flex items-center gap-2 px-2"><img src="/icon.svg" className="h-8 w-8 rounded-lg" alt="" /><span className="text-lg font-bold">Centavo</span></div>
          <Btn className="mb-4" onClick={() => ctx.nuevo()}><Plus size={18} /> Registrar</Btn>
          <nav className="space-y-1">
            {side.map((s) => (
              <button key={s.t} onClick={() => go(s.t)} className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition', tab === s.t ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800')}>
                {s.icon}{s.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="mx-auto w-full max-w-5xl px-4 pb-32 pt-[max(1rem,env(safe-area-inset-top))] md:px-8 md:pb-12 md:pt-8">
          {error && <div className="mb-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">No se pudieron cargar tus datos ({error}). <button className="font-semibold underline" onClick={() => recargar()}>Reintentar</button></div>}
          {cargando ? <Cargando /> : screen[tab]}
        </main>
      </div>

      {/* Navegación inferior (celular) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-900/90">
        <div className="relative grid grid-cols-5">
          {bottom.slice(0, 2).map((b) => <NavBtn key={b.t} {...b} on={tab === b.t} onClick={() => go(b.t)} />)}
          <div className="flex justify-center">
            <button onClick={() => ctx.nuevo()} aria-label="Registrar movimiento" className="-mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/40 transition active:scale-95">
              <Plus size={30} strokeWidth={2.5} />
            </button>
          </div>
          {bottom.slice(2).map((b) => <NavBtn key={b.t} {...b} on={b.t === 'mas' ? enMas : tab === b.t} onClick={() => go(b.t)} />)}
        </div>
      </nav>

      <QuickGasto open={rapido} onClose={() => setRapido(false)} onAvanzado={(p) => { setRapido(false); setForm({ preset: p }) }} />
      <MovForm open={!!form} onClose={() => setForm(null)} edit={form?.edit} preset={form?.preset} />
    </AppContext.Provider>
  )
}

function NavBtn({ label, icon, on, onClick }: { label: string; icon: ReactNode; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cx('flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium', on ? 'text-emerald-600' : 'text-slate-500')}>
      {icon}{label}
    </button>
  )
}

function Cargando() {
  return (
    <div className="space-y-4">
      {[40, 160, 120, 200].map((h, i) => <div key={i} className="animate-pulse rounded-3xl bg-slate-200/70 dark:bg-slate-800" style={{ height: h }} />)}
    </div>
  )
}

function NuevaPass({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [p, setP] = useState('')
  async function guardar() {
    const { error } = await supabase.auth.updateUser({ password: p })
    if (error) return toast(errorMsg(error), 'err')
    toast('Contraseña actualizada'); onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title="Nueva contraseña" footer={<Btn className="w-full" onClick={guardar} disabled={p.length < 6}>Guardar</Btn>}>
      <Field label="Escribe tu nueva contraseña"><Input type="password" autoFocus value={p} onChange={(e) => setP(e.target.value)} minLength={6} autoComplete="new-password" /></Field>
    </Sheet>
  )
}
