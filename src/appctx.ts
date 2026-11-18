import { createContext, useContext } from 'react'
import type { Movimiento } from './lib/types'
import type { Preset } from './screens/MovForm'

export type Tab = 'inicio' | 'movimientos' | 'tarjetas' | 'presupuesto' | 'prestamos' | 'compartidos' | 'cuentas' | 'mas'

export interface AppCtx {
  go: (t: Tab) => void
  nuevo: (p?: Preset) => void
  editar: (m: Movimiento) => void
}
export const AppContext = createContext<AppCtx>({ go: () => {}, nuevo: () => {}, editar: () => {} })
export const useApp = () => useContext(AppContext)
