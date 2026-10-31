import sql from "mssql";
import { getPool } from "../db";
import { assertMutationsAllowed } from "../db-guard";
import {
  CreateReturnInput,
  ApproveReturnInput,
  RejectReturnInput,
  SaleForReturnSearch,
  SaleLineWithBalance,
  TransactionalReturnResult,
} from "@/types/returns";

// ============================================================================
// CLASES DE ERROR TRANSACCIONALES
// ============================================================================

export class ReturnTransactionError extends Error {
  constructor(message: string, public readonly code: string = "RETURN_TRANSACTION_ERROR") {
    super(message);
    this.name = "ReturnTransactionError";
  }
}

export class SaleNotFoundError extends ReturnTransactionError {
  constructor(identifier: string | number) {
    super(`La venta '${identifier}' no existe en la base de datos.`, "SALE_NOT_FOUND");
    this.name = "SaleNotFoundError";
  }
}

export class ReturnNotFoundError extends ReturnTransactionError {
  constructor(id: number) {
    super(`El trámite de devolución con ID #${id} no existe en la base de datos.`, "RETURN_NOT_FOUND");
    this.name = "ReturnNotFoundError";
  }
}

export class InvalidStateTransitionError extends ReturnTransactionError {
  constructor(id: number, currentState: string, attemptedAction: "aprobar" | "rechazar") {
    super(
      `No se puede ${attemptedAction} el trámite #${id}. Su estado actual es '${currentState}'. Únicamente los trámites en estado 'Pendiente' pueden ser procesados.`,
      "INVALID_STATE_TRANSITION"
    );
    this.name = "InvalidStateTransitionError";
  }
}

export class ReturnLineBelongsToAnotherSaleError extends ReturnTransactionError {
  constructor(idDetalle: number, idVentaOriginal: number, idVentaSolicitada: number) {
    super(
      `El detalle #${idDetalle} pertenece a la venta #${idVentaOriginal}, no a la venta #${idVentaSolicitada}.`,
      "RETURN_LINE_SALE_MISMATCH"
    );
    this.name = "ReturnLineBelongsToAnotherSaleError";
  }
}

export class ReturnLineNotFoundError extends ReturnTransactionError {
  constructor(idDetalle: number) {
    super(`El detalle de venta con ID #${idDetalle} no existe.`, "RETURN_LINE_NOT_FOUND");
    this.name = "ReturnLineNotFoundError";
  }
}

export class InvalidReturnQuantityError extends ReturnTransactionError {
  constructor(message: string) {
    super(message, "INVALID_RETURN_QUANTITY");
    this.name = "InvalidReturnQuantityError";
  }
}

export class ReturnQuantityExceedsAvailableError extends ReturnTransactionError {
  constructor(
    public readonly idDetalle: number,
    public readonly codbarras: string,
    public readonly nombreProd: string,
    public readonly disponible: number,
    public readonly solicitada: number
  ) {
    super(
      `Cantidad inválida para '${nombreProd}' (${codbarras}). Solicitado: ${solicitada} unid., Disponible real para devolución: ${disponible} unid. (Ya descontando devoluciones aprobadas y pendientes reservadas).`,
      "RETURN_QUANTITY_EXCEEDS_AVAILABLE"
    );
    this.name = "ReturnQuantityExceedsAvailableError";
  }
}

export class InvalidReturnMotiveError extends ReturnTransactionError {
  constructor(idMotivo: number) {
    super(`El motivo de devolución con ID #${idMotivo} no existe en dbo.Motivo_Dev.`, "INVALID_RETURN_MOTIVE");
    this.name = "InvalidReturnMotiveError";
  }
}

export class RestockNotAllowedForDefectiveError extends ReturnTransactionError {
  constructor(motivo: string, codbarras: string, nombreProd: string) {
    super(
      `Reingreso a stock denegado para '${nombreProd}' (${codbarras}). Las devoluciones con motivo '${motivo}' no son aptas para retorno al inventario comercial vendible.`,
      "RESTOCK_NOT_ALLOWED"
    );
    this.name = "RestockNotAllowedForDefectiveError";
  }
}

export class ProductDiscontinuedRestockError extends ReturnTransactionError {
  constructor(codbarras: string, nombreProd: string) {
    super(
      `El producto '${nombreProd}' (${codbarras}) se encuentra en estado Descontinuado y no puede ser reintegrado automáticamente al catálogo activo.`,
      "PRODUCT_DISCONTINUED_RESTOCK"
    );
    this.name = "ProductDiscontinuedRestockError";
  }
}

// ============================================================================
// CONSULTA DE VENTA CON BALANCE DISPONIBLE (SOLO LECTURA)
// ============================================================================

export interface SaleCandidate {
  idVenta: number;
  numeroComprobante: string;
  fechaVenta: string;
  totalVenta: number;
  tipoComprobante: string;
  dniCliente: string;
  nombreCliente: string;
}

/**
 * Busca ventas candidatas por comprobante, DNI, nombre de cliente o fecha.
 */
