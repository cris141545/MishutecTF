import sql from "mssql";
import { getPool } from "../db";
import { assertMutationsAllowed } from "../db-guard";
import {
  CashSession,
  CashMovement,
  OpenCashInput,
  AddCashMovementInput,
  CloseCashInput,
  ReopenCashInput,
  CashClosingSummary,
  EmployeePaymentInput,
  EmployeePayment,
  ChannelSummaryCard,
} from "@/types/cash-register";

export class CashError extends Error {
  constructor(message: string, public readonly code: string = "CASH_ERROR") {
    super(message);
    this.name = "CashError";
  }
}

export class ActiveSessionAlreadyExistsError extends CashError {
  constructor(idSesion: number, empleado: string) {
    super(
      `Ya existe una sesión de caja abierta (Turno #${idSesion}) a cargo de ${empleado}. Debe cerrar la caja activa antes de abrir un nuevo turno.`,
      "ACTIVE_SESSION_EXISTS"
    );
    this.name = "ActiveSessionAlreadyExistsError";
  }
}

export class NoActiveSessionError extends CashError {
  constructor() {
    super("No existe ninguna sesión de caja abierta en este momento.", "NO_ACTIVE_SESSION");
    this.name = "NoActiveSessionError";
  }
}

export class SessionAlreadyClosedError extends CashError {
  constructor(idSesion: number) {
    super(
      `La sesión de caja #${idSesion} ya se encuentra cerrada y no permite registrar operaciones financieras adicionales.`,
      "SESSION_ALREADY_CLOSED"
    );
    this.name = "SessionAlreadyClosedError";
  }
}

export class SessionNotFoundError extends CashError {
  constructor(idSesion: number) {
    super(`La sesión de caja #${idSesion} no existe en la base de datos.`, "SESSION_NOT_FOUND");
    this.name = "SessionNotFoundError";
  }
}

/**
 * Obtiene la sesión de caja actualmente activa (estado ABIERTA o REABIERTA).
 */
export async function getActiveCashSession(pool?: sql.ConnectionPool): Promise<CashSession | null> {
  const p = pool || (await getPool());
  const query = `
    SELECT TOP 1
      s.ID_sesion,
      s.ID_empleado_apertura,
      (eA.Nombre_emp + ' ' + eA.Apellido_emp) AS EmpleadoAperturaNombre,
      CONVERT(VARCHAR(19), s.Fecha_apertura, 120) AS FechaApertura,
      s.Monto_inicial,
      CONVERT(VARCHAR(19), s.Fecha_cierre, 120) AS FechaCierre,
      s.ID_empleado_cierre,
      (eC.Nombre_emp + ' ' + eC.Apellido_emp) AS EmpleadoCierreNombre,
      s.Efectivo_esperado,
      s.Efectivo_contado,
      s.Diferencia,
      s.Estado,
      s.Observaciones_apertura,
      s.Observaciones_cierre,
      s.Motivo_reapertura,
      CONVERT(VARCHAR(19), s.Fecha_reapertura, 120) AS FechaReapertura,
      s.ID_empleado_reapertura
    FROM dbo.Sesion_Caja s
    JOIN dbo.Empleado eA ON s.ID_empleado_apertura = eA.ID_empleado
    LEFT JOIN dbo.Empleado eC ON s.ID_empleado_cierre = eC.ID_empleado
    WHERE s.Estado IN ('ABIERTA', 'REABIERTA')
    ORDER BY s.ID_sesion DESC
  `;

  const res = await p.request().query(query);
  if (res.recordset.length === 0) return null;

  const raw = res.recordset[0];
  return await hydrateSessionMetrics(p, raw);
}

/**
 * Obtiene una sesión de caja por ID.
 */
export async function getCashSessionById(idSesion: number, pool?: sql.ConnectionPool): Promise<CashSession | null> {
  const p = pool || (await getPool());
  const query = `
    SELECT
      s.ID_sesion,
      s.ID_empleado_apertura,
      (eA.Nombre_emp + ' ' + eA.Apellido_emp) AS EmpleadoAperturaNombre,
      CONVERT(VARCHAR(19), s.Fecha_apertura, 120) AS FechaApertura,
      s.Monto_inicial,
      CONVERT(VARCHAR(19), s.Fecha_cierre, 120) AS FechaCierre,
      s.ID_empleado_cierre,
      (eC.Nombre_emp + ' ' + eC.Apellido_emp) AS EmpleadoCierreNombre,
      s.Efectivo_esperado,
      s.Efectivo_contado,
      s.Diferencia,
      s.Estado,
      s.Observaciones_apertura,
      s.Observaciones_cierre,
      s.Motivo_reapertura,
      CONVERT(VARCHAR(19), s.Fecha_reapertura, 120) AS FechaReapertura,
      s.ID_empleado_reapertura
    FROM dbo.Sesion_Caja s
    JOIN dbo.Empleado eA ON s.ID_empleado_apertura = eA.ID_empleado
    LEFT JOIN dbo.Empleado eC ON s.ID_empleado_cierre = eC.ID_empleado
    WHERE s.ID_sesion = @idSesion
  `;

  const res = await p.request().input("idSesion", sql.Int, idSesion).query(query);
  if (res.recordset.length === 0) return null;

  return await hydrateSessionMetrics(p, res.recordset[0]);
}

