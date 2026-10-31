import sql from "mssql";
import { getPool } from "../db";
import { assertMutationsAllowed } from "../db-guard";
import { ClientListItem, ClientDetail } from "@/types/entities";
import { ClientInput, ClientUpdateInput } from "../validations/entity.schema";

export class DuplicateDniError extends Error {
  constructor(public readonly dni: string) {
    super(`El DNI '${dni}' ya se encuentra registrado en el sistema.`);
    this.name = "DuplicateDniError";
  }
}

export class ClientNotFoundError extends Error {
  constructor(public readonly dni: string) {
    super(`El cliente con DNI '${dni}' no existe.`);
    this.name = "ClientNotFoundError";
  }
}

/**
 * Obtiene el listado de clientes con estadísticas agregadas de ventas.
 */
export async function getClientsList(query?: string): Promise<ClientListItem[]> {
  const pool = await getPool();
  const request = pool.request();

  let whereClause = "";
  if (query && query.trim()) {
    const term = `%${query.trim()}%`;
    request.input("queryTerm", sql.VarChar(100), term);
    whereClause = `
      WHERE c.Dni_cliente LIKE @queryTerm
         OR c.Nombre_cl LIKE @queryTerm
         OR c.Apellido_cl LIKE @queryTerm
         OR c.Correo_cl LIKE @queryTerm
         OR CONCAT(c.Nombre_cl, ' ', c.Apellido_cl) LIKE @queryTerm
    `;
  }

  const sqlQuery = `
    SELECT 
      c.Dni_cliente AS dni,
      c.Nombre_cl AS nombre,
      c.Apellido_cl AS apellido,
      CONCAT(c.Nombre_cl, ' ', c.Apellido_cl) AS nombreCompleto,
      c.Telefono_cl AS telefono,
      c.Correo_cl AS correo,
      COUNT(v.ID_venta) AS totalVentas,
      ISNULL(SUM(v.Total_venta), 0) AS montoTotalComprado,
      CONVERT(VARCHAR(10), MAX(v.Fecha_venta), 120) AS ultimaCompraFecha
    FROM dbo.Cliente c
    LEFT JOIN dbo.Venta v ON c.Dni_cliente = v.Dni_cliente
    ${whereClause}
    GROUP BY c.Dni_cliente, c.Nombre_cl, c.Apellido_cl, c.Telefono_cl, c.Correo_cl
    ORDER BY c.Apellido_cl ASC, c.Nombre_cl ASC;
  `;

  const result = await request.query(sqlQuery);

  return result.recordset.map((r) => ({
    dni: r.dni,
    nombre: r.nombre,
    apellido: r.apellido,
    nombreCompleto: r.nombreCompleto,
    telefono: r.telefono || null,
    correo: r.correo,
    totalVentas: Number(r.totalVentas) || 0,
    montoTotalComprado: Number(r.montoTotalComprado) || 0,
    ultimaCompraFecha: r.ultimaCompraFecha || null,
  }));
}

/**
 * Obtiene la ficha detallada de un cliente con su historial completo de ventas.
 */