export async function searchSaleCandidates(query: string): Promise<SaleCandidate[]> {
  const pool = await getPool();
  const req = pool.request();
  const cleanTerm = query.trim();
  req.input("term", sql.VarChar(100), `%${cleanTerm}%`);

  const res = await req.query(`
    SELECT TOP 15
      v.ID_venta,
      v.Numero_comprobante,
      CONVERT(VARCHAR(10), v.Fecha_venta, 120) AS Fecha_venta,
      CAST(v.Total_venta AS FLOAT) AS Total_venta,
      tc.Nombre_tipo AS Tipo_comprobante,
      v.Dni_cliente,
      CONCAT(c.Nombre_cl, ' ', c.Apellido_cl) AS Nombre_cliente
    FROM dbo.Venta v
    JOIN dbo.Tipo_Comprobante tc ON v.ID_tipo_comp = tc.ID_tipo_comp
    JOIN dbo.Cliente c ON v.Dni_cliente = c.Dni_cliente
    WHERE 
      v.Numero_comprobante LIKE @term
      OR v.Dni_cliente LIKE @term
      OR c.Nombre_cl LIKE @term
      OR c.Apellido_cl LIKE @term
      OR CONCAT(c.Nombre_cl, ' ', c.Apellido_cl) LIKE @term
      OR CONVERT(VARCHAR(10), v.Fecha_venta, 120) LIKE @term
    ORDER BY v.Fecha_venta DESC, v.ID_venta DESC;
  `);

  return res.recordset.map((r: any) => ({
    idVenta: Number(r.ID_venta),
    numeroComprobante: String(r.Numero_comprobante),
    fechaVenta: String(r.Fecha_venta),
    totalVenta: Number(r.Total_venta),
    tipoComprobante: String(r.Tipo_comprobante),
    dniCliente: String(r.Dni_cliente),
    nombreCliente: String(r.Nombre_cliente),
  }));
}

/**
 * Consulta una venta por número de comprobante o ID y calcula para cada línea vendida
 * el saldo real disponible aplicando la política estricta de reservas:
 * Disponible = CantidadVendida - Aprobadas - PendientesReservadas.
 */
export async function getSaleWithAvailableBalances(
  identifier: string | number
): Promise<SaleForReturnSearch | null> {
  const pool = await getPool();

  const req = pool.request();
  const strId = String(identifier).trim();
  const isNumeric = typeof identifier === "number" || /^\d+$/.test(strId);

  let whereClause = "";
  if (isNumeric && strId.length <= 6) {
    req.input("idVenta", sql.Int, Number(strId));
    whereClause = "v.ID_venta = @idVenta";
  } else if (isNumeric && strId.length === 8) {
    // Si pasaron un DNI, buscar la venta más reciente de ese cliente
    req.input("dniCliente", sql.Char(8), strId);
    whereClause = "v.Dni_cliente = @dniCliente";
  } else {
    req.input("voucher", sql.VarChar(50), strId);
    whereClause = "v.Numero_comprobante = @voucher OR v.Numero_comprobante LIKE '%' + @voucher + '%'";
  }

  // 1. Obtener cabecera de la venta (la más reciente si coincide más de una)
  const saleRes = await req.query(`
    SELECT TOP 1
      v.ID_venta,
      v.Numero_comprobante,
      CONVERT(VARCHAR(10), v.Fecha_venta, 120) AS Fecha_venta,
      CAST(v.Total_venta AS FLOAT) AS Total_venta,
      tc.Nombre_tipo AS Tipo_comprobante,
      v.Dni_cliente,
      CONCAT(c.Nombre_cl, ' ', c.Apellido_cl) AS Nombre_cliente,
      v.ID_empleado,
      CONCAT(e.Nombre_emp, ' ', e.Apellido_emp) AS Nombre_empleado
    FROM dbo.Venta v
    JOIN dbo.Tipo_Comprobante tc ON v.ID_tipo_comp = tc.ID_tipo_comp
    JOIN dbo.Cliente c ON v.Dni_cliente = c.Dni_cliente
    JOIN dbo.Empleado e ON v.ID_empleado = e.ID_empleado
    WHERE ${whereClause}
    ORDER BY v.Fecha_venta DESC, v.ID_venta DESC;
  `);

  if (saleRes.recordset.length === 0) {
    return null;
  }

  const s = saleRes.recordset[0];

  // 2. Obtener líneas de detalle con cálculo de saldos y plazos de garantía
  const linesReq = pool.request();
  linesReq.input("idVentaParam", sql.Int, s.ID_venta);

  const linesRes = await linesReq.query(`
    SELECT 
      dv.ID_detalle,
      dv.Codbarras_prod,
      p.Nombre_prod,
      CAST(dv.Precio_unitario AS FLOAT) AS Precio_unitario,
      dv.Cantidad AS CantidadVendida,
      CAST(dv.Subtotal AS FLOAT) AS Subtotal,
      p.Garantia_meses,
      ISNULL(SUM(CASE WHEN d.ID_estado_dev = 2 THEN dd.Cantidad_dev ELSE 0 END), 0) AS CantidadAprobada,
      ISNULL(SUM(CASE WHEN d.ID_estado_dev = 1 THEN dd.Cantidad_dev ELSE 0 END), 0) AS CantidadPendiente
    FROM dbo.Detalle_Venta dv
    JOIN dbo.Producto p ON dv.Codbarras_prod = p.Codbarras_prod
    LEFT JOIN dbo.Detalle_Dev dd ON dv.ID_detalle = dd.ID_detalle
    LEFT JOIN dbo.Devolucion d ON dd.ID_devolucion = d.ID_devolucion
    WHERE dv.ID_venta = @idVentaParam
    GROUP BY 
      dv.ID_detalle, 
      dv.Codbarras_prod, 
      p.Nombre_prod, 
      dv.Precio_unitario, 
      dv.Cantidad, 
      dv.Subtotal, 
      p.Garantia_meses
    ORDER BY dv.ID_detalle ASC;
  `);

  const now = new Date();
  const saleDateObj = new Date(s.Fecha_venta + "T00:00:00");

  const lineas: SaleLineWithBalance[] = linesRes.recordset.map((r: any) => {
    const vendida = Number(r.CantidadVendida);
    const aprobada = Number(r.CantidadAprobada);
    const pendiente = Number(r.CantidadPendiente);
    const disponible = Math.max(0, vendida - aprobada - pendiente);

    // Cálculo dinámico de garantía
    const garantiaMeses = Number(r.Garantia_meses) || 0;
    const expirationDate = new Date(saleDateObj);
    expirationDate.setMonth(expirationDate.getMonth() + garantiaMeses);

    const diffTime = expirationDate.getTime() - now.getTime();
    const diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const garantiaVigente = diasRestantes >= 0;

    return {
      idDetalle: Number(r.ID_detalle),
      codbarrasProd: String(r.Codbarras_prod),
      nombreProd: String(r.Nombre_prod),
      precioUnitario: Number(r.Precio_unitario),
      cantidadVendida: vendida,
      subtotal: Number(r.Subtotal),
      garantiaMeses,
      cantidadAprobada: aprobada,
      cantidadPendiente: pendiente,
      cantidadDisponible: disponible,
      diasGarantiaRestantes: diasRestantes,
      garantiaVigente,
      fechaVencimientoGarantia: expirationDate.toISOString().split("T")[0],
    };
  });

  return {
    idVenta: Number(s.ID_venta),
    numeroComprobante: String(s.Numero_comprobante),
    fechaVenta: String(s.Fecha_venta),
    totalVenta: Number(s.Total_venta),
    tipoComprobante: String(s.Tipo_comprobante),
    dniCliente: String(s.Dni_cliente),
    nombreCliente: String(s.Nombre_cliente),
    idEmpleado: Number(s.ID_empleado),
    nombreEmpleado: String(s.Nombre_empleado),
    lineas,
  };
}