async function hydrateSessionMetrics(p: sql.ConnectionPool, raw: any): Promise<CashSession> {
  const idSesion = Number(raw.ID_sesion);

  const metricsQuery = `
    SELECT
      ISNULL(SUM(CASE WHEN Tipo = 'INGRESO' AND Categoria = 'VENTA' AND Afecta_efectivo = 1 THEN Monto ELSE 0 END), 0) AS TotalVentasEfectivo,
      ISNULL(SUM(CASE WHEN Tipo = 'INGRESO' AND Categoria = 'VENTA' AND Afecta_efectivo = 0 THEN Monto ELSE 0 END), 0) AS TotalVentasElectronicas,
      ISNULL(SUM(CASE WHEN Tipo = 'INGRESO' AND Categoria != 'VENTA' AND Concepto NOT LIKE '%Fondo fijo de apertura%' AND Afecta_efectivo = 1 THEN Monto ELSE 0 END), 0) AS TotalOtrosIngresosEfectivo,
      ISNULL(SUM(CASE WHEN Tipo = 'EGRESO' AND Categoria = 'GASTO_OPERATIVO' AND Afecta_efectivo = 1 THEN Monto ELSE 0 END), 0) AS TotalGastosEfectivo,
      ISNULL(SUM(CASE WHEN Tipo = 'EGRESO' AND Categoria = 'PAGO_PERSONAL' AND Afecta_efectivo = 1 THEN Monto ELSE 0 END), 0) AS TotalPagosPersonalEfectivo,
      ISNULL(SUM(CASE WHEN Tipo = 'EGRESO' AND Categoria = 'PAGO_PROVEEDOR' AND Afecta_efectivo = 1 THEN Monto ELSE 0 END), 0) AS TotalPagosProveedorEfectivo,
      ISNULL(SUM(CASE WHEN Tipo = 'EGRESO' AND Categoria = 'RETIRO' AND Afecta_efectivo = 1 THEN Monto ELSE 0 END), 0) AS TotalRetirosEfectivo,
      ISNULL(SUM(CASE WHEN Tipo = 'EGRESO' AND Categoria = 'REEMBOLSO_DEVOLUCION' AND Afecta_efectivo = 1 THEN Monto ELSE 0 END), 0) AS TotalReembolsosEfectivo,
      COUNT(DISTINCT ID_venta) AS VentasCount,
      COUNT(*) AS MovimientosCount
    FROM dbo.Movimiento_Caja
    WHERE ID_sesion = @idSesion
  `;

  const mRes = await p.request().input("idSesion", sql.Int, idSesion).query(metricsQuery);
  const m = mRes.recordset[0] || {};

  const totalVentasEfectivo = Number(m.TotalVentasEfectivo || 0);
  const totalVentasElectronicas = Number(m.TotalVentasElectronicas || 0);
  const totalOtrosIngresosEfectivo = Number(m.TotalOtrosIngresosEfectivo || 0);
  const totalGastosEfectivo = Number(m.TotalGastosEfectivo || 0);
  const totalPagosPersonalEfectivo = Number(m.TotalPagosPersonalEfectivo || 0);
  const totalPagosProveedorEfectivo = Number(m.TotalPagosProveedorEfectivo || 0);
  const totalRetirosEfectivo = Number(m.TotalRetirosEfectivo || 0);
  const totalReembolsosEfectivo = Number(m.TotalReembolsosEfectivo || 0);

  const montoInicial = Number(raw.Monto_inicial || 0);
  const efectivoEsperadoActual =
    montoInicial +
    totalVentasEfectivo +
    totalOtrosIngresosEfectivo -
    totalGastosEfectivo -
    totalPagosPersonalEfectivo -
    totalPagosProveedorEfectivo -
    totalRetirosEfectivo -
    totalReembolsosEfectivo;

  return {
    idSesion,
    idEmpleadoApertura: Number(raw.ID_empleado_apertura),
    empleadoAperturaNombre: String(raw.EmpleadoAperturaNombre),
    fechaApertura: String(raw.FechaApertura),
    montoInicial,
    fechaCierre: raw.FechaCierre ? String(raw.FechaCierre) : null,
    idEmpleadoCierre: raw.ID_empleado_cierre ? Number(raw.ID_empleado_cierre) : null,
    empleadoCierreNombre: raw.EmpleadoCierreNombre ? String(raw.EmpleadoCierreNombre) : null,
    efectivoEsperado: raw.Efectivo_esperado !== null ? Number(raw.Efectivo_esperado) : null,
    efectivoContado: raw.Efectivo_contado !== null ? Number(raw.Efectivo_contado) : null,
    diferencia: raw.Diferencia !== null ? Number(raw.Diferencia) : null,
    estado: raw.Estado,
    observacionesApertura: raw.Observaciones_apertura,
    observacionesCierre: raw.Observaciones_cierre,
    motivoReapertura: raw.Motivo_reapertura,
    fechaReapertura: raw.FechaReapertura ? String(raw.FechaReapertura) : null,
    idEmpleadoReapertura: raw.ID_empleado_reapertura ? Number(raw.ID_empleado_reapertura) : null,
    totalVentasEfectivo,
    totalVentasElectronicas,
    totalOtrosIngresosEfectivo,
    totalGastosEfectivo,
    totalPagosPersonalEfectivo,
    totalPagosProveedorEfectivo,
    totalRetirosEfectivo,
    totalReembolsosEfectivo,
    efectivoEsperadoActual,
    ventasCount: Number(m.VentasCount || 0),
    movimientosCount: Number(m.MovimientosCount || 0),
  };
}

/**
 * Apertura de Caja Transaccional.
 */
export async function openCashSessionTransaction(input: OpenCashInput): Promise<CashSession> {
  assertMutationsAllowed("openCashSessionTransaction");
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    // 1. Bloqueo pesimista y verificación de que NO haya sesiones abiertas
    const checkReq = new sql.Request(transaction);
    const checkRes = await checkReq.query(`
      SELECT TOP 1 s.ID_sesion, (e.Nombre_emp + ' ' + e.Apellido_emp) AS Responsable
      FROM dbo.Sesion_Caja s WITH (UPDLOCK, HOLDLOCK)
      JOIN dbo.Empleado e ON s.ID_empleado_apertura = e.ID_empleado
      WHERE s.Estado IN ('ABIERTA', 'REABIERTA')
      ORDER BY s.ID_sesion DESC
    `);

    if (checkRes.recordset.length > 0) {
      const active = checkRes.recordset[0];
      throw new ActiveSessionAlreadyExistsError(active.ID_sesion, active.Responsable);
    }

    // 2. Verificar existencia del empleado
    const empReq = new sql.Request(transaction);
    const empRes = await empReq.input("idEmp", sql.Int, input.idEmpleado).query(`
      SELECT ID_empleado, (Nombre_emp + ' ' + Apellido_emp) AS Nombre
      FROM dbo.Empleado WHERE ID_empleado = @idEmp
    `);
    if (empRes.recordset.length === 0) {
      throw new CashError(`El empleado #${input.idEmpleado} no existe.`, "EMPLOYEE_NOT_FOUND");
    }

    // 3. Insertar sesión de caja
    const insertReq = new sql.Request(transaction);
    insertReq.input("idEmp", sql.Int, input.idEmpleado);
    insertReq.input("montoIni", sql.Decimal(12, 2), input.montoInicial);
    insertReq.input("obs", sql.VarChar(255), input.observaciones || "Apertura de turno regular");

    const insertRes = await insertReq.query(`
      INSERT INTO dbo.Sesion_Caja (
        ID_empleado_apertura, Fecha_apertura, Monto_inicial, Estado, Observaciones_apertura
      )
      OUTPUT INSERTED.ID_sesion, CONVERT(VARCHAR(19), INSERTED.Fecha_apertura, 120) AS FechaApertura
      VALUES (
        @idEmp, GETDATE(), @montoIni, 'ABIERTA', @obs
      )
    `);

    const newId = insertRes.recordset[0].ID_sesion;

    // 4. Si el monto inicial es mayor a 0, registrar movimiento inicial
    if (input.montoInicial > 0) {
      const movReq = new sql.Request(transaction);
      movReq.input("idSesion", sql.Int, newId);
      movReq.input("monto", sql.Decimal(12, 2), input.montoInicial);
      movReq.input("idMetodo", sql.Int, 1); // Efectivo
      movReq.input("concepto", sql.VarChar(255), "Fondo fijo de apertura en caja física");
      movReq.input("idEmp", sql.Int, input.idEmpleado);

      await movReq.query(`
        INSERT INTO dbo.Movimiento_Caja (
          ID_sesion, Fecha_hora, Tipo, Categoria, Monto, ID_metodo, Concepto, ID_empleado, Afecta_efectivo
        )
        VALUES (
          @idSesion, GETDATE(), 'INGRESO', 'INGRESO_MANUAL', @monto, @idMetodo, @concepto, @idEmp, 1
        )
      `);
    }

    await transaction.commit();

    const created = await getCashSessionById(newId, pool);
    if (!created) throw new CashError("Error al recuperar la sesión recién creada.");
    return created;
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {}
    throw err;
  }
}

