import sql from "mssql";
import { getPool } from "../db";
import { assertMutationsAllowed } from "../db-guard";
import { SaleInput } from "../validations/sale.schema";

export class SaleTransactionError extends Error {
  constructor(message: string, public readonly code: string = "SALE_TRANSACTION_ERROR") {
    super(message);
    this.name = "SaleTransactionError";
  }
}

export class ClientNotFoundError extends SaleTransactionError {
  constructor(dni: string) {
    super(`El cliente con DNI '${dni}' no existe en la base de datos.`, "CLIENT_NOT_FOUND");
    this.name = "ClientNotFoundError";
  }
}

export class EmployeeNotFoundError extends SaleTransactionError {
  constructor(id: number) {
    super(`El empleado con ID #${id} no existe en la base de datos.`, "EMPLOYEE_NOT_FOUND");
    this.name = "EmployeeNotFoundError";
  }
}

export class PaymentMethodNotFoundError extends SaleTransactionError {
  constructor(id: number) {
    super(`El método de pago con ID #${id} no existe en dbo.Metodo_Pago.`, "PAYMENT_METHOD_NOT_FOUND");
    this.name = "PaymentMethodNotFoundError";
  }
}

export class ProductNotFoundError extends SaleTransactionError {
  constructor(codbarras: string) {
    super(`El producto con código de barras '${codbarras}' no existe.`, "PRODUCT_NOT_FOUND");
    this.name = "ProductNotFoundError";
  }
}

export class ProductDiscontinuedError extends SaleTransactionError {
  constructor(nombre: string, codbarras: string) {
    super(
      `El producto '${nombre}' (${codbarras}) se encuentra en estado Descontinuado y no puede ser vendido.`,
      "PRODUCT_DISCONTINUED"
    );
    this.name = "ProductDiscontinuedError";
  }
}

export class InsufficientStockError extends SaleTransactionError {
  constructor(nombre: string, stockActual: number, cantidadSolicitada: number) {
    super(
      `Stock insuficiente para '${nombre}'. Disponible en almacén: ${stockActual} unidades, solicitado: ${cantidadSolicitada} unidades.`,
      "INSUFFICIENT_STOCK"
    );
    this.name = "InsufficientStockError";
  }
}

export class PaymentMismatchError extends SaleTransactionError {
  constructor(totalVenta: number, totalPagos: number) {
    super(
      `Discrepancia en la liquidación: El total de la orden es S/. ${totalVenta.toFixed(2)}, pero la suma de métodos de pago es S/. ${totalPagos.toFixed(2)}. La diferencia debe ser exactamente S/. 0.00.`,
      "PAYMENT_MISMATCH"
    );
    this.name = "PaymentMismatchError";
  }
}

export class VoucherLockTimeoutError extends SaleTransactionError {
  constructor(tipoComprobante: string) {
    super(
      `No se pudo adquirir el bloqueo exclusivo de numeración para '${tipoComprobante}' debido a alta concurrencia. Intente nuevamente.`,
      "VOUCHER_LOCK_TIMEOUT"
    );
    this.name = "VoucherLockTimeoutError";
  }
}

export interface TransactionalSaleResult {
  idVenta: number;
  numeroComprobante: string;
  fecha: string;
  totalVenta: number;
  idTipoComp: number;
  tipoComprobante: string;
  dniCliente: string;
  clienteNombre: string;
  idEmpleado: number;
  empleadoNombre: string;
  items: Array<{
    codbarras: string;
    nombre: string;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
    stockRestante: number;
  }>;
  pagos: Array<{
    idMetodo: number;
    nombreMetodo: string;
    monto: number;
  }>;
  efectivoRecibido?: number;
  vuelto?: number;
}

/**
 * Registra una venta completa con control transaccional ACID estricto sobre SQL Server.
 * Todo el circuito (validaciones, bloqueos de producto, cálculo correlativo, inserciones,
 * descuento de stock, registro en Kardex y actualización de estado) se ejecuta dentro de
 * una única transacción SQL atómica.
 */