// ============================================================================
// TRANSACCIÓN: REGISTRAR NUEVA DEVOLUCIÓN (ESTADO PENDIENTE)
// ============================================================================

/**
 * Registra una devolución en estado Pendiente.
 * - Adquiere bloqueos pesimistas UPDLOCK, ROWLOCK sobre las líneas vendidas.
 * - Valida que las cantidades solicitadas no superen el saldo disponible.
 * - Consolida líneas duplicadas antes de insertar (respeta UQ_DetDev).
 * - Reserva las unidades devueltas en la misma transacción atómica.
 */
export async function createReturnTransaction(
  input: CreateReturnInput,
  sessionEmpId: number
): Promise<TransactionalReturnResult> {
  // Verificación estricta: bloquea mutaciones sobre MishutecT2 (académica)
  assertMutationsAllowed("createReturnTransaction");

  if (!input.items || input.items.length === 0) {
    throw new InvalidReturnQuantityError("Debe incluir al menos un producto a devolver.");
  }

  // 1. Consolidación de ítems repetidos por ID_detalle
  const consolidatedMap = new Map<number, { idDetalle: number; cantidadDev: number; idMotivo: number }>();
  for (const it of input.items) {
    if (it.cantidadDev <= 0) {
      throw new InvalidReturnQuantityError(`La cantidad devuelta para el detalle #${it.idDetalle} debe ser mayor a 0.`);
    }
    if (consolidatedMap.has(it.idDetalle)) {
      const prev = consolidatedMap.get(it.idDetalle)!;
      prev.cantidadDev += it.cantidadDev;
    } else {
      consolidatedMap.set(it.idDetalle, { ...it });
    }
  }
  const consolidatedItems = Array.from(consolidatedMap.values());

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    // 2. Verificar existencia de la venta
    const saleReq = new sql.Request(transaction);
    saleReq.input("idVenta", sql.Int, input.idVenta);
    const saleRes = await saleReq.query(`
      SELECT v.ID_venta, v.Numero_comprobante, v.Fecha_venta
      FROM dbo.Venta v WITH (UPDLOCK, ROWLOCK)
      WHERE v.ID_venta = @idVenta;
    `);

    if (saleRes.recordset.length === 0) {
      throw new SaleNotFoundError(input.idVenta);
    }
    const saleInfo = saleRes.recordset[0];

    // 3. Validar motivos en dbo.Motivo_Dev
    const motivosReq = new sql.Request(transaction);
    const motivosRes = await motivosReq.query("SELECT ID_motivo FROM dbo.Motivo_Dev");
    const validMotivoIds = new Set<number>(motivosRes.recordset.map((r: any) => Number(r.ID_motivo)));

    for (const it of consolidatedItems) {
      if (!validMotivoIds.has(it.idMotivo)) {
        throw new InvalidReturnMotiveError(it.idMotivo);
      }
    }

    // 4. Bloquear y validar líneas de Detalle_Venta en orden creciente de ID_detalle (antideadlock)
    const sortedDetails = [...consolidatedItems].sort((a, b) => a.idDetalle - b.idDetalle);
    let totalUnidades = 0;
    let montoEstimado = 0;

    for (const it of sortedDetails) {
      const lineReq = new sql.Request(transaction);
      lineReq.input("idDetalle", sql.Int, it.idDetalle);

      const lineRes = await lineReq.query(`
        SELECT 
          dv.ID_detalle,
          dv.ID_venta,
          dv.Codbarras_prod,
          p.Nombre_prod,
          CAST(dv.Precio_unitario AS FLOAT) AS Precio_unitario,
          dv.Cantidad AS CantidadVendida,
          ISNULL(SUM(CASE WHEN d.ID_estado_dev = 2 THEN dd.Cantidad_dev ELSE 0 END), 0) AS CantidadAprobada,
          ISNULL(SUM(CASE WHEN d.ID_estado_dev = 1 THEN dd.Cantidad_dev ELSE 0 END), 0) AS CantidadPendiente
        FROM dbo.Detalle_Venta dv WITH (UPDLOCK, ROWLOCK)
        JOIN dbo.Producto p ON dv.Codbarras_prod = p.Codbarras_prod
        LEFT JOIN dbo.Detalle_Dev dd ON dv.ID_detalle = dd.ID_detalle
        LEFT JOIN dbo.Devolucion d ON dd.ID_devolucion = d.ID_devolucion
        WHERE dv.ID_detalle = @idDetalle
        GROUP BY 
          dv.ID_detalle, 
          dv.ID_venta, 
          dv.Codbarras_prod, 
          p.Nombre_prod, 
          dv.Precio_unitario, 
          dv.Cantidad;
      `);

      if (lineRes.recordset.length === 0) {
        throw new ReturnLineNotFoundError(it.idDetalle);
      }

      const l = lineRes.recordset[0];

      // Validar que el detalle pertenezca a la venta solicitada
      if (Number(l.ID_venta) !== Number(input.idVenta)) {
        throw new ReturnLineBelongsToAnotherSaleError(it.idDetalle, Number(l.ID_venta), Number(input.idVenta));
      }

      const vendida = Number(l.CantidadVendida);
      const aprobada = Number(l.CantidadAprobada);
      const pendiente = Number(l.CantidadPendiente);
      const disponible = Math.max(0, vendida - aprobada - pendiente);

      if (it.cantidadDev > disponible) {
        throw new ReturnQuantityExceedsAvailableError(
          it.idDetalle,
          String(l.Codbarras_prod),
          String(l.Nombre_prod),
          disponible,
          it.cantidadDev
        );
      }

      totalUnidades += it.cantidadDev;
      montoEstimado += it.cantidadDev * Number(l.Precio_unitario);
    }

    // 5. Insertar cabecera en dbo.Devolucion (ID_estado_dev = 1 -> Pendiente)
    const empIdToUse = sessionEmpId > 0 ? sessionEmpId : input.idEmpleado;

    const insDevReq = new sql.Request(transaction);
    insDevReq.input("idVenta", sql.Int, input.idVenta);
    insDevReq.input("idEmpleado", sql.Int, empIdToUse);

    const insDevRes = await insDevReq.query(`
      INSERT INTO dbo.Devolucion (Fecha_dev, ID_estado_dev, ID_venta, ID_empleado)
      OUTPUT INSERTED.ID_devolucion, CONVERT(VARCHAR(10), INSERTED.Fecha_dev, 120) AS FechaDevStr
      VALUES (CAST(GETDATE() AS DATE), 1, @idVenta, @idEmpleado);
    `);

    const newIdDevolucion = Number(insDevRes.recordset[0].ID_devolucion);
    const fechaDevStr = String(insDevRes.recordset[0].FechaDevStr);

    // 6. Insertar líneas en dbo.Detalle_Dev
    for (const it of consolidatedItems) {
      const insDetReq = new sql.Request(transaction);
      insDetReq.input("cantidadDev", sql.Int, it.cantidadDev);
      insDetReq.input("idDevolucion", sql.Int, newIdDevolucion);
      insDetReq.input("idDetalle", sql.Int, it.idDetalle);
      insDetReq.input("idMotivo", sql.Int, it.idMotivo);

      await insDetReq.query(`
        INSERT INTO dbo.Detalle_Dev (Cantidad_dev, ID_devolucion, ID_detalle, ID_motivo)
        VALUES (@cantidadDev, @idDevolucion, @idDetalle, @idMotivo);
      `);
    }

    // 7. Commit atómico
    await transaction.commit();

    return {
      idDevolucion: newIdDevolucion,
      fechaDev: fechaDevStr,
      idEstadoDev: 1,
      nombreEstado: "Pendiente",
      idVenta: Number(input.idVenta),
      numeroComprobante: String(saleInfo.Numero_comprobante),
      totalItemsAfectados: consolidatedItems.length,
      totalUnidades,
      montoEstimado,
    };
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {}
    throw err;
  }
}