/**
 * Registro de Movimiento de Caja Transaccional.
 */
export async function addCashMovementTransaction(input: AddCashMovementInput): Promise<CashMovement> {
  assertMutationsAllowed("addCashMovementTransaction");
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    // 1. Validar estado de la sesión con bloqueo
    const sessReq = new sql.Request(transaction);
    const sessRes = await sessReq.input("idSesion", sql.Int, input.idSesion).query(`
      SELECT ID_sesion, Estado FROM dbo.Sesion_Caja WITH (UPDLOCK)
      WHERE ID_sesion = @idSesion
    `);

    if (sessRes.recordset.length === 0) {
      throw new SessionNotFoundError(input.idSesion);
    }
    if (sessRes.recordset[0].Estado === "CERRADA") {
      throw new SessionAlreadyClosedError(input.idSesion);
    }

    // 2. Determinar si el método de pago afecta el efectivo físico (ID_metodo = 1 es Efectivo)
    const afectaEfectivo = input.idMetodo === 1 ? 1 : 0;

    // 3. Insertar movimiento
    const insReq = new sql.Request(transaction);
    insReq.input("idSesion", sql.Int, input.idSesion);
    insReq.input("tipo", sql.VarChar(20), input.tipo);
    insReq.input("categoria", sql.VarChar(50), input.categoria);
    insReq.input("monto", sql.Decimal(12, 2), input.monto);
    insReq.input("idMetodo", sql.Int, input.idMetodo);
    insReq.input("concepto", sql.VarChar(255), input.concepto);
    insReq.input("idEmp", sql.Int, input.idEmpleado);
    insReq.input("idVenta", sql.Int, input.idVenta || null);
    insReq.input("idDev", sql.Int, input.idDevolucion || null);
    insReq.input("afectaEf", sql.Bit, afectaEfectivo);

    const insRes = await insReq.query(`
      INSERT INTO dbo.Movimiento_Caja (
        ID_sesion, Fecha_hora, Tipo, Categoria, Monto, ID_metodo, Concepto, ID_empleado, ID_venta, ID_devolucion, Afecta_efectivo
      )
      OUTPUT 
        INSERTED.ID_mov_caja,
        CONVERT(VARCHAR(19), INSERTED.Fecha_hora, 120) AS FechaHora
      VALUES (
        @idSesion, GETDATE(), @tipo, @categoria, @monto, @idMetodo, @concepto, @idEmp, @idVenta, @idDev, @afectaEf
      )
    `);

    await transaction.commit();

    // Obtener datos hidratados para retorno
    const idMov = insRes.recordset[0].ID_mov_caja;
    const movQuery = `
      SELECT
        m.ID_mov_caja,
        m.ID_sesion,
        CONVERT(VARCHAR(19), m.Fecha_hora, 120) AS FechaHora,
        m.Tipo,
        m.Categoria,
        m.Monto,
        m.ID_metodo,
        mp.Nombre_metodo,
        m.Concepto,
        m.ID_empleado,
        (e.Nombre_emp + ' ' + e.Apellido_emp) AS NombreEmpleado,
        m.ID_venta,
        m.ID_devolucion,
        m.Afecta_efectivo
      FROM dbo.Movimiento_Caja m
      JOIN dbo.Metodo_Pago mp ON m.ID_metodo = mp.ID_metodo
      JOIN dbo.Empleado e ON m.ID_empleado = e.ID_empleado
      WHERE m.ID_mov_caja = @idMov
    `;
    const fullRes = await pool.request().input("idMov", sql.Int, idMov).query(movQuery);
    const row = fullRes.recordset[0];

    return {
      idMovCaja: Number(row.ID_mov_caja),
      idSesion: Number(row.ID_sesion),
      fechaHora: String(row.FechaHora),
      tipo: row.Tipo,
      categoria: row.Categoria,
      monto: Number(row.Monto),
      idMetodo: Number(row.ID_metodo),
      nombreMetodo: String(row.Nombre_metodo),
      concepto: String(row.Concepto),
      idEmpleado: Number(row.ID_empleado),
      nombreEmpleado: String(row.NombreEmpleado),
      idVenta: row.ID_venta ? Number(row.ID_venta) : null,
      idDevolucion: row.ID_devolucion ? Number(row.ID_devolucion) : null,
      afectaEfectivo: Boolean(row.Afecta_efectivo),
    };
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {}
    throw err;
  }
}

/**
 * Cierre Diario y Arqueo Transaccional.
 */
