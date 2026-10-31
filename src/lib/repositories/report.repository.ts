import sql from "mssql";
import { getPool } from "../db";
import {
  ReportFilterParams,
  ReportKpiMetrics,
  FinancialAnalytics,
  TaxSummarySunat,
  SalesByDateItem,
  SalesByVoucherType,
  SalesByPaymentMethod,
  TopSellingProduct,
  SalesByCategory,
  SalesByEmployee,
  CustomerAnalyticsItem,
  InventoryAnalytics,
  SupplierOverview,
  ReturnsAnalytics,
  ReportsFilterMetadata,
  CompleteReportsPageData,
} from "@/types/reports";

/**
 * Repositorio de analítica comercial y reportes ejecutivos (Fase 8).
 * Estrictamente 100% LECTURA. CERO INSERT, CERO UPDATE, CERO DELETE.
 * Cero multiplicación cartesiana en consultas agregadas.
 */

// Construcción segura de condiciones WHERE para ventas
function buildSalesConditions(
  filters: ReportFilterParams,
  request: sql.Request
): { whereSql: string; productWhereSql: string } {
  const conditions: string[] = [];
  const prodConditions: string[] = [];

  if (filters.fechaDesde && filters.fechaDesde.trim()) {
    request.input("fechaDesde", sql.VarChar(10), filters.fechaDesde.trim());
    conditions.push("v.Fecha_venta >= @fechaDesde");
  }

  if (filters.fechaHasta && filters.fechaHasta.trim()) {
    request.input("fechaHasta", sql.VarChar(10), filters.fechaHasta.trim());
    conditions.push("v.Fecha_venta <= @fechaHasta");
  }

  if (filters.dniCliente && filters.dniCliente.trim() && filters.dniCliente !== "todos") {
    request.input("dniCliente", sql.VarChar(8), filters.dniCliente.trim());
    conditions.push("v.Dni_cliente = @dniCliente");
  }

  if (filters.idEmpleado && !isNaN(filters.idEmpleado) && filters.idEmpleado > 0) {
    request.input("idEmpleado", sql.Int, filters.idEmpleado);
    conditions.push("v.ID_empleado = @idEmpleado");
  }

  if (filters.idTipoComp && !isNaN(filters.idTipoComp) && filters.idTipoComp > 0) {
    request.input("idTipoComp", sql.Int, filters.idTipoComp);
    conditions.push("v.ID_tipo_comp = @idTipoComp");
  }

  if (filters.idMetodoPago && !isNaN(filters.idMetodoPago) && filters.idMetodoPago > 0) {
    request.input("idMetodoPago", sql.Int, filters.idMetodoPago);
    conditions.push(
      "EXISTS (SELECT 1 FROM dbo.Venta_Metodo_Pago vmp WHERE vmp.ID_venta = v.ID_venta AND vmp.ID_metodo = @idMetodoPago)"
    );
  }

  if (filters.idCategoria && !isNaN(filters.idCategoria) && filters.idCategoria > 0) {
    request.input("idCategoria", sql.Int, filters.idCategoria);
    conditions.push(
      "EXISTS (SELECT 1 FROM dbo.Detalle_Venta dv JOIN dbo.Producto p ON dv.Codbarras_prod = p.Codbarras_prod WHERE dv.ID_venta = v.ID_venta AND p.ID_categoria = @idCategoria)"
    );
    prodConditions.push("p.ID_categoria = @idCategoria");
  }

  if (filters.idMarca && !isNaN(filters.idMarca) && filters.idMarca > 0) {
    request.input("idMarca", sql.Int, filters.idMarca);
    conditions.push(
      "EXISTS (SELECT 1 FROM dbo.Detalle_Venta dv JOIN dbo.Producto p ON dv.Codbarras_prod = p.Codbarras_prod WHERE dv.ID_venta = v.ID_venta AND p.ID_marca = @idMarca)"
    );
    prodConditions.push("p.ID_marca = @idMarca");
  }

  const whereSql = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";
  const productWhereSql = prodConditions.length > 0 ? `AND ${prodConditions.join(" AND ")}` : "";

  return { whereSql, productWhereSql };
}

export async function getReportsFilterMetadata(): Promise<ReportsFilterMetadata> {
  const pool = await getPool();

  const [catRes, marcaRes, empRes, compRes, metRes] = await Promise.all([
    pool.request().query("SELECT ID_categoria AS id, Nombre_cat AS nombre FROM dbo.Categoria ORDER BY Nombre_cat ASC;"),
    pool.request().query("SELECT ID_marca AS id, Nombre_marca AS nombre FROM dbo.Marca ORDER BY Nombre_marca ASC;"),
    pool.request().query("SELECT ID_empleado AS id, (Nombre_emp + ' ' + Apellido_emp) AS nombre FROM dbo.Empleado ORDER BY Nombre_emp ASC;"),
    pool.request().query("SELECT ID_tipo_comp AS id, Nombre_tipo AS nombre FROM dbo.Tipo_Comprobante ORDER BY Nombre_tipo ASC;"),
    pool.request().query("SELECT ID_metodo AS id, Nombre_metodo AS nombre FROM dbo.Metodo_Pago ORDER BY Nombre_metodo ASC;"),
  ]);

  return {
    categorias: catRes.recordset.map((r: any) => ({ id: Number(r.id), nombre: String(r.nombre) })),
    marcas: marcaRes.recordset.map((r: any) => ({ id: Number(r.id), nombre: String(r.nombre) })),
    empleados: empRes.recordset.map((r: any) => ({ id: Number(r.id), nombre: String(r.nombre) })),
    tiposComprobante: compRes.recordset.map((r: any) => ({ id: Number(r.id), nombre: String(r.nombre) })),
    metodosPago: metRes.recordset.map((r: any) => ({ id: Number(r.id), nombre: String(r.nombre) })),
  };
}

