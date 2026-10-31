import sql from "mssql";
import { getPool } from "../db";
import { assertMutationsAllowed } from "../db-guard";
import {
  ObligacionPersonalItem,
  PagoPersonalDetalleItem,
  CreateEmployeeObligationDto,
  RegisterEmployeeObligationPaymentDto,
} from "@/types/expenses";

/**
 * Obtiene el listado de obligaciones de personal con filtros opcionales
 */
export async function getEmployeeObligations(filters?: {
  idEmpleado?: number;
  periodo?: string;
  estado?: string;
}): Promise<ObligacionPersonalItem[]> {
  const pool = await getPool();
  const req = pool.request();

  let query = `
    SELECT 
      op.ID_obligacion,
      op.ID_empleado,
      (e.Nombre_emp + ' ' + e.Apellido_emp) AS NombreEmpleado,
      e.Dni_emp AS DniEmpleado,
      op.Periodo,
      op.Concepto,
      op.Monto_pactado,
      op.Monto_pagado,
      op.Saldo_pendiente,
      op.Estado,
      op.ID_empleado_responsable,
      (r.Nombre_emp + ' ' + r.Apellido_emp) AS NombreEmpleadoResponsable,
      CONVERT(VARCHAR(19), op.Fecha_registro, 120) AS FechaRegistro
    FROM dbo.Obligacion_Personal op
    JOIN dbo.Empleado e ON op.ID_empleado = e.ID_empleado
    JOIN dbo.Empleado r ON op.ID_empleado_responsable = r.ID_empleado
    WHERE 1=1
  `;

  if (filters?.idEmpleado) {
    query += ` AND op.ID_empleado = @idEmp`;
    req.input("idEmp", sql.Int, filters.idEmpleado);
  }

  if (filters?.periodo && filters.periodo !== "TODOS") {
    query += ` AND op.Periodo = @periodo`;
    req.input("periodo", sql.VarChar(40), filters.periodo);
  }

  if (filters?.estado && filters.estado !== "TODOS") {
    query += ` AND op.Estado = @estado`;
    req.input("estado", sql.VarChar(30), filters.estado);
  }

  query += ` ORDER BY op.ID_obligacion DESC`;

  const res = await req.query(query);

  if (res.recordset.length === 0) {
    return [];
  }

  const ids = res.recordset.map((r: any) => r.ID_obligacion);
  const pagosReq = pool.request();
  const pagosRes = await pagosReq.query(`
    SELECT 
      pp.ID_pago_personal,
      pp.ID_obligacion,
      pp.ID_empleado,
      (e.Nombre_emp + ' ' + e.Apellido_emp) AS NombreEmpleado,
      CONVERT(VARCHAR(19), pp.Fecha_pago, 120) AS FechaPago,
      pp.Periodo,
      pp.Concepto,
      pp.Monto,
      pp.ID_metodo,
      mp.Nombre_metodo AS NombreMetodo,
      pp.ID_empleado_responsable,
      (r.Nombre_emp + ' ' + r.Apellido_emp) AS NombreEmpleadoResponsable,
      pp.ID_sesion,
      ISNULL(pp.Es_adelanto, 0) AS Es_adelanto,
      pp.Observaciones
    FROM dbo.Pago_Personal pp
    JOIN dbo.Empleado e ON pp.ID_empleado = e.ID_empleado
    JOIN dbo.Metodo_Pago mp ON pp.ID_metodo = mp.ID_metodo
    JOIN dbo.Empleado r ON pp.ID_empleado_responsable = r.ID_empleado
    WHERE pp.ID_obligacion IN (${ids.join(",")})
    ORDER BY pp.ID_pago_personal ASC
  `);

  const pagosByObligacion = new Map<number, PagoPersonalDetalleItem[]>();
  for (const p of pagosRes.recordset) {
    const list = pagosByObligacion.get(p.ID_obligacion) || [];
    list.push({
      idPagoPersonal: Number(p.ID_pago_personal),
      idObligacion: Number(p.ID_obligacion),
      idEmpleado: Number(p.ID_empleado),
      nombreEmpleado: String(p.NombreEmpleado),
      fechaPago: String(p.FechaPago),
      periodo: String(p.Periodo),
      concepto: String(p.Concepto),
      monto: Number(p.Monto),
      idMetodo: Number(p.ID_metodo),
      nombreMetodo: String(p.NombreMetodo),
      idEmpleadoResponsable: Number(p.ID_empleado_responsable),
      nombreEmpleadoResponsable: String(p.NombreEmpleadoResponsable),
      idSesion: p.ID_sesion ? Number(p.ID_sesion) : null,
      esAdelanto: Boolean(p.Es_adelanto),
      observaciones: p.Observaciones || null,
    });
    pagosByObligacion.set(p.ID_obligacion, list);
  }

  return res.recordset.map((r: any) => ({
    idObligacion: Number(r.ID_obligacion),
    idEmpleado: Number(r.ID_empleado),
    nombreEmpleado: String(r.NombreEmpleado),
    dniEmpleado: String(r.DniEmpleado),
    periodo: String(r.Periodo),
    concepto: String(r.Concepto),
    montoPactado: Number(r.Monto_pactado),
    montoPagado: Number(r.Monto_pagado),
    saldoPendiente: Number(r.Saldo_pendiente),
    estado: r.Estado as any,
    idEmpleadoResponsable: Number(r.ID_empleado_responsable),
    nombreEmpleadoResponsable: String(r.NombreEmpleadoResponsable),
    fechaRegistro: String(r.FechaRegistro),
    pagos: pagosByObligacion.get(Number(r.ID_obligacion)) || [],
  }));
}