export async function closeCashSessionTransaction(input: CloseCashInput): Promise<CashClosingSummary> {
  assertMutationsAllowed("closeCashSessionTransaction");
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    // 1. Bloqueo de la sesión
    const sessReq = new sql.Request(transaction);
    const sessRes = await sessReq.input("idSesion", sql.Int, input.idSesion).query(`
      SELECT 
        s.ID_sesion, s.Monto_inicial, s.Estado,
        CONVERT(VARCHAR(19), s.Fecha_apertura, 120) AS FechaApertura,
        (eA.Nombre_emp + ' ' + eA.Apellido_emp) AS EmpleadoApertura
      FROM dbo.Sesion_Caja s WITH (UPDLOCK, HOLDLOCK)
      JOIN dbo.Empleado eA ON s.ID_empleado_apertura = eA.ID_empleado
      WHERE s.ID_sesion = @idSesion
    `);

    if (sessRes.recordset.length === 0) {
      throw new SessionNotFoundError(input.idSesion);
    }
    const sessRow = sessRes.recordset[0];
    if (sessRow.Estado === "CERRADA") {
      throw new SessionAlreadyClosedError(input.idSesion);
    }

    // 2. Verificar empleado de cierre
    const empReq = new sql.Request(transaction);
    const empRes = await empReq.input("idEmp", sql.Int, input.idEmpleadoCierre).query(`
      SELECT (Nombre_emp + ' ' + Apellido_emp) AS Nombre FROM dbo.Empleado WHERE ID_empleado = @idEmp
    `);
    if (empRes.recordset.length === 0) {
      throw new CashError(`El empleado de cierre #${input.idEmpleadoCierre} no existe.`, "EMPLOYEE_NOT_FOUND");
    }
    const empleadoCierreNombre = empRes.recordset[0].Nombre;

    // 3. Calcular todos los importes consolidados de la sesión
    const calcReq = new sql.Request(transaction);
    const calcRes = await calcReq.input("idSesion", sql.Int, input.idSesion).query(`
      SELECT
        -- Ventas brutas y netas
        ISNULL(SUM(CASE WHEN Tipo = 'INGRESO' AND Categoria = 'VENTA' THEN Monto ELSE 0 END), 0) AS VentasBrutas,
        ISNULL(SUM(CASE WHEN Tipo = 'EGRESO' AND Categoria = 'REEMBOLSO_DEVOLUCION' THEN Monto ELSE 0 END), 0) AS DevolucionesMonto,
        -- Efectivo físico
        ISNULL(SUM(CASE WHEN Tipo = 'INGRESO' AND Categoria = 'VENTA' AND Afecta_efectivo = 1 THEN Monto ELSE 0 END), 0) AS VentasEfectivo,
        ISNULL(SUM(CASE WHEN Tipo = 'INGRESO' AND Categoria != 'VENTA' AND Concepto NOT LIKE '%Fondo fijo de apertura%' AND Afecta_efectivo = 1 THEN Monto ELSE 0 END), 0) AS OtrosIngresosEfectivo,
        ISNULL(SUM(CASE WHEN Tipo = 'EGRESO' AND Categoria = 'GASTO_OPERATIVO' AND Afecta_efectivo = 1 THEN Monto ELSE 0 END), 0) AS GastosEfectivo,
        ISNULL(SUM(CASE WHEN Tipo = 'EGRESO' AND Categoria = 'PAGO_PERSONAL' AND Afecta_efectivo = 1 THEN Monto ELSE 0 END), 0) AS PagosPersonalEfectivo,
        ISNULL(SUM(CASE WHEN Tipo = 'EGRESO' AND Categoria = 'PAGO_PROVEEDOR' AND Afecta_efectivo = 1 THEN Monto ELSE 0 END), 0) AS PagosProveedorEfectivo,
        ISNULL(SUM(CASE WHEN Tipo = 'EGRESO' AND Categoria = 'RETIRO' AND Afecta_efectivo = 1 THEN Monto ELSE 0 END), 0) AS RetirosEfectivo,
        ISNULL(SUM(CASE WHEN Tipo = 'EGRESO' AND Categoria = 'REEMBOLSO_DEVOLUCION' AND Afecta_efectivo = 1 THEN Monto ELSE 0 END), 0) AS ReembolsosEfectivo,
        COUNT(DISTINCT ID_venta) AS VentasCount
      FROM dbo.Movimiento_Caja
      WHERE ID_sesion = @idSesion
    `);
    const c = calcRes.recordset[0];

    const montoInicial = Number(sessRow.Monto_inicial);
    const ventasEfectivo = Number(c.VentasEfectivo || 0);
    const otrosIngresosEfectivo = Number(c.OtrosIngresosEfectivo || 0);
    const gastosEfectivo = Number(c.GastosEfectivo || 0);
    const pagosPersonalEfectivo = Number(c.PagosPersonalEfectivo || 0);
    const pagosProveedorEfectivo = Number(c.PagosProveedorEfectivo || 0);
    const retirosEfectivo = Number(c.RetirosEfectivo || 0);
    const reembolsosEfectivo = Number(c.ReembolsosEfectivo || 0);
    const ventasBrutas = Number(c.VentasBrutas || 0);
    const devolucionesMonto = Number(c.DevolucionesMonto || 0);
    const ventasNetas = ventasBrutas - devolucionesMonto;

    // Fórmula estricta:
    // Efectivo Esperado = Monto inicial + Ingresos en efectivo - Egresos en efectivo
    const efectivoEsperado =
      montoInicial +
      ventasEfectivo +
      otrosIngresosEfectivo -
      gastosEfectivo -
      pagosPersonalEfectivo -
      pagosProveedorEfectivo -
      retirosEfectivo -
      reembolsosEfectivo;

    const efectivoContado = Number(input.efectivoContado);
    const diferencia = Number((efectivoContado - efectivoEsperado).toFixed(2));

    let tipoCuadre: "CUADRE_EXACTO" | "FALTANTE" | "SOBRANTE" = "CUADRE_EXACTO";
    if (diferencia < -0.01) tipoCuadre = "FALTANTE";
    else if (diferencia > 0.01) tipoCuadre = "SOBRANTE";

    // 4. Actualizar la sesión a CERRADA con fecha, totales y diferencia inmutable
    const updateReq = new sql.Request(transaction);
    updateReq.input("idSesion", sql.Int, input.idSesion);
    updateReq.input("idEmpCierre", sql.Int, input.idEmpleadoCierre);
    updateReq.input("efEsperado", sql.Decimal(12, 2), efectivoEsperado);
    updateReq.input("efContado", sql.Decimal(12, 2), efectivoContado);
    updateReq.input("dif", sql.Decimal(12, 2), diferencia);
    updateReq.input("obsCierre", sql.VarChar(255), input.observacionesCierre || `Cierre de caja - ${tipoCuadre}`);

    const updateRes = await updateReq.query(`
      UPDATE dbo.Sesion_Caja
      SET 
        Estado = 'CERRADA',
        Fecha_cierre = GETDATE(),
        ID_empleado_cierre = @idEmpCierre,
        Efectivo_esperado = @efEsperado,
        Efectivo_contado = @efContado,
        Diferencia = @dif,
        Observaciones_cierre = @obsCierre
      OUTPUT CONVERT(VARCHAR(19), INSERTED.Fecha_cierre, 120) AS FechaCierre
      WHERE ID_sesion = @idSesion
    `);
    const fechaCierre = String(updateRes.recordset[0].FechaCierre);

    // 5. Desglose por método de pago para el informe final
    const pmReq = new sql.Request(transaction);
    const pmRes = await pmReq.input("idSesion", sql.Int, input.idSesion).query(`
      SELECT 
        mp.ID_metodo,
        mp.Nombre_metodo,
        ISNULL(SUM(CASE WHEN m.Tipo = 'INGRESO' AND m.Categoria = 'VENTA' THEN m.Monto ELSE 0 END), 0) AS TotalCobrado,
        ISNULL(SUM(CASE WHEN m.Tipo = 'EGRESO' AND m.Categoria = 'REEMBOLSO_DEVOLUCION' THEN m.Monto ELSE 0 END), 0) AS TotalDevuelto,
        ISNULL(SUM(CASE WHEN m.Tipo = 'INGRESO' THEN m.Monto ELSE -m.Monto END), 0) AS SaldoNeto,
        CASE WHEN mp.ID_metodo = 1 THEN 1 ELSE 0 END AS EsEfectivoFisico
      FROM dbo.Metodo_Pago mp
      LEFT JOIN dbo.Movimiento_Caja m ON mp.ID_metodo = m.ID_metodo AND m.ID_sesion = @idSesion
      GROUP BY mp.ID_metodo, mp.Nombre_metodo
      ORDER BY mp.ID_metodo ASC
    `);

    const desgloseMetodosPago = pmRes.recordset.map((row: any) => ({
      idMetodo: Number(row.ID_metodo),
      nombreMetodo: String(row.Nombre_metodo),
      totalCobrado: Number(row.TotalCobrado || 0),
      totalDevuelto: Number(row.TotalDevuelto || 0),
      saldoNeto: Number(row.SaldoNeto || 0),
      esEfectivoFisico: Boolean(row.EsEfectivoFisico),
    }));

    await transaction.commit();

    return {
      idSesion: input.idSesion,
      fechaApertura: String(sessRow.FechaApertura),
      fechaCierre,
      empleadoApertura: String(sessRow.EmpleadoApertura),
      empleadoCierre: String(empleadoCierreNombre),
      montoInicial,
      ventasCount: Number(c.VentasCount || 0),
      ventasBrutas,
      descuentos: 0,
      devoluciones: devolucionesMonto,
      ventasNetas,
      desgloseMetodosPago,
      otrosIngresosEfectivo,
      gastosEfectivo,
      pagosPersonalEfectivo,
      pagosProveedorEfectivo,
      retirosEfectivo,
      reembolsosEfectivo,
      efectivoEsperado,
      efectivoContado,
      diferencia,
      tipoCuadre,
      observacionesCierre: input.observacionesCierre || `Cierre registrado con ${tipoCuadre}`,
    };
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {}
    throw err;
  }
}