export async function getReportKpis(filters: ReportFilterParams = {}): Promise<ReportKpiMetrics> {
  const pool = await getPool();
  const req = pool.request();
  const { whereSql, productWhereSql } = buildSalesConditions(filters, req);

  const query = `
    ;WITH VentasFiltradas AS (
      SELECT v.ID_venta, v.Total_venta
      FROM dbo.Venta v
      WHERE 1=1 ${whereSql}
    ),
    VentasKpi AS (
      SELECT 
        ISNULL(SUM(v.Total_venta), 0) AS ventasTotales,
        COUNT(v.ID_venta) AS comprobantesCount
      FROM VentasFiltradas v
    ),
    UnidadesKpi AS (
      SELECT 
        ISNULL(SUM(dv.Cantidad), 0) AS unidadesVendidas
      FROM dbo.Detalle_Venta dv
      JOIN VentasFiltradas vf ON dv.ID_venta = vf.ID_venta
      JOIN dbo.Producto p ON dv.Codbarras_prod = p.Codbarras_prod
      WHERE 1=1 ${productWhereSql}
    ),
    InventarioKpi AS (
      SELECT 
        COUNT(p.Codbarras_prod) AS productosCatalogo,
        COUNT(CASE WHEN p.Stock = 0 THEN 1 END) AS productosAgotados,
        COUNT(CASE WHEN p.Stock > 0 AND p.Stock <= 5 THEN 1 END) AS productosStockBajo,
        ISNULL(SUM(p.Stock), 0) AS stockTotal,
        ISNULL(SUM(CAST(p.Stock AS DECIMAL(12,2)) * p.Precio), 0) AS valorInventarioVenta
      FROM dbo.Producto p
      WHERE 1=1 ${productWhereSql}
    ),
    DevolucionesKpi AS (
      SELECT 
        COUNT(d.ID_devolucion) AS totalDevoluciones,
        COUNT(CASE WHEN d.ID_estado_dev = 1 THEN 1 END) AS devolucionesPendientes,
        COUNT(CASE WHEN d.ID_estado_dev = 2 THEN 1 END) AS devolucionesAprobadas,
        COUNT(CASE WHEN d.ID_estado_dev = 3 THEN 1 END) AS devolucionesRechazadas,
        ISNULL((SELECT SUM(dd.Cantidad_dev) FROM dbo.Detalle_Dev dd), 0) AS unidadesDevueltasTotal,
        ISNULL((
          SELECT SUM(dd.Cantidad_dev)
          FROM dbo.Detalle_Dev dd
          JOIN dbo.Devolucion d2 ON dd.ID_devolucion = d2.ID_devolucion
          WHERE d2.ID_estado_dev = 2
        ), 0) AS unidadesAprobadasTotal,
        ISNULL((
          SELECT SUM(dd.Cantidad_dev)
          FROM dbo.Detalle_Dev dd
          JOIN dbo.Devolucion d2 ON dd.ID_devolucion = d2.ID_devolucion
          WHERE d2.ID_estado_dev = 3
        ), 0) AS unidadesRechazadasTotal,
        ISNULL((
          SELECT SUM(dd.Cantidad_dev)
          FROM dbo.Detalle_Dev dd
          JOIN dbo.Devolucion d2 ON dd.ID_devolucion = d2.ID_devolucion
          WHERE d2.ID_estado_dev = 1
        ), 0) AS unidadesPendientesTotal,
        ISNULL((
          SELECT SUM(mi.Cantidad)
          FROM dbo.Mov_Inventario mi
          WHERE mi.ID_tipo_mov = 1 AND mi.ID_movimiento >= 50
        ), 0) AS unidadesReingresadasKardex
      FROM dbo.Devolucion d
    )
    SELECT 
      vk.ventasTotales,
      vk.comprobantesCount,
      uk.unidadesVendidas,
      ik.productosCatalogo,
      ik.productosAgotados,
      ik.productosStockBajo,
      ik.stockTotal,
      ik.valorInventarioVenta,
      dk.totalDevoluciones,
      dk.devolucionesPendientes,
      dk.devolucionesAprobadas,
      dk.devolucionesRechazadas,
      dk.unidadesDevueltasTotal,
      dk.unidadesAprobadasTotal,
      dk.unidadesRechazadasTotal,
      dk.unidadesPendientesTotal,
      dk.unidadesReingresadasKardex
    FROM VentasKpi vk
    CROSS JOIN UnidadesKpi uk
    CROSS JOIN InventarioKpi ik
    CROSS JOIN DevolucionesKpi dk;
  `;

  const res = await req.query(query);
  const row = res.recordset[0] || {};

  const ventasTotales = Number(row.ventasTotales || 0);
  const comprobantesCount = Number(row.comprobantesCount || 0);
  const ticketPromedio = comprobantesCount > 0 ? Number((ventasTotales / comprobantesCount).toFixed(2)) : 0;
  const unidadesVendidas = Number(row.unidadesVendidas || 0);
  const unidadesDevueltasTotal = Number(row.unidadesDevueltasTotal || 0);
  const unidadesAprobadasTotal = Number(row.unidadesAprobadasTotal || 0);
  const unidadesRechazadasTotal = Number(row.unidadesRechazadasTotal || 0);
  const unidadesPendientesTotal = Number(row.unidadesPendientesTotal || 0);
  const unidadesReingresadasKardex = Number(row.unidadesReingresadasKardex || 0);

  const tasaRetornoUnidades =
    unidadesVendidas > 0 ? Number(((unidadesDevueltasTotal / unidadesVendidas) * 100).toFixed(2)) : 0;
  const tasaIncidenciaSolicitudes = tasaRetornoUnidades;
  const tasaDevolucionAprobada =
    unidadesVendidas > 0 ? Number(((unidadesAprobadasTotal / unidadesVendidas) * 100).toFixed(2)) : 0;
  const tasaReingresoKardex =
    unidadesVendidas > 0 ? Number(((unidadesReingresadasKardex / unidadesVendidas) * 100).toFixed(2)) : 0;

  return {
    ventasTotales,
    comprobantesCount,
    ticketPromedio,
    unidadesVendidas,
    productosCatalogo: Number(row.productosCatalogo || 0),
    productosAgotados: Number(row.productosAgotados || 0),
    productosStockBajo: Number(row.productosStockBajo || 0),
    stockTotal: Number(row.stockTotal || 0),
    valorInventarioVenta: Number(row.valorInventarioVenta || 0),
    totalDevoluciones: Number(row.totalDevoluciones || 0),
    devolucionesPendientes: Number(row.devolucionesPendientes || 0),
    devolucionesAprobadas: Number(row.devolucionesAprobadas || 0),
    devolucionesRechazadas: Number(row.devolucionesRechazadas || 0),
    unidadesDevueltasTotal,
    tasaRetornoUnidades,
    unidadesReclamadasTotal: unidadesDevueltasTotal,
    unidadesAprobadasTotal,
    unidadesRechazadasTotal,
    unidadesPendientesTotal,
    unidadesReingresadasKardex,
    tasaIncidenciaSolicitudes,
    tasaDevolucionAprobada,
    tasaReingresoKardex,
  };
}

export async function getSalesByDate(filters: ReportFilterParams = {}): Promise<SalesByDateItem[]> {
  const pool = await getPool();
  const req = pool.request();
  const { whereSql, productWhereSql } = buildSalesConditions(filters, req);

  const query = `
    ;WITH VentasFiltradas AS (
      SELECT v.ID_venta, v.Total_venta, v.Fecha_venta
      FROM dbo.Venta v
      WHERE 1=1 ${whereSql}
    ),
    VentasPorFecha AS (
      SELECT 
        CONVERT(VARCHAR(10), vf.Fecha_venta, 120) AS fecha,
        ISNULL(SUM(vf.Total_venta), 0) AS totalVenta,
        COUNT(vf.ID_venta) AS comprobantesCount,
        ISNULL((
          SELECT SUM(dv.Cantidad)
          FROM dbo.Detalle_Venta dv
          JOIN dbo.Producto p ON dv.Codbarras_prod = p.Codbarras_prod
          WHERE dv.ID_venta IN (
            SELECT vf2.ID_venta FROM VentasFiltradas vf2 WHERE vf2.Fecha_venta = vf.Fecha_venta
          )
          ${productWhereSql}
        ), 0) AS unidadesVendidas
      FROM VentasFiltradas vf
      GROUP BY vf.Fecha_venta
    )
    SELECT fecha, totalVenta, comprobantesCount, unidadesVendidas
    FROM VentasPorFecha
    ORDER BY fecha ASC;
  `;

  const res = await req.query(query);
  let acumulado = 0;

  return res.recordset.map((r: any) => {
    const total = Number(r.totalVenta || 0);
    acumulado += total;
    return {
      fecha: String(r.fecha),
      totalVenta: total,
      comprobantesCount: Number(r.comprobantesCount || 0),
      unidadesVendidas: Number(r.unidadesVendidas || 0),
      acumulado: Number(acumulado.toFixed(2)),
    };
  });
}