/**
 * Obtiene una obligación de personal por ID
 */
export async function getEmployeeObligationById(
  idObligacion: number
): Promise<ObligacionPersonalItem | null> {
  const list = await getEmployeeObligations();
  return list.find((o) => o.idObligacion === idObligacion) || null;
}

/**
 * Registra una nueva obligación salarial o compromiso con un trabajador
 */
export async function createEmployeeObligation(
  data: CreateEmployeeObligationDto
): Promise<ObligacionPersonalItem> {
  assertMutationsAllowed("createEmployeeObligation");

  if (!data.idEmpleado || data.idEmpleado <= 0) {
    throw new Error("Debe seleccionar un empleado válido.");
  }
  if (!data.periodo || !data.periodo.trim()) {
    throw new Error("El período laboral es obligatorio (ej. Octubre 2026).");
  }
  if (!data.concepto || !data.concepto.trim()) {
    throw new Error("El concepto de remuneración es obligatorio.");
  }
  const monto = Math.round(Number(data.montoPactado || 0) * 100) / 100;
  if (monto <= 0) {
    throw new Error("La remuneración pactada debe ser mayor a cero.");
  }

  const pool = await getPool();
  const req = pool.request();
  req.input("idEmp", sql.Int, data.idEmpleado);
  req.input("periodo", sql.VarChar(40), data.periodo.trim());
  req.input("concepto", sql.VarChar(100), data.concepto.trim());
  req.input("monto", sql.Decimal(12, 2), monto);
  req.input("idResp", sql.Int, data.idEmpleadoResponsable);

  const res = await req.query(`
    INSERT INTO dbo.Obligacion_Personal (
      ID_empleado, Periodo, Concepto, Monto_pactado, Monto_pagado,
      Saldo_pendiente, Estado, ID_empleado_responsable, Fecha_registro
    )
    OUTPUT INSERTED.ID_obligacion
    VALUES (
      @idEmp, @periodo, @concepto, @monto, 0.00,
      @monto, 'PENDIENTE', @idResp, GETDATE()
    );
  `);

  const idObligacion = Number(res.recordset[0].ID_obligacion);
  const created = await getEmployeeObligationById(idObligacion);
  if (!created) throw new Error("No se pudo recuperar la obligación laboral creada.");
  return created;
}

/**
 * Registra un pago (adelanto o saldo) a un trabajador
 */