export async function executeSaleTransaction(
  input: SaleInput
): Promise<TransactionalSaleResult> {
  // 1. Verificación obligatoria de entorno: impide mutaciones sobre MishutecT2 (académica)
  assertMutationsAllowed("executeSaleTransaction");

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    // 2. Comprobar existencia del cliente en dbo.Cliente
    const clientReq = new sql.Request(transaction);
    clientReq.input("dni", sql.VarChar(8), input.dniCliente);
    const clientRes = await clientReq.query(`
      SELECT Dni_cliente, CONCAT(Nombre_cl, ' ', Apellido_cl) AS nombreCompleto
      FROM dbo.Cliente
      WHERE Dni_cliente = @dni;
    `);

    if (clientRes.recordset.length === 0) {
      throw new ClientNotFoundError(input.dniCliente);
    }
    const clienteNombre = clientRes.recordset[0].nombreCompleto;

    // 3. Comprobar existencia del empleado en dbo.Empleado
    const empReq = new sql.Request(transaction);
    empReq.input("idEmp", sql.Int, input.idEmpleado);
    const empRes = await empReq.query(`
      SELECT ID_empleado, CONCAT(Nombre_emp, ' ', Apellido_emp) AS nombreCompleto
      FROM dbo.Empleado
      WHERE ID_empleado = @idEmp;
    `);

    if (empRes.recordset.length === 0) {
      throw new EmployeeNotFoundError(input.idEmpleado);
    }
    const empleadoNombre = empRes.recordset[0].nombreCompleto;

    // 4. Consolidar códigos de barras repetidos en el carrito (cumple UQ_Detalle_Venta_Prod)
    const consolidatedItemsMap = new Map<string, number>();
    for (const item of input.items) {
      const current = consolidatedItemsMap.get(item.codbarras) || 0;
      consolidatedItemsMap.set(item.codbarras, current + item.cantidad);
    }

    // 5. Consolidar métodos de pago repetidos (cumple PK_Venta_Metodo_Pago compuesta)
    const consolidatedPaymentsMap = new Map<number, number>();
    for (const payment of input.payments) {
      const current = consolidatedPaymentsMap.get(payment.idMetodo) || 0;
      // Suma exacta con redondeo a 2 decimales para evitar problemas de coma flotante
      const rounded = Math.round((current + payment.monto) * 100) / 100;
      consolidatedPaymentsMap.set(payment.idMetodo, rounded);
    }

    // 6. Validar que los métodos de pago existan en dbo.Metodo_Pago
    const methodIds = Array.from(consolidatedPaymentsMap.keys());
    const methodNamesMap = new Map<number, string>();
    for (const mId of methodIds) {
      const mReq = new sql.Request(transaction);
      mReq.input("mId", sql.Int, mId);
      const mRes = await mReq.query(`
        SELECT ID_metodo, Nombre_metodo
        FROM dbo.Metodo_Pago
        WHERE ID_metodo = @mId;
      `);
      if (mRes.recordset.length === 0) {
        throw new PaymentMethodNotFoundError(mId);
      }
      methodNamesMap.set(mId, mRes.recordset[0].Nombre_metodo);
    }

    // 7. Bloqueo determinístico de productos: Ordenar códigos de barras ascendentemente
    // para prevenir interbloqueos (deadlocks) ante ventas concurrentes de los mismos productos
    const sortedBarcodes = Array.from(consolidatedItemsMap.keys()).sort();

    interface ProductLockedData {
      codbarras: string;
      nombre: string;
      precio: number;
      stockActual: number;
      idEstadoProd: number;
      estado: string;
      cantidadSolicitada: number;
      subtotalCents: number;
      subtotal: number;
    }

    const lockedProducts: ProductLockedData[] = [];
    let totalVentaCents = 0;

    for (const codbarras of sortedBarcodes) {
      const cantidadSolicitada = consolidatedItemsMap.get(codbarras)!;

      const prodReq = new sql.Request(transaction);
      prodReq.input("codbarras", sql.VarChar(13), codbarras);
      const prodRes = await prodReq.query(`
        SELECT 
          p.Codbarras_prod,
          p.Nombre_prod,
          p.Precio,
          p.Stock,
          p.ID_estado_prod,
          ep.Estado
        FROM dbo.Producto p WITH (UPDLOCK, ROWLOCK)
        JOIN dbo.Estado_Prod ep ON p.ID_estado_prod = ep.ID_estado_prod
        WHERE p.Codbarras_prod = @codbarras;
      `);

      if (prodRes.recordset.length === 0) {
        throw new ProductNotFoundError(codbarras);
      }

      const row = prodRes.recordset[0];
      const stockActual = Number(row.Stock);
      const precioReal = Number(row.Precio);
      const estado = row.Estado;

      // 8. Verificar que el producto no esté descontinuado
      if (estado === "Descontinuado" || row.ID_estado_prod === 3) {
        throw new ProductDiscontinuedError(row.Nombre_prod, codbarras);
      }

      // 9. Comprobar existencias disponibles
      if (stockActual < cantidadSolicitada) {
        throw new InsufficientStockError(row.Nombre_prod, stockActual, cantidadSolicitada);
      }

      // 10 y 11. Calcular subtotales con céntimos enteros exactos
      const unitPriceCents = Math.round(precioReal * 100);
      const subtotalCents = unitPriceCents * cantidadSolicitada;
      totalVentaCents += subtotalCents;

      lockedProducts.push({
        codbarras,
        nombre: row.Nombre_prod,
        precio: precioReal,
        stockActual,
        idEstadoProd: Number(row.ID_estado_prod),
        estado,
        cantidadSolicitada,
        subtotalCents,
        subtotal: subtotalCents / 100,
      });
    }

    const totalVenta = totalVentaCents / 100;

    // 12. Validación y conciliación de medios de pago (soporte de efectivo con vuelto y pagos mixtos)
    let totalNoEfectivoCents = 0;
    let cashMontoCents = 0;
    const hasCash = consolidatedPaymentsMap.has(1);

    for (const [idMetodo, monto] of consolidatedPaymentsMap.entries()) {
      const mCents = Math.round(monto * 100);
      if (idMetodo === 1) {
        cashMontoCents = mCents;
      } else {
        totalNoEfectivoCents += mCents;
      }
    }

    // Regla de Negocio 1: Los métodos electrónicos/digitales no pueden exceder el total de la venta
    if (totalNoEfectivoCents > totalVentaCents) {
      throw new PaymentMismatchError(
        totalVenta,
        totalNoEfectivoCents / 100
      );
    }

    const restantePorCubrirCents = totalVentaCents - totalNoEfectivoCents;

    let efectivoRecibido: number | null = null;
    let vuelto = 0;

    if (hasCash || (input.efectivoRecibido && input.efectivoRecibido > 0)) {
      // Determinamos el efectivo efectivamente entregado por el cliente
      const efectivoEntregado =
        input.efectivoRecibido !== undefined
          ? Number(input.efectivoRecibido)
          : cashMontoCents / 100;
      const efectivoEntregadoCents = Math.round(efectivoEntregado * 100);

      // Si el efectivo entregado no cubre el saldo restante de la venta
      if (efectivoEntregadoCents < restantePorCubrirCents) {
        throw new PaymentMismatchError(
          totalVenta,
          (totalNoEfectivoCents + efectivoEntregadoCents) / 100
        );
      }

      // El vuelto procede exclusivamente del exceso de efectivo entregado
      const vueltoCents = efectivoEntregadoCents - restantePorCubrirCents;
      vuelto = vueltoCents / 100;
      efectivoRecibido = efectivoEntregado;

      // El importe neto cobrado en efectivo para registrar en la venta y caja es exactamente el saldo de la orden
      consolidatedPaymentsMap.set(1, restantePorCubrirCents / 100);
    } else {
      // Venta 100% digital / electrónica: debe cuadrar al centavo
      if (totalNoEfectivoCents !== totalVentaCents) {
        throw new PaymentMismatchError(totalVenta, totalNoEfectivoCents / 100);
      }
    }

    // Construcción final de pagos asignados a la venta (coincidencia matemática exacta 1:1 con totalVenta)
    const finalPayments: Array<{ idMetodo: number; nombreMetodo: string; monto: number }> = [];
    for (const [idMetodo, monto] of consolidatedPaymentsMap.entries()) {
      if (monto > 0 || consolidatedPaymentsMap.size === 1) {
        finalPayments.push({
          idMetodo,
          nombreMetodo: methodNamesMap.get(idMetodo) || `Método #${idMetodo}`,
          monto: Math.round(monto * 100) / 100,
        });
      }
    }

    // 13. Obtención atómica y segura del correlativo mediante sys.sp_getapplock
    const prefix = input.idTipoComp === 1 ? "B001-" : "F001-";
    const tipoCompNombre = input.idTipoComp === 1 ? "Boleta" : "Factura";
    const appLockResource = `Mishutec_Voucher_Lock_${prefix.replace("-", "")}`;

    const lockReq = new sql.Request(transaction);
    lockReq.input("resName", sql.VarChar(255), appLockResource);
    const lockRes = await lockReq.query(`
      DECLARE @lockResult INT;
      EXEC @lockResult = sp_getapplock 
        @Resource = @resName, 
        @LockMode = 'Exclusive', 
        @LockOwner = 'Transaction', 
        @LockTimeout = 5000;
      SELECT @lockResult AS LockResult;
    `);

    const lockResult = Number(lockRes.recordset[0]?.LockResult);
    if (lockResult < 0) {
      throw new VoucherLockTimeoutError(tipoCompNombre);
    }

    // Obtener el siguiente correlativo secuencial con bloqueo exclusivo
    const seqReq = new sql.Request(transaction);
    seqReq.input("idTipoComp", sql.Int, input.idTipoComp);
    seqReq.input("prefixPattern", sql.VarChar(10), `${prefix}%`);
    const seqRes = await seqReq.query(`
      SELECT ISNULL(MAX(CAST(SUBSTRING(Numero_comprobante, 6, 6) AS INT)), 0) + 1 AS NextNum
      FROM dbo.Venta WITH (UPDLOCK, HOLDLOCK)
      WHERE ID_tipo_comp = @idTipoComp AND Numero_comprobante LIKE @prefixPattern;
    `);

    const nextCorrelativo = Number(seqRes.recordset[0]?.NextNum) || 1;
    if (nextCorrelativo > 999999) {
      throw new SaleTransactionError(
        `Se ha alcanzado el límite máximo correlativo para la serie '${prefix}'.`,
        "VOUCHER_SERIES_OVERFLOW"
      );
    }

    const numeroComprobante = `${prefix}${String(nextCorrelativo).padStart(6, "0")}`;

    // 14. INSERT en dbo.Venta
    const insertVentaReq = new sql.Request(transaction);
    insertVentaReq.input("totalVenta", sql.Decimal(10, 2), totalVenta);
    insertVentaReq.input("numeroComp", sql.VarChar(20), numeroComprobante);
    insertVentaReq.input("idTipoComp", sql.Int, input.idTipoComp);
    insertVentaReq.input("dniCliente", sql.VarChar(8), input.dniCliente);
    insertVentaReq.input("idEmpleado", sql.Int, input.idEmpleado);
    insertVentaReq.input("efectivoRecibido", sql.Decimal(10, 2), efectivoRecibido);
    insertVentaReq.input("vuelto", sql.Decimal(10, 2), vuelto > 0 ? vuelto : 0);

    const ventaRes = await insertVentaReq.query(`
      INSERT INTO dbo.Venta (
        Fecha_venta,
        Total_venta,
        Numero_comprobante,
        ID_tipo_comp,
        Dni_cliente,
        ID_empleado,
        Estado,
        Efectivo_recibido,
        Vuelto
      )
      OUTPUT INSERTED.ID_venta, CONVERT(VARCHAR(10), INSERTED.Fecha_venta, 120) AS FechaStr
      VALUES (
        CONVERT(DATE, GETDATE()),
        @totalVenta,
        @numeroComp,
        @idTipoComp,
        @dniCliente,
        @idEmpleado,
        'COMPLETADA',
        @efectivoRecibido,
        @vuelto
      );
    `);

    const idVenta = Number(ventaRes.recordset[0].ID_venta);
    const fechaVentaStr = ventaRes.recordset[0].FechaStr;

    // 15. INSERT en dbo.Detalle_Venta
    for (const item of lockedProducts) {
      const detailReq = new sql.Request(transaction);
      detailReq.input("cantidad", sql.Int, item.cantidadSolicitada);
      detailReq.input("precioUnit", sql.Decimal(10, 2), item.precio);
      detailReq.input("subtotal", sql.Decimal(10, 2), item.subtotal);
      detailReq.input("idVenta", sql.Int, idVenta);
      detailReq.input("codbarras", sql.VarChar(13), item.codbarras);

      await detailReq.query(`
        INSERT INTO dbo.Detalle_Venta (
          Cantidad,
          Precio_unitario,
          Subtotal,
          ID_venta,
          Codbarras_prod
        )
        VALUES (
          @cantidad,
          @precioUnit,
          @subtotal,
          @idVenta,
          @codbarras
        );
      `);
    }

    // 16. INSERT en dbo.Venta_Metodo_Pago
    for (const payment of finalPayments) {
      const vmpReq = new sql.Request(transaction);
      vmpReq.input("idVenta", sql.Int, idVenta);
      vmpReq.input("idMetodo", sql.Int, payment.idMetodo);
      vmpReq.input("monto", sql.Decimal(10, 2), payment.monto);

      await vmpReq.query(`
        INSERT INTO dbo.Venta_Metodo_Pago (
          ID_venta,
          ID_metodo,
          Monto_pagado
        )
        VALUES (
          @idVenta,
          @idMetodo,
          @monto
        );
      `);
    }

    // 17. Descontar existencias en dbo.Producto
    // 18. Registrar Salida en dbo.Mov_Inventario (Tipo 2 = 'Salida')
    // 19. Actualizar estado a 'Agotado' (ID 2) si Stock llega exactamente a 0
    const finalItemsResult: TransactionalSaleResult["items"] = [];

    for (const item of lockedProducts) {
      const nuevoStock = item.stockActual - item.cantidadSolicitada;

      // Descuento de stock
      const stockReq = new sql.Request(transaction);
      stockReq.input("codbarras", sql.VarChar(13), item.codbarras);
      stockReq.input("cantidad", sql.Int, item.cantidadSolicitada);

      await stockReq.query(`
        UPDATE dbo.Producto
        SET Stock = Stock - @cantidad
        WHERE Codbarras_prod = @codbarras;
      `);

      // Registro en Mov_Inventario (Tipo 2 = Salida)
      const movReq = new sql.Request(transaction);
      movReq.input("cantidad", sql.Int, item.cantidadSolicitada);
      movReq.input("codbarras", sql.VarChar(13), item.codbarras);
      movReq.input("idEmpleado", sql.Int, input.idEmpleado);

      await movReq.query(`
        INSERT INTO dbo.Mov_Inventario (
          Fecha,
          Cantidad,
          ID_tipo_mov,
          Codbarras_prod,
          ID_empleado
        )
        VALUES (
          CONVERT(DATE, GETDATE()),
          @cantidad,
          2, -- Salida
          @codbarras,
          @idEmpleado
        );
      `);

      // Actualizar estado si quedó agotado
      if (nuevoStock === 0) {
        const estadoReq = new sql.Request(transaction);
        estadoReq.input("codbarras", sql.VarChar(13), item.codbarras);
        await estadoReq.query(`
          UPDATE dbo.Producto
          SET ID_estado_prod = 2 -- Agotado
          WHERE Codbarras_prod = @codbarras AND Stock = 0;
        `);
      }

      finalItemsResult.push({
        codbarras: item.codbarras,
        nombre: item.nombre,
        cantidad: item.cantidadSolicitada,
        precioUnitario: item.precio,
        subtotal: item.subtotal,
        stockRestante: nuevoStock,
      });
    }

    // 19.5 Integración automática con Caja (si existe sesión activa)
    const activeSesReq = new sql.Request(transaction);
    const activeSesRes = await activeSesReq.query(`
      SELECT TOP 1 ID_sesion
      FROM dbo.Sesion_Caja WITH (UPDLOCK)
      WHERE Estado IN ('ABIERTA', 'REABIERTA')
      ORDER BY ID_sesion DESC
    `);

    if (activeSesRes.recordset.length > 0) {
      const idSesionActiva = activeSesRes.recordset[0].ID_sesion;
      for (const p of finalPayments) {
        const movReq = new sql.Request(transaction);
        movReq.input("idSesion", sql.Int, idSesionActiva);
        movReq.input("monto", sql.Decimal(12, 2), p.monto);
        movReq.input("idMetodo", sql.Int, p.idMetodo);
        movReq.input(
          "concepto",
          sql.VarChar(255),
          `Cobro venta ${numeroComprobante} - ${p.nombreMetodo}`
        );
        movReq.input("idEmp", sql.Int, input.idEmpleado);
        movReq.input("idVenta", sql.Int, idVenta);
        movReq.input("afectaEf", sql.Bit, p.idMetodo === 1 ? 1 : 0);

        await movReq.query(`
          INSERT INTO dbo.Movimiento_Caja (
            ID_sesion, Fecha_hora, Tipo, Categoria, Monto, ID_metodo, Concepto, ID_empleado, ID_venta, Afecta_efectivo
          )
          VALUES (
            @idSesion, GETDATE(), 'INGRESO', 'VENTA', @monto, @idMetodo, @concepto, @idEmp, @idVenta, @afectaEf
          );
        `);
      }
    }

    // 20. Confirmación Atómica (COMMIT TRANSACTION)
    await transaction.commit();

    return {
      idVenta,
      numeroComprobante,
      fecha: fechaVentaStr,
      totalVenta,
      idTipoComp: input.idTipoComp,
      tipoComprobante: tipoCompNombre,
      dniCliente: input.dniCliente,
      clienteNombre,
      idEmpleado: input.idEmpleado,
      empleadoNombre,
      items: finalItemsResult,
      pagos: finalPayments,
      efectivoRecibido: efectivoRecibido ?? undefined,
      vuelto: vuelto > 0 ? vuelto : 0,
    };
  } catch (err: any) {
    // Si la transacción sigue activa, revertir completamente
    try {
      await transaction.rollback();
    } catch (rbErr) {
      console.error("Error al ejecutar rollback:", rbErr);
    }

    // Si es error de clave duplicada en SQL Server (código 2627 o 2601)
    if (err.number === 2627 || err.number === 2601) {
      if (err.message && err.message.includes("UQ_Venta_Numero_comprobante")) {
        throw new SaleTransactionError(
          "Conflicto de concurrencia: el número de comprobante ya fue asignado. Por favor, reintente la operación.",
          "DUPLICATE_VOUCHER_COLLISION"
        );
      }
      if (err.message && err.message.includes("UQ_Detalle_Venta_Prod")) {
        throw new SaleTransactionError(
          "Conflicto de integridad: se detectó una duplicidad de producto en las líneas de detalle.",
          "DUPLICATE_DETAIL_ITEM"
        );
      }
      if (err.message && err.message.includes("PK_Venta_Metodo_Pago")) {
        throw new SaleTransactionError(
          "Conflicto de integridad: duplicidad en la clave compuesta de métodos de pago.",
          "DUPLICATE_PAYMENT_METHOD"
        );
      }
    }

    throw err;
  }
}

export { executeSaleTransaction as createSaleTransaction };
export type TransactionalSaleInput = SaleInput;
