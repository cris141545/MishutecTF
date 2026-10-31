import sql from "mssql";
import { getPool } from "../db";
import {
  InventoryDashboardStats,
  InventoryProductStockItem,
  KardexMovementItem,
  InventoryFilterMetadata,
  InventoryEmployee,
} from "@/types/inventory";

/**
 * Obtiene las estadísticas generales del inventario directamente de SQL Server.
 */
export async function getInventoryDashboardStats(): Promise<InventoryDashboardStats> {
  const pool = await getPool();

  const query = `
    SELECT
      ISNULL(SUM(p.Stock), 0) AS TotalUnidades,
      COUNT(CASE WHEN p.Stock = 0 THEN 1 END) AS ProductosAgotados,
      COUNT(CASE WHEN p.Stock >= 1 AND p.Stock <= 5 THEN 1 END) AS ProductosStockBajo,
      ISNULL(SUM(CAST(p.Stock AS DECIMAL(18,2)) * p.Precio), 0) AS ValorInventarioVenta,
      (
        SELECT ISNULL(SUM(m.Cantidad), 0)
        FROM dbo.Mov_Inventario m
        JOIN dbo.Tipo_Movimiento tm ON m.ID_tipo_mov = tm.ID_tipo_mov
        WHERE tm.Nombre_tipo = 'Entrada'
      ) AS TotalEntradas,
      (
        SELECT ISNULL(SUM(m.Cantidad), 0)
        FROM dbo.Mov_Inventario m
        JOIN dbo.Tipo_Movimiento tm ON m.ID_tipo_mov = tm.ID_tipo_mov
        WHERE tm.Nombre_tipo = 'Salida'
      ) AS TotalSalidas,
      (
        SELECT COUNT(*)
        FROM dbo.Mov_Inventario
      ) AS TotalMovimientos
    FROM dbo.Producto p;
  `;

  const result = await pool.request().query(query);
  const row = result.recordset[0];

  return {
    totalUnidades: Number(row.TotalUnidades) || 0,
    productosAgotados: Number(row.ProductosAgotados) || 0,
    productosStockBajo: Number(row.ProductosStockBajo) || 0,
    valorInventarioVenta: Number(row.ValorInventarioVenta) || 0,
    totalEntradas: Number(row.TotalEntradas) || 0,
    totalSalidas: Number(row.TotalSalidas) || 0,
    totalMovimientos: Number(row.TotalMovimientos) || 0,
  };
}

/**
 * Obtiene las existencias actuales de productos con agregación de entradas y salidas.
 */
