import sql from "mssql";
import { getPool } from "../db";
import { assertMutationsAllowed } from "../db-guard";
import {
  CuentaPagarProveedor,
  PagoProveedorItem,
  CreateAccountPayableDto,
  RegisterSupplierPaymentDto,
} from "@/types/expenses";
import { calculateTaxFromTotal } from "../tax";

async function validateSupplierPaymentSession(
  transaction: sql.Transaction,
  idSesion: number,
  idMetodo: number,
  monto: number
): Promise<void> {
  const sessionReq = new sql.Request(transaction);
  sessionReq.input("idSesion", sql.Int, idSesion);
  const sessionRes = await sessionReq.query(`
    SELECT Estado, Monto_inicial
    FROM dbo.Sesion_Caja WITH (UPDLOCK, HOLDLOCK)
    WHERE ID_sesion = @idSesion;
  `);
  if (
    sessionRes.recordset.length === 0 ||
    !["ABIERTA", "REABIERTA"].includes(String(sessionRes.recordset[0].Estado))
  ) {
    throw new Error("La sesión de Caja indicada no existe o está cerrada.");
  }

  if (idMetodo === 1) {
    const balanceReq = new sql.Request(transaction);
    balanceReq.input("idSesion", sql.Int, idSesion);
    const balanceRes = await balanceReq.query(`
      SELECT
        ISNULL(SUM(CASE WHEN Tipo = 'INGRESO' AND Afecta_efectivo = 1
          AND Concepto NOT LIKE '%Fondo fijo de apertura%' THEN Monto ELSE 0 END), 0)
        - ISNULL(SUM(CASE WHEN Tipo = 'EGRESO' AND Afecta_efectivo = 1 THEN Monto ELSE 0 END), 0) AS SaldoMovimientos
      FROM dbo.Movimiento_Caja
      WHERE ID_sesion = @idSesion;
    `);
    const efectivoDisponible =
      Number(sessionRes.recordset[0].Monto_inicial) +
      Number(balanceRes.recordset[0].SaldoMovimientos);
    if (monto > efectivoDisponible + 0.001) {
      throw new Error(
        `Efectivo insuficiente en Caja. Disponible: S/ ${efectivoDisponible.toFixed(2)}.`
      );
    }
  }
}

/**
 * Obtiene el listado de cuentas por pagar a proveedores con filtros opcionales
 */