export async function registerEmployeePayment(
  data: RegisterEmployeeObligationPaymentDto
): Promise<PagoPersonalDetalleItem> {
  assertMutationsAllowed("registerEmployeePayment");

  if (!data.idEmpleado || data.idEmpleado <= 0) {
    throw new Error("Debe seleccionar un trabajador válido.");
  }
  const monto = Math.round(Number(data.monto || 0) * 100) / 100;
  if (monto <= 0) {
    throw new Error("El monto del pago debe ser mayor a cero.");
  }
  if (!data.idMetodo || data.idMetodo <= 0) {
    throw new Error("Debe seleccionar un método de pago válido.");
  }
  if (!data.idEmpleadoResponsable || data.idEmpleadoResponsable <= 0) {
    throw new Error("Debe indicarse el empleado responsable que autoriza el pago.");
  }

  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    let idObligacion = data.idObligacion || null;

    if (idObligacion) {
      // 1. Validar contra la obligación laboral con UPDLOCK
      const checkReq = new sql.Request(tx);
      checkReq.input("idOb", sql.Int, idObligacion);
      const obRes = await checkReq.query(`
        SELECT Monto_pactado, Monto_pagado, Saldo_pendiente, Estado, Periodo
        FROM dbo.Obligacion_Personal WITH (UPDLOCK, ROWLOCK)
        WHERE ID_obligacion = @idOb;
      `);

      if (obRes.recordset.length === 0) {
        throw new Error(`Obligación laboral #${idObligacion} no encontrada.`);
      }

      const ob = obRes.recordset[0];
      const pactado = Number(ob.Monto_pactado);
      const pagadoActual = Number(ob.Monto_pagado);
      const saldoActual = Number(ob.Saldo_pendiente);

      if (ob.Estado === "PAGADA") {
        throw new Error(`La obligación laboral #${idObligacion} ya está totalmente pagada.`);
      }
      if (ob.Estado === "ANULADA") {
        throw new Error(`La obligación laboral #${idObligacion} está anulada.`);
      }

      if (monto > saldoActual + 0.001) {
        throw new Error(
          `El abono de S/ ${monto.toFixed(2)} supera el saldo pendiente (S/ ${saldoActual.toFixed(2)}). ` +
          `No se admiten sobrepagos de haberes sin un registro previo de ajuste.`
        );
      }

      // Prevención de duplicado en los últimos 2 segundos
      const dupReq = new sql.Request(tx);
      dupReq.input("idOb", sql.Int, idObligacion);
      dupReq.input("monto", sql.Decimal(12, 2), monto);
      const dupRes = await dupReq.query(`
        SELECT 1 FROM dbo.Pago_Personal
        WHERE ID_obligacion = @idOb AND Monto = @monto 
          AND DATEDIFF(SECOND, Fecha_pago, GETDATE()) < 2;
      `);
      if (dupRes.recordset.length > 0) {
        throw new Error("Transacción duplicada detectada. Se rechazó el reintento de pago al personal.");
      }

      // 2. Actualizar obligación
      const nuevoMontoPagado = Math.round((pagadoActual + monto) * 100) / 100;
      const nuevoSaldo = Math.max(0, Math.round((pactado - nuevoMontoPagado) * 100) / 100);
      const nuevoEstado = nuevoSaldo <= 0.001 ? "PAGADA" : "PARCIALMENTE PAGADA";

      const updateObReq = new sql.Request(tx);
      updateObReq.input("idOb", sql.Int, idObligacion);
      updateObReq.input("pagado", sql.Decimal(12, 2), nuevoMontoPagado);
      updateObReq.input("saldo", sql.Decimal(12, 2), nuevoSaldo);
      updateObReq.input("estado", sql.VarChar(30), nuevoEstado);
      await updateObReq.query(`
        UPDATE dbo.Obligacion_Personal
        SET Monto_pagado = @pagado,
            Saldo_pendiente = @saldo,
            Estado = @estado
        WHERE ID_obligacion = @idOb;
      `);
    }

    // 3. Insertar en dbo.Pago_Personal
    const insPagoReq = new sql.Request(tx);
    const periodoVal = data.periodo?.trim() || "Noviembre 2026";
    const conceptoVal = data.concepto?.trim() || "Pago de remuneración al personal";
    insPagoReq.input("idEmp", sql.Int, data.idEmpleado);
    insPagoReq.input("periodo", sql.VarChar(40), periodoVal);
    insPagoReq.input("concepto", sql.VarChar(100), conceptoVal);
    insPagoReq.input("monto", sql.Decimal(12, 2), monto);
    insPagoReq.input("idMetodo", sql.Int, data.idMetodo);
    insPagoReq.input("idResp", sql.Int, data.idEmpleadoResponsable);
    insPagoReq.input("idSesion", sql.Int, data.idSesion || null);
    insPagoReq.input("idOb", sql.Int, idObligacion);
    insPagoReq.input("esAdelanto", sql.Bit, data.esAdelanto ? 1 : 0);
    insPagoReq.input("obs", sql.VarChar(255), data.observaciones?.trim() || null);

    const pagoRes = await insPagoReq.query(`
      INSERT INTO dbo.Pago_Personal (
        ID_empleado, Fecha_pago, Periodo, Concepto, Monto, ID_metodo,
        ID_empleado_responsable, ID_sesion, ID_obligacion, Es_adelanto, Observaciones
      )
      OUTPUT INSERTED.ID_pago_personal, CONVERT(VARCHAR(19), INSERTED.Fecha_pago, 120) AS FechaPago
      VALUES (
        @idEmp, GETDATE(), @periodo, @concepto, @monto, @idMetodo,
        @idResp, @idSesion, @idOb, @esAdelanto, @obs
      );
    `);

    const idPago = Number(pagoRes.recordset[0].ID_pago_personal);
    const fechaPago = String(pagoRes.recordset[0].FechaPago);

    // 4. Si hay sesión de caja, registrar en dbo.Movimiento_Caja
    if (data.idSesion) {
      const affectsCash = data.idMetodo === 1; // Solo efectivo físico resta dinero en gaveta
      const insMovReq = new sql.Request(tx);
      insMovReq.input("idSesion", sql.Int, data.idSesion);
      insMovReq.input("monto", sql.Decimal(12, 2), monto);
      insMovReq.input("idMetodo", sql.Int, data.idMetodo);
      insMovReq.input("concepto", sql.VarChar(200), `${data.concepto.trim()} - Periodo ${data.periodo.trim()}`);
      insMovReq.input("idResp", sql.Int, data.idEmpleadoResponsable);
      insMovReq.input("afectaEf", sql.Bit, affectsCash ? 1 : 0);
      insMovReq.input("idPago", sql.Int, idPago);

      await insMovReq.query(`
        INSERT INTO dbo.Movimiento_Caja (
          ID_sesion, Fecha_hora, Tipo, Categoria, Monto, ID_metodo,
          Concepto, ID_empleado, Afecta_efectivo, ID_pago_personal
        ) VALUES (
          @idSesion, GETDATE(), 'EGRESO', 'PAGO_PERSONAL', @monto, @idMetodo,
          @concepto, @idResp, @afectaEf, @idPago
        );
      `);
    }

    await tx.commit();

    return {
      idPagoPersonal: idPago,
      idObligacion,
      idEmpleado: data.idEmpleado,
      nombreEmpleado: "", // Puede completarse si es necesario
      fechaPago,
      periodo: data.periodo,
      concepto: data.concepto,
      monto,
      idMetodo: data.idMetodo,
      nombreMetodo: "",
      idEmpleadoResponsable: data.idEmpleadoResponsable,
      nombreEmpleadoResponsable: "",
      idSesion: data.idSesion || null,
      esAdelanto: Boolean(data.esAdelanto),
      observaciones: data.observaciones || null,
    };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export { registerEmployeePayment as registerEmployeeObligationPayment };