/**
 * Reapertura Excepcional Auditada de Caja.
 */
export async function reopenCashSessionTransaction(input: ReopenCashInput): Promise<CashSession> {
  assertMutationsAllowed("reopenCashSessionTransaction");
  if (!input.motivoReapertura || input.motivoReapertura.trim().length < 10) {
    throw new CashError(
      "Debe proporcionar una justificación de auditoría de al menos 10 caracteres.",
      "INVALID_REOPEN_REASON"
    );
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    // 1. Bloqueo y verificación de que esté CERRADA
    const sessReq = new sql.Request(transaction);
    const sessRes = await sessReq.input("idSesion", sql.Int, input.idSesion).query(`
      SELECT ID_sesion, Estado FROM dbo.Sesion_Caja WITH (UPDLOCK, HOLDLOCK)
      WHERE ID_sesion = @idSesion
    `);
    if (sessRes.recordset.length === 0) throw new SessionNotFoundError(input.idSesion);
    if (sessRes.recordset[0].Estado !== "CERRADA") {
      throw new CashError(`La sesión #${input.idSesion} no está cerrada.`, "SESSION_NOT_CLOSED");
    }

    // 2. Verificar que no haya otra sesión ya abierta actualmente
    const activeReq = new sql.Request(transaction);
    const activeRes = await activeReq.query(`
      SELECT ID_sesion FROM dbo.Sesion_Caja WITH (UPDLOCK, HOLDLOCK)
      WHERE Estado IN ('ABIERTA', 'REABIERTA')
    `);
    if (activeRes.recordset.length > 0) {
      throw new CashError(
        `No se puede reabrir la sesión #${input.idSesion} porque ya existe otra sesión activa (#${activeRes.recordset[0].ID_sesion}).`,
        "ANOTHER_SESSION_ACTIVE"
      );
    }

    // 3. Actualizar a REABIERTA guardando motivo y fecha
    const upReq = new sql.Request(transaction);
    upReq.input("idSesion", sql.Int, input.idSesion);
    upReq.input("idEmpReap", sql.Int, input.idEmpleadoReapertura);
    upReq.input("motivo", sql.VarChar(255), input.motivoReapertura);

    await upReq.query(`
      UPDATE dbo.Sesion_Caja
      SET 
        Estado = 'REABIERTA',
        Fecha_reapertura = GETDATE(),
        ID_empleado_reapertura = @idEmpReap,
        Motivo_reapertura = @motivo
      WHERE ID_sesion = @idSesion
    `);

    // 4. Registrar movimiento de auditoría por reapertura
    const audReq = new sql.Request(transaction);
    audReq.input("idSesion", sql.Int, input.idSesion);
    audReq.input("motivo", sql.VarChar(255), `AUDITORÍA: Reapertura excepcional de turno - ${input.motivoReapertura}`);
    audReq.input("idEmp", sql.Int, input.idEmpleadoReapertura);
    await audReq.query(`
      INSERT INTO dbo.Movimiento_Caja (
        ID_sesion, Fecha_hora, Tipo, Categoria, Monto, ID_metodo, Concepto, ID_empleado, Afecta_efectivo
      )
      VALUES (
        @idSesion, GETDATE(), 'INGRESO', 'AJUSTE', 0.01, 1, @motivo, @idEmp, 0
      )
    `);

    await transaction.commit();

    const reopened = await getCashSessionById(input.idSesion, pool);
    if (!reopened) throw new CashError("Error al recuperar la sesión reabierta.");
    return reopened;
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {}
    throw err;
  }
}

/**
 * Consulta movimientos recientes de caja.
 */
export async function getRecentCashMovements(idSesion?: number, limit = 50): Promise<CashMovement[]> {
  const pool = await getPool();
  let where = "";
  if (idSesion) {
    where = "WHERE m.ID_sesion = @idSesion";
  }

  const query = `
    SELECT TOP (${limit})
      m.ID_mov_caja,
      m.ID_sesion,
      CONVERT(VARCHAR(19), m.Fecha_hora, 120) AS FechaHora,
      m.Tipo,
      m.Categoria,
      m.Monto,
      m.ID_metodo,
      mp.Nombre_metodo,
      m.Concepto,
      m.ID_empleado,
      (e.Nombre_emp + ' ' + e.Apellido_emp) AS NombreEmpleado,
      m.ID_venta,
      m.ID_devolucion,
      m.Afecta_efectivo
    FROM dbo.Movimiento_Caja m
    JOIN dbo.Metodo_Pago mp ON m.ID_metodo = mp.ID_metodo
    JOIN dbo.Empleado e ON m.ID_empleado = e.ID_empleado
    ${where}
    ORDER BY m.ID_mov_caja DESC
  `;

  const req = pool.request();
  if (idSesion) req.input("idSesion", sql.Int, idSesion);
  const res = await req.query(query);

  return res.recordset.map((row: any) => ({
    idMovCaja: Number(row.ID_mov_caja),
    idSesion: Number(row.ID_sesion),
    fechaHora: String(row.FechaHora),
    tipo: row.Tipo,
    categoria: row.Categoria,
    monto: Number(row.Monto),
    idMetodo: Number(row.ID_metodo),
    nombreMetodo: String(row.Nombre_metodo),
    concepto: String(row.Concepto),
    idEmpleado: Number(row.ID_empleado),
    nombreEmpleado: String(row.NombreEmpleado),
    idVenta: row.ID_venta ? Number(row.ID_venta) : null,
    idDevolucion: row.ID_devolucion ? Number(row.ID_devolucion) : null,
    afectaEfectivo: Boolean(row.Afecta_efectivo),
  }));
}

