export type TipoCuenta = 'efectivo' | 'debito' | 'ahorro' | 'inversion' | 'credito'
export type TipoMov = 'ingreso' | 'gasto' | 'transferencia'
export type Frecuencia = 'semanal' | 'quincenal' | 'mensual'

export interface Perfil { id: string; nombre: string; email: string }

export interface Cuenta {
  id: string; user_id: string; nombre: string; tipo: TipoCuenta
  saldo_inicial: number; limite_credito: number | null
  dia_corte: number | null; dia_pago: number | null
  color: string; archivada: boolean; orden: number
  pendiente_inicial: number; created_at: string
}

export interface Categoria {
  id: string; user_id: string; nombre: string; tipo: 'ingreso' | 'gasto'
  icono: string; color: string; orden: number; archivada: boolean
}

export interface Movimiento {
  id: string; user_id: string; tipo: TipoMov; monto: number; fecha: string
  cuenta_id: string; cuenta_destino_id: string | null; categoria_id: string | null
  nota: string | null; msi_meses: number | null
  prestamo_id: string | null; abono_id: string | null; compartido_id: string | null
  created_at: string
}

export interface Presupuesto { id: string; user_id: string; categoria_id: string; monto: number }

export interface Prestamo {
  id: string; user_id: string; direccion: 'debo' | 'me_deben'
  contraparte_nombre: string; contraparte_id: string | null
  tipo: 'personal' | 'credito'; monto: number; tasa_anual: number
  plazo: number | null; frecuencia: Frecuencia; fecha_inicio: string
  nota: string | null; cerrado: boolean; created_at: string
  pago_fijo: number | null; iva_interes: boolean; base_dias: 'periodo' | '360' | '365'
  saldo_inicial: number | null; pagos_previos: number
}

export interface Abono {
  id: string; prestamo_id: string; user_id: string; monto: number
  fecha: string; nota: string | null; created_at: string
}

export interface Contacto { user_id: string; contacto_id: string }

export interface Compartido {
  id: string; creado_por: string; pagado_por: string; descripcion: string
  monto_total: number; fecha: string; created_at: string
}

export interface Parte { id: string; compartido_id: string; user_id: string; monto: number; liquidado: boolean }