export async function getAccountsPayable(filters?: {
  idProveedor?: number;
  estado?: string;
  search?: string;
}): Promise<CuentaPagarProveedor[]> {
  const pool = await getPool();
  const req = pool.request();

  let query = `
    SELECT 
      cp.ID_cuenta_pagar,
      cp.ID_proveedor,
      p.Nombre_prov AS NombreProveedor,
      p.Telefono_prov AS TelefonoProveedor,
      p.Correo_prov AS CorreoProveedor,
      cp.Numero_documento,
      CONVERT(VARCHAR(10), cp.Fecha_emision, 120) AS FechaEmision,
      CONVERT(VARCHAR(10), cp.Fecha_vencimiento, 120) AS FechaVencimiento,
      cp.Condicion_pago,
      cp.Total,
      cp.Monto_pagado,
      cp.Saldo_pendiente,
      CASE 
        WHEN cp.Estado != 'PAGADA' AND cp.Estado != 'ANULADA' AND cp.Fecha_vencimiento < CAST(GETDATE() AS DATE) 
        THEN 'VENCIDA'
        ELSE cp.Estado 
      END AS EstadoCalculado,
      cp.Base_imponible,
      cp.Impuesto,
      cp.Tiene_credito_fiscal,
      cp.Concepto,
      cp.Observaciones,
      CONVERT(VARCHAR(19), cp.Fecha_registro, 120) AS FechaRegistro
    FROM dbo.Cuenta_Pagar_Proveedor cp
    JOIN dbo.Proveedor p ON cp.ID_proveedor = p.ID_proveedor
    WHERE 1=1
  `;

  if (filters?.idProveedor) {
    query += ` AND cp.ID_proveedor = @idProv`;
    req.input("idProv", sql.Int, filters.idProveedor);
  }

  if (filters?.estado && filters.estado !== "TODOS") {
    if (filters.estado === "VENCIDA") {
      query += ` AND cp.Estado != 'PAGADA' AND cp.Estado != 'ANULADA' AND cp.Fecha_vencimiento < CAST(GETDATE() AS DATE)`;
    } else {
      query += ` AND cp.Estado = @estado`;
      req.input("estado", sql.VarChar(30), filters.estado);
    }
  }

  if (filters?.search?.trim()) {
    query += ` AND (cp.Numero_documento LIKE @search OR cp.Concepto LIKE @search OR p.Nombre_prov LIKE @search)`;
    req.input("search", sql.VarChar(100), `%${filters.search.trim()}%`);
  }

  query += ` ORDER BY cp.ID_cuenta_pagar DESC`;

  const res = await req.query(query);

  if (res.recordset.length === 0) {
    return [];
  }

  // Obtener pagos de las cuentas listadas
  const ids = res.recordset.map((r: any) => r.ID_cuenta_pagar);
  const pagosReq = pool.request();
  const pagosRes = await pagosReq.query(`
    SELECT 
      pp.ID_pago_proveedor,
      pp.ID_cuenta_pagar,
      CONVERT(VARCHAR(19), pp.Fecha_pago, 120) AS FechaPago,
      pp.Monto,
      pp.ID_metodo,
      mp.Nombre_metodo AS NombreMetodo,
      pp.ID_empleado_responsable,
      (e.Nombre_emp + ' ' + e.Apellido_emp) AS NombreEmpleadoResponsable,
      pp.ID_sesion,
      pp.Referencia,
      pp.Observaciones
    FROM dbo.Pago_Proveedor pp
    JOIN dbo.Metodo_Pago mp ON pp.ID_metodo = mp.ID_metodo
    JOIN dbo.Empleado e ON pp.ID_empleado_responsable = e.ID_empleado
    WHERE pp.ID_cuenta_pagar IN (${ids.join(",")})
    ORDER BY pp.ID_pago_proveedor ASC
  `);

  const pagosByCuenta = new Map<number, PagoProveedorItem[]>();
  for (const p of pagosRes.recordset) {
    const list = pagosByCuenta.get(p.ID_cuenta_pagar) || [];
    list.push({
      idPagoProveedor: Number(p.ID_pago_proveedor),
      idCuentaPagar: Number(p.ID_cuenta_pagar),
      fechaPago: String(p.FechaPago),
      monto: Number(p.Monto),
      idMetodo: Number(p.ID_metodo),
      nombreMetodo: String(p.NombreMetodo),
      idEmpleadoResponsable: Number(p.ID_empleado_responsable),
      nombreEmpleadoResponsable: String(p.NombreEmpleadoResponsable),
      idSesion: p.ID_sesion ? Number(p.ID_sesion) : null,
      referencia: p.Referencia || null,
      observaciones: p.Observaciones || null,
    });
    pagosByCuenta.set(p.ID_cuenta_pagar, list);
  }

  return res.recordset.map((r: any) => ({
    idCuentaPagar: Number(r.ID_cuenta_pagar),
    idProveedor: Number(r.ID_proveedor),
    nombreProveedor: String(r.NombreProveedor),
    telefonoProveedor: String(r.TelefonoProveedor || ""),
    correoProveedor: String(r.CorreoProveedor || ""),
    numeroDocumento: String(r.Numero_documento),
    fechaEmision: String(r.FechaEmision),
    fechaVencimiento: String(r.FechaVencimiento),
    condicionPago: r.Condicion_pago as any,
    total: Number(r.Total),
    montoPagado: Number(r.Monto_pagado),
    saldoPendiente: Number(r.Saldo_pendiente),
    estado: r.EstadoCalculado as any,
    baseImponible: Number(r.Base_imponible),
    impuesto: Number(r.Impuesto),
    tieneCreditoFiscal: Boolean(r.Tiene_credito_fiscal),
    concepto: String(r.Concepto),
    observaciones: r.Observaciones || null,
    fechaRegistro: String(r.FechaRegistro),
    pagos: pagosByCuenta.get(Number(r.ID_cuenta_pagar)) || [],
  }));
}