/**
 * Historial de sesiones de caja pasadas.
 */
export async function getPastCashSessions(limit = 20): Promise<CashSession[]> {
  const pool = await getPool();
  const query = `
    SELECT TOP (${limit})
      s.ID_sesion,
      s.ID_empleado_apertura,
      (eA.Nombre_emp + ' ' + eA.Apellido_emp) AS EmpleadoAperturaNombre,
      CONVERT(VARCHAR(19), s.Fecha_apertura, 120) AS FechaApertura,
      s.Monto_inicial,
      CONVERT(VARCHAR(19), s.Fecha_cierre, 120) AS FechaCierre,
      s.ID_empleado_cierre,
      (eC.Nombre_emp + ' ' + eC.Apellido_emp) AS EmpleadoCierreNombre,
      s.Efectivo_esperado,
      s.Efectivo_contado,
      s.Diferencia,
      s.Estado,
      s.Observaciones_apertura,
      s.Observaciones_cierre,
      s.Motivo_reapertura,
      CONVERT(VARCHAR(19), s.Fecha_reapertura, 120) AS FechaReapertura,
      s.ID_empleado_reapertura
    FROM dbo.Sesion_Caja s
    JOIN dbo.Empleado eA ON s.ID_empleado_apertura = eA.ID_empleado
    LEFT JOIN dbo.Empleado eC ON s.ID_empleado_cierre = eC.ID_empleado
    ORDER BY s.ID_sesion DESC
  `;

  const res = await pool.request().query(query);
  const list: CashSession[] = [];
  for (const row of res.recordset) {
    list.push(await hydrateSessionMetrics(pool, row));
  }
  return list;
}

/**
 * Registra un pago al personal dentro de la sesión de caja activa.
 * Aplica validación estricta de saldo físico si el método es Efectivo.
 */
export async function registerEmployeePaymentTransaction(
  input: EmployeePaymentInput
): Promise<EmployeePayment> {
  assertMutationsAllowed("registerEmployeePaymentTransaction");

  if (!input.monto || input.monto <= 0) {
    throw new CashError("El monto a pagar debe ser mayor a 0.", "INVALID_AMOUNT");
  }
  if (!input.periodo || !input.periodo.trim()) {
    throw new CashError("Debe especificar el período al que corresponde el pago.", "INVALID_PERIOD");
  }
  if (!input.concepto || !input.concepto.trim()) {
    throw new CashError("Debe especificar el concepto del pago.", "INVALID_CONCEPT");
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    // 1. Validar estado de la sesión
    const sessReq = new sql.Request(transaction);
    const sessRes = await sessReq.input("idSesion", sql.Int, input.idSesion).query(`
      SELECT ID_sesion, Estado, Monto_inicial FROM dbo.Sesion_Caja WITH (UPDLOCK, ROWLOCK)
      WHERE ID_sesion = @idSesion
    `);
    if (sessRes.recordset.length === 0) throw new SessionNotFoundError(input.idSesion);
    const sess = sessRes.recordset[0];
    if (sess.Estado === "CERRADA") throw new SessionAlreadyClosedError(input.idSesion);

    // 2. Validar empleado beneficiario
    const empReq = new sql.Request(transaction);
    const empRes = await empReq.input("idEmp", sql.Int, input.idEmpleado).query(`
      SELECT ID_empleado, (Nombre_emp + ' ' + Apellido_emp) AS Nombre, Dni_emp FROM dbo.Empleado WHERE ID_empleado = @idEmp
    `);
    if (empRes.recordset.length === 0) {
      throw new CashError(`El empleado beneficiario #${input.idEmpleado} no existe.`, "EMPLOYEE_NOT_FOUND");
    }
    const empBeneficiario = empRes.recordset[0];

    // 3. Validar empleado responsable
    const respReq = new sql.Request(transaction);
    const respRes = await respReq.input("idResp", sql.Int, input.idEmpleadoResponsable).query(`
      SELECT (Nombre_emp + ' ' + Apellido_emp) AS Nombre FROM dbo.Empleado WHERE ID_empleado = @idResp
    `);
    if (respRes.recordset.length === 0) {
      throw new CashError(`El empleado responsable #${input.idEmpleadoResponsable} no existe.`, "EMPLOYEE_NOT_FOUND");
    }
    const respNombre = respRes.recordset[0].Nombre;

    // 4. Validar método de pago
    const metReq = new sql.Request(transaction);
    const metRes = await metReq.input("idMetodo", sql.Int, input.idMetodo).query(`
      SELECT ID_metodo, Nombre_metodo FROM dbo.Metodo_Pago WHERE ID_metodo = @idMetodo
    `);
    if (metRes.recordset.length === 0) {
      throw new CashError(`El método de pago #${input.idMetodo} no existe.`, "PAYMENT_METHOD_NOT_FOUND");
    }
    const metodoNombre = metRes.recordset[0].Nombre_metodo;
    const afectaEfectivo = input.idMetodo === 1;

    // 5. Si es efectivo, validar que la gaveta física tenga saldo suficiente
    if (afectaEfectivo) {
      const balReq = new sql.Request(transaction);
      const balRes = await balReq.input("idSesion", sql.Int, input.idSesion).query(`
        SELECT
          ISNULL(SUM(CASE WHEN Tipo = 'INGRESO' AND Afecta_efectivo = 1 THEN Monto ELSE 0 END), 0) -
          ISNULL(SUM(CASE WHEN Tipo = 'EGRESO' AND Afecta_efectivo = 1 THEN Monto ELSE 0 END), 0) AS SaldoMovimientos
        FROM dbo.Movimiento_Caja
        WHERE ID_sesion = @idSesion
      `);
      const saldoGaveta = Number(sess.Monto_inicial) + Number(balRes.recordset[0]?.SaldoMovimientos || 0);
      if (saldoGaveta < input.monto) {
        throw new CashError(
          `Efectivo insuficiente en gaveta física. Saldo disponible: S/ ${saldoGaveta.toFixed(2)}, Requerido: S/ ${input.monto.toFixed(2)}.`,
          "INSUFFICIENT_CASH_IN_DRAWER"
        );
      }
    }

    // 6. Insertar en dbo.Pago_Personal
    const insPagoReq = new sql.Request(transaction);
    insPagoReq.input("idEmp", sql.Int, input.idEmpleado);
    insPagoReq.input("periodo", sql.VarChar(40), input.periodo.trim());
    insPagoReq.input("concepto", sql.VarChar(100), input.concepto.trim());
    insPagoReq.input("monto", sql.Decimal(12, 2), input.monto);
    insPagoReq.input("idMetodo", sql.Int, input.idMetodo);
    insPagoReq.input("idResp", sql.Int, input.idEmpleadoResponsable);
    insPagoReq.input("idSesion", sql.Int, input.idSesion);
    insPagoReq.input("obs", sql.VarChar(255), input.observaciones ? input.observaciones.trim() : null);

    const insPagoRes = await insPagoReq.query(`
      INSERT INTO dbo.Pago_Personal (
        ID_empleado, Fecha_pago, Periodo, Concepto, Monto, ID_metodo, ID_empleado_responsable, ID_sesion, Observaciones
      )
      OUTPUT INSERTED.ID_pago_personal, CONVERT(VARCHAR(19), INSERTED.Fecha_pago, 120) AS FechaPago
      VALUES (
        @idEmp, GETDATE(), @periodo, @concepto, @monto, @idMetodo, @idResp, @idSesion, @obs
      )
    `);
    const newIdPago = Number(insPagoRes.recordset[0].ID_pago_personal);
    const fechaPago = String(insPagoRes.recordset[0].FechaPago);

    // 7. Insertar en dbo.Movimiento_Caja
    const conceptoMov = `Pago al personal: ${empBeneficiario.Nombre} - ${input.concepto.trim()} (${input.periodo.trim()})`;
    const insMovReq = new sql.Request(transaction);
    insMovReq.input("idSesion", sql.Int, input.idSesion);
    insMovReq.input("monto", sql.Decimal(12, 2), input.monto);
    insMovReq.input("idMetodo", sql.Int, input.idMetodo);
    insMovReq.input("concepto", sql.VarChar(255), conceptoMov);
    insMovReq.input("idResp", sql.Int, input.idEmpleadoResponsable);
    insMovReq.input("afectaEf", sql.Bit, afectaEfectivo ? 1 : 0);
    insMovReq.input("idPago", sql.Int, newIdPago);

    await insMovReq.query(`
      INSERT INTO dbo.Movimiento_Caja (
        ID_sesion, Fecha_hora, Tipo, Categoria, Monto, ID_metodo, Concepto, ID_empleado, Afecta_efectivo, ID_pago_personal
      )
      VALUES (
        @idSesion, GETDATE(), 'EGRESO', 'PAGO_PERSONAL', @monto, @idMetodo, @concepto, @idResp, @afectaEf, @idPago
      )
    `);

    await transaction.commit();

    return {
      idPagoPersonal: newIdPago,
      idEmpleado: input.idEmpleado,
      nombreEmpleado: String(empBeneficiario.Nombre),
      dniEmpleado: String(empBeneficiario.Dni_emp),
      fechaPago,
      periodo: input.periodo.trim(),
      concepto: input.concepto.trim(),
      monto: input.monto,
      idMetodo: input.idMetodo,
      nombreMetodo: metodoNombre,
      idEmpleadoResponsable: input.idEmpleadoResponsable,
      nombreResponsable: respNombre,
      idSesion: input.idSesion,
      observaciones: input.observaciones ? input.observaciones.trim() : null,
    };
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {}
    throw err;
  }
}

