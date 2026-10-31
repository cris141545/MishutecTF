/**
 * Tipos de datos para el Dashboard y Analítica de Mishutec
 * Mapeo estricto con las entidades de Microsoft SQL Server (MishutecT2)
 */

export interface DashboardKpis {
  totalProductos: number;
  valorInventarioVenta: number;
  ventasAcumuladas: number;
  cantidadVentas: number;
  clientesRegistrados: number;
  productosAgotados: number;
  productosStockBajo: number;
  stockBajoThreshold: number; // Umbral visual configurable (por defecto 5 unidades)
}

export interface SalesTimelinePoint {
  fecha: string;
  fechaLabel: string;
  total: number;       // Venta individual por fecha
  acumulado: number;   // Suma progresiva acumulada hasta la fecha (concilia a S/. 4,050.00)
  ventasCount: number;
}

export interface CategoryDistribution {
  idCategoria: number;
  nombreCategoria: string;
  totalProductos: number;
  stockTotal: number;
  valorInventario: number;
}

export interface RecentSale {
  idVenta: number;
  numeroComprobante: string;
  fecha: string;
  total: number;
  tipoComprobante: string;
  cliente: string;
  dniCliente: string;
  empleado: string;
  metodosPago: string;
}

export interface LowStockProduct {
  codbarras: string;
  nombre: string;
  stock: number;
  precio: number;
  estado: string;
  categoria: string;
  marca: string;
  nivelUrgencia: "Agotado" | "Crítico" | "Bajo";
}

export interface InventoryMovement {
  idMovimiento: number;
  fecha: string;
  cantidad: number;
  tipoMov: "Entrada" | "Salida" | string;
  codbarras: string;
  nombreProducto: string;
  empleado: string;
}

export interface DashboardData {
  kpis: DashboardKpis;
  salesTimeline: SalesTimelinePoint[];
  categories: CategoryDistribution[];
  recentSales: RecentSale[];
  lowStockProducts: LowStockProduct[];
  recentMovements: InventoryMovement[];
  serverInfo: {
    activeDatabase: string;
    databaseUser: string;
    sqlVersion: string;
    queriedAt: string;
  };
}