// ============================================================================
// TRANSACCIÓN: APROBAR DEVOLUCIÓN (PENDIENTE -> APROBADA) Y REINGRESO A KARDEX
// ============================================================================

/**
 * Aprueba una devolución en estado Pendiente.
 * - Bloquea la cabecera y ejecuta UPDATE condicional verificando estado = 1.
 * - Idempotente y a prueba de condiciones de carrera.
 * - Si reingresoStock es true:
 *   - Solo permitido si el motivo es "Producto equivocado".
 *   - Bloquea el producto y registra movimiento tipo 1 (Entrada) en Mov_Inventario.
 *   - Actualiza Stock y Estado_Prod si estaba Agotado.
 *   - Respeta productos Descontinuados (no los reactiva).
 * - En cualquier caso, las unidades ya reservadas pasan a aprobadas sin doble descuento.
 */
export async function approveReturnTransaction(
  input: ApproveReturnInput,
  sessionEmpId: number
): Promise<TransactionalReturnResult> {
  assertMutationsAllowed("approveReturnTransaction");

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    // 1. Bloqueo de la devolución y verificación de estado
    const devReq = new sql.Request(transaction);
    devReq.input("idDevolucion", sql.Int, input.idDevolucion);

    const devRes = await devReq.query(`
      SELECT 
        d.ID_devolucion,
        d.ID_estado_dev,
        ed.Nombre_estado,
        d.ID_venta,
        v.Numero_comprobante,
        CONVERT(VARCHAR(10), d.Fecha_dev, 120) AS FechaDevStr,
        d.ID_empleado
      FROM dbo.Devolucion d WITH (UPDLOCK, ROWLOCK)
      JOIN dbo.Estado_Dev ed ON d.ID_estado_dev = ed.ID_estado_dev
      JOIN dbo.Venta v ON d.ID_venta = v.ID_venta
      WHERE d.ID_devolucion = @idDevolucion;
    `);

    if (devRes.recordset.length === 0) {
      throw new ReturnNotFoundError(input.idDevolucion);
    }

    const dev = devRes.recordset[0];
    if (Number(dev.ID_estado_dev) !== 1) {
      throw new InvalidStateTransitionError(input.idDevolucion, String(dev.Nombre_estado), "aprobar");
    }

    // 2. Ejecutar UPDATE condicional a estado 2 (Aprobada)
    const updateReq = new sql.Request(transaction);
    updateReq.input("idDevolucion", sql.Int, input.idDevolucion);
    const updateRes = await updateReq.query(`
      UPDATE dbo.Devolucion
      SET ID_estado_dev = 2
      WHERE ID_devolucion = @idDevolucion AND ID_estado_dev = 1;
    `);

    if (updateRes.rowsAffected[0] === 0) {
      throw new InvalidStateTransitionError(input.idDevolucion, "Procesado concurrentemente", "aprobar");
    }

    // 3. Consultar las líneas de esta devolución
    const linesReq = new sql.Request(transaction);
    linesReq.input("idDevolucion", sql.Int, input.idDevolucion);
    const linesRes = await linesReq.query(`
      SELECT 
        dd.ID_detalle_dev,
        dd.Cantidad_dev,
        dd.ID_motivo,
        md.Descripcion_motivo,
        dv.Codbarras_prod,
        p.Nombre_prod,
        p.Stock,
        p.ID_estado_prod,
        CAST(dv.Precio_unitario AS FLOAT) AS Precio_unitario
      FROM dbo.Detalle_Dev dd
      JOIN dbo.Motivo_Dev md ON dd.ID_motivo = md.ID_motivo
      JOIN dbo.Detalle_Venta dv ON dd.ID_detalle = dv.ID_detalle
      JOIN dbo.Producto p ON dv.Codbarras_prod = p.Codbarras_prod
      WHERE dd.ID_devolucion = @idDevolucion
      ORDER BY dd.ID_detalle_dev ASC;
    `);

    let totalUnidades = 0;
    let montoEstimado = 0;
    let reingresoKardexRealizado = false;
    let unidadesReingresadas = 0;

    const empIdToUse = sessionEmpId > 0 ? sessionEmpId : Number(dev.ID_empleado);

    // 4. Evaluar reingreso físico a almacén (Kardex) si fue solicitado
    const wantRestock = Boolean(input.reingresoStock);

    for (const line of linesRes.recordset) {
      const cant = Number(line.Cantidad_dev);
      const precio = Number(line.Precio_unitario);
      const idMotivo = Number(line.ID_motivo);
      const codbarras = String(line.Codbarras_prod);
      const nombreProd = String(line.Nombre_prod);
      const estadoProd = Number(line.ID_estado_prod);

      totalUnidades += cant;
      montoEstimado += cant * precio;

      if (wantRestock) {
        // Validación de regla de negocio: Defectuoso (1) y Garantía (3) NO pueden reingresar
        if (idMotivo !== 2) {
          throw new RestockNotAllowedForDefectiveError(
            String(line.Descripcion_motivo),
            codbarras,
            nombreProd
          );
        }

        // Validación de producto descontinuado (3): no reactivar
        if (estadoProd === 3) {
          throw new ProductDiscontinuedRestockError(codbarras, nombreProd);
        }

        // Bloqueo y actualización de Producto
        const prodReq = new sql.Request(transaction);
        prodReq.input("codbarras", sql.VarChar(13), codbarras);
        prodReq.input("cantidadDev", sql.Int, cant);

        await prodReq.query(`
          UPDATE dbo.Producto WITH (UPDLOCK, ROWLOCK)
          SET 
            Stock = Stock + @cantidadDev,
            ID_estado_prod = CASE 
              WHEN ID_estado_prod = 3 THEN 3 -- Preservar Descontinuado
              WHEN (Stock + @cantidadDev) > 0 AND ID_estado_prod = 2 THEN 1 -- De Agotado a Disponible
              ELSE ID_estado_prod
            END
          WHERE Codbarras_prod = @codbarras;
        `);

        // Inserción en dbo.Mov_Inventario (1 = Entrada)
        const movReq = new sql.Request(transaction);
        movReq.input("cantidad", sql.Int, cant);
        movReq.input("codbarras", sql.VarChar(13), codbarras);
        movReq.input("idEmp", sql.Int, empIdToUse);

        await movReq.query(`
          INSERT INTO dbo.Mov_Inventario (Fecha, Cantidad, ID_tipo_mov, Codbarras_prod, ID_empleado)
          VALUES (CAST(GETDATE() AS DATE), @cantidad, 1, @codbarras, @idEmp);
        `);

        reingresoKardexRealizado = true;
        unidadesReingresadas += cant;
      }
    }

    // 5. Emitir Nota de Crédito vinculada (SUNAT referencial / académico)
    let notaCreditoData: TransactionalReturnResult["notaCredito"] | undefined = undefined;
    const shouldEmitNc = input.emitirNotaCredito !== false;

    if (shouldEmitNc) {
      // Obtener total original de la venta
      const saleTotReq = new sql.Request(transaction);
      saleTotReq.input("idVenta", sql.Int, Number(dev.ID_venta));
      const saleTotRes = await saleTotReq.query(`
        SELECT Total_venta FROM dbo.Venta WHERE ID_venta = @idVenta;
      `);
      const totalVentaOrig = Number(saleTotRes.recordset[0]?.Total_venta || 0);

      const tipoAjuste = montoEstimado >= totalVentaOrig - 0.01 ? "TOTAL" : "PARCIAL";

      // Obtener siguiente correlativo NC01-XXXXXX
      const ncSeqReq = new sql.Request(transaction);
      const ncSeqRes = await ncSeqReq.query(`
        SELECT ISNULL(MAX(ID_nota_credito), 0) + 1 AS NextId FROM dbo.Nota_Credito;
      `);
      const nextNcId = Number(ncSeqRes.recordset[0].NextId);
      const numeroNota = `NC01-${String(nextNcId).padStart(6, "0")}`;

      const montoSubtotal = Math.round((montoEstimado / 1.18) * 100) / 100;
      const montoIgv = Math.round((montoEstimado - montoSubtotal) * 100) / 100;
      const motivoNc =
        input.motivoNotaCredito?.trim() ||
        (tipoAjuste === "TOTAL"
          ? "Anulación de la operación comercial"
          : "Ajuste por devolución parcial de productos");

      const insNcReq = new sql.Request(transaction);
      insNcReq.input("numNota", sql.VarChar(20), numeroNota);
      insNcReq.input("idVenta", sql.Int, Number(dev.ID_venta));
      insNcReq.input("idDev", sql.Int, input.idDevolucion);
      insNcReq.input("tipoAjuste", sql.VarChar(10), tipoAjuste);
      insNcReq.input("motivo", sql.VarChar(250), motivoNc);
      insNcReq.input("subtotal", sql.Decimal(10, 2), montoSubtotal);
      insNcReq.input("igv", sql.Decimal(10, 2), montoIgv);
      insNcReq.input("total", sql.Decimal(10, 2), montoEstimado);
      insNcReq.input("idEmp", sql.Int, empIdToUse);

      const insNcRes = await insNcReq.query(`
        INSERT INTO dbo.Nota_Credito (
          Numero_nota, ID_venta, ID_devolucion, Fecha_emision, Tipo_ajuste, Motivo,
          Monto_subtotal, Monto_igv, Monto_total, ID_empleado, Estado, Es_simulacion_academica
        )
        OUTPUT INSERTED.ID_nota_credito
        VALUES (
          @numNota, @idVenta, @idDev, CAST(GETDATE() AS DATE), @tipoAjuste, @motivo,
          @subtotal, @igv, @total, @idEmp, 'EMITIDA', 1
        );
      `);

      const idNotaCredito = Number(insNcRes.recordset[0].ID_nota_credito);
      notaCreditoData = {
        idNotaCredito,
        numeroNota,
        montoTotal: montoEstimado,
        montoSubtotal,
        montoIgv,
      };
    }

    // 6. Registrar Reembolso y Movimiento de Caja si aplica
    let reembolsoData: TransactionalReturnResult["reembolso"] | undefined = undefined;
    const idMetodoReembolso = input.idMetodoReembolso ?? 1; // Default 1 = Efectivo
    const afectaEfectivo = idMetodoReembolso === 1;

    // Obtener nombre del método de pago
    const metReq = new sql.Request(transaction);
    metReq.input("idMetodo", sql.Int, idMetodoReembolso);
    const metRes = await metReq.query(`
      SELECT Nombre_metodo FROM dbo.Metodo_Pago WHERE ID_metodo = @idMetodo;
    `);
    const nombreMetodo = metRes.recordset[0]?.Nombre_metodo || (afectaEfectivo ? "Efectivo" : "Digital");

    // Verificar si hay una sesión de caja abierta
    const sesReq = new sql.Request(transaction);
    if (input.idSesionCaja) {
      sesReq.input("idSesionParam", sql.Int, input.idSesionCaja);
    }
    const sesRes = await sesReq.query(`
      SELECT TOP 1 ID_sesion 
      FROM dbo.Sesion_Caja 
      WHERE Estado = 'ABIERTA' ${input.idSesionCaja ? "AND ID_sesion = @idSesionParam" : ""}
      ORDER BY ID_sesion DESC;
    `);
    const idSesionActiva = sesRes.recordset[0] ? Number(sesRes.recordset[0].ID_sesion) : null;

    // Insertar en dbo.Reembolso_Devolucion
    const insReembReq = new sql.Request(transaction);
    insReembReq.input("idDev", sql.Int, input.idDevolucion);
    insReembReq.input("idVenta", sql.Int, Number(dev.ID_venta));
    insReembReq.input("idMetodo", sql.Int, idMetodoReembolso);
    insReembReq.input("monto", sql.Decimal(10, 2), montoEstimado);
    insReembReq.input("idEmp", sql.Int, empIdToUse);
    insReembReq.input("idSesion", sql.Int, idSesionActiva);
    insReembReq.input(
      "referencia",
      sql.VarChar(100),
      input.referenciaReembolso || (afectaEfectivo ? "Reembolso en efectivo en caja" : `Reembolso por ${nombreMetodo}`)
    );

    const insReembRes = await insReembReq.query(`
      INSERT INTO dbo.Reembolso_Devolucion (
        ID_devolucion, ID_venta, ID_metodo, Monto, Fecha_hora, ID_empleado, ID_sesion, Referencia
      )
      OUTPUT INSERTED.ID_reembolso
      VALUES (
        @idDev, @idVenta, @idMetodo, @monto, GETDATE(), @idEmp, @idSesion, @referencia
      );
    `);

    const idReembolso = Number(insReembRes.recordset[0].ID_reembolso);
    reembolsoData = {
      idReembolso,
      metodo: nombreMetodo,
      monto: montoEstimado,
      afectaEfectivo,
    };

    // Si hay sesión de caja abierta, registrar el movimiento de caja correspondiente
    if (idSesionActiva) {
      const insMovReq = new sql.Request(transaction);
      insMovReq.input("idSesion", sql.Int, idSesionActiva);
      insMovReq.input("monto", sql.Decimal(10, 2), montoEstimado);
      insMovReq.input("idMetodo", sql.Int, idMetodoReembolso);
      insMovReq.input(
        "concepto",
        sql.VarChar(200),
        `Reembolso devolución #${input.idDevolucion} (${afectaEfectivo ? "Efectivo en caja" : nombreMetodo})`
      );
      insMovReq.input("idEmp", sql.Int, empIdToUse);
      insMovReq.input("idVenta", sql.Int, Number(dev.ID_venta));
      insMovReq.input("idDev", sql.Int, input.idDevolucion);
      insMovReq.input("afectaEfectivo", sql.Bit, afectaEfectivo ? 1 : 0);

      await insMovReq.query(`
        INSERT INTO dbo.Movimiento_Caja (
          ID_sesion, Fecha_hora, Tipo, Categoria, Monto, ID_metodo, Concepto, ID_empleado, ID_venta, ID_devolucion, Afecta_efectivo
        )
        VALUES (
          @idSesion, GETDATE(), 'EGRESO', 'REEMBOLSO_DEVOLUCION', @monto, @idMetodo, @concepto, @idEmp, @idVenta, @idDev, @afectaEfectivo
        );
      `);
    }

    // 7. Actualizar Estado de la Venta (COMPLETADA -> PARCIALMENTE DEVUELTA o TOTALMENTE DEVUELTA)
    const updateSaleStatusReq = new sql.Request(transaction);
    updateSaleStatusReq.input("idVenta", sql.Int, Number(dev.ID_venta));
    await updateSaleStatusReq.query(`
      DECLARE @totVendidas INT;
      DECLARE @totDevueltas INT;

      SELECT @totVendidas = ISNULL(SUM(Cantidad), 0)
      FROM dbo.Detalle_Venta WHERE ID_venta = @idVenta;

      SELECT @totDevueltas = ISNULL(SUM(dd.Cantidad_dev), 0)
      FROM dbo.Devolucion d
      JOIN dbo.Detalle_Dev dd ON d.ID_devolucion = dd.ID_devolucion
      WHERE d.ID_venta = @idVenta AND d.ID_estado_dev = 2; -- Aprobadas

      UPDATE dbo.Venta
      SET Estado = CASE 
        WHEN @totDevueltas >= @totVendidas THEN 'TOTALMENTE DEVUELTA'
        WHEN @totDevueltas > 0 THEN 'PARCIALMENTE DEVUELTA'
        ELSE 'COMPLETADA'
      END
      WHERE ID_venta = @idVenta;
    `);

    // 8. Commit atómico
    await transaction.commit();

    return {
      idDevolucion: Number(dev.ID_devolucion),
      fechaDev: String(dev.FechaDevStr),
      idEstadoDev: 2,
      nombreEstado: "Aprobada",
      idVenta: Number(dev.ID_venta),
      numeroComprobante: String(dev.Numero_comprobante),
      totalItemsAfectados: linesRes.recordset.length,
      totalUnidades,
      montoEstimado,
      reingresoKardexRealizado,
      unidadesReingresadas,
      notaCredito: notaCreditoData,
      reembolso: reembolsoData,
    };
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {}
    throw err;
  }
}

