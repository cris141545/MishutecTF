import sql from "mssql";
import { getPool } from "../db";
import { assertMutationsAllowed } from "../db-guard";
import {
  EmployeeListItem,
  EmployeeDetail,
  EmployeeSaleRecord,
  EmployeeMovementRecord,
  EmployeeDevolucionRecord,
} from "@/types/entities";
import { EmployeeInput, EmployeeUpdateInput } from "../validations/entity.schema";
import { DuplicateDniError } from "./client.repository";

export class EmployeeNotFoundError extends Error {
  constructor(public readonly id: number) {
    super(`El empleado con ID ${id} no existe.`);
    this.name = "EmployeeNotFoundError";
  }
}

/**
 * Obtiene el listado de empleados con métricas de ventas, inventario y devoluciones.
 */
export async function getEmployeesList(query?: string): Promise<EmployeeListItem[]> {
  const pool = await getPool();
  const request = pool.request();

  let whereClause = "";
  if (query && query.trim()) {
    const term = `%${query.trim()}%`;
    request.input("queryTerm", sql.VarChar(100), term);
    whereClause = `
      WHERE e.Dni_emp LIKE @queryTerm
         OR e.Nombre_emp LIKE @queryTerm
         OR e.Apellido_emp LIKE @queryTerm
         OR CONCAT(e.Nombre_emp, ' ', e.Apellido_emp) LIKE @queryTerm
    `;
  }

  const sqlQuery = `
    SELECT 
      e.ID_empleado AS idEmpleado,
      e.Dni_emp AS dni,
      e.Nombre_emp AS nombre,
      e.Apellido_emp AS apellido,
      CONCAT(e.Nombre_emp, ' ', e.Apellido_emp) AS nombreCompleto,
      ISNULL(v.TotalVentas, 0) AS totalVentasAtendidas,
      ISNULL(v.MontoVentas, 0) AS montoTotalVendido,
      ISNULL(m.TotalMovs, 0) AS totalMovimientosInventario,
      ISNULL(d.TotalDevs, 0) AS totalDevolucionesAtendidas
    FROM dbo.Empleado e
    LEFT JOIN (
      SELECT ID_empleado, COUNT(*) AS TotalVentas, SUM(Total_venta) AS MontoVentas
      FROM dbo.Venta
      GROUP BY ID_empleado
    ) v ON e.ID_empleado = v.ID_empleado
    LEFT JOIN (
      SELECT ID_empleado, COUNT(*) AS TotalMovs
      FROM dbo.Mov_Inventario
      GROUP BY ID_empleado
    ) m ON e.ID_empleado = m.ID_empleado
    LEFT JOIN (
      SELECT ID_empleado, COUNT(*) AS TotalDevs
      FROM dbo.Devolucion
      GROUP BY ID_empleado
    ) d ON e.ID_empleado = d.ID_empleado
    ${whereClause}
    ORDER BY e.Apellido_emp ASC, e.Nombre_emp ASC;
  `;

  const result = await request.query(sqlQuery);

  return result.recordset.map((r) => ({
    idEmpleado: Number(r.idEmpleado),
    dni: r.dni,
    nombre: r.nombre,
    apellido: r.apellido,
    nombreCompleto: r.nombreCompleto,
    totalVentasAtendidas: Number(r.totalVentasAtendidas) || 0,
    montoTotalVendido: Number(r.montoTotalVendido) || 0,
    totalMovimientosInventario: Number(r.totalMovimientosInventario) || 0,
    totalDevolucionesAtendidas: Number(r.totalDevolucionesAtendidas) || 0,
  }));
}

/**
 * Obtiene la ficha completa de un empleado con sus historiales vinculados.
 */