export async function getSalesByVoucherType(filters: ReportFilterParams = {}): Promise<SalesByVoucherType[]> {
  const pool = await getPool();
  const req = pool.request();
  const { whereSql } = buildSalesConditions(filters, req);

  const query = `
    ;WITH VentasFiltradas AS (
      SELECT v.ID_venta, v.Total_venta, v.ID_tipo_comp
      FROM dbo.Venta v
      WHERE 1=1 ${whereSql}
    )
    SELECT 
      tc.ID_tipo_comp AS idTipoComp,
      tc.Nombre_tipo AS nombreTipo,
      ISNULL(SUM(vf.Total_venta), 0) AS totalVenta,
      COUNT(vf.ID_venta) AS comprobantesCount
    FROM dbo.Tipo_Comprobante tc
    LEFT JOIN VentasFiltradas vf ON tc.ID_tipo_comp = vf.ID_tipo_comp
    GROUP BY tc.ID_tipo_comp, tc.Nombre_tipo
    ORDER BY totalVenta DESC;
  `;

  const res = await req.query(query);
  const totalGlobal = res.recordset.reduce((acc: number, r: any) => acc + Number(r.totalVenta || 0), 0);

  return res.recordset.map((r: any) => {
    const total = Number(r.totalVenta || 0);
    const pct = totalGlobal > 0 ? Number(((total / totalGlobal) * 100).toFixed(2)) : 0;
    return {
      idTipoComp: Number(r.idTipoComp),
      nombreTipo: String(r.nombreTipo),
      totalVenta: total,
      comprobantesCount: Number(r.comprobantesCount || 0),
      porcentaje: pct,
    };
  });
}

export async function getSalesByPaymentMethod(filters: ReportFilterParams = {}): Promise<SalesByPaymentMethod[]> {
  const pool = await getPool();
  const req = pool.request();
  const { whereSql } = buildSalesConditions(filters, req);

  const query = `
    ;WITH VentasFiltradas AS (
      SELECT v.ID_venta
      FROM dbo.Venta v
      WHERE 1=1 ${whereSql}
    )
    SELECT 
      mp.ID_metodo AS idMetodo,
      mp.Nombre_metodo AS nombreMetodo,
      ISNULL(SUM(vmp.Monto_pagado), 0) AS montoPagado,
      COUNT(vmp.ID_venta) AS transaccionesCount
    FROM dbo.Metodo_Pago mp
    LEFT JOIN dbo.Venta_Metodo_Pago vmp ON mp.ID_metodo = vmp.ID_metodo
      AND vmp.ID_venta IN (SELECT vf.ID_venta FROM VentasFiltradas vf)
    GROUP BY mp.ID_metodo, mp.Nombre_metodo
    ORDER BY montoPagado DESC;
  `;

  const res = await req.query(query);
  const totalGlobal = res.recordset.reduce((acc: number, r: any) => acc + Number(r.montoPagado || 0), 0);

  return res.recordset.map((r: any) => {
    const monto = Number(r.montoPagado || 0);
    const pct = totalGlobal > 0 ? Number(((monto / totalGlobal) * 100).toFixed(2)) : 0;
    return {
      idMetodo: Number(r.idMetodo),
      nombreMetodo: String(r.nombreMetodo),
      montoPagado: monto,
      transaccionesCount: Number(r.transaccionesCount || 0),
      porcentaje: pct,
      esEfectivoFisico: Number(r.idMetodo) === 1,
    };
  });
}

export async function getTopSellingProducts(filters: ReportFilterParams = {}): Promise<TopSellingProduct[]> {
  const pool = await getPool();
  const req = pool.request();
  const { whereSql, productWhereSql } = buildSalesConditions(filters, req);

  const query = `
    ;WITH VentasFiltradas AS (
      SELECT v.ID_venta
      FROM dbo.Venta v
      WHERE 1=1 ${whereSql}
    ),
    CostosProd AS (
      SELECT s.Codbarras_prod, AVG(s.Precio_compra) AS costoCompra
      FROM dbo.Suministra s
      GROUP BY s.Codbarras_prod
    )
    SELECT 
      p.Codbarras_prod AS codbarras,
      p.Nombre_prod AS nombreProd,
      c.Nombre_cat AS categoria,
      m.Nombre_marca AS marca,
      p.Precio AS precioUnitario,
      ISNULL(cp.costoCompra, p.Precio * 0.65) AS costoUnitario,
      p.Stock AS stockActual,
      ISNULL(SUM(dv.Cantidad), 0) AS unidadesVendidas,
      ISNULL(SUM(dv.Subtotal), 0) AS totalFacturado
    FROM dbo.Producto p
    JOIN dbo.Categoria c ON p.ID_categoria = c.ID_categoria
    JOIN dbo.Marca m ON p.ID_marca = m.ID_marca
    LEFT JOIN CostosProd cp ON p.Codbarras_prod = cp.Codbarras_prod
    LEFT JOIN dbo.Detalle_Venta dv ON p.Codbarras_prod = dv.Codbarras_prod
      AND dv.ID_venta IN (SELECT vf.ID_venta FROM VentasFiltradas vf)
    WHERE 1=1 ${productWhereSql}
    GROUP BY p.Codbarras_prod, p.Nombre_prod, c.Nombre_cat, m.Nombre_marca, p.Precio, cp.costoCompra, p.Stock
    HAVING ISNULL(SUM(dv.Cantidad), 0) > 0
    ORDER BY unidadesVendidas DESC, totalFacturado DESC;
  `;

  const res = await req.query(query);

  return res.recordset.map((r: any) => {
    const precio = Number(r.precioUnitario);
    const costo = Number(r.costoUnitario);
    const cant = Number(r.unidadesVendidas);
    const tot = Number(r.totalFacturado);
    const ganancia = Math.round((tot - cant * costo) * 100) / 100;
    const margen = tot > 0 ? Number(((ganancia / tot) * 100).toFixed(1)) : 0;

    return {
      codbarras: String(r.codbarras),
      nombreProd: String(r.nombreProd),
      categoria: String(r.categoria),
      marca: String(r.marca),
      precioUnitario: precio,
      costoUnitario: costo,
      stockActual: Number(r.stockActual),
      unidadesVendidas: cant,
      totalFacturado: tot,
      gananciaGenerada: ganancia,
      margenPorcentaje: margen,
    };
  });
}

export async function getSalesByCategory(filters: ReportFilterParams = {}): Promise<SalesByCategory[]> {
  const pool = await getPool();
  const req = pool.request();
  const { whereSql, productWhereSql } = buildSalesConditions(filters, req);

  const query = `
    ;WITH VentasFiltradas AS (
      SELECT v.ID_venta
      FROM dbo.Venta v
      WHERE 1=1 ${whereSql}
    )
    SELECT 
      c.ID_categoria AS idCategoria,
      c.Nombre_cat AS nombreCategoria,
      ISNULL(SUM(dv.Subtotal), 0) AS totalFacturado,
      ISNULL(SUM(dv.Cantidad), 0) AS unidadesVendidas
    FROM dbo.Categoria c
    LEFT JOIN dbo.Producto p ON c.ID_categoria = p.ID_categoria ${productWhereSql}
    LEFT JOIN dbo.Detalle_Venta dv ON p.Codbarras_prod = dv.Codbarras_prod
      AND dv.ID_venta IN (SELECT vf.ID_venta FROM VentasFiltradas vf)
    GROUP BY c.ID_categoria, c.Nombre_cat
    ORDER BY totalFacturado DESC;
  `;

  const res = await req.query(query);
  const totalGlobal = res.recordset.reduce((acc: number, r: any) => acc + Number(r.totalFacturado || 0), 0);

  return res.recordset.map((r: any) => {
    const facturado = Number(r.totalFacturado || 0);
    const pct = totalGlobal > 0 ? Number(((facturado / totalGlobal) * 100).toFixed(2)) : 0;
    return {
      idCategoria: Number(r.idCategoria),
      nombreCategoria: String(r.nombreCategoria),
      totalFacturado: facturado,
      unidadesVendidas: Number(r.unidadesVendidas || 0),
      porcentaje: pct,
    };
  });
}

