/**
 * Tipos de datos para el módulo de Devoluciones, Garantías, Notas de Crédito y Reembolsos.
 * Estructuras estrictamente alineadas al esquema físico de SQL Server:
 * dbo.Devolucion, dbo.Detalle_Dev, dbo.Estado_Dev, dbo.Motivo_Dev, dbo.Venta, dbo.Detalle_Venta, dbo.Producto,
 * dbo.Nota_Credito, dbo.Reembolso_Devolucion.
 */

export interface ReturnSummaryItem {
  idDevolucion: number;
  fechaDev: string; // YYYY-MM-DD
  idEstadoDev: number;
  estadoDev: string; // 'Pendiente' | 'Aprobada' | 'Rechazada'
  idVenta: number;
  numeroComprobante: string;
  fechaVenta: string;
  totalVenta: number;
  dniCliente: string;
  clienteNombre: string;
  idEmpleado: number;
  empleadoNombre: string;
  itemsCount: number;
  totalUnidadesDevueltas: number;
  motivos: string[];
  productosDevueltos: Array<{
    codbarras: string;
    nombre: string;
    cantidadDev: number;
    motivo: string;
  }>;
  // Campos de Notas de Crédito y Reembolsos vinculados
  tieneNotaCredito?: boolean;
  numeroNotaCredito?: string | null;
  montoReembolsado?: number;
  metodoReembolso?: string | null;
}

export interface ReturnSaleLineTrace {
  idDetalle: number;
  codbarras: string;
  nombreProd: string;
  precioVentaOriginal: number;
  cantidadVendidaOriginal: number;
  cantidadDevueltaEstaDev: number;
  cantidadDevueltaAprobadaTotal: number;
  cantidadDevueltaPendienteTotal: number;
  cantidadDisponibleDevolucion: number;
  idMotivo: number | null;
  motivo: string | null;
  // Garantía
  garantiaMeses: number;
  fechaVenta: string;
  fechaVencimientoGarantia: string;
  garantiaVigente: boolean;
  diasRestantesGarantia: number;
}

export interface CreditNote {
  idNotaCredito: number;
  numeroNota: string;
  idVenta: number;
  idDevolucion: number | null;
  fechaEmision: string;
  tipoAjuste: "PARCIAL" | "TOTAL";
  motivo: string;
  montoSubtotal: number;
  montoIgv: number;
  montoTotal: number;
  idEmpleado: number;
  nombreEmpleado?: string;
  estado: string;
  esSimulacionAcademica: boolean;
}

export interface Refund {
  idReembolso: number;
  idDevolucion: number;
  idVenta: number;
  idMetodo: number;
  nombreMetodo: string;
  monto: number;
  fechaHora: string;
  idEmpleado: number;
  idSesion: number | null;
  referencia: string | null;
  afectaEfectivo: boolean;
}

export interface ReturnDetail {
  idDevolucion: number;
  fechaDev: string;
  idEstadoDev: number;
  estadoDev: string;
  idVenta: number;
  numeroComprobante: string;
  fechaVenta: string;
  totalVenta: number;
  dniCliente: string;
  clienteNombre: string;
  clienteTelefono: string | null;
  clienteCorreo: string | null;
  idEmpleado: number;
  empleadoNombre: string;
  lineasDevolucion: ReturnSaleLineTrace[];
  todasLasLineasVenta: ReturnSaleLineTrace[];
  totalUnidadesDevueltas: number;
  montoEstimadoDevuelto: number;
  montoConservado: number;
  notaCredito?: CreditNote | null;
  reembolso?: Refund | null;
}

export interface ReturnKpiMetrics {
  totalDevoluciones: number;
  totalAprobadas: number;
  totalPendientes: number;
  totalRechazadas: number;
  totalUnidadesDevueltas: number;
  productosInvolucradosCount: number;
  montoTotalDevueltoEstimado: number;
  totalNotasCreditoEmitidas?: number;
  montoTotalReembolsado?: number;
}