export async function getEmployeeDetail(id: number): Promise<EmployeeDetail | null> {
  const pool = await getPool();

  const empReq = pool.request();
  empReq.input("id", sql.Int, id);
  const empRes = await empReq.query(`
    SELECT 
      e.ID_empleado AS idEmpleado,
      e.Dni_emp AS dni,
      e.Nombre_emp AS nombre,
      e.Apellido_emp AS apellido,
      CONCAT(e.Nombre_emp, ' ', e.Apellido_emp) AS nombreCompleto
    FROM dbo.Empleado e
    WHERE e.ID_empleado = @id;
  `);

  if (empRes.recordset.length === 0) {
    return null;
  }

  const emp = empRes.recordset[0];

  // 1. Ventas atendidas
  const salesReq = pool.request();
  salesReq.input("id", sql.Int, id);
  const salesRes = await salesReq.query(`
    SELECT 
      v.ID_venta AS idVenta,
      v.Numero_comprobante AS numeroComprobante,
      CONVERT(VARCHAR(10), v.Fecha_venta, 120) AS fecha,
      CAST(v.Total_venta AS FLOAT) AS total,
      v.Dni_cliente AS clienteDni,
      CONCAT(c.Nombre_cl, ' ', c.Apellido_cl) AS clienteNombre
    FROM dbo.Venta v
    JOIN dbo.Cliente c ON v.Dni_cliente = c.Dni_cliente
    WHERE v.ID_empleado = @id
    ORDER BY v.Fecha_venta DESC;
  `);

  const ventas: EmployeeSaleRecord[] = salesRes.recordset.map((s) => ({
    idVenta: Number(s.idVenta),
    numeroComprobante: s.numeroComprobante,
    fecha: s.fecha,
    total: Number(s.total) || 0,
    clienteDni: s.clienteDni,
    clienteNombre: s.clienteNombre,
  }));

  // 2. Movimientos de inventario registrados
  const movReq = pool.request();
  movReq.input("id", sql.Int, id);
  const movRes = await movReq.query(`
    SELECT 
      m.ID_movimiento AS idMovimiento,
      CONVERT(VARCHAR(10), m.Fecha, 120) AS fecha,
      m.Codbarras_prod AS codbarras,
      p.Nombre_prod AS nombreProducto,
      tm.Nombre_tipo AS tipoMovimiento,
      m.Cantidad AS cantidad
    FROM dbo.Mov_Inventario m
    JOIN dbo.Producto p ON m.Codbarras_prod = p.Codbarras_prod
    JOIN dbo.Tipo_Movimiento tm ON m.ID_tipo_mov = tm.ID_tipo_mov
    WHERE m.ID_empleado = @id
    ORDER BY m.Fecha DESC, m.ID_movimiento DESC;
  `);

  const movimientos: EmployeeMovementRecord[] = movRes.recordset.map((m) => ({
    idMovimiento: Number(m.idMovimiento),
    fecha: m.fecha,
    codbarras: m.codbarras,
    nombreProducto: m.nombreProducto,
    tipoMovimiento: m.tipoMovimiento,
    cantidad: Number(m.cantidad) || 0,
  }));

  // 3. Devoluciones atendidas
  const devReq = pool.request();
  devReq.input("id", sql.Int, id);
  const devRes = await devReq.query(`
    SELECT 
      d.ID_devolucion AS idDevolucion,
      CONVERT(VARCHAR(10), d.Fecha_dev, 120) AS fecha,
      d.ID_venta AS idVenta,
      v.Numero_comprobante AS numeroComprobante,
      ed.Nombre_estado AS estadoDevolucion
    FROM dbo.Devolucion d
    JOIN dbo.Venta v ON d.ID_venta = v.ID_venta
    JOIN dbo.Estado_Dev ed ON d.ID_estado_dev = ed.ID_estado_dev
    WHERE d.ID_empleado = @id
    ORDER BY d.Fecha_dev DESC;
  `);

  const devoluciones: EmployeeDevolucionRecord[] = devRes.recordset.map((d) => ({
    idDevolucion: Number(d.idDevolucion),
    fecha: d.fecha,
    idVenta: Number(d.idVenta),
    numeroComprobante: d.numeroComprobante,
    estadoDevolucion: d.estadoDevolucion,
  }));

  const montoTotalVendido = ventas.reduce((acc, curr) => acc + curr.total, 0);

  return {
    idEmpleado: Number(emp.idEmpleado),
    dni: emp.dni,
    nombre: emp.nombre,
    apellido: emp.apellido,
    nombreCompleto: emp.nombreCompleto,
    totalVentasAtendidas: ventas.length,
    montoTotalVendido,
    totalMovimientosInventario: movimientos.length,
    totalDevolucionesAtendidas: devoluciones.length,
    ventas,
    movimientos,
    devoluciones,
  };
}

/**
 * Registra un nuevo empleado en SQL Server.
 */
export async function createEmployee(
  input: EmployeeInput
): Promise<{ idEmpleado: number }> {
  assertMutationsAllowed("Registrar Empleado");

  const pool = await getPool();

  const checkReq = pool.request();
  checkReq.input("dni", sql.VarChar(8), input.dni);
  const existing = await checkReq.query(
    "SELECT ID_empleado FROM dbo.Empleado WHERE Dni_emp = @dni"
  );

  if (existing.recordset.length > 0) {
    throw new DuplicateDniError(input.dni);
  }

  const req = pool.request();
  req.input("dni", sql.VarChar(8), input.dni);
  req.input("nombre", sql.VarChar(60), input.nombre);
  req.input("apellido", sql.VarChar(60), input.apellido);

  const res = await req.query(`
    INSERT INTO dbo.Empleado (Dni_emp, Nombre_emp, Apellido_emp)
    OUTPUT INSERTED.ID_empleado
    VALUES (@dni, @nombre, @apellido);
  `);

  return { idEmpleado: Number(res.recordset[0].ID_empleado) };
}

/**
 * Actualiza los nombres y apellidos de un empleado.
 */
export async function updateEmployee(
  id: number,
  input: EmployeeUpdateInput
): Promise<{ idEmpleado: number }> {
  assertMutationsAllowed("Actualizar Empleado");

  const pool = await getPool();

  const checkReq = pool.request();
  checkReq.input("id", sql.Int, id);
  const existing = await checkReq.query(
    "SELECT ID_empleado FROM dbo.Empleado WHERE ID_empleado = @id"
  );

  if (existing.recordset.length === 0) {
    throw new EmployeeNotFoundError(id);
  }

  const updReq = pool.request();
  updReq.input("id", sql.Int, id);
  updReq.input("nombre", sql.VarChar(60), input.nombre);
  updReq.input("apellido", sql.VarChar(60), input.apellido);

  await updReq.query(`
    UPDATE dbo.Empleado
    SET 
      Nombre_emp = @nombre,
      Apellido_emp = @apellido
    WHERE ID_empleado = @id;
  `);

  return { idEmpleado: id };
}