export async function getSalesByEmployee(filters: ReportFilterParams = {}): Promise<SalesByEmployee[]> {
  const pool = await getPool();
  const req = pool.request();
  const { whereSql } = buildSalesConditions(filters, req);

  const query = `
    ;WITH VentasFiltradas AS (
      SELECT v.ID_venta, v.ID_empleado, v.Total_venta
      FROM dbo.Venta v
      WHERE 1=1 ${whereSql}
    )
    SELECT 
      e.ID_empleado AS idEmpleado,
      (e.Nombre_emp + ' ' + e.Apellido_emp) AS nombreEmpleado,
      COUNT(vf.ID_venta) AS comprobantesCount,
      ISNULL((
        SELECT SUM(dv.Cantidad)
        FROM dbo.Detalle_Venta dv
        WHERE dv.ID_venta IN (SELECT vf2.ID_venta FROM VentasFiltradas vf2 WHERE vf2.ID_empleado = e.ID_empleado)
      ), 0) AS unidadesVendidas,
      ISNULL(SUM(vf.Total_venta), 0) AS totalFacturado,
      (SELECT COUNT(*) FROM dbo.Mov_Inventario mi WHERE mi.ID_empleado = e.ID_empleado) AS movimientosKardexCount,
      (SELECT COUNT(*) FROM dbo.Devolucion d WHERE d.ID_empleado = e.ID_empleado) AS devolucionesTramitadasCount
    FROM dbo.Empleado e
    LEFT JOIN VentasFiltradas vf ON e.ID_empleado = vf.ID_empleado
    GROUP BY e.ID_empleado, e.Nombre_emp, e.Apellido_emp
    ORDER BY totalFacturado DESC;
  `;

  const res = await req.query(query);

  return res.recordset.map((r: any) => {
    const total = Number(r.totalFacturado || 0);
    const count = Number(r.comprobantesCount || 0);
    return {
      idEmpleado: Number(r.idEmpleado),
      nombreEmpleado: String(r.nombreEmpleado),
      comprobantesCount: count,
      unidadesVendidas: Number(r.unidadesVendidas || 0),
      totalFacturado: total,
      ticketPromedio: count > 0 ? Number((total / count).toFixed(2)) : 0,
      movimientosKardexCount: Number(r.movimientosKardexCount || 0),
      devolucionesTramitadasCount: Number(r.devolucionesTramitadasCount || 0),
    };
  });
}

export async function getCustomerAnalytics(filters: ReportFilterParams = {}): Promise<{
  totalClientes: number;
  conCompras: number;
  recurrentes: number;
  lista: CustomerAnalyticsItem[];
}> {
  const pool = await getPool();
  const req = pool.request();
  const { whereSql } = buildSalesConditions(filters, req);

  const [totalRes, customersRes] = await Promise.all([
    pool.request().query("SELECT COUNT(*) AS total FROM dbo.Cliente;"),
    req.query(`
      ;WITH VentasFiltradas AS (
        SELECT v.ID_venta, v.Dni_cliente, v.Total_venta, v.Fecha_venta
        FROM dbo.Venta v
        WHERE 1=1 ${whereSql}
      )
      SELECT 
        c.Dni_cliente AS dniCliente,
        (c.Nombre_cl + ' ' + c.Apellido_cl) AS nombreCliente,
        c.Telefono_cl AS telefono,
        c.Correo_cl AS correo,
        COUNT(vf.ID_venta) AS comprasCount,
        ISNULL((
          SELECT SUM(dv.Cantidad)
          FROM dbo.Detalle_Venta dv
          WHERE dv.ID_venta IN (SELECT vf2.ID_venta FROM VentasFiltradas vf2 WHERE vf2.Dni_cliente = c.Dni_cliente)
        ), 0) AS unidadesCompradas,
        ISNULL(SUM(vf.Total_venta), 0) AS totalGastado,
        CONVERT(VARCHAR(10), MIN(vf.Fecha_venta), 120) AS primeraCompra,
        CONVERT(VARCHAR(10), MAX(vf.Fecha_venta), 120) AS ultimaCompra
      FROM dbo.Cliente c
      JOIN VentasFiltradas vf ON c.Dni_cliente = vf.Dni_cliente
      GROUP BY c.Dni_cliente, c.Nombre_cl, c.Apellido_cl, c.Telefono_cl, c.Correo_cl
      ORDER BY totalGastado DESC;
    `),
  ]);

  const lista: CustomerAnalyticsItem[] = customersRes.recordset.map((r: any) => {
    const comprasCount = Number(r.comprasCount || 0);
    const totalGastado = Number(r.totalGastado || 0);
    return {
      dniCliente: String(r.dniCliente),
      nombreCliente: String(r.nombreCliente),
      telefono: r.telefono ? String(r.telefono) : null,
      correo: String(r.correo),
      comprasCount,
      unidadesCompradas: Number(r.unidadesCompradas || 0),
      totalGastado,
      ticketPromedio: comprasCount > 0 ? Number((totalGastado / comprasCount).toFixed(2)) : 0,
      primeraCompra: String(r.primeraCompra),
      ultimaCompra: String(r.ultimaCompra),
      esRecurrente: comprasCount >= 2,
    };
  });

  const totalClientes = Number(totalRes.recordset[0]?.total || 0);
  const conCompras = lista.length;
  const recurrentes = lista.filter((c) => c.esRecurrente).length;

  return {
    totalClientes,
    conCompras,
    recurrentes,
    lista,
  };
}