/**
 * Consulta pagos al personal realizados en una sesión de caja.
 */
export async function getEmployeePaymentsBySession(
  idSesion: number,
  pool?: sql.ConnectionPool
): Promise<EmployeePayment[]> {
  const p = pool || (await getPool());
  const res = await p.request().input("idSesion", sql.Int, idSesion).query(`
    SELECT
      pp.ID_pago_personal,
      pp.ID_empleado,
      (e.Nombre_emp + ' ' + e.Apellido_emp) AS NombreEmpleado,
      e.Dni_emp AS DniEmpleado,
      CONVERT(VARCHAR(19), pp.Fecha_pago, 120) AS FechaPago,
      pp.Periodo,
      pp.Concepto,
      pp.Monto,
      pp.ID_metodo,
      mp.Nombre_metodo,
      pp.ID_empleado_responsable,
      (r.Nombre_emp + ' ' + r.Apellido_emp) AS NombreResponsable,
      pp.ID_sesion,
      pp.Observaciones
    FROM dbo.Pago_Personal pp
    JOIN dbo.Empleado e ON pp.ID_empleado = e.ID_empleado
    JOIN dbo.Empleado r ON pp.ID_empleado_responsable = r.ID_empleado
    JOIN dbo.Metodo_Pago mp ON pp.ID_metodo = mp.ID_metodo
    WHERE pp.ID_sesion = @idSesion
    ORDER BY pp.ID_pago_personal DESC
  `);

  return res.recordset.map((row: any) => ({
    idPagoPersonal: Number(row.ID_pago_personal),
    idEmpleado: Number(row.ID_empleado),
    nombreEmpleado: String(row.NombreEmpleado),
    dniEmpleado: String(row.DniEmpleado),
    fechaPago: String(row.FechaPago),
    periodo: String(row.Periodo),
    concepto: String(row.Concepto),
    monto: Number(row.Monto),
    idMetodo: Number(row.ID_metodo),
    nombreMetodo: String(row.Nombre_metodo),
    idEmpleadoResponsable: Number(row.ID_empleado_responsable),
    nombreResponsable: String(row.NombreResponsable),
    idSesion: Number(row.ID_sesion),
    observaciones: row.Observaciones ? String(row.Observaciones) : null,
  }));
}

/**
 * Genera el desglose analítico de los 4 canales de pago requeridos:
 * EFECTIVO EN CAJA, YAPE, TARJETAS y TRANSFERENCIAS.
 */