export interface ReturnFilterMetadata {
  estados: Array<{ id: number; nombre: string }>;
  motivos: Array<{ id: number; descripcion: string }>;
  metodosPago: Array<{ id: number; nombre: string }>;
}

export interface ReturnsPageData {
  returns: ReturnSummaryItem[];
  kpis: ReturnKpiMetrics;
  metadata: ReturnFilterMetadata;
}

// ==========================================
// TIPOS TRANSACCIONALES PARA FASE 7B Y NOTAS DE CRÉDITO
// ==========================================

export interface CreateReturnItemInput {
  idDetalle: number;
  cantidadDev: number;
  idMotivo: number;
}

export interface CreateReturnInput {
  idVenta: number;
  idEmpleado: number;
  items: CreateReturnItemInput[];
}

export interface ApproveReturnInput {
  idDevolucion: number;
  idEmpleado?: number;
  reingresoStock?: boolean;
  observaciones?: string;
  // Campos de Reembolso y Nota de Crédito
  idMetodoReembolso?: number; // 1=Efectivo, 2=Tarjeta, 3=Transferencia, 4=Yape
  referenciaReembolso?: string;
  emitirNotaCredito?: boolean;
  motivoNotaCredito?: string;
  idSesionCaja?: number;
}

export interface RejectReturnInput {
  idDevolucion: number;
  idEmpleado?: number;
  motivoRechazo?: string;
}

export interface SaleLineWithBalance {
  idDetalle: number;
  codbarrasProd: string;
  nombreProd: string;
  precioUnitario: number;
  cantidadVendida: number;
  subtotal: number;
  garantiaMeses: number;
  cantidadAprobada: number;
  cantidadPendiente: number;
  cantidadDisponible: number;
  diasGarantiaRestantes: number;
  garantiaVigente: boolean;
  fechaVencimientoGarantia: string;
}

export interface SaleForReturnSearch {
  idVenta: number;
  numeroComprobante: string;
  fechaVenta: string;
  totalVenta: number;
  tipoComprobante: string;
  dniCliente: string;
  nombreCliente: string;
  idEmpleado: number;
  nombreEmpleado: string;
  lineas: SaleLineWithBalance[];
  pagosOriginales?: Array<{
    idMetodo: number;
    nombreMetodo: string;
    monto: number;
  }>;
}

export interface TransactionalReturnResult {
  idDevolucion: number;
  fechaDev: string;
  idEstadoDev: number;
  nombreEstado: string;
  idVenta: number;
  numeroComprobante: string;
  totalItemsAfectados: number;
  totalUnidades: number;
  montoEstimado: number;
  reingresoKardexRealizado?: boolean;
  unidadesReingresadas?: number;
  notaCredito?: {
    idNotaCredito: number;
    numeroNota: string;
    montoTotal: number;
    montoSubtotal: number;
    montoIgv: number;
  };
  reembolso?: {
    idReembolso: number;
    metodo: string;
    monto: number;
    afectaEfectivo: boolean;
  };
}

export interface ReturnReceiptData {
  titulo: string;
  subtitulo: string;
  empresa: {
    nombre: string;
    ruc: string;
    direccion: string;
    telefono?: string;
  };
  numeroDevolucion: string;
  fechaHora: string;
  idVenta: number;
  numeroComprobanteOriginal: string;
  fechaVentaOriginal: string;
  cliente: {
    dni: string;
    nombre: string;
  };
  responsable: {
    idEmpleado: number;
    nombre: string;
  };
  productos: Array<{
    codbarras: string;
    nombre: string;
    cantidadDevuelta: number;
    precioUnitario: number;
    subtotal: number;
    motivo: string;
  }>;
  resumenFinanciero: {
    subtotalDevuelto: number;
    igvDevuelto: number;
    totalDevuelto: number;
    totalVentaOriginal: number;
    montoConservado: number;
  };
  reembolso: {
    metodo: string;
    monto: number;
    estado: string;
    afectaCajaFisica: boolean;
  };
  notaCredito?: {
    numeroNota: string;
    fechaEmision: string;
    tipoAjuste: string;
    baseImponible: number;
    igv: number;
    total: number;
  } | null;
}
