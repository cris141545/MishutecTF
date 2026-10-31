export type CashSessionStatus = "ABIERTA" | "CERRADA" | "REABIERTA";

export type CashMovementType = "INGRESO" | "EGRESO";

export type CashMovementCategory =
  | "VENTA"
  | "INGRESO_MANUAL"
  | "GASTO_OPERATIVO"
  | "PAGO_PERSONAL"
  | "PAGO_PROVEEDOR"
  | "RETIRO"
  | "REEMBOLSO_DEVOLUCION"
  | "AJUSTE";

export interface CashSession {
  idSesion: number;
  idEmpleadoApertura: number;
  empleadoAperturaNombre: string;
  fechaApertura: string;
  montoInicial: number;
  fechaCierre: string | null;
  idEmpleadoCierre: number | null;
  empleadoCierreNombre: string | null;
  efectivoEsperado: number | null;
  efectivoContado: number | null;
  diferencia: number | null;
  estado: CashSessionStatus;
  observacionesApertura: string | null;
  observacionesCierre: string | null;
  motivoReapertura: string | null;
  fechaReapertura: string | null;
  idEmpleadoReapertura: number | null;
  totalVentasEfectivo: number;
  totalVentasElectronicas: number;
  totalOtrosIngresosEfectivo: number;
  totalGastosEfectivo: number;
  totalPagosPersonalEfectivo: number;
  totalPagosProveedorEfectivo: number;
  totalRetirosEfectivo: number;
  totalReembolsosEfectivo: number;
  efectivoEsperadoActual: number;
  ventasCount: number;
  movimientosCount: number;
}

export interface CashMovement {
  idMovCaja: number;
  idSesion: number;
  fechaHora: string;
  tipo: CashMovementType;
  categoria: CashMovementCategory;
  monto: number;
  idMetodo: number;
  nombreMetodo: string;
  concepto: string;
  idEmpleado: number;
  nombreEmpleado: string;
  idVenta: number | null;
  idDevolucion: number | null;
  afectaEfectivo: boolean;
}

export interface OpenCashInput {
  idEmpleado: number;
  montoInicial: number;
  observaciones?: string;
}

export interface AddCashMovementInput {
  idSesion: number;
  tipo: CashMovementType;
  categoria: CashMovementCategory;
  monto: number;
  idMetodo: number;
  concepto: string;
  idEmpleado: number;
  idVenta?: number;
  idDevolucion?: number;
}

export interface CloseCashInput {
  idSesion: number;
  idEmpleadoCierre: number;
  efectivoContado: number;
  observacionesCierre?: string;
}

export interface ReopenCashInput {
  idSesion: number;
  idEmpleadoReapertura: number;
  motivoReapertura: string;
}

export interface CashClosingSummary {
  idSesion: number;
  fechaApertura: string;
  fechaCierre: string;
  empleadoApertura: string;
  empleadoCierre: string;
  montoInicial: number;
  ventasCount: number;
  ventasBrutas: number;
  descuentos: number;
  devoluciones: number;
  ventasNetas: number;
  desgloseMetodosPago: Array<{
    idMetodo: number;
    nombreMetodo: string;
    totalCobrado: number;
    totalDevuelto: number;
    saldoNeto: number;
    esEfectivoFisico: boolean;
  }>;
  otrosIngresosEfectivo: number;
  gastosEfectivo: number;
  pagosPersonalEfectivo: number;
  pagosProveedorEfectivo: number;
  retirosEfectivo: number;
  reembolsosEfectivo: number;
  efectivoEsperado: number;
  efectivoContado: number;
  diferencia: number;
  tipoCuadre: "CUADRE_EXACTO" | "FALTANTE" | "SOBRANTE";
  observacionesCierre: string;
}

export interface EmployeePaymentInput {
  idSesion: number;
  idEmpleado: number; // Beneficiario
  periodo: string;
  concepto: string;
  monto: number;
  idMetodo: number;
  idEmpleadoResponsable: number;
  observaciones?: string;
}

export interface EmployeePayment {
  idPagoPersonal: number;
  idEmpleado: number;
  nombreEmpleado: string;
  dniEmpleado: string;
  fechaPago: string;
  periodo: string;
  concepto: string;
  monto: number;
  idMetodo: number;
  nombreMetodo: string;
  idEmpleadoResponsable: number;
  nombreResponsable: string;
  idSesion: number | null;
  observaciones: string | null;
}

export interface ChannelSummaryCard {
  canal: "EFECTIVO" | "YAPE" | "TARJETAS" | "TRANSFERENCIAS";
  titulo: string;
  totalIngresos: number;
  totalEgresos: number;
  saldoNeto: number;
  esEfectivoFisico: boolean;
  detalles: {
    fondoInicial?: number;
    ventas: number;
    otrosIngresos?: number;
    gastosOperativos?: number;
    pagosPersonal?: number;
    pagosProveedor?: number;
    retiros?: number;
    reembolsos: number;
    saldoEsperado?: number;
    saldoContado?: number;
  };
}

export interface CashDashboardData {
  activeSession: CashSession | null;
  recentMovements: CashMovement[];
  pastSessions: CashSession[];
  employees: Array<{ id: number; nombre: string }>;
  suppliers: Array<{ id: number; nombre: string }>;
  paymentMethods: Array<{ id: number; nombre: string }>;
  channelCards?: ChannelSummaryCard[];
  pagosPersonal?: EmployeePayment[];
}