export async function getClientDetail(dni: string): Promise<ClientDetail | null> {
  const pool = await getPool();

  const clientReq = pool.request();
  clientReq.input("dni", sql.VarChar(8), dni);
  const clientRes = await clientReq.query(`
    SELECT 
      c.Dni_cliente AS dni,
      c.Nombre_cl AS nombre,
      c.Apellido_cl AS apellido,
      CONCAT(c.Nombre_cl, ' ', c.Apellido_cl) AS nombreCompleto,
      c.Telefono_cl AS telefono,
      c.Correo_cl AS correo
    FROM dbo.Cliente c
    WHERE c.Dni_cliente = @dni;
  `);

  if (clientRes.recordset.length === 0) {
    return null;
  }

  const client = clientRes.recordset[0];

  const salesReq = pool.request();
  salesReq.input("dni", sql.VarChar(8), dni);
  const salesRes = await salesReq.query(`
    SELECT 
      v.ID_venta AS idVenta,
      v.Numero_comprobante AS numeroComprobante,
      CONVERT(VARCHAR(10), v.Fecha_venta, 120) AS fecha,
      CAST(v.Total_venta AS FLOAT) AS total,
      tc.Nombre_tipo AS tipoComprobante,
      CONCAT(e.Nombre_emp, ' ', e.Apellido_emp) AS empleado
    FROM dbo.Venta v
    JOIN dbo.Tipo_Comprobante tc ON v.ID_tipo_comp = tc.ID_tipo_comp
    JOIN dbo.Empleado e ON v.ID_empleado = e.ID_empleado
    WHERE v.Dni_cliente = @dni
    ORDER BY v.Fecha_venta DESC, v.ID_venta DESC;
  `);

  const ventas = salesRes.recordset.map((v) => ({
    idVenta: v.idVenta,
    numeroComprobante: v.numeroComprobante,
    fecha: v.fecha,
    total: Number(v.total) || 0,
    tipoComprobante: v.tipoComprobante,
    empleado: v.empleado,
  }));

  const totalVentas = ventas.length;
  const montoTotalComprado = ventas.reduce((acc, curr) => acc + curr.total, 0);
  const ultimaCompraFecha = ventas.length > 0 ? ventas[0].fecha : null;

  return {
    dni: client.dni,
    nombre: client.nombre,
    apellido: client.apellido,
    nombreCompleto: client.nombreCompleto,
    telefono: client.telefono || null,
    correo: client.correo,
    totalVentas,
    montoTotalComprado,
    ultimaCompraFecha,
    ventas,
  };
}

/**
 * Registra un nuevo cliente en SQL Server.
 */
export async function createClient(input: ClientInput): Promise<{ dni: string }> {
  assertMutationsAllowed("Registrar Cliente");

  const pool = await getPool();

  // Verificar unicidad de DNI
  const checkReq = pool.request();
  checkReq.input("dni", sql.VarChar(8), input.dni);
  const existing = await checkReq.query(
    "SELECT Dni_cliente FROM dbo.Cliente WHERE Dni_cliente = @dni"
  );

  if (existing.recordset.length > 0) {
    throw new DuplicateDniError(input.dni);
  }

  const insertReq = pool.request();
  insertReq.input("dni", sql.VarChar(8), input.dni);
  insertReq.input("nombre", sql.VarChar(60), input.nombre);
  insertReq.input("apellido", sql.VarChar(60), input.apellido);
  insertReq.input("telefono", sql.VarChar(15), input.telefono || null);
  insertReq.input("correo", sql.VarChar(100), input.correo);

  await insertReq.query(`
    INSERT INTO dbo.Cliente (Dni_cliente, Nombre_cl, Apellido_cl, Telefono_cl, Correo_cl)
    VALUES (@dni, @nombre, @apellido, @telefono, @correo);
  `);

  return { dni: input.dni };
}

/**
 * Actualiza los datos personales de un cliente (DNI inmutable por ser PK).
 */
export async function updateClient(
  dni: string,
  input: ClientUpdateInput
): Promise<{ dni: string }> {
  assertMutationsAllowed("Actualizar Cliente");

  const pool = await getPool();

  const checkReq = pool.request();
  checkReq.input("dni", sql.VarChar(8), dni);
  const existing = await checkReq.query(
    "SELECT Dni_cliente FROM dbo.Cliente WHERE Dni_cliente = @dni"
  );

  if (existing.recordset.length === 0) {
    throw new ClientNotFoundError(dni);
  }

  const updateReq = pool.request();
  updateReq.input("dni", sql.VarChar(8), dni);
  updateReq.input("nombre", sql.VarChar(60), input.nombre);
  updateReq.input("apellido", sql.VarChar(60), input.apellido);
  updateReq.input("telefono", sql.VarChar(15), input.telefono || null);
  updateReq.input("correo", sql.VarChar(100), input.correo);

  await updateReq.query(`
    UPDATE dbo.Cliente
    SET 
      Nombre_cl = @nombre,
      Apellido_cl = @apellido,
      Telefono_cl = @telefono,
      Correo_cl = @correo
    WHERE Dni_cliente = @dni;
  `);

  return { dni };
}