export async function getInventoryAnalytics(): Promise<InventoryAnalytics> {
  const pool = await getPool();

  const [catRes, marcaRes, agotadosRes, bajoRes, movsRes, rotacionRes, totalRes] = await Promise.all([
    pool.request().query(`
      SELECT 
        c.ID_categoria AS idCategoria,
        c.Nombre_cat AS categoria,
        ISNULL(SUM(p.Stock), 0) AS stockTotal,
        ISNULL(SUM(CAST(p.Stock AS DECIMAL(12,2)) * p.Precio), 0) AS valorVenta,
        COUNT(p.Codbarras_prod) AS productosCount
      FROM dbo.Categoria c
      LEFT JOIN dbo.Producto p ON c.ID_categoria = p.ID_categoria
      GROUP BY c.ID_categoria, c.Nombre_cat
      ORDER BY stockTotal DESC;
    `),
    pool.request().query(`
      SELECT 
        m.ID_marca AS idMarca,
        m.Nombre_marca AS marca,
        ISNULL(SUM(p.Stock), 0) AS stockTotal,
        ISNULL(SUM(CAST(p.Stock AS DECIMAL(12,2)) * p.Precio), 0) AS valorVenta,
        COUNT(p.Codbarras_prod) AS productosCount
      FROM dbo.Marca m
      LEFT JOIN dbo.Producto p ON m.ID_marca = p.ID_marca
      GROUP BY m.ID_marca, m.Nombre_marca
      ORDER BY stockTotal DESC;
    `),
    pool.request().query(`
      SELECT 
        p.Codbarras_prod AS codbarras,
        p.Nombre_prod AS nombreProd,
        c.Nombre_cat AS categoria,
        m.Nombre_marca AS marca,
        p.Precio AS precio
      FROM dbo.Producto p
      JOIN dbo.Categoria c ON p.ID_categoria = c.ID_categoria
      JOIN dbo.Marca m ON p.ID_marca = m.ID_marca
      WHERE p.Stock = 0
      ORDER BY p.Nombre_prod ASC;
    `),
    pool.request().query(`
      SELECT 
        p.Codbarras_prod AS codbarras,
        p.Nombre_prod AS nombreProd,
        c.Nombre_cat AS categoria,
        m.Nombre_marca AS marca,
        p.Stock AS stock,
        p.Precio AS precio
      FROM dbo.Producto p
      JOIN dbo.Categoria c ON p.ID_categoria = c.ID_categoria
      JOIN dbo.Marca m ON p.ID_marca = m.ID_marca
      WHERE p.Stock > 0 AND p.Stock <= 5
      ORDER BY p.Stock ASC;
    `),
    pool.request().query(`
      SELECT 
        ISNULL(SUM(CASE WHEN ID_tipo_mov = 1 THEN Cantidad END), 0) AS entradasTotal,
        ISNULL(SUM(CASE WHEN ID_tipo_mov = 2 THEN Cantidad END), 0) AS salidasTotal,
        ISNULL(SUM(CASE WHEN ID_tipo_mov NOT IN (1, 2) THEN Cantidad END), 0) AS ajustesTotal
      FROM dbo.Mov_Inventario;
    `),
    pool.request().query(`
      SELECT 
        p.Codbarras_prod AS codbarras,
        p.Nombre_prod AS nombreProd,
        p.Stock AS stockActual,
        ISNULL(SUM(dv.Cantidad), 0) AS unidadesVendidas
      FROM dbo.Producto p
      LEFT JOIN dbo.Detalle_Venta dv ON p.Codbarras_prod = dv.Codbarras_prod
      GROUP BY p.Codbarras_prod, p.Nombre_prod, p.Stock
      ORDER BY unidadesVendidas DESC;
    `),
    pool.request().query(`
      SELECT ISNULL(SUM(CAST(Stock AS DECIMAL(12,2)) * Precio), 0) AS valorTotal
      FROM dbo.Producto;
    `),
  ]);

  const movRow = movsRes.recordset[0] || {};
  const valorTotalInventarioVenta = Number(totalRes.recordset[0]?.valorTotal || 0);

  return {
    stockPorCategoria: catRes.recordset.map((r: any) => ({
      idCategoria: Number(r.idCategoria),
      categoria: String(r.categoria),
      stockTotal: Number(r.stockTotal),
      valorVenta: Number(r.valorVenta),
      productosCount: Number(r.productosCount),
    })),
    stockPorMarca: marcaRes.recordset.map((r: any) => ({
      idMarca: Number(r.idMarca),
      marca: String(r.marca),
      stockTotal: Number(r.stockTotal),
      valorVenta: Number(r.valorVenta),
      productosCount: Number(r.productosCount),
    })),
    productosAgotados: agotadosRes.recordset.map((r: any) => ({
      codbarras: String(r.codbarras),
      nombreProd: String(r.nombreProd),
      categoria: String(r.categoria),
      marca: String(r.marca),
      precio: Number(r.precio),
    })),
    productosStockBajo: bajoRes.recordset.map((r: any) => ({
      codbarras: String(r.codbarras),
      nombreProd: String(r.nombreProd),
      categoria: String(r.categoria),
      marca: String(r.marca),
      stock: Number(r.stock),
      precio: Number(r.precio),
    })),
    movimientosResumen: {
      entradasTotal: Number(movRow.entradasTotal || 0),
      salidasTotal: Number(movRow.salidasTotal || 0),
      ajustesTotal: Number(movRow.ajustesTotal || 0),
    },
    productosRotacion: rotacionRes.recordset.map((r: any) => {
      const vendidas = Number(r.unidadesVendidas || 0);
      const stock = Number(r.stockActual || 0);
      const denom = stock + vendidas;
      const indice = denom > 0 ? Number(((vendidas / denom) * 100).toFixed(1)) : 0;
      return {
        codbarras: String(r.codbarras),
        nombreProd: String(r.nombreProd),
        unidadesVendidas: vendidas,
        stockActual: stock,
        indiceRotacion: indice,
      };
    }),
    valorTotalInventarioVenta,
  };
}

export async function getSupplierAnalytics(): Promise<SupplierOverview> {
  const pool = await getPool();

  const [multiRes, sinProvRes, provsRes, prodsSuministradosRes, relCountRes] = await Promise.all([
    pool.request().query(`
      SELECT 
        p.Codbarras_prod AS codbarras,
        p.Nombre_prod AS nombreProd,
        COUNT(DISTINCT s.ID_proveedor) AS cantidadProveedores,
        ('S/ ' + CAST(MIN(s.Precio_compra) AS VARCHAR(20)) + ' - S/ ' + CAST(MAX(s.Precio_compra) AS VARCHAR(20))) AS rangoPreciosCompra,
        STRING_AGG(pr.Nombre_prov, ', ') WITHIN GROUP (ORDER BY pr.Nombre_prov) AS proveedoresNombres
      FROM dbo.Producto p
      JOIN dbo.Suministra s ON p.Codbarras_prod = s.Codbarras_prod
      JOIN dbo.Proveedor pr ON s.ID_proveedor = pr.ID_proveedor
      GROUP BY p.Codbarras_prod, p.Nombre_prod
      HAVING COUNT(DISTINCT s.ID_proveedor) > 1
      ORDER BY cantidadProveedores DESC;
    `),
    pool.request().query(`
      SELECT 
        p.Codbarras_prod AS codbarras,
        p.Nombre_prod AS nombreProd,
        c.Nombre_cat AS categoria,
        p.Stock AS stock
      FROM dbo.Producto p
      JOIN dbo.Categoria c ON p.ID_categoria = c.ID_categoria
      LEFT JOIN dbo.Suministra s ON p.Codbarras_prod = s.Codbarras_prod
      WHERE s.ID_proveedor IS NULL
      ORDER BY p.Nombre_prod ASC;
    `),
    pool.request().query(`
      SELECT 
        pr.ID_proveedor AS idProveedor,
        pr.Nombre_prov AS nombreProveedor,
        pr.Correo_prov AS correo,
        pr.Telefono_prov AS telefono,
        COUNT(s.Codbarras_prod) AS productosSuministradosCount,
        ISNULL(AVG(s.Precio_compra), 0) AS costoPromedioCompra
      FROM dbo.Proveedor pr
      LEFT JOIN dbo.Suministra s ON pr.ID_proveedor = s.ID_proveedor
      GROUP BY pr.ID_proveedor, pr.Nombre_prov, pr.Correo_prov, pr.Telefono_prov
      ORDER BY productosSuministradosCount DESC, pr.Nombre_prov ASC;
    `),
    pool.request().query(`
      SELECT 
        s.ID_proveedor AS idProveedor,
        p.Codbarras_prod AS codbarras,
        p.Nombre_prod AS nombreProd,
        s.Precio_compra AS precioCompra,
        p.Precio AS precioVenta
      FROM dbo.Suministra s
      JOIN dbo.Producto p ON s.Codbarras_prod = p.Codbarras_prod
      ORDER BY s.ID_proveedor, p.Nombre_prod;
    `),
    pool.request().query("SELECT COUNT(*) AS totalRel FROM dbo.Suministra;"),
  ]);

  const prodsMap = new Map<number, any[]>();
  for (const item of prodsSuministradosRes.recordset) {
    const id = Number(item.idProveedor);
    if (!prodsMap.has(id)) {
      prodsMap.set(id, []);
    }
    prodsMap.get(id)!.push({
      codbarras: String(item.codbarras),
      nombreProd: String(item.nombreProd),
      precioCompra: Number(item.precioCompra),
      precioVenta: Number(item.precioVenta),
    });
  }

  const proveedores = provsRes.recordset.map((r: any) => {
    const id = Number(r.idProveedor);
    return {
      idProveedor: id,
      nombreProveedor: String(r.nombreProveedor),
      correo: String(r.correo),
      telefono: r.telefono ? String(r.telefono) : null,
      productosSuministradosCount: Number(r.productosSuministradosCount || 0),
      costoPromedioCompra: Number(Number(r.costoPromedioCompra || 0).toFixed(2)),
      productos: prodsMap.get(id) || [],
    };
  });

  return {
    totalProveedores: proveedores.length,
    totalRelacionesSuministro: Number(relCountRes.recordset[0]?.totalRel || 0),
    productosConMultiplesProveedores: multiRes.recordset.map((r: any) => ({
      codbarras: String(r.codbarras),
      nombreProd: String(r.nombreProd),
      cantidadProveedores: Number(r.cantidadProveedores),
      rangoPreciosCompra: String(r.rangoPreciosCompra),
      proveedoresNombres: String(r.proveedoresNombres),
    })),
    productosSinProveedor: sinProvRes.recordset.map((r: any) => ({
      codbarras: String(r.codbarras),
      nombreProd: String(r.nombreProd),
      categoria: String(r.categoria),
      stock: Number(r.stock),
    })),
    proveedores,
  };
}

