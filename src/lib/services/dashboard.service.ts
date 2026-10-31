import { getPool } from "@/lib/db";
import sql from "mssql";
import {
  DashboardData,
  DashboardKpis,
  SalesTimelinePoint,
  CategoryDistribution,
  RecentSale,
  LowStockProduct,
  InventoryMovement,
} from "@/types/dashboard";

/**
 * Servicio de Acceso a Datos (DAL) para el Dashboard de Mishutec.
 * Ejecuta consultas SQL Server puramente de solo lectura sobre la base MishutecT2.
 * 
 * @param lowStockThreshold - Umbral visual configurable para alertar stock bajo.
 * NOTA: Este umbral es una regla de visualización en la capa de presentación/SaaS,
 * no es una restricción en el esquema físico de la base de datos SQL Server.
 */
export async function getDashboardData(lowStockThreshold: number = 5): Promise<DashboardData> {
  const pool = await getPool();

  // 1. Consulta de KPIs Globales (agregaciones sobre Producto, Venta y Cliente)
  const kpiRequest = pool.request();
  kpiRequest.input("threshold", sql.Int, lowStockThreshold);
  const kpiResult = await kpiRequest.query(`
    SELECT
      (SELECT COUNT(*) FROM dbo.Producto) AS TotalProductos,
      (SELECT ISNULL(SUM(CAST(Stock AS BIGINT) * Precio), 0) FROM dbo.Producto) AS ValorInventarioVenta,
      (SELECT ISNULL(SUM(Total_venta), 0) FROM dbo.Venta) AS VentasAcumuladas,
      (SELECT COUNT(*) FROM dbo.Venta) AS CantidadVentas,
      (SELECT COUNT(*) FROM dbo.Cliente) AS ClientesRegistrados,
      (SELECT COUNT(*) FROM dbo.Producto WHERE Stock = 0) AS ProductosAgotados,
      (SELECT COUNT(*) FROM dbo.Producto WHERE Stock > 0 AND Stock <= @threshold) AS ProductosStockBajo,
      DB_NAME() AS ActiveDb,
      SUSER_SNAME() AS DatabaseUser,
      SUBSTRING(@@VERSION, 1, CHARINDEX(' - ', @@VERSION) - 1) AS SqlVersion
  `);

  const kpiRow = kpiResult.recordset[0] || {};
  const kpis: DashboardKpis = {
    totalProductos: Number(kpiRow.TotalProductos || 0),
    valorInventarioVenta: Number(kpiRow.ValorInventarioVenta || 0),
    ventasAcumuladas: Number(kpiRow.VentasAcumuladas || 0),
    cantidadVentas: Number(kpiRow.CantidadVentas || 0),
    clientesRegistrados: Number(kpiRow.ClientesRegistrados || 0),
    productosAgotados: Number(kpiRow.ProductosAgotados || 0),
    productosStockBajo: Number(kpiRow.ProductosStockBajo || 0),
    stockBajoThreshold: lowStockThreshold,
  };

  // 2. Línea de tiempo de ventas (agrupadas por fecha de venta)
  const salesResult = await pool.request().query(`
    SELECT 
      CONVERT(VARCHAR(10), Fecha_venta, 120) AS Fecha,
      SUM(Total_venta) AS TotalVenta,
      COUNT(*) AS CantidadVentas
    FROM dbo.Venta
    GROUP BY CONVERT(VARCHAR(10), Fecha_venta, 120)
    ORDER BY Fecha ASC
  `);

  const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
  let progressiveSum = 0;
  const salesTimeline: SalesTimelinePoint[] = salesResult.recordset.map((row: any) => {
    const parts = (row.Fecha as string).split("-");
    const day = parts[2];
    const month = monthNames[parseInt(parts[1], 10) - 1] || parts[1];
    const total = Number(row.TotalVenta);
    progressiveSum += total;

    return {
      fecha: row.Fecha,
      fechaLabel: `${day} ${month}`,
      total,
      acumulado: progressiveSum,
      ventasCount: Number(row.CantidadVentas),
    };
  });

  // 3. Distribución de catálogo y stock por Categoría
  const catResult = await pool.request().query(`
    SELECT 
      c.ID_categoria AS IdCategoria,
      c.Nombre_cat AS NombreCategoria,
      COUNT(p.Codbarras_prod) AS TotalProductos,
      ISNULL(SUM(p.Stock), 0) AS StockTotal,
      ISNULL(SUM(CAST(p.Stock AS BIGINT) * p.Precio), 0) AS ValorInventario
    FROM dbo.Categoria c
    LEFT JOIN dbo.Producto p ON c.ID_categoria = p.ID_categoria
    GROUP BY c.ID_categoria, c.Nombre_cat
    ORDER BY TotalProductos DESC, StockTotal DESC
  `);

  const categories: CategoryDistribution[] = catResult.recordset.map((row: any) => ({
    idCategoria: Number(row.IdCategoria),
    nombreCategoria: String(row.NombreCategoria),
    totalProductos: Number(row.TotalProductos),
    stockTotal: Number(row.StockTotal),
    valorInventario: Number(row.ValorInventario),
  }));

  // 4. Últimas Ventas registradas
  const recentSalesResult = await pool.request().query(`
    SELECT 
      v.ID_venta AS IdVenta,
      v.Numero_comprobante AS NumeroComprobante,
      CONVERT(VARCHAR(10), v.Fecha_venta, 120) AS FechaVenta,
      v.Total_venta AS TotalVenta,
      tc.Nombre_tipo AS TipoComprobante,
      c.Nombre_cl + ' ' + c.Apellido_cl AS Cliente,
      v.Dni_cliente AS DniCliente,
      e.Nombre_emp + ' ' + e.Apellido_emp AS Empleado,
      ISNULL(
        (
          SELECT STRING_AGG(mp.Nombre_metodo, ', ')
          FROM dbo.Venta_Metodo_Pago vmp
          JOIN dbo.Metodo_Pago mp ON vmp.ID_metodo = mp.ID_metodo
          WHERE vmp.ID_venta = v.ID_venta
        ), 'Efectivo'
      ) AS MetodosPago
    FROM dbo.Venta v
    JOIN dbo.Tipo_Comprobante tc ON v.ID_tipo_comp = tc.ID_tipo_comp
    JOIN dbo.Cliente c ON v.Dni_cliente = c.Dni_cliente
    JOIN dbo.Empleado e ON v.ID_empleado = e.ID_empleado
    ORDER BY v.Fecha_venta DESC, v.ID_venta DESC
  `);

  const recentSales: RecentSale[] = recentSalesResult.recordset.map((row: any) => ({
    idVenta: Number(row.IdVenta),
    numeroComprobante: String(row.NumeroComprobante),
    fecha: String(row.FechaVenta),
    total: Number(row.TotalVenta),
    tipoComprobante: String(row.TipoComprobante),
    cliente: String(row.Cliente),
    dniCliente: String(row.DniCliente),
    empleado: String(row.Empleado),
    metodosPago: String(row.MetodosPago),
  }));

  // 5. Productos con stock bajo o agotado (Stock <= threshold)
  const lowStockRequest = pool.request();
  lowStockRequest.input("threshold", sql.Int, lowStockThreshold);
  const lowStockResult = await lowStockRequest.query(`
    SELECT 
      p.Codbarras_prod AS Codbarras,
      p.Nombre_prod AS Nombre,
      p.Stock AS Stock,
      p.Precio AS Precio,
      e.Estado AS Estado,
      c.Nombre_cat AS Categoria,
      m.Nombre_marca AS Marca
    FROM dbo.Producto p
    JOIN dbo.Estado_Prod e ON p.ID_estado_prod = e.ID_estado_prod
    JOIN dbo.Categoria c ON p.ID_categoria = c.ID_categoria
    JOIN dbo.Marca m ON p.ID_marca = m.ID_marca
    WHERE p.Stock <= @threshold
    ORDER BY p.Stock ASC, p.Nombre_prod ASC
  `);

  const lowStockProducts: LowStockProduct[] = lowStockResult.recordset.map((row: any) => {
    const stock = Number(row.Stock);
    let nivelUrgencia: "Agotado" | "Crítico" | "Bajo" = "Bajo";
    if (stock === 0) {
      nivelUrgencia = "Agotado";
    } else if (stock <= 3) {
      nivelUrgencia = "Crítico";
    }

    return {
      codbarras: String(row.Codbarras),
      nombre: String(row.Nombre),
      stock,
      precio: Number(row.Precio),
      estado: String(row.Estado),
      categoria: String(row.Categoria),
      marca: String(row.Marca),
      nivelUrgencia,
    };
  });

  // 6. Resumen de Movimientos de Inventario recientes
  const movResult = await pool.request().query(`
    SELECT TOP 6
      m.ID_movimiento AS IdMovimiento,
      CONVERT(VARCHAR(10), m.Fecha, 120) AS Fecha,
      m.Cantidad AS Cantidad,
      tm.Nombre_tipo AS TipoMov,
      p.Codbarras_prod AS Codbarras,
      p.Nombre_prod AS NombreProducto,
      e.Nombre_emp + ' ' + e.Apellido_emp AS Empleado
    FROM dbo.Mov_Inventario m
    JOIN dbo.Tipo_Movimiento tm ON m.ID_tipo_mov = tm.ID_tipo_mov
    JOIN dbo.Producto p ON m.Codbarras_prod = p.Codbarras_prod
    JOIN dbo.Empleado e ON m.ID_empleado = e.ID_empleado
    ORDER BY m.Fecha DESC, m.ID_movimiento DESC
  `);

  const recentMovements: InventoryMovement[] = movResult.recordset.map((row: any) => ({
    idMovimiento: Number(row.IdMovimiento),
    fecha: String(row.Fecha),
    cantidad: Number(row.Cantidad),
    tipoMov: String(row.TipoMov),
    codbarras: String(row.Codbarras),
    nombreProducto: String(row.NombreProducto),
    empleado: String(row.Empleado),
  }));

  return {
    kpis,
    salesTimeline,
    categories,
    recentSales,
    lowStockProducts,
    recentMovements,
    serverInfo: {
      activeDatabase: String(kpiRow.ActiveDb || "MishutecT2"),
      databaseUser: String(kpiRow.DatabaseUser || "SQL Server"),
      sqlVersion: String(kpiRow.SqlVersion || "Microsoft SQL Server"),
      queriedAt: new Date().toISOString(),
    },
  };
}
