/**
 * Tipos para Cuentas por Pagar (Proveedores) y Obligaciones Laborales (Personal)
 * MISHUTEC - Fase 10.2
 */

export type EstadoCuentaPagar =
  | "PENDIENTE"
  | "PARCIALMENTE PAGADA"
  | "PAGADA"
  | "VENCIDA"
  | "ANULADA";

export type CondicionPago = "CONTADO" | "CREDITO";

export interface CuentaPagarProveedor {
  idCuentaPagar: number;
  idProveedor: number;
  nombreProveedor: string;
  telefonoProveedor: string;
  correoProveedor: string;
  numeroDocumento: string;
  fechaEmision: string;
  fechaVencimiento: string;
  condicionPago: CondicionPago;
  total: number;
  montoPagado: number;
  saldoPendiente: number;
  estado: EstadoCuentaPagar;
  baseImponible: number;
  impuesto: number;
  tieneCreditoFiscal: boolean;
  concepto: string;
  observaciones?: string | null;
  fechaRegistro: string;
  pagos: PagoProveedorItem[];
}

export interface PagoProveedorItem {
  idPagoProveedor: number;
  idCuentaPagar: number;
  fechaPago: string;
  monto: number;
  idMetodo: number;
  nombreMetodo: string;
  idEmpleadoResponsable: number;
  nombreEmpleadoResponsable: string;
  idSesion?: number | null;
  referencia?: string | null;
  observaciones?: string | null;
}

export interface CreateAccountPayableDto {
  idProveedor: number;
  numeroDocumento: string;
  fechaEmision: string; // YYYY-MM-DD
  fechaVencimiento?: string; // YYYY-MM-DD, defaults to fechaEmision
  condicionPago: CondicionPago;
  total: number;
  baseImponible?: number;
  impuesto?: number;
  tieneCreditoFiscal?: boolean;
  concepto: string;
  observaciones?: string;
  idEmpleadoResponsable?: number;
  items?: Array<{
    codbarras: string;
    cantidad: number;
    precioUnitario: number;
  }>;
  pagoInicial?: {
    monto: number;
    idMetodo: number;
    idEmpleadoResponsable: number;
    idSesion?: number | null;
    referencia?: string;
    observaciones?: string;
  };
}

export interface RegisterSupplierPaymentDto {
  idCuentaPagar: number;
  monto: number;
  idMetodo: number;
  idEmpleadoResponsable: number;
  idSesion?: number | null;
  referencia?: string;
  observaciones?: string;
}

export type EstadoObligacionPersonal =
  | "PENDIENTE"
  | "PARCIALMENTE PAGADA"
  | "PAGADA"
  | "ANULADA";

export interface ObligacionPersonalItem {
  idObligacion: number;
  idEmpleado: number;
  nombreEmpleado: string;
  dniEmpleado: string;
  periodo: string;
  concepto: string;
  montoPactado: number;
  montoPagado: number;
  saldoPendiente: number;
  estado: EstadoObligacionPersonal;
  idEmpleadoResponsable: number;
  nombreEmpleadoResponsable: string;
  fechaRegistro: string;
  pagos: PagoPersonalDetalleItem[];
}

export interface PagoPersonalDetalleItem {
  idPagoPersonal: number;
  idObligacion?: number | null;
  idEmpleado: number;
  nombreEmpleado: string;
  fechaPago: string;
  periodo: string;
  concepto: string;
  monto: number;
  idMetodo: number;
  nombreMetodo: string;
  idEmpleadoResponsable: number;
  nombreEmpleadoResponsable: string;
  idSesion?: number | null;
  esAdelanto: boolean;
  observaciones?: string | null;
}

export interface CreateEmployeeObligationDto {
  idEmpleado: number;
  periodo: string;
  concepto: string;
  montoPactado: number;
  idEmpleadoResponsable: number;
}

export interface RegisterEmployeeObligationPaymentDto {
  idObligacion?: number | null;
  idEmpleado: number;
  periodo: string;
  concepto: string;
  monto: number;
  idMetodo: number;
  idEmpleadoResponsable: number;
  idSesion?: number | null;
  esAdelanto?: boolean;
  observaciones?: string;
}