export async function getReturnsAnalytics(filters: ReportFilterParams = {}): Promise<ReturnsAnalytics> {
  const pool = await getPool();

  const [
    estadosRes,
    motivosRes,
    masDevRes,
    fechasRes,
    empRes,
    totalVendidasRes,
    rmaUnidadesRes,
    kardexReingresoRes,
  ] = await Promise.all([
    pool.request().query(`
      SELECT 
        ed.ID_estado_dev AS idEstado,
        ed.Nombre_estado AS estado,
        COUNT(d.ID_devolucion) AS total
      FROM dbo.Estado_Dev ed
      LEFT JOIN dbo.Devolucion d ON ed.ID_estado_dev = d.ID_estado_dev
      GROUP BY ed.ID_estado_dev, ed.Nombre_estado
      ORDER BY ed.ID_estado_dev ASC;
    `),
    pool.request().query(`
      SELECT 
        md.ID_motivo AS idMotivo,
        md.Descripcion_motivo AS motivo,
        COUNT(dd.ID_detalle_dev) AS total,
        ISNULL(SUM(dd.Cantidad_dev), 0) AS unidadesDevueltas
      FROM dbo.Motivo_Dev md
      LEFT JOIN dbo.Detalle_Dev dd ON md.ID_motivo = dd.ID_motivo
      GROUP BY md.ID_motivo, md.Descripcion_motivo
      ORDER BY unidadesDevueltas DESC;
    `),
    pool.request().query(`
      SELECT 
        p.Codbarras_prod AS codbarras,
        p.Nombre_prod AS nombreProd,
        COUNT(DISTINCT dd.ID_devolucion) AS vecesDevuelto,
        ISNULL(SUM(dd.Cantidad_dev), 0) AS unidadesDevueltas,
        ISNULL(SUM(CAST(dd.Cantidad_dev AS DECIMAL(10,2)) * dv.Precio_unitario), 0) AS impactoValorVenta
      FROM dbo.Detalle_Dev dd
      JOIN dbo.Detalle_Venta dv ON dd.ID_detalle = dv.ID_detalle
      JOIN dbo.Producto p ON dv.Codbarras_prod = p.Codbarras_prod
      GROUP BY p.Codbarras_prod, p.Nombre_prod
      ORDER BY unidadesDevueltas DESC;
    `),
    pool.request().query(`
      SELECT 
        CONVERT(VARCHAR(10), d.Fecha_dev, 120) AS fecha,
        COUNT(DISTINCT d.ID_devolucion) AS count,
        ISNULL(SUM(dd.Cantidad_dev), 0) AS unidades
      FROM dbo.Devolucion d
      LEFT JOIN dbo.Detalle_Dev dd ON d.ID_devolucion = dd.ID_devolucion
      GROUP BY d.Fecha_dev
      ORDER BY fecha ASC;
    `),
    pool.request().query(`
      SELECT 
        e.ID_empleado AS idEmpleado,
        (e.Nombre_emp + ' ' + e.Apellido_emp) AS empleado,
        COUNT(d.ID_devolucion) AS totalTramites
      FROM dbo.Empleado e
      JOIN dbo.Devolucion d ON e.ID_empleado = d.ID_empleado
      GROUP BY e.ID_empleado, e.Nombre_emp, e.Apellido_emp
      ORDER BY totalTramites DESC;
    `),
    pool.request().query("SELECT ISNULL(SUM(Cantidad), 0) AS totalVendidas FROM dbo.Detalle_Venta;"),
    pool.request().query(`
      SELECT 
        ISNULL(SUM(CASE WHEN d.ID_estado_dev = 2 THEN dd.Cantidad_dev ELSE 0 END), 0) AS unidadesAprobadas,
        ISNULL(SUM(CASE WHEN d.ID_estado_dev = 3 THEN dd.Cantidad_dev ELSE 0 END), 0) AS unidadesRechazadas,
        ISNULL(SUM(CASE WHEN d.ID_estado_dev = 1 THEN dd.Cantidad_dev ELSE 0 END), 0) AS unidadesPendientes
      FROM dbo.Detalle_Dev dd
      JOIN dbo.Devolucion d ON dd.ID_devolucion = d.ID_devolucion;
    `),
    pool.request().query(`
      SELECT ISNULL(SUM(Cantidad), 0) AS unidadesReingresadasKardex
      FROM dbo.Mov_Inventario
      WHERE ID_tipo_mov = 1 AND ID_movimiento >= 50;
    `),
  ]);

  const totalDevoluciones = estadosRes.recordset.reduce((acc: number, r: any) => acc + Number(r.total || 0), 0);
  const totalDevueltas = motivosRes.recordset.reduce((acc: number, r: any) => acc + Number(r.unidadesDevueltas || 0), 0);
  const totalVendidas = Number(totalVendidasRes.recordset[0]?.totalVendidas || 0);
  const tasaRetorno = totalVendidas > 0 ? Number(((totalDevueltas / totalVendidas) * 100).toFixed(2)) : 0;

  const unidadesAprobadas = Number(rmaUnidadesRes.recordset[0]?.unidadesAprobadas || 0);
  const unidadesRechazadas = Number(rmaUnidadesRes.recordset[0]?.unidadesRechazadas || 0);
  const unidadesPendientes = Number(rmaUnidadesRes.recordset[0]?.unidadesPendientes || 0);
  const unidadesReingresadasKardex = Number(kardexReingresoRes.recordset[0]?.unidadesReingresadasKardex || 0);

  const tasaIncidenciaSolicitudes = tasaRetorno;
  const tasaDevolucionAprobada =
    totalVendidas > 0 ? Number(((unidadesAprobadas / totalVendidas) * 100).toFixed(2)) : 0;
  const tasaReingresoKardex =
    totalVendidas > 0 ? Number(((unidadesReingresadasKardex / totalVendidas) * 100).toFixed(2)) : 0;

  return {
    totalDevoluciones,
    porEstado: estadosRes.recordset.map((r: any) => {
      const tot = Number(r.total || 0);
      return {
        idEstado: Number(r.idEstado),
        estado: String(r.estado),
        total: tot,
        porcentaje: totalDevoluciones > 0 ? Number(((tot / totalDevoluciones) * 100).toFixed(2)) : 0,
      };
    }),
    porMotivo: motivosRes.recordset.map((r: any) => ({
      idMotivo: Number(r.idMotivo),
      motivo: String(r.motivo),
      total: Number(r.total || 0),
      unidadesDevueltas: Number(r.unidadesDevueltas || 0),
    })),
    productosMasDevueltos: masDevRes.recordset.map((r: any) => ({
      codbarras: String(r.codbarras),
      nombreProd: String(r.nombreProd),
      vecesDevuelto: Number(r.vecesDevuelto),
      unidadesDevueltas: Number(r.unidadesDevueltas),
      impactoValorVenta: Number(r.impactoValorVenta),
    })),
    devolucionesPorFecha: fechasRes.recordset.map((r: any) => ({
      fecha: String(r.fecha),
      count: Number(r.count),
      unidades: Number(r.unidades),
    })),
    porEmpleado: empRes.recordset.map((r: any) => ({
      idEmpleado: Number(r.idEmpleado),
      empleado: String(r.empleado),
      totalTramites: Number(r.totalTramites),
    })),
    relacionRetornoVentas: {
      totalVendidas,
      totalDevueltas,
      tasaRetorno,
      unidadesReclamadasTotal: totalDevueltas,
      unidadesAprobadasTotal: unidadesAprobadas,
      unidadesRechazadasTotal: unidadesRechazadas,
      unidadesPendientesTotal: unidadesPendientes,
      unidadesReingresadasKardex,
      tasaIncidenciaSolicitudes,
      tasaDevolucionAprobada,
      tasaReingresoKardex,
    },
  };
}