// ============================================================================
// TRANSACCIÓN: RECHAZAR DEVOLUCIÓN (PENDIENTE -> RECHAZADA) Y LIBERAR RESERVA
// ============================================================================

/**
 * Rechaza una devolución en estado Pendiente.
 * - Bloquea la cabecera y ejecuta UPDATE condicional verificando estado = 1.
 * - Al pasar a estado 3 (Rechazada), las unidades previamente reservadas se liberan
 *   automáticamente para futuros trámites.
 * - No modifica stock ni genera movimientos en Kardex.
 */
export async function rejectReturnTransaction(
  input: RejectReturnInput,
  sessionEmpId: number
): Promise<TransactionalReturnResult> {
  assertMutationsAllowed("rejectReturnTransaction");

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    // 1. Bloqueo de la devolución y verificación de estado
    const devReq = new sql.Request(transaction);
    devReq.input("idDevolucion", sql.Int, input.idDevolucion);

    const devRes = await devReq.query(`
      SELECT 
        d.ID_devolucion,
        d.ID_estado_dev,
        ed.Nombre_estado,
        d.ID_venta,
        v.Numero_comprobante,
        CONVERT(VARCHAR(10), d.Fecha_dev, 120) AS FechaDevStr
      FROM dbo.Devolucion d WITH (UPDLOCK, ROWLOCK)
      JOIN dbo.Estado_Dev ed ON d.ID_estado_dev = ed.ID_estado_dev
      JOIN dbo.Venta v ON d.ID_venta = v.ID_venta
      WHERE d.ID_devolucion = @idDevolucion;
    `);

    if (devRes.recordset.length === 0) {
      throw new ReturnNotFoundError(input.idDevolucion);
    }

    const dev = devRes.recordset[0];
    if (Number(dev.ID_estado_dev) !== 1) {
      throw new InvalidStateTransitionError(input.idDevolucion, String(dev.Nombre_estado), "rechazar");
    }

    // 2. UPDATE condicional a estado 3 (Rechazada)
    const updateReq = new sql.Request(transaction);
    updateReq.input("idDevolucion", sql.Int, input.idDevolucion);
    const updateRes = await updateReq.query(`
      UPDATE dbo.Devolucion
      SET ID_estado_dev = 3
      WHERE ID_devolucion = @idDevolucion AND ID_estado_dev = 1;
    `);

    if (updateRes.rowsAffected[0] === 0) {
      throw new InvalidStateTransitionError(input.idDevolucion, "Procesado concurrentemente", "rechazar");
    }

    // 3. Consultar métricas de las líneas liberadas
    const linesReq = new sql.Request(transaction);
    linesReq.input("idDevolucion", sql.Int, input.idDevolucion);
    const linesRes = await linesReq.query(`
      SELECT 
        dd.Cantidad_dev,
        CAST(dv.Precio_unitario AS FLOAT) AS Precio_unitario
      FROM dbo.Detalle_Dev dd
      JOIN dbo.Detalle_Venta dv ON dd.ID_detalle = dv.ID_detalle
      WHERE dd.ID_devolucion = @idDevolucion;
    `);

    let totalUnidades = 0;
    let montoEstimado = 0;
    for (const l of linesRes.recordset) {
      const c = Number(l.Cantidad_dev);
      totalUnidades += c;
      montoEstimado += c * Number(l.Precio_unitario);
    }

    // 4. Commit atómico (la reserva queda liberada en el cálculo del saldo)
    await transaction.commit();

    return {
      idDevolucion: Number(dev.ID_devolucion),
      fechaDev: String(dev.FechaDevStr),
      idEstadoDev: 3,
      nombreEstado: "Rechazada",
      idVenta: Number(dev.ID_venta),
      numeroComprobante: String(dev.Numero_comprobante),
      totalItemsAfectados: linesRes.recordset.length,
      totalUnidades,
      montoEstimado,
      reingresoKardexRealizado: false,
      unidadesReingresadas: 0,
    };
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {}
    throw err;
  }
}
