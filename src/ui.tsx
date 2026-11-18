import { useEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { X } from 'lucide-react'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Sheet({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px] anim-fade" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl anim-up md:max-w-lg md:rounded-3xl dark:bg-slate-900">
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-200 md:hidden dark:bg-slate-700" />
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Cerrar"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-slate-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-slate-800">{footer}</div>}
      </div>
    </div>
  )
}

export function Btn({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'soft' }) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[15px] font-semibold transition active:scale-[.98] disabled:opacity-50',
        variant === 'primary' && 'bg-emerald-600 text-white hover:bg-emerald-700',
        variant === 'soft' && 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300',
        variant === 'ghost' && 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200',
        variant === 'danger' && 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300',
        className,
      )}
    />
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800'
export function Input(p: InputHTMLAttributes<HTMLInputElement>) { return <input {...p} className={cx(inputCls, p.className)} /> }
export function Select(p: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...p} className={cx(inputCls, p.className)} /> }

export function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string; cls?: string }[] }) {
  return (
    <div className="flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)}
          className={cx('flex-1 rounded-xl py-2 text-sm font-semibold transition', value === o.v ? cx('bg-white shadow-sm dark:bg-slate-700', o.cls) : 'text-slate-500')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cx('rounded-3xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900', onClick && 'cursor-pointer active:scale-[.99] transition', className)}>
      {children}
    </div>
  )
}

export function Bar({ value, tone = 'emerald' }: { value: number; tone?: 'emerald' | 'amber' | 'rose' | 'sky' }) {
  const color = { emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500', sky: 'bg-sky-500' }[tone]
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  )
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 text-4xl">{icon}</div>
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-xs text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PageTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {sub && <p className="text-sm text-slate-500">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

// ---------- Toast sencillo ----------
let pushToast: (m: string, tone?: 'ok' | 'err') => void = () => {}
export const toast = (m: string, tone: 'ok' | 'err' = 'ok') => pushToast(m, tone)
export function Toaster() {
  const [t, setT] = useState<{ m: string; tone: 'ok' | 'err'; id: number } | null>(null)
  useEffect(() => {
    pushToast = (m, tone = 'ok') => {
      const id = Date.now()
      setT({ m, tone, id })
      setTimeout(() => setT((cur) => (cur?.id === id ? null : cur)), tone === 'err' ? 4500 : 2200)
    }
  }, [])
  if (!t) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-[60] flex justify-center px-4">
      <div className={cx('anim-down rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-lg', t.tone === 'ok' ? 'bg-slate-900' : 'bg-rose-600')}>{t.m}</div>
    </div>
  )
}

export function MontoInput({ value, onChange, autoFocus, tone }: { value: string; onChange: (v: string) => void; autoFocus?: boolean; tone?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus({ preventScroll: true }), 60) }, [autoFocus])
  return (
    <div className="flex items-center justify-center gap-1 py-2">
      <span className={cx('text-3xl font-semibold', tone ?? 'text-slate-400')}>$</span>
      <input
        ref={ref}
        inputMode="decimal"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
        className={cx('w-full max-w-[14ch] bg-transparent text-center text-5xl font-bold tracking-tight outline-none placeholder:text-slate-300', tone)}
      />
    </div>
  )
}