export async function getFinancialAnalytics(filters: ReportFilterParams = {}): Promise<FinancialAnalytics> {
  const pool = await getPool();
  const req = pool.request();
  const { whereSql } = buildSalesConditions(filters, req);

  // 1. Total ventas brutas
  const salesQuery = `
    SELECT ISNULL(SUM(v.Total_venta), 0) AS ventasBrutas
    FROM dbo.Venta v
    WHERE 1=1 ${whereSql};
  `;
  const salesRes = await req.query(salesQuery);
  const ventasBrutas = Number(salesRes.recordset[0]?.ventasBrutas || 0);

  // 2. Total devoluciones aprobadas en el rango
  const devReq = pool.request();
  if (filters.fechaDesde) devReq.input("fDesde", sql.VarChar(10), filters.fechaDesde);
  if (filters.fechaHasta) devReq.input("fHasta", sql.VarChar(10), filters.fechaHasta);

  const devQuery = `
    SELECT ISNULL(SUM(dd.Cantidad_dev * dv.Precio_unitario), 0) AS devolucionesMonto
    FROM dbo.Detalle_Dev dd
    JOIN dbo.Devolucion d ON dd.ID_devolucion = d.ID_devolucion
    JOIN dbo.Detalle_Venta dv ON dd.ID_detalle = dv.ID_detalle
    WHERE d.ID_estado_dev = 2
      ${filters.fechaDesde ? "AND d.Fecha_dev >= @fDesde" : ""}
      ${filters.fechaHasta ? "AND d.Fecha_dev <= @fHasta" : ""};
  `;
  const devRes = await devReq.query(devQuery);
  const devolucionesMonto = Number(devRes.recordset[0]?.devolucionesMonto || 0);

  // 3. Ventas netas
  const ventasNetasTotal = Math.max(0, ventasBrutas - devolucionesMonto);
  const ventasNetasSinImpuestos = Math.round((ventasNetasTotal / 1.18) * 100) / 100;

  // 4. Costo de ventas real (COGS) según dbo.Suministra
  const cogsReq = pool.request();
  const { whereSql: cogsWhere } = buildSalesConditions(filters, cogsReq);

  const cogsQuery = `
    ;WITH CostosPorProducto AS (
      SELECT 
        s.Codbarras_prod,
        AVG(s.Precio_compra) AS CostoPromedio
      FROM dbo.Suministra s
      GROUP BY s.Codbarras_prod
    ),
    DevolucionesPorDetalle AS (
      SELECT 
        dd.ID_detalle,
        SUM(dd.Cantidad_dev) AS CantidadDevuelta
      FROM dbo.Detalle_Dev dd
      JOIN dbo.Devolucion d ON dd.ID_devolucion = d.ID_devolucion
      WHERE d.ID_estado_dev = 2
      GROUP BY dd.ID_detalle
    )
    SELECT 
      ISNULL(SUM(
        (dv.Cantidad - ISNULL(dpd.CantidadDevuelta, 0)) * 
        ISNULL(cp.CostoPromedio, dv.Precio_unitario * 0.65)
      ), 0) AS costoVentas
    FROM dbo.Detalle_Venta dv
    JOIN dbo.Venta v ON dv.ID_venta = v.ID_venta
    LEFT JOIN CostosPorProducto cp ON dv.Codbarras_prod = cp.Codbarras_prod
    LEFT JOIN DevolucionesPorDetalle dpd ON dv.ID_detalle = dpd.ID_detalle
    WHERE 1=1 ${cogsWhere};
  `;
  const cogsRes = await cogsReq.query(cogsQuery);
  const costoVentas = Math.round(Number(cogsRes.recordset[0]?.costoVentas || 0) * 100) / 100;

  // 5. Ganancia bruta y margen bruto %
  const gananciaBruta = Math.round((ventasNetasSinImpuestos - costoVentas) * 100) / 100;
  const margenBrutoPorcentaje =
    ventasNetasSinImpuestos > 0 ? Number(((gananciaBruta / ventasNetasSinImpuestos) * 100).toFixed(2)) : 0;

  // 6. Gastos operativos, pagos a personal, pagos a proveedores y retiros de caja
  const cashReq = pool.request();
  const cashRes = await cashReq.query(`
    SELECT 
      ISNULL(SUM(CASE WHEN Categoria = 'GASTO_OPERATIVO' THEN Monto ELSE 0 END), 0) AS gastosOperativos,
      ISNULL(SUM(CASE WHEN Categoria = 'PAGO_PERSONAL' THEN Monto ELSE 0 END), 0) AS pagosPersonal,
      ISNULL(SUM(CASE WHEN Categoria = 'PAGO_PROVEEDOR' THEN Monto ELSE 0 END), 0) AS pagosProveedores,
      ISNULL(SUM(CASE WHEN Categoria = 'RETIRO' THEN Monto ELSE 0 END), 0) AS retirosEfectivo,
      ISNULL(SUM(CASE WHEN Tipo = 'INGRESO' AND Afecta_efectivo = 1 THEN Monto ELSE 0 END), 0) -
      ISNULL(SUM(CASE WHEN Tipo = 'EGRESO' AND Afecta_efectivo = 1 THEN Monto ELSE 0 END), 0) AS flujoEfectivoNeto
    FROM dbo.Movimiento_Caja;
  `);

  const gastosOperativos = Number(cashRes.recordset[0]?.gastosOperativos || 0);
  const pagosPersonal = Number(cashRes.recordset[0]?.pagosPersonal || 0);
  const pagosProveedores = Number(cashRes.recordset[0]?.pagosProveedores || 0);
  const retirosEfectivo = Number(cashRes.recordset[0]?.retirosEfectivo || 0);
  const flujoEfectivoNeto = Number(cashRes.recordset[0]?.flujoEfectivoNeto || 0);

  // Saldos pendientes en deudas con proveedores y compromisos laborales
  let cuentasPorPagarPendientes = 0;
  try {
    const cpRes = await pool.request().query(`
      SELECT ISNULL(SUM(Saldo_pendiente), 0) AS saldo 
      FROM dbo.Cuenta_Pagar_Proveedor 
      WHERE Estado NOT IN ('PAGADA', 'ANULADA');
    `);
    cuentasPorPagarPendientes = Number(cpRes.recordset[0]?.saldo || 0);
  } catch {}

  let obligacionesPersonalPendientes = 0;
  try {
    const opRes = await pool.request().query(`
      SELECT ISNULL(SUM(Saldo_pendiente), 0) AS saldo 
      FROM dbo.Obligacion_Personal 
      WHERE Estado NOT IN ('PAGADA', 'ANULADA');
    `);
    obligacionesPersonalPendientes = Number(opRes.recordset[0]?.saldo || 0);
  } catch {}

  // 7. Utilidad Operativa y margen neto %
  // NOTA CONTABLE: El pago a proveedores de mercadería no se descuenta aquí porque el costo del inventario
  // ya se reconoce mediante el Costo de Ventas (COGS) para evitar doble contabilización.
  const utilidadOperativa = Math.round((gananciaBruta - gastosOperativos - pagosPersonal) * 100) / 100;
  const margenNetoPorcentaje =
    ventasNetasSinImpuestos > 0 ? Number(((utilidadOperativa / ventasNetasSinImpuestos) * 100).toFixed(2)) : 0;

  return {
    ventasBrutas,
    descuentos: 0,
    devolucionesMonto,
    ventasNetasTotal,
    ventasNetasSinImpuestos,
    costoVentas,
    gananciaBruta,
    margenBrutoPorcentaje,
    gastosOperativos,
    pagosPersonal,
    cuentasPorPagarPendientes,
    pagosProveedores,
    obligacionesPersonalPendientes,
    retirosEfectivo,
    utilidadOperativa,
    margenNetoPorcentaje,
    flujoEfectivoNeto,
  };
}

