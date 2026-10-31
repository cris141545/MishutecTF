export type SaleStatus =
  | "PENDIENTE"
  | "COMPLETADA"
  | "PARCIALMENTE DEVUELTA"
  | "TOTALMENTE DEVUELTA"
  | "ANULADA";

export interface SaleListItem {
  idVenta: number;
  numeroComprobante: string;
  fecha: string;
  total: number;
  estado?: SaleStatus;
  idTipoComp: number;
  tipoComprobante: string;
  dniCliente: string;
  clienteNombre: string;
  idEmpleado: number;
  empleadoNombre: string;
  metodosPago: string;
  totalItems: number;
}

export interface SaleDetailItem {
  idDetalle: number;
  codbarras: string;
  nombreProducto: string;
  categoria: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface SalePaymentMethodItem {
  idMetodo: number;
  nombreMetodo: string;
  monto: number;
}

export interface SaleDetail {
  idVenta: number;
  numeroComprobante: string;
  fecha: string;
  total: number;
  estado?: SaleStatus;
  idTipoComp: number;
  tipoComprobante: string;
  dniCliente: string;
  clienteNombre: string;
  clienteTelefono: string | null;
  clienteCorreo: string;
  idEmpleado: number;
  empleadoNombre: string;
  detalles: SaleDetailItem[];
  pagos: SalePaymentMethodItem[];
  sumDetalles: number;
  sumPagos: number;
  isReconciled: boolean;
  efectivoRecibido?: number | null;
  vuelto?: number | null;
}

export interface SalesKpis {
  totalVentasAcumuladas: number;
  cantidadVentas: number;
  ticketPromedio: number;
  totalBoletas: number;
  totalFacturas: number;
  ventasPorPeriodo: Array<{
    periodo: string;
    label: string;
    monto: number;
    cantidad: number;
  }>;
}

export interface SalesFilterMetadata {
  clientes: Array<{ dni: string; nombreCompleto: string }>;
  empleados: Array<{ id: number; nombreCompleto: string }>;
  tiposComprobante: Array<{ id: number; nombre: string }>;
  metodosPago: Array<{ id: number; nombre: string }>;
}

export interface SalesPageData {
  kpis: SalesKpis;
  sales: SaleListItem[];
  metadata: SalesFilterMetadata;
}

export interface PosProductItem {
  codbarras: string;
  nombre: string;
  precio: number;
  stock: number;
  categoria: string;
  marca: string;
  idEstado: number;
  estado: string;
}

export interface PosCartItem {
  producto: PosProductItem;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface PosPaymentAllocation {
  idMetodo: number;
  nombreMetodo: string;
  monto: number;
}