/**
 * Obtiene una cuenta por pagar específica por ID
 */
export async function getAccountPayableById(
  idCuentaPagar: number
): Promise<CuentaPagarProveedor | null> {
  const list = await getAccountsPayable();
  return list.find((c) => c.idCuentaPagar === idCuentaPagar) || null;
}

/**
 * Registra una nueva compra / cuenta por pagar a un proveedor
 */
export async function createAccountPayable(
  data: CreateAccountPayableDto
): Promise<CuentaPagarProveedor> {
  assertMutationsAllowed("createAccountPayable");

  if (!Number.isInteger(data.idProveedor) || data.idProveedor <= 0) {
    throw new Error("Debe seleccionar un proveedor válido.");
  }
  if (!data.numeroDocumento || !data.numeroDocumento.trim() || data.numeroDocumento.trim().length > 40) {
    throw new Error("El número de documento o factura es obligatorio.");
  }
  if (!Number.isFinite(data.total) || data.total <= 0 || data.total > 9999999999.99) {
    throw new Error("El importe total de la compra debe ser mayor a cero.");
  }
  if (typeof data.concepto !== "string" || !data.concepto.trim() || data.concepto.trim().length > 200) {
    throw new Error("El detalle de la compra es obligatorio y no puede superar 200 caracteres.");
  }
  const fechaEmis = data.fechaEmision || new Date().toISOString().slice(0, 10);
  const fechaVenc = data.fechaVencimiento || fechaEmis;
  if (!["CONTADO", "CREDITO"].includes(data.condicionPago)) {
    throw new Error("La condición de pago no es válida.");
  }

  const purchaseItems = data.items ?? [];
  if (!Array.isArray(purchaseItems) || purchaseItems.length > 100 || purchaseItems.some((item) =>
    !item ||
    typeof item.codbarras !== "string" ||
    !item.codbarras.trim() ||
    item.codbarras.trim().length > 13 ||
    !Number.isInteger(item.cantidad) ||
    item.cantidad <= 0 ||
    item.cantidad > 10000 ||
    !Number.isFinite(item.precioUnitario) ||
    item.precioUnitario <= 0 ||
    item.precioUnitario > 999999.99
  )) {
    throw new Error("Los productos, cantidades o costos de la compra no son válidos.");
  }
  if (new Set(purchaseItems.map((item) => item.codbarras.trim())).size !== purchaseItems.length) {
    throw new Error("Cada producto debe aparecer una sola vez en el detalle de compra.");
  }
  if (purchaseItems.length > 0) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaEmis) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fechaVenc)) {
      throw new Error("Las fechas de compra y vencimiento deben tener formato YYYY-MM-DD.");
    }
    if (!Number.isInteger(data.idEmpleadoResponsable) || Number(data.idEmpleadoResponsable) <= 0) {
      throw new Error("Debe seleccionar al empleado responsable de recibir la compra.");
    }
    const totalDetalle = Math.round(purchaseItems.reduce(
      (sum, item) => sum + Math.round(item.cantidad * item.precioUnitario * 100) / 100,
      0
    ) * 100) / 100;
    if (Math.abs(totalDetalle - data.total) > 0.01) {
      throw new Error("El total de la factura debe coincidir con la suma de los productos.");
    }
  }
  if (data.pagoInicial && (
    !Number.isFinite(data.pagoInicial.monto) ||
    data.pagoInicial.monto < 0 ||
    !Number.isInteger(data.pagoInicial.idMetodo) ||
    data.pagoInicial.idMetodo <= 0 ||
    !Number.isInteger(data.pagoInicial.idEmpleadoResponsable) ||
    data.pagoInicial.idEmpleadoResponsable <= 0 ||
    (data.pagoInicial.idSesion !== null &&
      data.pagoInicial.idSesion !== undefined &&
      (!Number.isInteger(data.pagoInicial.idSesion) || data.pagoInicial.idSesion <= 0))
  )) {
    throw new Error("Los datos del pago inicial no son válidos.");
  }

  const tax = calculateTaxFromTotal(data.total);
  const baseImponible = data.baseImponible ?? tax.baseImponible;
  const impuesto = data.impuesto ?? tax.totalImpuestos;
  const tieneCreditoFiscal = data.tieneCreditoFiscal ?? true;

  const pagoInicialMonto = data.pagoInicial?.monto ? Math.round(data.pagoInicial.monto * 100) / 100 : 0;
  if (pagoInicialMonto > data.total) {
    throw new Error("El pago inicial no puede ser superior al total del documento.");
  }
  if (data.condicionPago === "CONTADO" && Math.abs(pagoInicialMonto - data.total) > 0.01) {
    throw new Error("Una compra al contado debe pagarse por el total de la factura.");
  }
  if (pagoInicialMonto > 0 && !data.pagoInicial?.idSesion) {
    throw new Error("Debe haber una sesión de Caja abierta para registrar el pago de la compra.");
  }

  const montoPagado = pagoInicialMonto;
  const saldoPendiente = Math.round((data.total - montoPagado) * 100) / 100;
  let estado: string = "PENDIENTE";
  if (saldoPendiente <= 0.001) {
    estado = "PAGADA";
  } else if (montoPagado > 0) {
    estado = "PARCIALMENTE PAGADA";
  }

  const pool = await getPool();
  if (purchaseItems.length > 0) {
    const schemaCheck = await pool.request().query(`
      SELECT OBJECT_ID(N'dbo.Detalle_Compra_Proveedor', N'U') AS TablaDetalleCompra;
    `);
    if (!schemaCheck.recordset[0]?.TablaDetalleCompra) {
      throw new Error(
        "Falta la estructura de detalle de compras. Aplique scripts/migrations/phase10_3_detalle_compras_proveedor.sql en la base de aceptación."
      );
    }
  }

  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    const insertCpReq = new sql.Request(tx);
    insertCpReq.input("idProv", sql.Int, data.idProveedor);
    insertCpReq.input("numDoc", sql.VarChar(40), data.numeroDocumento.trim());
    insertCpReq.input("fechaEmis", sql.Date, fechaEmis);
    insertCpReq.input("fechaVenc", sql.Date, fechaVenc);
    insertCpReq.input("condicion", sql.VarChar(20), data.condicionPago);
    insertCpReq.input("total", sql.Decimal(12, 2), data.total);
    insertCpReq.input("pagado", sql.Decimal(12, 2), montoPagado);
    insertCpReq.input("saldo", sql.Decimal(12, 2), saldoPendiente);
    insertCpReq.input("estado", sql.VarChar(30), estado);
    insertCpReq.input("base", sql.Decimal(12, 2), baseImponible);
    insertCpReq.input("impuesto", sql.Decimal(12, 2), impuesto);
    insertCpReq.input("credito", sql.Bit, tieneCreditoFiscal ? 1 : 0);
    insertCpReq.input("concepto", sql.VarChar(200), data.concepto.trim());
    insertCpReq.input("obs", sql.VarChar(500), data.observaciones?.trim() || null);

    const cpRes = await insertCpReq.query(`
      INSERT INTO dbo.Cuenta_Pagar_Proveedor (
        ID_proveedor, Numero_documento, Fecha_emision, Fecha_vencimiento, Condicion_pago,
        Total, Monto_pagado, Saldo_pendiente, Estado, Base_imponible, Impuesto,
        Tiene_credito_fiscal, Concepto, Observaciones
      )
      OUTPUT INSERTED.ID_cuenta_pagar
      VALUES (
        @idProv, @numDoc, @fechaEmis, @fechaVenc, @condicion,
        @total, @pagado, @saldo, @estado, @base, @impuesto,
        @credito, @concepto, @obs
      );
    `);

    const idCuentaPagar = Number(cpRes.recordset[0].ID_cuenta_pagar);

    for (const item of purchaseItems) {
      const codbarras = item.codbarras.trim();
      const productReq = new sql.Request(tx);
      productReq.input("idProv", sql.Int, data.idProveedor);
      productReq.input("codbarras", sql.VarChar(13), codbarras);
      const productRes = await productReq.query(`
        SELECT
          p.Codbarras_prod,
          p.Nombre_prod,
          p.Stock,
          p.ID_estado_prod,
          ep.Estado AS EstadoNombre
        FROM dbo.Producto p WITH (UPDLOCK, ROWLOCK)
        JOIN dbo.Estado_Prod ep ON p.ID_estado_prod = ep.ID_estado_prod
        JOIN dbo.Suministra s ON s.Codbarras_prod = p.Codbarras_prod
          AND s.ID_proveedor = @idProv
        WHERE p.Codbarras_prod = @codbarras;
      `);

      if (productRes.recordset.length === 0) {
        throw new Error(`El producto ${codbarras} no está asociado al proveedor seleccionado.`);
      }

      const product = productRes.recordset[0];
      if (Number(product.ID_estado_prod) === 3 ||
        String(product.EstadoNombre).toLowerCase() === "descontinuado") {
        throw new Error(`No se puede comprar el producto descontinuado '${product.Nombre_prod}'.`);
      }

      const stockNuevo = Number(product.Stock) + item.cantidad;
      if (!Number.isSafeInteger(stockNuevo) || stockNuevo > 2147483647) {
        throw new Error(`La cantidad de '${product.Nombre_prod}' excede el stock máximo permitido.`);
      }

      const stockReq = new sql.Request(tx);
      stockReq.input("codbarras", sql.VarChar(13), codbarras);
      stockReq.input("stockNuevo", sql.Int, stockNuevo);
      stockReq.input("idEstadoAnterior", sql.Int, Number(product.ID_estado_prod));
      stockReq.input("stockAnterior", sql.Int, Number(product.Stock));
      await stockReq.query(`
        UPDATE dbo.Producto
        SET Stock = @stockNuevo,
            ID_estado_prod = CASE
              WHEN @stockAnterior = 0 OR ID_estado_prod = 2 THEN 1
              ELSE @idEstadoAnterior
            END
        WHERE Codbarras_prod = @codbarras;
      `);

      const movimientoReq = new sql.Request(tx);
      movimientoReq.input("fecha", sql.Date, fechaEmis);
      movimientoReq.input("cantidad", sql.Int, item.cantidad);
      movimientoReq.input("codbarras", sql.VarChar(13), codbarras);
      movimientoReq.input("idEmpleado", sql.Int, data.idEmpleadoResponsable);
      const movimientoRes = await movimientoReq.query(`
        INSERT INTO dbo.Mov_Inventario (
          Fecha, Cantidad, ID_tipo_mov, Codbarras_prod, ID_empleado
        )
        OUTPUT INSERTED.ID_movimiento
        VALUES (@fecha, @cantidad, 1, @codbarras, @idEmpleado);
      `);
      const idMovimiento = Number(movimientoRes.recordset[0].ID_movimiento);
      const subtotal = Math.round(item.cantidad * item.precioUnitario * 100) / 100;

      const detailReq = new sql.Request(tx);
      detailReq.input("idCuentaPagar", sql.Int, idCuentaPagar);
      detailReq.input("codbarras", sql.VarChar(13), codbarras);
      detailReq.input("idMovimiento", sql.Int, idMovimiento);
      detailReq.input("cantidad", sql.Int, item.cantidad);
      detailReq.input("precioUnitario", sql.Decimal(10, 2), item.precioUnitario);
      detailReq.input("subtotal", sql.Decimal(12, 2), subtotal);
      await detailReq.query(`
        INSERT INTO dbo.Detalle_Compra_Proveedor (
          ID_cuenta_pagar, Codbarras_prod, ID_movimiento,
          Cantidad, Precio_unitario, Subtotal
        ) VALUES (
          @idCuentaPagar, @codbarras, @idMovimiento,
          @cantidad, @precioUnitario, @subtotal
        );
      `);

      const supplierCostReq = new sql.Request(tx);
      supplierCostReq.input("idProv", sql.Int, data.idProveedor);
      supplierCostReq.input("codbarras", sql.VarChar(13), codbarras);
      supplierCostReq.input("precioCompra", sql.Decimal(10, 2), item.precioUnitario);
      await supplierCostReq.query(`
        UPDATE dbo.Suministra
        SET Precio_compra = @precioCompra
        WHERE ID_proveedor = @idProv AND Codbarras_prod = @codbarras;
      `);
    }

    // Si hubo pago inicial, registrar el pago y su egreso asociado en Caja.
    if (data.pagoInicial && pagoInicialMonto > 0) {
      const p = data.pagoInicial;
      await validateSupplierPaymentSession(
        tx,
        Number(p.idSesion),
        p.idMetodo,
        pagoInicialMonto
      );

      const insPagoReq = new sql.Request(tx);
      insPagoReq.input("idCp", sql.Int, idCuentaPagar);
      insPagoReq.input("monto", sql.Decimal(12, 2), pagoInicialMonto);
      insPagoReq.input("idMetodo", sql.Int, p.idMetodo);
      insPagoReq.input("idResp", sql.Int, p.idEmpleadoResponsable);
      insPagoReq.input("idSesion", sql.Int, p.idSesion || null);
      insPagoReq.input("ref", sql.VarChar(100), p.referencia?.trim() || null);
      insPagoReq.input("obs", sql.VarChar(255), p.observaciones?.trim() || null);

      const pagoRes = await insPagoReq.query(`
        INSERT INTO dbo.Pago_Proveedor (
          ID_cuenta_pagar, Fecha_pago, Monto, ID_metodo, ID_empleado_responsable,
          ID_sesion, Referencia, Observaciones
        )
        OUTPUT INSERTED.ID_pago_proveedor
        VALUES (
          @idCp, GETDATE(), @monto, @idMetodo, @idResp,
          @idSesion, @ref, @obs
        );
      `);

      const idPagoProv = Number(pagoRes.recordset[0].ID_pago_proveedor);

      const affectsCash = p.idMetodo === 1;
      const insMovReq = new sql.Request(tx);
      insMovReq.input("idSesion", sql.Int, p.idSesion);
      insMovReq.input("monto", sql.Decimal(12, 2), pagoInicialMonto);
      insMovReq.input("idMetodo", sql.Int, p.idMetodo);
      insMovReq.input("concepto", sql.VarChar(200), `Pago inicial proveedor Doc #${data.numeroDocumento.trim()}`);
      insMovReq.input("idResp", sql.Int, p.idEmpleadoResponsable);
      insMovReq.input("afectaEf", sql.Bit, affectsCash ? 1 : 0);
      insMovReq.input("idPagoProv", sql.Int, idPagoProv);

      await insMovReq.query(`
        INSERT INTO dbo.Movimiento_Caja (
          ID_sesion, Fecha_hora, Tipo, Categoria, Monto, ID_metodo,
          Concepto, ID_empleado, Afecta_efectivo, ID_pago_proveedor
        ) VALUES (
          @idSesion, GETDATE(), 'EGRESO', 'PAGO_PROVEEDOR', @monto, @idMetodo,
          @concepto, @idResp, @afectaEf, @idPagoProv
        );
      `);
    }

    await tx.commit();

    const created = await getAccountPayableById(idCuentaPagar);
    if (!created) throw new Error("No se pudo recuperar la cuenta por pagar creada.");
    return created;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

