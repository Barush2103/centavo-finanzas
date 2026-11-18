import { useState } from 'react'
import { errorMsg, supabase } from '../lib/supabase'
import { Btn, Field, Input, Seg } from '../ui'

export default function Auth() {
  const [modo, setModo] = useState<'entrar' | 'registro'>('entrar')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass })
        if (error) throw error
      } else {
        if (!nombre.trim()) throw new Error('Escribe tu nombre.')
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password: pass,
          options: { data: { nombre: nombre.trim() }, emailRedirectTo: window.location.origin },
        })
        if (error) throw error
        if (!data.session) setMsg({ t: 'Listo. Revisa tu correo y abre el enlace para activar tu cuenta.', ok: true })
      }
    } catch (err) {
      setMsg({ t: errorMsg(err) })
    } finally { setBusy(false) }
  }

  async function olvide() {
    if (!email.trim()) { setMsg({ t: 'Escribe tu correo arriba y vuelve a tocar "Olvidé mi contraseña".' }); return }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
    setMsg(error ? { t: errorMsg(error) } : { t: 'Te enviamos un correo para restablecer tu contraseña.', ok: true })
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-emerald-50 to-slate-50 px-5 dark:from-emerald-950/40 dark:to-slate-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/icon.svg" alt="" className="mx-auto mb-3 h-16 w-16 rounded-2xl shadow-lg" />
          <h1 className="text-3xl font-bold tracking-tight">Centavo</h1>
          <p className="mt-1 text-slate-500">Tus finanzas, al centavo.</p>
        </div>
        <form onSubmit={enviar} className="rounded-3xl bg-white p-5 shadow-xl shadow-emerald-900/5 dark:bg-slate-900">
          <div className="mb-4">
            <Seg value={modo} onChange={(v) => { setModo(v); setMsg(null) }} options={[{ v: 'entrar', label: 'Entrar' }, { v: 'registro', label: 'Crear cuenta' }]} />
          </div>
          {modo === 'registro' && (
            <Field label="Tu nombre"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" placeholder="Ej. Edrick" /></Field>
          )}
          <Field label="Correo"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="tucorreo@gmail.com" /></Field>
          <Field label="Contraseña"><Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} required minLength={6} placeholder="Mínimo 6 caracteres" /></Field>
          {msg && <p className={`mb-3 rounded-xl px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-300'}`}>{msg.t}</p>}
          <Btn type="submit" disabled={busy} className="w-full">{busy ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : 'Crear mi cuenta'}</Btn>
          {modo === 'entrar' && <button type="button" onClick={olvide} className="mt-3 w-full text-center text-sm text-slate-500 hover:text-emerald-600">Olvidé mi contraseña</button>}
        </form>
        <p className="mt-6 text-center text-xs text-slate-400">Cada persona ve solo sus propias finanzas.</p>
      </div>
    </div>
  )
}
