import sql from "mssql";
import { getPool } from "../db";
import {
  SaleListItem,
  SaleDetail,
  SaleDetailItem,
  SalePaymentMethodItem,
  SalesKpis,
  SalesFilterMetadata,
  SalesPageData,
  PosProductItem,
} from "@/types/sales";

export interface SalesFilterParams {
  search?: string;
  dniCliente?: string;
  idEmpleado?: number;
  idTipoComp?: number;
  fechaDesde?: string;
  fechaHasta?: string;
}

/**
 * Obtiene el listado de ventas con filtros aplicados, KPIs globales y metadatos de filtrado.
 */
export async function getSalesData(filters: SalesFilterParams = {}): Promise<SalesPageData> {
  const pool = await getPool();

  // 1. Construcción dinámica del WHERE
  const conditions: string[] = [];
  const request = pool.request();

  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    request.input("searchTerm", sql.VarChar(100), term);
    conditions.push(`(
      v.Numero_comprobante LIKE @searchTerm OR 
      c.Nombre_cl LIKE @searchTerm OR 
      c.Apellido_cl LIKE @searchTerm OR 
      v.Dni_cliente LIKE @searchTerm
    )`);
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

  if (filters.fechaDesde && filters.fechaDesde.trim()) {
    request.input("fechaDesde", sql.VarChar(10), filters.fechaDesde.trim());
    conditions.push("v.Fecha_venta >= @fechaDesde");
  }

  if (filters.fechaHasta && filters.fechaHasta.trim()) {
    request.input("fechaHasta", sql.VarChar(10), filters.fechaHasta.trim());
    conditions.push("v.Fecha_venta <= @fechaHasta");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // 2. Consulta de Ventas
  const salesQuery = `
    SELECT 
      v.ID_venta AS idVenta,
      v.Numero_comprobante AS numeroComprobante,
      CONVERT(VARCHAR(10), v.Fecha_venta, 120) AS fecha,
      v.Total_venta AS total,
      ISNULL(v.Estado, 'COMPLETADA') AS estado,
      v.ID_tipo_comp AS idTipoComp,
      tc.Nombre_tipo AS tipoComprobante,
      v.Dni_cliente AS dniCliente,
      CONCAT(c.Nombre_cl, ' ', c.Apellido_cl) AS clienteNombre,
      v.ID_empleado AS idEmpleado,
      CONCAT(e.Nombre_emp, ' ', e.Apellido_emp) AS empleadoNombre,
      ISNULL(pag.metodosPago, 'Sin método') AS metodosPago,
      ISNULL(det.totalItems, 0) AS totalItems
    FROM dbo.Venta v
    JOIN dbo.Tipo_Comprobante tc ON v.ID_tipo_comp = tc.ID_tipo_comp
    JOIN dbo.Cliente c ON v.Dni_cliente = c.Dni_cliente
    JOIN dbo.Empleado e ON v.ID_empleado = e.ID_empleado
    LEFT JOIN (
      SELECT 
        vmp.ID_venta,
        STRING_AGG(mp.Nombre_metodo, ', ') WITHIN GROUP (ORDER BY mp.Nombre_metodo) AS metodosPago
      FROM dbo.Venta_Metodo_Pago vmp
      JOIN dbo.Metodo_Pago mp ON vmp.ID_metodo = mp.ID_metodo
      GROUP BY vmp.ID_venta
    ) pag ON v.ID_venta = pag.ID_venta
    LEFT JOIN (
      SELECT 
        dv.ID_venta,
        SUM(dv.Cantidad) AS totalItems
      FROM dbo.Detalle_Venta dv
      GROUP BY dv.ID_venta
    ) det ON v.ID_venta = det.ID_venta
    ${whereClause}
    ORDER BY v.Fecha_venta DESC, v.ID_venta DESC;
  `;

  // 3. Consulta de KPIs (sobre la totalidad de ventas en BD)
  const kpiQuery = `
    SELECT 
      ISNULL(SUM(v.Total_venta), 0) AS totalVentasAcumuladas,
      COUNT(v.ID_venta) AS cantidadVentas,
      ISNULL(AVG(v.Total_venta), 0) AS ticketPromedio,
      COUNT(CASE WHEN v.ID_tipo_comp = 1 THEN 1 END) AS totalBoletas,
      COUNT(CASE WHEN v.ID_tipo_comp = 2 THEN 1 END) AS totalFacturas
    FROM dbo.Venta v;
  `;

  // 4. Ventas agrupadas por período
  const periodQuery = `
    SELECT 
      FORMAT(v.Fecha_venta, 'yyyy-MM') AS periodo,
      FORMAT(v.Fecha_venta, 'MMMM yyyy', 'es-ES') AS label,
      SUM(v.Total_venta) AS monto,
      COUNT(v.ID_venta) AS cantidad
    FROM dbo.Venta v
    GROUP BY FORMAT(v.Fecha_venta, 'yyyy-MM'), FORMAT(v.Fecha_venta, 'MMMM yyyy', 'es-ES')
    ORDER BY periodo ASC;
  `;

  // 5. Metadatos de catálogo
  const metaQuery = `
    SELECT Dni_cliente AS dni, CONCAT(Nombre_cl, ' ', Apellido_cl) AS nombreCompleto FROM dbo.Cliente ORDER BY Apellido_cl;
    SELECT ID_empleado AS id, CONCAT(Nombre_emp, ' ', Apellido_emp) AS nombreCompleto FROM dbo.Empleado ORDER BY Apellido_emp;
    SELECT ID_tipo_comp AS id, Nombre_tipo AS nombre FROM dbo.Tipo_Comprobante ORDER BY ID_tipo_comp;
    SELECT ID_metodo AS id, Nombre_metodo AS nombre FROM dbo.Metodo_Pago ORDER BY ID_metodo;
  `;

  const [salesResult, kpiResult, periodResult, metaResult] = await Promise.all([
    request.query(salesQuery),
    pool.request().query(kpiQuery),
    pool.request().query(periodQuery),
    pool.request().query(metaQuery),
  ]);

  const rawKpis = kpiResult.recordset[0] || {};
  const kpis: SalesKpis = {
    totalVentasAcumuladas: Number(rawKpis.totalVentasAcumuladas) || 0,
    cantidadVentas: Number(rawKpis.cantidadVentas) || 0,
    ticketPromedio: Number(rawKpis.ticketPromedio) || 0,
    totalBoletas: Number(rawKpis.totalBoletas) || 0,
    totalFacturas: Number(rawKpis.totalFacturas) || 0,
    ventasPorPeriodo: periodResult.recordset.map((p) => ({
      periodo: p.periodo,
      label: p.label || p.periodo,
      monto: Number(p.monto) || 0,
      cantidad: Number(p.cantidad) || 0,
    })),
  };

  const sales: SaleListItem[] = salesResult.recordset.map((r) => ({
    idVenta: Number(r.idVenta),
    numeroComprobante: r.numeroComprobante,
    fecha: r.fecha,
    total: Number(r.total),
    idTipoComp: Number(r.idTipoComp),
    tipoComprobante: r.tipoComprobante,
    dniCliente: r.dniCliente,
    clienteNombre: r.clienteNombre,
    idEmpleado: Number(r.idEmpleado),
    empleadoNombre: r.empleadoNombre,
    metodosPago: r.metodosPago,
    totalItems: Number(r.totalItems),
  }));

  const sets = metaResult.recordsets as any[];
  const metadata: SalesFilterMetadata = {
    clientes: sets[0] || [],
    empleados: (sets[1] || []).map((e: any) => ({
      id: Number(e.id),
      nombreCompleto: String(e.nombreCompleto),
    })),
    tiposComprobante: (sets[2] || []).map((t: any) => ({
      id: Number(t.id),
      nombre: String(t.nombre),
    })),
    metodosPago: (sets[3] || []).map((m: any) => ({
      id: Number(m.id),
      nombre: String(m.nombre),
    })),
  };

  return {
    kpis,
    sales,
    metadata,
  };
}

/**
 * Obtiene el detalle exhaustivo de una venta con conciliación matemática estricta.
 */
export async function getSaleDetailById(idVenta: number): Promise<SaleDetail | null> {
  const pool = await getPool();

  // 1. Cabecera de venta
  const headerRes = await pool
    .request()
    .input("idVenta", sql.Int, idVenta)
    .query(`
      SELECT 
        v.ID_venta AS idVenta,
        v.Numero_comprobante AS numeroComprobante,
        CONVERT(VARCHAR(10), v.Fecha_venta, 120) AS fecha,
        v.Total_venta AS total,
        ISNULL(v.Estado, 'COMPLETADA') AS estado,
        v.Efectivo_recibido AS efectivoRecibido,
        v.Vuelto AS vuelto,
        v.ID_tipo_comp AS idTipoComp,
        tc.Nombre_tipo AS tipoComprobante,
        v.Dni_cliente AS dniCliente,
        CONCAT(c.Nombre_cl, ' ', c.Apellido_cl) AS clienteNombre,
        c.Telefono_cl AS clienteTelefono,
        c.Correo_cl AS clienteCorreo,
        v.ID_empleado AS idEmpleado,
        CONCAT(e.Nombre_emp, ' ', e.Apellido_emp) AS empleadoNombre
      FROM dbo.Venta v
      JOIN dbo.Tipo_Comprobante tc ON v.ID_tipo_comp = tc.ID_tipo_comp
      JOIN dbo.Cliente c ON v.Dni_cliente = c.Dni_cliente
      JOIN dbo.Empleado e ON v.ID_empleado = e.ID_empleado
      WHERE v.ID_venta = @idVenta;
    `);

  if (headerRes.recordset.length === 0) {
    return null;
  }

  const header = headerRes.recordset[0];

  // 2. Líneas de detalle de productos
  const detailRes = await pool
    .request()
    .input("idVenta", sql.Int, idVenta)
    .query(`
      SELECT 
        dv.ID_detalle AS idDetalle,
        dv.Codbarras_prod AS codbarras,
        p.Nombre_prod AS nombreProducto,
        cat.Nombre_cat AS categoria,
        dv.Cantidad AS cantidad,
        dv.Precio_unitario AS precioUnitario,
        dv.Subtotal AS subtotal
      FROM dbo.Detalle_Venta dv
      JOIN dbo.Producto p ON dv.Codbarras_prod = p.Codbarras_prod
      JOIN dbo.Categoria cat ON p.ID_categoria = cat.ID_categoria
      WHERE dv.ID_venta = @idVenta
      ORDER BY dv.ID_detalle ASC;
    `);

  // 3. Métodos y montos de pago
  const paymentRes = await pool
    .request()
    .input("idVenta", sql.Int, idVenta)
    .query(`
      SELECT 
        vmp.ID_metodo AS idMetodo,
        mp.Nombre_metodo AS nombreMetodo,
        vmp.Monto_pagado AS monto
      FROM dbo.Venta_Metodo_Pago vmp
      JOIN dbo.Metodo_Pago mp ON vmp.ID_metodo = mp.ID_metodo
      WHERE vmp.ID_venta = @idVenta
      ORDER BY vmp.ID_metodo ASC;
    `);

  const detalles: SaleDetailItem[] = detailRes.recordset.map((d) => ({
    idDetalle: Number(d.idDetalle),
    codbarras: d.codbarras,
    nombreProducto: d.nombreProducto,
    categoria: d.categoria,
    cantidad: Number(d.cantidad),
    precioUnitario: Number(d.precioUnitario),
    subtotal: Number(d.subtotal),
  }));

  const pagos: SalePaymentMethodItem[] = paymentRes.recordset.map((p) => ({
    idMetodo: Number(p.idMetodo),
    nombreMetodo: p.nombreMetodo,
    monto: Number(p.monto),
  }));

  const total = Number(header.total);
  const sumDetalles = detalles.reduce((acc, d) => acc + d.subtotal, 0);
  const sumPagos = pagos.reduce((acc, p) => acc + p.monto, 0);

  // Conciliación de coma flotante con 2 decimales de precisión
  const isReconciled =
    Math.abs(sumDetalles - total) < 0.01 && Math.abs(sumPagos - total) < 0.01;

  return {
    idVenta: Number(header.idVenta),
    numeroComprobante: header.numeroComprobante,
    fecha: header.fecha,
    total,
    estado: header.estado,
    efectivoRecibido: header.efectivoRecibido != null ? Number(header.efectivoRecibido) : null,
    vuelto: header.vuelto != null ? Number(header.vuelto) : null,
    idTipoComp: Number(header.idTipoComp),
    tipoComprobante: header.tipoComprobante,
    dniCliente: header.dniCliente,
    clienteNombre: header.clienteNombre,
    clienteTelefono: header.clienteTelefono || null,
    clienteCorreo: header.clienteCorreo,
    idEmpleado: Number(header.idEmpleado),
    empleadoNombre: header.empleadoNombre,
    detalles,
    pagos,
    sumDetalles: Number(sumDetalles.toFixed(2)),
    sumPagos: Number(sumPagos.toFixed(2)),
    isReconciled,
  };
}

/**
 * Obtiene los productos disponibles con stock activo para el Terminal POS.
 */
export async function getAvailableProductsForPos(): Promise<PosProductItem[]> {
  const pool = await getPool();
  const res = await pool.request().query(`
    SELECT 
      p.Codbarras_prod AS codbarras,
      p.Nombre_prod AS nombre,
      p.Precio AS precio,
      p.Stock AS stock,
      c.Nombre_cat AS categoria,
      m.Nombre_marca AS marca,
      p.ID_estado_prod AS idEstado,
      ep.Estado AS estado
    FROM dbo.Producto p
    JOIN dbo.Categoria c ON p.ID_categoria = c.ID_categoria
    JOIN dbo.Marca m ON p.ID_marca = m.ID_marca
    JOIN dbo.Estado_Prod ep ON p.ID_estado_prod = ep.ID_estado_prod
    WHERE p.Stock > 0 AND ep.Estado = 'Disponible'
    ORDER BY p.Nombre_prod ASC;
  `);

  return res.recordset.map((r) => ({
    codbarras: r.codbarras,
    nombre: r.nombre,
    precio: Number(r.precio),
    stock: Number(r.stock),
    categoria: r.categoria,
    marca: r.marca,
    idEstado: Number(r.idEstado),
    estado: r.estado,
  }));
}