export async function getInventoryProductStockList(params?: {
  query?: string;
  categoria?: string;
  estado?: string;
}): Promise<InventoryProductStockItem[]> {
  const pool = await getPool();
  const request = pool.request();

  let whereClauses: string[] = [];

  if (params?.query && params.query.trim()) {
    const term = `%${params.query.trim()}%`;
    request.input("queryTerm", sql.VarChar(120), term);
    whereClauses.push("(p.Nombre_prod LIKE @queryTerm OR p.Codbarras_prod LIKE @queryTerm)");
  }

  if (params?.categoria && params.categoria !== "todas") {
    request.input("catParam", sql.VarChar(50), params.categoria);
    whereClauses.push("c.Nombre_cat = @catParam");
  }

  if (params?.estado && params.estado !== "todos") {
    request.input("estParam", sql.VarChar(30), params.estado);
    whereClauses.push("ep.Estado = @estParam");
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const sqlQuery = `
    SELECT 
      p.Codbarras_prod AS codbarras,
      p.Nombre_prod AS nombre,
      c.Nombre_cat AS categoria,
      p.ID_categoria AS idCategoria,
      m.Nombre_marca AS marca,
      p.Stock AS stock,
      CAST(p.Precio AS FLOAT) AS precio,
      CAST((CAST(p.Stock AS DECIMAL(18,2)) * p.Precio) AS FLOAT) AS valorTotal,
      p.ID_estado_prod AS idEstado,
      ep.Estado AS estado,
      ISNULL(mov.TotalEntradas, 0) AS totalEntradas,
      ISNULL(mov.TotalSalidas, 0) AS totalSalidas
    FROM dbo.Producto p
    JOIN dbo.Categoria c ON p.ID_categoria = c.ID_categoria
    JOIN dbo.Marca m ON p.ID_marca = m.ID_marca
    JOIN dbo.Estado_Prod ep ON p.ID_estado_prod = ep.ID_estado_prod
    LEFT JOIN (
      SELECT 
        mi.Codbarras_prod,
        SUM(CASE WHEN tm.Nombre_tipo = 'Entrada' THEN mi.Cantidad ELSE 0 END) AS TotalEntradas,
        SUM(CASE WHEN tm.Nombre_tipo = 'Salida' THEN mi.Cantidad ELSE 0 END) AS TotalSalidas
      FROM dbo.Mov_Inventario mi
      JOIN dbo.Tipo_Movimiento tm ON mi.ID_tipo_mov = tm.ID_tipo_mov
      GROUP BY mi.Codbarras_prod
    ) mov ON p.Codbarras_prod = mov.Codbarras_prod
    ${whereSql}
    ORDER BY p.Stock ASC, p.Nombre_prod ASC;
  `;

  const result = await request.query(sqlQuery);

  return result.recordset.map((r) => ({
    codbarras: r.codbarras,
    nombre: r.nombre,
    categoria: r.categoria,
    idCategoria: r.idCategoria,
    marca: r.marca,
    stock: Number(r.stock) || 0,
    precio: Number(r.precio) || 0,
    valorTotal: Number(r.valorTotal) || 0,
    idEstado: r.idEstado,
    estado: r.estado,
    totalEntradas: Number(r.totalEntradas) || 0,
    totalSalidas: Number(r.totalSalidas) || 0,
  }));
}

/**
 * Obtiene el Kardex completo con cálculo de saldo progresivo por producto.
 */
export async function getKardexMovements(params?: {
  codbarras?: string;
  tipo?: string;
  fechaInicio?: string;
  fechaFin?: string;
}): Promise<KardexMovementItem[]> {
  const pool = await getPool();
  const request = pool.request();

  let whereClauses: string[] = [];

  if (params?.codbarras && params.codbarras !== "todos") {
    request.input("codbarrasParam", sql.VarChar(13), params.codbarras);
    whereClauses.push("m.codbarras = @codbarrasParam");
  }

  if (params?.tipo && params.tipo !== "todos") {
    request.input("tipoParam", sql.VarChar(40), params.tipo);
    whereClauses.push("m.tipoMovimiento = @tipoParam");
  }

  if (params?.fechaInicio) {
    request.input("fechaInicioParam", sql.VarChar(10), params.fechaInicio);
    whereClauses.push("m.fecha >= @fechaInicioParam");
  }

  if (params?.fechaFin) {
    request.input("fechaFinParam", sql.VarChar(10), params.fechaFin);
    whereClauses.push("m.fecha <= @fechaFinParam");
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  // Se utiliza CTE con Window Function para calcular el saldo progresivo operativo de cada movimiento
  const sqlQuery = `
    WITH KardexCalculado AS (
      SELECT 
        m.ID_movimiento AS idMovimiento,
        CONVERT(VARCHAR(10), m.Fecha, 120) AS fecha,
        m.Codbarras_prod AS codbarras,
        p.Nombre_prod AS nombreProducto,
        c.Nombre_cat AS categoria,
        tm.ID_tipo_mov AS idTipoMov,
        tm.Nombre_tipo AS tipoMovimiento,
        m.Cantidad AS cantidad,
        e.ID_empleado AS idEmpleado,
        CONCAT(e.Nombre_emp, ' ', e.Apellido_emp) AS empleado,
        SUM(
          CASE 
            WHEN tm.Nombre_tipo = 'Entrada' THEN m.Cantidad
            WHEN tm.Nombre_tipo = 'Salida' THEN -m.Cantidad
            ELSE 0
          END
        ) OVER (
          PARTITION BY m.Codbarras_prod 
          ORDER BY m.Fecha ASC, m.ID_movimiento ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS saldoCalculado
      FROM dbo.Mov_Inventario m
      JOIN dbo.Producto p ON m.Codbarras_prod = p.Codbarras_prod
      JOIN dbo.Categoria c ON p.ID_categoria = c.ID_categoria
      JOIN dbo.Tipo_Movimiento tm ON m.ID_tipo_mov = tm.ID_tipo_mov
      JOIN dbo.Empleado e ON m.ID_empleado = e.ID_empleado
    )
    SELECT *
    FROM KardexCalculado m
    ${whereSql}
    ORDER BY m.fecha DESC, m.idMovimiento DESC;
  `;

  const result = await request.query(sqlQuery);

  return result.recordset.map((r) => ({
    idMovimiento: r.idMovimiento,
    fecha: r.fecha,
    codbarras: r.codbarras,
    nombreProducto: r.nombreProducto,
    categoria: r.categoria,
    idTipoMov: r.idTipoMov,
    tipoMovimiento: r.tipoMovimiento,
    cantidad: Number(r.cantidad) || 0,
    idEmpleado: r.idEmpleado,
    empleado: r.empleado,
    saldoCalculado: Number(r.saldoCalculado) || 0,
  }));
}

/**
 * Obtiene la metadata para filtros y selección en formularios de inventario.
 */
export async function getInventoryMetadata(): Promise<InventoryFilterMetadata> {
  const pool = await getPool();

  const [catRes, estRes, empRes, tipoRes, prodRes] = await Promise.all([
    pool.request().query(`
      SELECT c.ID_categoria AS id, c.Nombre_cat AS nombre, COUNT(p.Codbarras_prod) AS total
      FROM dbo.Categoria c
      LEFT JOIN dbo.Producto p ON c.ID_categoria = p.ID_categoria
      GROUP BY c.ID_categoria, c.Nombre_cat
      ORDER BY c.Nombre_cat;
    `),
    pool.request().query(`
      SELECT ID_estado_prod AS id, Estado AS nombre
      FROM dbo.Estado_Prod
      ORDER BY ID_estado_prod;
    `),
    pool.request().query(`
      SELECT 
        ID_empleado AS idEmpleado,
        Dni_emp AS dni,
        CONCAT(Nombre_emp, ' ', Apellido_emp) AS nombreCompleto
      FROM dbo.Empleado
      ORDER BY Nombre_emp ASC;
    `),
    pool.request().query(`
      SELECT ID_tipo_mov AS id, Nombre_tipo AS nombre
      FROM dbo.Tipo_Movimiento
      ORDER BY ID_tipo_mov;
    `),
    pool.request().query(`
      SELECT 
        p.Codbarras_prod AS codbarras,
        p.Nombre_prod AS nombre,
        p.Stock AS stock,
        ep.Estado AS estado,
        p.ID_estado_prod AS idEstado
      FROM dbo.Producto p
      JOIN dbo.Estado_Prod ep ON p.ID_estado_prod = ep.ID_estado_prod
      ORDER BY p.Nombre_prod ASC;
    `),
  ]);

  return {
    categorias: catRes.recordset.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      total: Number(r.total) || 0,
    })),
    estados: estRes.recordset.map((r) => ({
      id: r.id,
      nombre: r.nombre,
    })),
    empleados: empRes.recordset.map((r) => ({
      idEmpleado: r.idEmpleado,
      dni: r.dni,
      nombreCompleto: r.nombreCompleto,
    })),
    tiposMovimiento: tipoRes.recordset.map((r) => ({
      id: r.id,
      nombre: r.nombre,
    })),
    productos: prodRes.recordset.map((r) => ({
      codbarras: r.codbarras,
      nombre: r.nombre,
      stock: Number(r.stock) || 0,
      estado: r.estado,
      idEstado: r.idEstado,
    })),
  };
}