export async function getChannelSummaryCards(
  idSesion: number,
  pool?: sql.ConnectionPool
): Promise<ChannelSummaryCard[]> {
  const p = pool || (await getPool());

  // 1. Obtener datos de la sesión para el fondo inicial y estado
  const sessRes = await p.request().input("idSesion", sql.Int, idSesion).query(`
    SELECT Monto_inicial, Efectivo_contado FROM dbo.Sesion_Caja WHERE ID_sesion = @idSesion
  `);
  const montoInicial = Number(sessRes.recordset[0]?.Monto_inicial || 0);
  const efectivoContado = sessRes.recordset[0]?.Efectivo_contado !== null ? Number(sessRes.recordset[0]?.Efectivo_contado) : undefined;

  // 2. Movimientos agregados por canal
  const movRes = await p.request().input("idSesion", sql.Int, idSesion).query(`
    SELECT
      m.ID_metodo,
      mp.Nombre_metodo,
      m.Tipo,
      m.Categoria,
      CASE WHEN m.Concepto LIKE '%Fondo fijo de apertura%' THEN 1 ELSE 0 END AS EsFondoApertura,
      SUM(m.Monto) AS TotalMonto
    FROM dbo.Movimiento_Caja m
    JOIN dbo.Metodo_Pago mp ON m.ID_metodo = mp.ID_metodo
    WHERE m.ID_sesion = @idSesion
    GROUP BY m.ID_metodo, mp.Nombre_metodo, m.Tipo, m.Categoria, CASE WHEN m.Concepto LIKE '%Fondo fijo de apertura%' THEN 1 ELSE 0 END
  `);

  const rows = movRes.recordset;

  // Helper para sumar montos (por defecto excluye fondo inicial de apertura ya que se suma explícitamente vía montoInicial)
  const sum = (metodoIdOrList: number | number[], tipo?: string, categoria?: string, includeApertura = false) => {
    const ids = Array.isArray(metodoIdOrList) ? metodoIdOrList : [metodoIdOrList];
    return rows
      .filter((r: any) => {
        if (!ids.includes(Number(r.ID_metodo))) return false;
        if (tipo && r.Tipo !== tipo) return false;
        if (categoria && r.Categoria !== categoria) return false;
        if (!includeApertura && r.EsFondoApertura === 1) return false;
        return true;
      })
      .reduce((acc: number, r: any) => acc + Number(r.TotalMonto || 0), 0);
  };

  // 1. EFECTIVO (ID_metodo = 1)
  const efVentas = sum(1, "INGRESO", "VENTA");
  const efOtrosIngresos = sum(1, "INGRESO", "INGRESO_MANUAL");
  const efGastos = sum(1, "EGRESO", "GASTO_OPERATIVO");
  const efPagosPers = sum(1, "EGRESO", "PAGO_PERSONAL");
  const efPagosProv = sum(1, "EGRESO", "PAGO_PROVEEDOR");
  const efRetiros = sum(1, "EGRESO", "RETIRO");
  const efReembolsos = sum(1, "EGRESO", "REEMBOLSO_DEVOLUCION");
  const efTotalIngresos = montoInicial + efVentas + efOtrosIngresos;
  const efTotalEgresos = efGastos + efPagosPers + efPagosProv + efRetiros + efReembolsos;
  const efSaldoEsperado = efTotalIngresos - efTotalEgresos;

  const cardEfectivo: ChannelSummaryCard = {
    canal: "EFECTIVO",
    titulo: "Efectivo en Caja",
    totalIngresos: efTotalIngresos,
    totalEgresos: efTotalEgresos,
    saldoNeto: efSaldoEsperado,
    esEfectivoFisico: true,
    detalles: {
      fondoInicial: montoInicial,
      ventas: efVentas,
      otrosIngresos: efOtrosIngresos,
      gastosOperativos: efGastos,
      pagosPersonal: efPagosPers,
      pagosProveedor: efPagosProv,
      retiros: efRetiros,
      reembolsos: efReembolsos,
      saldoEsperado: efSaldoEsperado,
      saldoContado: efectivoContado,
    },
  };

  // 2. YAPE / PLIN (ID_metodo = 4 o nombres que contengan Yape)
  const yapeVentas = sum(4, "INGRESO", "VENTA");
  const yapeReembolsos = sum(4, "EGRESO", "REEMBOLSO_DEVOLUCION");
  const yapePagosPers = sum(4, "EGRESO", "PAGO_PERSONAL");
  const yapePagosProv = sum(4, "EGRESO", "PAGO_PROVEEDOR");
  const yapeTotalIngresos = yapeVentas;
  const yapeTotalEgresos = yapeReembolsos + yapePagosPers + yapePagosProv;

  const cardYape: ChannelSummaryCard = {
    canal: "YAPE",
    titulo: "Billetera Digital Yape / Plin",
    totalIngresos: yapeTotalIngresos,
    totalEgresos: yapeTotalEgresos,
    saldoNeto: yapeTotalIngresos - yapeTotalEgresos,
    esEfectivoFisico: false,
    detalles: {
      ventas: yapeVentas,
      reembolsos: yapeReembolsos,
      pagosPersonal: yapePagosPers,
      pagosProveedor: yapePagosProv,
    },
  };

  // 3. TARJETAS (Crédito y Débito: ID_metodo = 2)
  const tarjVentas = sum(2, "INGRESO", "VENTA");
  const tarjReembolsos = sum(2, "EGRESO", "REEMBOLSO_DEVOLUCION");
  const tarjPagosPers = sum(2, "EGRESO", "PAGO_PERSONAL");
  const tarjPagosProv = sum(2, "EGRESO", "PAGO_PROVEEDOR");
  const tarjTotalIngresos = tarjVentas;
  const tarjTotalEgresos = tarjReembolsos + tarjPagosPers + tarjPagosProv;

  const cardTarjetas: ChannelSummaryCard = {
    canal: "TARJETAS",
    titulo: "Tarjetas (Crédito / Débito)",
    totalIngresos: tarjTotalIngresos,
    totalEgresos: tarjTotalEgresos,
    saldoNeto: tarjTotalIngresos - tarjTotalEgresos,
    esEfectivoFisico: false,
    detalles: {
      ventas: tarjVentas,
      reembolsos: tarjReembolsos,
      pagosPersonal: tarjPagosPers,
      pagosProveedor: tarjPagosProv,
    },
  };

  // 4. TRANSFERENCIAS (ID_metodo = 3)
  const transVentas = sum(3, "INGRESO", "VENTA");
  const transReembolsos = sum(3, "EGRESO", "REEMBOLSO_DEVOLUCION");
  const transPagosPers = sum(3, "EGRESO", "PAGO_PERSONAL");
  const transPagosProv = sum(3, "EGRESO", "PAGO_PROVEEDOR");
  const transTotalIngresos = transVentas;
  const transTotalEgresos = transReembolsos + transPagosPers + transPagosProv;

  const cardTransferencias: ChannelSummaryCard = {
    canal: "TRANSFERENCIAS",
    titulo: "Transferencias Bancarias",
    totalIngresos: transTotalIngresos,
    totalEgresos: transTotalEgresos,
    saldoNeto: transTotalIngresos - transTotalEgresos,
    esEfectivoFisico: false,
    detalles: {
      ventas: transVentas,
      reembolsos: transReembolsos,
      pagosPersonal: transPagosPers,
      pagosProveedor: transPagosProv,
    },
  };

  return [cardEfectivo, cardYape, cardTarjetas, cardTransferencias];
}