/**
 * Registra un abono o liquidación total a una cuenta por pagar existente
 */
export async function registerSupplierPayment(
  data: RegisterSupplierPaymentDto
): Promise<CuentaPagarProveedor> {
  assertMutationsAllowed("registerSupplierPayment");

  if (!data.idCuentaPagar || data.idCuentaPagar <= 0) {
    throw new Error("ID de cuenta por pagar no válido.");
  }
  const montoAbono = Math.round(Number(data.monto || 0) * 100) / 100;
  if (montoAbono <= 0) {
    throw new Error("El monto del abono debe ser mayor a cero.");
  }
  if (!data.idMetodo || data.idMetodo <= 0) {
    throw new Error("Debe seleccionar un método de pago válido.");
  }
  if (!data.idEmpleadoResponsable || data.idEmpleadoResponsable <= 0) {
    throw new Error("Debe identificarse el empleado responsable del pago.");
  }
  if (!Number.isInteger(data.idSesion) || Number(data.idSesion) <= 0) {
    throw new Error("Debe haber una sesión de Caja abierta para registrar el pago al proveedor.");
  }

  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    // 1. Bloquear y leer la cuenta por pagar con UPDLOCK
    const checkReq = new sql.Request(tx);
    checkReq.input("idCp", sql.Int, data.idCuentaPagar);
    const cpRes = await checkReq.query(`
      SELECT 
        Total, Monto_pagado, Saldo_pendiente, Estado, Numero_documento
      FROM dbo.Cuenta_Pagar_Proveedor WITH (UPDLOCK, ROWLOCK)
      WHERE ID_cuenta_pagar = @idCp;
    `);

    if (cpRes.recordset.length === 0) {
      throw new Error(`Cuenta por pagar #${data.idCuentaPagar} no encontrada.`);
    }

    const cp = cpRes.recordset[0];
    const total = Number(cp.Total);
    const pagadoActual = Number(cp.Monto_pagado);
    const saldoActual = Number(cp.Saldo_pendiente);

    if (cp.Estado === "PAGADA") {
      throw new Error(`La obligación #${data.idCuentaPagar} (${cp.Numero_documento}) ya se encuentra totalmente pagada.`);
    }
    if (cp.Estado === "ANULADA") {
      throw new Error(`La obligación #${data.idCuentaPagar} está anulada y no admite nuevos pagos.`);
    }

    // Validación estricta contra sobrepagos
    if (montoAbono > saldoActual + 0.001) {
      throw new Error(
        `El importe a pagar (S/ ${montoAbono.toFixed(2)}) supera el saldo pendiente (S/ ${saldoActual.toFixed(2)}). ` +
        `No se admiten sobrepagos sin procedimiento explícito de saldo a favor.`
      );
    }

    await validateSupplierPaymentSession(
      tx,
      Number(data.idSesion),
      data.idMetodo,
      montoAbono
    );

    // Prevención de doble pago accidental idéntico dentro de los últimos 2 segundos
    const dupReq = new sql.Request(tx);
    dupReq.input("idCp", sql.Int, data.idCuentaPagar);
    dupReq.input("monto", sql.Decimal(12, 2), montoAbono);
    const dupRes = await dupReq.query(`
      SELECT 1 FROM dbo.Pago_Proveedor
      WHERE ID_cuenta_pagar = @idCp AND Monto = @monto 
        AND DATEDIFF(SECOND, Fecha_pago, GETDATE()) < 2;
    `);
    if (dupRes.recordset.length > 0) {
      throw new Error("Transacción duplicada detectada. Se rechazó el reintento simultáneo.");
    }

    // 2. Insertar en dbo.Pago_Proveedor
    const insPagoReq = new sql.Request(tx);
    insPagoReq.input("idCp", sql.Int, data.idCuentaPagar);
    insPagoReq.input("monto", sql.Decimal(12, 2), montoAbono);
    insPagoReq.input("idMetodo", sql.Int, data.idMetodo);
    insPagoReq.input("idResp", sql.Int, data.idEmpleadoResponsable);
    insPagoReq.input("idSesion", sql.Int, data.idSesion || null);
    insPagoReq.input("ref", sql.VarChar(100), data.referencia?.trim() || null);
    insPagoReq.input("obs", sql.VarChar(255), data.observaciones?.trim() || null);

    const pagoRes = await insPagoReq.query(`
      INSERT INTO dbo.Pago_Proveedor (
        ID_cuenta_pagar, Fecha_pago, Monto, ID_metodo, ID_empleado_responsable,
        ID_sesion, Referencia, Observaciones
      )
      OUTPUT INSERTED.ID_pago_proveedor
      VALUES (
        @idCp, GETDATE(), @monto, @idMetodo, @idResp,
        @idSesion, @ref, @obs
      );
    `);
    const idPagoProv = Number(pagoRes.recordset[0].ID_pago_proveedor);

    // 3. Recalcular saldo y estado
    const nuevoMontoPagado = Math.round((pagadoActual + montoAbono) * 100) / 100;
    const nuevoSaldo = Math.max(0, Math.round((total - nuevoMontoPagado) * 100) / 100);
    const nuevoEstado = nuevoSaldo <= 0.001 ? "PAGADA" : "PARCIALMENTE PAGADA";

    const updateCpReq = new sql.Request(tx);
    updateCpReq.input("idCp", sql.Int, data.idCuentaPagar);
    updateCpReq.input("pagado", sql.Decimal(12, 2), nuevoMontoPagado);
    updateCpReq.input("saldo", sql.Decimal(12, 2), nuevoSaldo);
    updateCpReq.input("estado", sql.VarChar(30), nuevoEstado);
    await updateCpReq.query(`
      UPDATE dbo.Cuenta_Pagar_Proveedor
      SET Monto_pagado = @pagado,
          Saldo_pendiente = @saldo,
          Estado = @estado
      WHERE ID_cuenta_pagar = @idCp;
    `);

    // 4. Registrar siempre el egreso en la sesión que se validó previamente.
    const affectsCash = data.idMetodo === 1;
    const insMovReq = new sql.Request(tx);
    insMovReq.input("idSesion", sql.Int, data.idSesion);
    insMovReq.input("monto", sql.Decimal(12, 2), montoAbono);
    insMovReq.input("idMetodo", sql.Int, data.idMetodo);
    insMovReq.input("concepto", sql.VarChar(200), `Abono a proveedor Doc #${cp.Numero_documento}`);
    insMovReq.input("idResp", sql.Int, data.idEmpleadoResponsable);
    insMovReq.input("afectaEf", sql.Bit, affectsCash ? 1 : 0);
    insMovReq.input("idPagoProv", sql.Int, idPagoProv);

    await insMovReq.query(`
      INSERT INTO dbo.Movimiento_Caja (
        ID_sesion, Fecha_hora, Tipo, Categoria, Monto, ID_metodo,
        Concepto, ID_empleado, Afecta_efectivo, ID_pago_proveedor
      ) VALUES (
        @idSesion, GETDATE(), 'EGRESO', 'PAGO_PROVEEDOR', @monto, @idMetodo,
        @concepto, @idResp, @afectaEf, @idPagoProv
      );
    `);

    await tx.commit();

    const updated = await getAccountPayableById(data.idCuentaPagar);
    if (!updated) throw new Error("No se pudo obtener la cuenta por pagar actualizada.");
    return updated;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}