export async function getTaxSummarySunat(filters: ReportFilterParams = {}): Promise<TaxSummarySunat> {
  const pool = await getPool();

  // 1. Configuración Tributaria (o fallback seguro)
  let conf = {
    Ruc: "20608945123",
    Razon_social: "MISHUTEC HARDWARE S.A.C.",
    Regimen_tributario: "MYPE Tributario",
    Tasa_igv: 15.5,
    Tasa_ipm: 2.5,
    Tasa_total: 18.0,
  };

  try {
    const confRes = await pool.request().query(`
      SELECT TOP 1 
        Ruc, Razon_social, Regimen_tributario, Tasa_igv, Tasa_ipm, Tasa_total
      FROM dbo.Configuracion_Tributaria;
    `);
    if (confRes.recordset.length > 0) {
      conf = confRes.recordset[0];
    }
  } catch {}

  // 2. Ventas del período
  const salesReq = pool.request();
  const { whereSql } = buildSalesConditions(filters, salesReq);
  const salesRes = await salesReq.query(`
    SELECT ISNULL(SUM(Total_venta), 0) AS totalVentas
    FROM dbo.Venta v
    WHERE 1=1 ${whereSql};
  `);
  const ventasGravadasTotal = Number(salesRes.recordset[0]?.totalVentas || 0);
  const baseImponibleVentas = Math.round((ventasGravadasTotal / 1.18) * 100) / 100;
  const debitoFiscalIgvTotal = Math.round((ventasGravadasTotal - baseImponibleVentas) * 100) / 100;
  const desgloseIgv = Math.round((baseImponibleVentas * 0.155) * 100) / 100;
  const desgloseIpm = Math.round((baseImponibleVentas * 0.025) * 100) / 100;

  // 3. Notas de crédito
  let ajustesNotasCredito = 0;
  try {
    const ncRes = await pool.request().query(`
      SELECT 
        ISNULL(SUM(Monto_total), 0) AS totalNc,
        ISNULL(SUM(Monto_igv), 0) AS igvNc
      FROM dbo.Nota_Credito
      WHERE Estado = 'EMITIDA';
    `);
    ajustesNotasCredito = Number(ncRes.recordset[0]?.igvNc || 0);
  } catch {}
  const debitoFiscalNeto = Math.max(0, Math.round((debitoFiscalIgvTotal - ajustesNotasCredito) * 100) / 100);

  // 4. Compras registradas y Crédito Fiscal (según facturas con comprobante formal y Mov_Inventario)
  let comprasRegistradasTotal = 0;
  let baseImponibleCompras = 0;
  let creditoFiscalSustentado = 0;

  try {
    const cpRes = await pool.request().query(`
      SELECT 
        ISNULL(SUM(Total), 0) AS totalFacturas,
        ISNULL(SUM(Base_imponible), 0) AS baseCompras,
        ISNULL(SUM(CASE WHEN Tiene_credito_fiscal = 1 THEN Impuesto ELSE 0 END), 0) AS creditoFiscal
      FROM dbo.Cuenta_Pagar_Proveedor
      WHERE Estado != 'ANULADA';
    `);

    if (cpRes.recordset.length > 0 && Number(cpRes.recordset[0]?.totalFacturas || 0) > 0) {
      comprasRegistradasTotal = Number(cpRes.recordset[0].totalFacturas);
      baseImponibleCompras = Number(cpRes.recordset[0].baseCompras);
      creditoFiscalSustentado = Number(cpRes.recordset[0].creditoFiscal);
    } else {
      // Fallback a compras de inventario si no hay facturas directas
      const compRes = await pool.request().query(`
        ;WITH CostosSuministro AS (
          SELECT Codbarras_prod, AVG(Precio_compra) AS CostoPromedio
          FROM dbo.Suministra
          GROUP BY Codbarras_prod
        )
        SELECT ISNULL(SUM(mi.Cantidad * cs.CostoPromedio), 0) AS totalCompras
        FROM dbo.Mov_Inventario mi
        JOIN CostosSuministro cs ON mi.Codbarras_prod = cs.Codbarras_prod
        WHERE mi.ID_tipo_mov = 1;
      `);
      comprasRegistradasTotal = Number(compRes.recordset[0]?.totalCompras || 0);
      baseImponibleCompras = Math.round((comprasRegistradasTotal / 1.18) * 100) / 100;
      creditoFiscalSustentado = Math.round((baseImponibleCompras * 0.18) * 100) / 100;
    }
  } catch {}

  // 5. Saldo y pago a cuenta
  const saldoReferencialIgvMes = Math.round((debitoFiscalNeto - creditoFiscalSustentado) * 100) / 100;
  const pagoCuentaRentaEstimado = Math.round((baseImponibleVentas * 0.01) * 100) / 100;

  const now = new Date();
  const periodoFiscal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return {
    ruc: String(conf.Ruc),
    razonSocial: String(conf.Razon_social),
    regimenTributario: String(conf.Regimen_tributario),
    periodoFiscal,
    ventasGravadasTotal,
    ventasExoneradas: 0,
    ventasInafectas: 0,
    baseImponibleVentas,
    tasaIgvPorcentaje: Number(conf.Tasa_igv || 15.5),
    tasaIpmPorcentaje: Number(conf.Tasa_ipm || 2.5),
    tasaTotalPorcentaje: Number(conf.Tasa_total || 18.0),
    debitoFiscalIgvTotal,
    desgloseIgv,
    desgloseIpm,
    ajustesNotasCredito,
    debitoFiscalNeto,
    comprasRegistradasTotal,
    baseImponibleCompras,
    creditoFiscalSustentado,
    saldoReferencialIgvMes,
    pagoCuentaRentaEstimado,
    advertenciaLegal:
      "Resumen fiscal referencial para control interno y simulación SUNAT (Formulario Virtual 621). Desglose 15.5% IGV + 2.5% IPM para 2026. Los montos no constituyen declaración jurada oficial.",
  };
}

export async function getCompleteReportsPageData(
  filters: ReportFilterParams = {}
): Promise<CompleteReportsPageData> {
  const [
    kpis,
    finanzas,
    tributario,
    ventasPorFecha,
    ventasPorComprobante,
    ventasPorMetodoPago,
    topProductos,
    ventasPorCategoria,
    ventasPorEmpleado,
    clientesAnalytics,
    inventarioAnalytics,
    proveedoresAnalytics,
    devolucionesAnalytics,
    metadata,
  ] = await Promise.all([
    getReportKpis(filters),
    getFinancialAnalytics(filters),
    getTaxSummarySunat(filters),
    getSalesByDate(filters),
    getSalesByVoucherType(filters),
    getSalesByPaymentMethod(filters),
    getTopSellingProducts(filters),
    getSalesByCategory(filters),
    getSalesByEmployee(filters),
    getCustomerAnalytics(filters),
    getInventoryAnalytics(),
    getSupplierAnalytics(),
    getReturnsAnalytics(filters),
    getReportsFilterMetadata(),
  ]);

  return {
    kpis,
    finanzas,
    tributario,
    ventasPorFecha,
    ventasPorComprobante,
    ventasPorMetodoPago,
    topProductos,
    ventasPorCategoria,
    ventasPorEmpleado,
    clientesAnalytics,
    inventarioAnalytics,
    proveedoresAnalytics,
    devolucionesAnalytics,
    metadata,
    filtrosAplicados: filters,
  };
}
