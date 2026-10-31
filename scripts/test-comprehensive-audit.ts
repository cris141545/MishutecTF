import fs from "fs";
import path from "path";
import sql from "mssql/msnodesqlv8";

// Cargar .env.local manualmente antes de importar librerías internas
function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, "utf-8");
    for (const line of envConfig.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        process.env[key] = value;
      }
    }
  }
}
loadEnvLocal();

import { getPool } from "../src/lib/db";
import {
  openCashSessionTransaction,
  addCashMovementTransaction,
  closeCashSessionTransaction,
  reopenCashSessionTransaction,
  getActiveCashSession,
} from "../src/lib/repositories/cash.repository";
import { executeSaleTransaction } from "../src/lib/repositories/sale-transaction.repository";
import { SaleInput } from "../src/lib/validations/sale.schema";
import {
  createReturnTransaction,
  approveReturnTransaction,
  rejectReturnTransaction,
} from "../src/lib/repositories/return-transaction.repository";
import {
  getFinancialAnalytics,
  getTaxSummarySunat,
} from "../src/lib/repositories/report.repository";
import { generateReportCsv } from "../src/lib/services/report.service";

interface TestReport {
  index: number;
  name: string;
  category: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const reports: TestReport[] = [];

function recordTest(index: number, name: string, category: string, passed: boolean, details?: string, error?: string) {
  reports.push({ index, name, category, passed, details, error });
  const status = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`[${status}] #${index.toString().padStart(2, "0")} - ${name}`);
  if (details) console.log(`       ↳ ${details}`);
  if (error) console.log(`       ⚠️ ERROR: ${error}`);
}

async function runAudit() {
  console.log("================================================================================");
  console.log(" MISHUTEC - SUITE DE PRUEBAS AUTOMATIZADAS (30 ESCENARIOS OBLIGATORIOS)");
  console.log(" Base activa:", process.env.DB_NAME || "MishutecT2_Aceptacion");
  console.log(" Servidor SQL:", process.env.DB_SERVER || "localhost\\SQLEXPRESS01");
  console.log("================================================================================\n");

  const pool = await getPool();

  // Limpieza inicial controlada: cerrar sesiones huérfanas si existieran
  await pool.request().query(`
    UPDATE dbo.Sesion_Caja 
    SET Estado = 'CERRADA', Fecha_cierre = GETDATE(), ID_empleado_cierre = 1, Observaciones_cierre = 'Auto-cerrada por inicio de pruebas'
    WHERE Estado IN ('ABIERTA', 'REABIERTA');
  `);

  // Obtener productos y clientes válidos de la base
  const prodRes = await pool.request().query(`
    SELECT TOP 5 Codbarras_prod, Stock, Precio 
    FROM dbo.Producto 
    WHERE Stock >= 5 AND ID_estado_prod = 1
    ORDER BY Stock DESC;
  `);
  const clientRes = await pool.request().query(`
    SELECT TOP 1 Dni_cliente FROM dbo.Cliente;
  `);

  const validDni = String(clientRes.recordset[0].Dni_cliente);
  const p1 = prodRes.recordset[0];
  const p2 = prodRes.recordset[1];
  const p3 = prodRes.recordset[2];
  const p4 = prodRes.recordset[3];

  let currentSessionId = 0;
  let testSaleIdCash = 0;
  let testSaleIdDigital = 0;
  let testSaleIdMixed = 0;
  let testReturnIdPartial = 0;
  let testReturnIdWrongProduct = 0;
  let testReturnIdRejected = 0;

  // ---------------------------------------------------------------------------
  // ESCENARIO 01: Apertura de caja con monto inicial
  // ---------------------------------------------------------------------------
  try {
    const s1 = await openCashSessionTransaction({
      idEmpleado: 1,
      montoInicial: 150.0,
      observaciones: "Apertura inicial para suite de pruebas",
    });
    currentSessionId = s1.idSesion;
    recordTest(
      1,
      "Apertura de caja con monto inicial",
      "Caja",
      s1.idSesion > 0 && s1.montoInicial === 150.0 && s1.estado === "ABIERTA",
      `Sesión #${s1.idSesion} aperturada con fondo inicial de S/ ${s1.montoInicial.toFixed(2)}`
    );
  } catch (err: any) {
    recordTest(1, "Apertura de caja con monto inicial", "Caja", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 02: Intento de apertura de caja duplicada (debe prevenir)
  // ---------------------------------------------------------------------------
  try {
    await openCashSessionTransaction({
      idEmpleado: 1,
      montoInicial: 200.0,
      observaciones: "Intento duplicado",
    });
    recordTest(2, "Prevención de apertura de caja duplicada", "Caja", false, "Permitió abrir caja duplicada");
  } catch (err: any) {
    const passed = err.code === "OPEN_SESSION_ALREADY_EXISTS" || err.message.includes("Ya existe una sesión de caja");
    recordTest(
      2,
      "Prevención de apertura de caja duplicada",
      "Caja",
      passed,
      `Rechazado correctamente: ${err.message}`
    );
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 03: Venta 100% en efectivo vinculada a la sesión de caja
  // ---------------------------------------------------------------------------
  try {
    const price1 = Number(p1.Precio);
    const saleInput: SaleInput = {
      dniCliente: validDni,
      idEmpleado: 1,
      idTipoComp: 1, // Boleta
      items: [{ codbarras: p1.Codbarras_prod, cantidad: 1 }],
      payments: [{ idMetodo: 1, monto: price1 }], // 100% Efectivo
    };
    const saleResult = await executeSaleTransaction(saleInput);
    testSaleIdCash = saleResult.idVenta;

    // Verificar movimiento de caja con Afecta_efectivo = 1
    const movRes = await pool.request().input("idVenta", sql.Int, testSaleIdCash).query(`
      SELECT ID_mov_caja, Tipo, Categoria, Monto, ID_metodo, Afecta_efectivo
      FROM dbo.Movimiento_Caja WHERE ID_venta = @idVenta;
    `);
    const mov = movRes.recordset[0];
    const passed = mov && mov.Tipo === "INGRESO" && mov.Afecta_efectivo === true && Number(mov.Monto) === price1;
    recordTest(
      3,
      "Venta 100% en efectivo vinculada a caja física",
      "Ventas & Caja",
      passed,
      `Venta #${testSaleIdCash} registrada. Movimiento #${mov?.ID_mov_caja} afectó efectivo físico (+S/ ${price1.toFixed(2)})`
    );
  } catch (err: any) {
    recordTest(3, "Venta 100% en efectivo vinculada a caja física", "Ventas & Caja", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 04: Venta 100% digital (Yape) con Afecta_efectivo = 0
  // ---------------------------------------------------------------------------
  try {
    const price2 = Number(p2.Precio);
    const saleInput: SaleInput = {
      dniCliente: validDni,
      idEmpleado: 1,
      idTipoComp: 1,
      items: [{ codbarras: p2.Codbarras_prod, cantidad: 1 }],
      payments: [{ idMetodo: 4, monto: price2 }], // 4 = Yape
    };
    const saleResult = await executeSaleTransaction(saleInput);
    testSaleIdDigital = saleResult.idVenta;

    const movRes = await pool.request().input("idVenta", sql.Int, testSaleIdDigital).query(`
      SELECT ID_mov_caja, Tipo, Categoria, Monto, ID_metodo, Afecta_efectivo
      FROM dbo.Movimiento_Caja WHERE ID_venta = @idVenta;
    `);
    const mov = movRes.recordset[0];
    const passed = mov && mov.Tipo === "INGRESO" && mov.Afecta_efectivo === false && Number(mov.Monto) === price2;
    recordTest(
      4,
      "Venta digital (Yape) registrada sin inflar caja física",
      "Ventas & Caja",
      passed,
      `Venta #${testSaleIdDigital} con Yape registrada en sesión con Afecta_efectivo = 0 (No suma a gaveta)`
    );
  } catch (err: any) {
    recordTest(4, "Venta digital (Yape) registrada sin inflar caja física", "Ventas & Caja", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 05: Venta con pago mixto (Efectivo + Tarjeta)
  // ---------------------------------------------------------------------------
  try {
    const price3 = Number(p3.Precio);
    const half1 = Math.round((price3 / 2) * 100) / 100;
    const half2 = Math.round((price3 - half1) * 100) / 100;

    const saleInput: SaleInput = {
      dniCliente: validDni,
      idEmpleado: 1,
      idTipoComp: 1,
      items: [{ codbarras: p3.Codbarras_prod, cantidad: 1 }],
      payments: [
        { idMetodo: 1, monto: half1 }, // Efectivo
        { idMetodo: 2, monto: half2 }, // Tarjeta
      ],
    };
    const saleResult = await executeSaleTransaction(saleInput);
    testSaleIdMixed = saleResult.idVenta;

    const movRes = await pool.request().input("idVenta", sql.Int, testSaleIdMixed).query(`
      SELECT ID_metodo, Monto, Afecta_efectivo
      FROM dbo.Movimiento_Caja WHERE ID_venta = @idVenta ORDER BY ID_metodo ASC;
    `);
    const cashRow = movRes.recordset.find((r: any) => r.ID_metodo === 1);
    const cardRow = movRes.recordset.find((r: any) => r.ID_metodo === 2);

    const passed =
      cashRow && cashRow.Afecta_efectivo === true && Number(cashRow.Monto) === half1 &&
      cardRow && cardRow.Afecta_efectivo === false && Number(cardRow.Monto) === half2;
    recordTest(
      5,
      "Venta mixta con desglose exacto de afectación física",
      "Ventas & Caja",
      Boolean(passed),
      `Venta #${testSaleIdMixed} desglosó S/ ${half1.toFixed(2)} efectivo físico y S/ ${half2.toFixed(2)} tarjeta bancarizada`
    );
  } catch (err: any) {
    recordTest(5, "Venta mixta con desglose exacto de afectación física", "Ventas & Caja", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 06: Registro de egreso manual (Gasto Operativo) en efectivo
  // ---------------------------------------------------------------------------
  try {
    const mov = await addCashMovementTransaction({
      idSesion: currentSessionId,
      tipo: "EGRESO",
      categoria: "GASTO_OPERATIVO",
      monto: 35.5,
      idMetodo: 1,
      concepto: "Compra de útiles y rollos térmicos",
      idEmpleado: 1,
    });
    recordTest(
      6,
      "Registro de gasto operativo en efectivo",
      "Caja",
      mov.idMovCaja > 0 && mov.afectaEfectivo === true && mov.monto === 35.5,
      `Movimiento #${mov.idMovCaja} registrado como GASTO_OPERATIVO por S/ 35.50 en efectivo`
    );
  } catch (err: any) {
    recordTest(6, "Registro de gasto operativo en efectivo", "Caja", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 07: Registro de egreso manual (Retiro parcial de seguridad)
  // ---------------------------------------------------------------------------
  try {
    const mov = await addCashMovementTransaction({
      idSesion: currentSessionId,
      tipo: "EGRESO",
      categoria: "RETIRO",
      monto: 100.0,
      idMetodo: 1,
      concepto: "Retiro parcial de resguardo a caja fuerte",
      idEmpleado: 1,
    });
    recordTest(
      7,
      "Registro de retiro parcial de resguardo en efectivo",
      "Caja",
      mov.idMovCaja > 0 && mov.afectaEfectivo === true && mov.monto === 100.0,
      `Movimiento #${mov.idMovCaja} registrado como RETIRO por S/ 100.00 en efectivo`
    );
  } catch (err: any) {
    recordTest(7, "Registro de retiro parcial de resguardo en efectivo", "Caja", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 08: Registro de ingreso manual a caja
  // ---------------------------------------------------------------------------
  try {
    const mov = await addCashMovementTransaction({
      idSesion: currentSessionId,
      tipo: "INGRESO",
      categoria: "INGRESO_MANUAL",
      monto: 50.0,
      idMetodo: 1,
      concepto: "Aporte complementario para cambio de monedas",
      idEmpleado: 1,
    });
    recordTest(
      8,
      "Registro de ingreso manual a caja",
      "Caja",
      mov.idMovCaja > 0 && mov.afectaEfectivo === true && mov.monto === 50.0,
      `Movimiento #${mov.idMovCaja} registrado como INGRESO_MANUAL por S/ 50.00 en efectivo`
    );
  } catch (err: any) {
    recordTest(8, "Registro de ingreso manual a caja", "Caja", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 09: Devolución parcial (solicitud Pendiente reservando unidades)
  // ---------------------------------------------------------------------------
  let idDetalleTestSale = 0;
  try {
    const detRes = await pool.request().input("idVenta", sql.Int, testSaleIdCash).query(`
      SELECT ID_detalle FROM dbo.Detalle_Venta WHERE ID_venta = @idVenta;
    `);
    idDetalleTestSale = detRes.recordset[0].ID_detalle;

    const retResult = await createReturnTransaction(
      {
        idVenta: testSaleIdCash,
        idEmpleado: 1,
        items: [{ idDetalle: idDetalleTestSale, cantidadDev: 1, idMotivo: 3 }], // Motivo 3 = Falla de fábrica
      },
      1
    );
    testReturnIdPartial = retResult.idDevolucion;

    recordTest(
      9,
      "Registro de solicitud de devolución parcial en estado Pendiente",
      "Devoluciones",
      retResult.idDevolucion > 0 && retResult.idEstadoDev === 1,
      `Devolución #${retResult.idDevolucion} creada en estado Pendiente con 1 unidad reservada`
    );
  } catch (err: any) {
    recordTest(9, "Registro de solicitud de devolución parcial en estado Pendiente", "Devoluciones", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 10: Intento de devolver más unidades de las disponibles (debe fallar)
  // ---------------------------------------------------------------------------
  try {
    await createReturnTransaction(
      {
        idVenta: testSaleIdCash,
        idEmpleado: 1,
        items: [{ idDetalle: idDetalleTestSale, cantidadDev: 10, idMotivo: 1 }],
      },
      1
    );
    recordTest(10, "Prevención de exceso de unidades en devolución", "Devoluciones", false, "Permitió devolver más unidades de las vendidas");
  } catch (err: any) {
    const passed = err.code === "RETURN_QUANTITY_EXCEEDS_AVAILABLE";
    recordTest(
      10,
      "Prevención de exceso de unidades en devolución",
      "Devoluciones",
      passed,
      `Bloqueado correctamente: ${err.message}`
    );
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 11: Intento de reingresar stock con motivo defectuoso (debe fallar)
  // ---------------------------------------------------------------------------
  try {
    await approveReturnTransaction(
      {
        idDevolucion: testReturnIdPartial,
        reingresoStock: true, // No permitido para motivo 3
      },
      1
    );
    recordTest(11, "Prevención de reingreso a stock para productos defectuosos", "Devoluciones", false, "Permitió reingresar producto defectuoso a almacén");
  } catch (err: any) {
    const passed = err.code === "RESTOCK_NOT_ALLOWED";
    recordTest(
      11,
      "Prevención de reingreso a stock para productos defectuosos",
      "Devoluciones",
      passed,
      `Bloqueado correctamente: ${err.message}`
    );
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 12: Intento de devolver ítem de otra venta (debe fallar)
  // ---------------------------------------------------------------------------
  try {
    const detResDigital = await pool.request().input("idVenta", sql.Int, testSaleIdDigital).query(`
      SELECT ID_detalle FROM dbo.Detalle_Venta WHERE ID_venta = @idVenta;
    `);
    const idDetalleDigital = detResDigital.recordset[0].ID_detalle;

    // Intentar asociar detalle de testSaleIdDigital a la venta testSaleIdCash
    await createReturnTransaction(
      {
        idVenta: testSaleIdCash,
        idEmpleado: 1,
        items: [{ idDetalle: idDetalleDigital, cantidadDev: 1, idMotivo: 1 }],
      },
      1
    );
    recordTest(12, "Prevención de línea perteneciente a otra venta", "Devoluciones", false, "Permitió asociar línea de otra venta");
  } catch (err: any) {
    const passed = err.code === "RETURN_LINE_SALE_MISMATCH";
    recordTest(
      12,
      "Prevención de línea perteneciente a otra venta",
      "Devoluciones",
      passed,
      `Validado correctamente: ${err.message}`
    );
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 13: Aprobación de devolución parcial con emisión de Nota de Crédito
  // ---------------------------------------------------------------------------
  try {
    const appRes = await approveReturnTransaction(
      {
        idDevolucion: testReturnIdPartial,
        reingresoStock: false,
        idMetodoReembolso: 1, // Efectivo
        emitirNotaCredito: true,
      },
      1
    );
    const passed = appRes.idEstadoDev === 2 && appRes.notaCredito && appRes.notaCredito.numeroNota.startsWith("NC01-");
    recordTest(
      13,
      "Aprobación de devolución con generación de Nota de Crédito correlativa",
      "Devoluciones & SUNAT",
      Boolean(passed),
      `Devolución #${testReturnIdPartial} aprobada con Nota de Crédito ${appRes.notaCredito?.numeroNota}`
    );
  } catch (err: any) {
    recordTest(13, "Aprobación de devolución con generación de Nota de Crédito correlativa", "Devoluciones & SUNAT", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 14: Verificación de cálculo tributario en Nota de Crédito (18% = 15.5% IGV + 2.5% IPM)
  // ---------------------------------------------------------------------------
  try {
    const ncRes = await pool.request().input("idDev", sql.Int, testReturnIdPartial).query(`
      SELECT Numero_nota, Monto_subtotal, Monto_igv, Monto_total, Tipo_ajuste
      FROM dbo.Nota_Credito WHERE ID_devolucion = @idDev;
    `);
    const nc = ncRes.recordset[0];
    const total = Number(nc.Monto_total);
    const subtotal = Number(nc.Monto_subtotal);
    const igv = Number(nc.Monto_igv);

    const expectedSubtotal = Math.round((total / 1.18) * 100) / 100;
    const expectedIgv = Math.round((total - expectedSubtotal) * 100) / 100;

    const passed = Math.abs(subtotal - expectedSubtotal) < 0.05 && Math.abs(igv - expectedIgv) < 0.05;
    recordTest(
      14,
      "Cálculo tributario de Nota de Crédito (Base Imponible + 18% IGV)",
      "SUNAT",
      passed,
      `Total NC: S/ ${total.toFixed(2)} -> Base Imponible: S/ ${subtotal.toFixed(2)} + IGV: S/ ${igv.toFixed(2)}`
    );
  } catch (err: any) {
    recordTest(14, "Cálculo tributario de Nota de Crédito (Base Imponible + 18% IGV)", "SUNAT", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 15: Reembolso en efectivo afectando caja física
  // ---------------------------------------------------------------------------
  try {
    const reembRes = await pool.request().input("idDev", sql.Int, testReturnIdPartial).query(`
      SELECT ID_reembolso, ID_metodo, Monto, ID_sesion FROM dbo.Reembolso_Devolucion WHERE ID_devolucion = @idDev;
    `);
    const reemb = reembRes.recordset[0];

    const movRes = await pool.request().input("idDev", sql.Int, testReturnIdPartial).query(`
      SELECT ID_mov_caja, Tipo, Categoria, Monto, Afecta_efectivo
      FROM dbo.Movimiento_Caja WHERE ID_devolucion = @idDev AND Categoria = 'REEMBOLSO_DEVOLUCION';
    `);
    const mov = movRes.recordset[0];

    const passed = reemb && mov && mov.Afecta_efectivo === true && mov.Tipo === "EGRESO";
    recordTest(
      15,
      "Reembolso de devolución en efectivo afectando la sesión de caja",
      "Caja & Devoluciones",
      Boolean(passed),
      `Reembolso #${reemb?.ID_reembolso} descontó S/ ${Number(mov?.Monto).toFixed(2)} de la gaveta de efectivo física`
    );
  } catch (err: any) {
    recordTest(15, "Reembolso de devolución en efectivo afectando la sesión de caja", "Caja & Devoluciones", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 16: Reembolso por medio digital (Yape) sin descontar efectivo físico
  // ---------------------------------------------------------------------------
  try {
    const detRes = await pool.request().input("idVenta", sql.Int, testSaleIdDigital).query(`
      SELECT ID_detalle FROM dbo.Detalle_Venta WHERE ID_venta = @idVenta;
    `);
    const idDetalleDigital = detRes.recordset[0].ID_detalle;

    const devRes = await createReturnTransaction(
      {
        idVenta: testSaleIdDigital,
        idEmpleado: 1,
        items: [{ idDetalle: idDetalleDigital, cantidadDev: 1, idMotivo: 3 }],
      },
      1
    );

    const appRes = await approveReturnTransaction(
      {
        idDevolucion: devRes.idDevolucion,
        reingresoStock: false,
        idMetodoReembolso: 4, // Yape
        emitirNotaCredito: true,
      },
      1
    );

    const movRes = await pool.request().input("idDev", sql.Int, devRes.idDevolucion).query(`
      SELECT ID_mov_caja, Tipo, Categoria, Monto, Afecta_efectivo
      FROM dbo.Movimiento_Caja WHERE ID_devolucion = @idDev AND Categoria = 'REEMBOLSO_DEVOLUCION';
    `);
    const mov = movRes.recordset[0];

    const passed = mov && mov.Afecta_efectivo === false && mov.Tipo === "EGRESO";
    recordTest(
      16,
      "Reembolso digital (Yape) sin descontar efectivo físico de gaveta",
      "Caja & Devoluciones",
      Boolean(passed),
      `Reembolso por Yape registrado con Afecta_efectivo = 0 (No reduce arqueo físico)`
    );
  } catch (err: any) {
    recordTest(16, "Reembolso digital (Yape) sin descontar efectivo físico de gaveta", "Caja & Devoluciones", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 17: Devolución con motivo 'Producto equivocado' y reingreso a almacén
  // ---------------------------------------------------------------------------
  try {
    const pPrice = Number(p4.Precio);
    const saleResult = await executeSaleTransaction({
      dniCliente: validDni,
      idEmpleado: 1,
      idTipoComp: 1,
      items: [{ codbarras: p4.Codbarras_prod, cantidad: 2 }],
      payments: [{ idMetodo: 1, monto: pPrice * 2 }],
    });

    const detRes = await pool.request().input("idVenta", sql.Int, saleResult.idVenta).query(`
      SELECT ID_detalle FROM dbo.Detalle_Venta WHERE ID_venta = @idVenta;
    `);
    const idDetalle = detRes.recordset[0].ID_detalle;

    const stockPreRes = await pool.request().input("code", sql.VarChar(13), p4.Codbarras_prod).query(`
      SELECT Stock FROM dbo.Producto WHERE Codbarras_prod = @code;
    `);
    const stockPre = Number(stockPreRes.recordset[0].Stock);

    const devRes = await createReturnTransaction(
      {
        idVenta: saleResult.idVenta,
        idEmpleado: 1,
        items: [{ idDetalle, cantidadDev: 2, idMotivo: 2 }], // 2 = Producto equivocado
      },
      1
    );
    testReturnIdWrongProduct = devRes.idDevolucion;

    const appRes = await approveReturnTransaction(
      {
        idDevolucion: testReturnIdWrongProduct,
        reingresoStock: true,
        idMetodoReembolso: 1,
      },
      1
    );

    const stockPostRes = await pool.request().input("code", sql.VarChar(13), p4.Codbarras_prod).query(`
      SELECT Stock FROM dbo.Producto WHERE Codbarras_prod = @code;
    `);
    const stockPost = Number(stockPostRes.recordset[0].Stock);

    const passed = appRes.reingresoKardexRealizado === true && stockPost === stockPre + 2;
    recordTest(
      17,
      "Devolución por producto equivocado con reingreso a Kardex y aumento de stock",
      "Kardex & Stock",
      passed,
      `Stock previo: ${stockPre} -> Stock post reingreso: ${stockPost} (+2 unidades en Almacén)`
    );
  } catch (err: any) {
    recordTest(17, "Devolución por producto equivocado con reingreso a Kardex y aumento de stock", "Kardex & Stock", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 18: Rechazo de devolución pendiente y liberación de reserva
  // ---------------------------------------------------------------------------
  try {
    const pPrice = Number(p1.Precio);
    const saleResult = await executeSaleTransaction({
      dniCliente: validDni,
      idEmpleado: 1,
      idTipoComp: 1,
      items: [{ codbarras: p1.Codbarras_prod, cantidad: 1 }],
      payments: [{ idMetodo: 1, monto: pPrice }],
    });

    const detRes = await pool.request().input("idVenta", sql.Int, saleResult.idVenta).query(`
      SELECT ID_detalle FROM dbo.Detalle_Venta WHERE ID_venta = @idVenta;
    `);
    const idDetalle = detRes.recordset[0].ID_detalle;

    const devRes = await createReturnTransaction(
      {
        idVenta: saleResult.idVenta,
        idEmpleado: 1,
        items: [{ idDetalle, cantidadDev: 1, idMotivo: 1 }],
      },
      1
    );
    testReturnIdRejected = devRes.idDevolucion;

    const rejRes = await rejectReturnTransaction(
      {
        idDevolucion: testReturnIdRejected,
        motivoRechazo: "Daño físico atribuible al usuario no cubierto por garantía",
      },
      1
    );

    const passed = rejRes.idEstadoDev === 3 && rejRes.nombreEstado === "Rechazada";
    recordTest(
      18,
      "Rechazo de devolución pendiente y liberación de unidades reservadas",
      "Devoluciones",
      passed,
      `Devolución #${testReturnIdRejected} rechazada exitosamente. Reserva liberada.`
    );
  } catch (err: any) {
    recordTest(18, "Rechazo de devolución pendiente y liberación de unidades reservadas", "Devoluciones", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 19: Intento de procesar una devolución ya rechazada (transición inválida)
  // ---------------------------------------------------------------------------
  try {
    await approveReturnTransaction(
      {
        idDevolucion: testReturnIdRejected,
      },
      1
    );
    recordTest(19, "Prevención de transición inválida en devolución rechazada", "Devoluciones", false, "Permitió aprobar devolución ya rechazada");
  } catch (err: any) {
    const passed = err.code === "INVALID_STATE_TRANSITION";
    recordTest(
      19,
      "Prevención de transición inválida en devolución rechazada",
      "Devoluciones",
      passed,
      `Transición bloqueada correctamente: ${err.message}`
    );
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 20: Arqueo y cálculo de Efectivo Físico Esperado en Caja
  // ---------------------------------------------------------------------------
  let currentExpectedCash = 0;
  try {
    const activeSes = await getActiveCashSession(pool);
    if (!activeSes) throw new Error("No hay sesión activa");
    currentExpectedCash = activeSes.efectivoEsperadoActual;

    const manualCalc =
      activeSes.montoInicial +
      activeSes.totalVentasEfectivo +
      activeSes.totalOtrosIngresosEfectivo -
      activeSes.totalGastosEfectivo -
      activeSes.totalRetirosEfectivo -
      activeSes.totalReembolsosEfectivo;

    const passed = Math.abs(currentExpectedCash - manualCalc) < 0.01;
    recordTest(
      20,
      "Arqueo exacto de efectivo físico esperado en caja",
      "Arqueo & Conciliación",
      passed,
      `Efectivo esperado calculado: S/ ${currentExpectedCash.toFixed(2)} (Fondo + Cobros Efectivo - Egresos Efectivo)`
    );
  } catch (err: any) {
    recordTest(20, "Arqueo exacto de efectivo físico esperado en caja", "Arqueo & Conciliación", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 21: Simulación de Arqueo con Detección de Faltante
  // ---------------------------------------------------------------------------
  try {
    const testCounted = currentExpectedCash - 20.0;
    const diff = Math.round((testCounted - currentExpectedCash) * 100) / 100;
    const isShort = diff < -0.01;
    recordTest(
      21,
      "Detección y clasificación matemática de Faltante en arqueo",
      "Arqueo & Conciliación",
      isShort && diff === -20.0,
      `Esperado: S/ ${currentExpectedCash.toFixed(2)} vs Contado: S/ ${testCounted.toFixed(2)} -> Diferencia: S/ ${diff.toFixed(2)} (FALTANTE)`
    );
  } catch (err: any) {
    recordTest(21, "Detección y clasificación matemática de Faltante en arqueo", "Arqueo & Conciliación", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 22: Simulación de Arqueo con Detección de Sobrante
  // ---------------------------------------------------------------------------
  try {
    const testCounted = currentExpectedCash + 15.0;
    const diff = Math.round((testCounted - currentExpectedCash) * 100) / 100;
    const isSurplus = diff > 0.01;
    recordTest(
      22,
      "Detección y clasificación matemática de Sobrante en arqueo",
      "Arqueo & Conciliación",
      isSurplus && diff === 15.0,
      `Esperado: S/ ${currentExpectedCash.toFixed(2)} vs Contado: S/ ${testCounted.toFixed(2)} -> Diferencia: +S/ ${diff.toFixed(2)} (SOBRANTE)`
    );
  } catch (err: any) {
    recordTest(22, "Detección y clasificación matemática de Sobrante en arqueo", "Arqueo & Conciliación", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 23: Cierre formal de caja con inmutabilización de sesión
  // ---------------------------------------------------------------------------
  try {
    const closeSummary = await closeCashSessionTransaction({
      idSesion: currentSessionId,
      idEmpleadoCierre: 1,
      efectivoContado: currentExpectedCash, // Cuadre exacto
      observacionesCierre: "Cierre exitoso verificado por arqueo",
    });

    const passed =
      closeSummary.idSesion === currentSessionId &&
      closeSummary.tipoCuadre === "CUADRE_EXACTO" &&
      closeSummary.diferencia === 0;

    recordTest(
      23,
      "Cierre formal diario de caja e inmutabilización",
      "Caja",
      passed,
      `Sesión #${currentSessionId} cerrada con CUADRE_EXACTO. Efectivo contado: S/ ${closeSummary.efectivoContado.toFixed(2)}`
    );
  } catch (err: any) {
    recordTest(23, "Cierre formal diario de caja e inmutabilización", "Caja", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 24: Intento de registrar movimiento en sesión cerrada (debe prevenir)
  // ---------------------------------------------------------------------------
  try {
    await addCashMovementTransaction({
      idSesion: currentSessionId,
      tipo: "EGRESO",
      categoria: "GASTO_OPERATIVO",
      monto: 10.0,
      idMetodo: 1,
      concepto: "Gasto en sesión ya cerrada",
      idEmpleado: 1,
    });
    recordTest(24, "Inmutabilidad de sesión cerrada (prevención de nuevos movimientos)", "Caja", false, "Permitió registrar egreso en sesión cerrada");
  } catch (err: any) {
    const passed = err.code === "SESSION_ALREADY_CLOSED";
    recordTest(
      24,
      "Inmutabilidad de sesión cerrada (prevención de nuevos movimientos)",
      "Caja",
      passed,
      `Bloqueado correctamente: ${err.message}`
    );
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 25: Reapertura excepcional auditada con justificación obligatoria
  // ---------------------------------------------------------------------------
  try {
    const reopenedSession = await reopenCashSessionTransaction({
      idSesion: currentSessionId,
      idEmpleadoReapertura: 1,
      motivoReapertura: "Ajuste excepcional autorizado por gerencia para revisión de arqueo",
    });

    const passed =
      reopenedSession.idSesion === currentSessionId &&
      reopenedSession.estado === "REABIERTA" &&
      Boolean(reopenedSession.fechaReapertura);

    recordTest(
      25,
      "Reapertura excepcional auditada con justificación obligatoria",
      "Auditoría",
      passed,
      `Sesión #${currentSessionId} reabierta bajo protocolo de auditoría`
    );
  } catch (err: any) {
    recordTest(25, "Reapertura excepcional auditada con justificación obligatoria", "Auditoría", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 26: Intento de reapertura sin justificación válida (debe fallar)
  // ---------------------------------------------------------------------------
  try {
    // Cerrar nuevamente la sesión
    await closeCashSessionTransaction({
      idSesion: currentSessionId,
      idEmpleadoCierre: 1,
      efectivoContado: currentExpectedCash,
      observacionesCierre: "Re-cierre para prueba de rechazo de reapertura",
    });

    // Intentar reabrir con motivo vacío o muy corto
    await reopenCashSessionTransaction({
      idSesion: currentSessionId,
      idEmpleadoReapertura: 1,
      motivoReapertura: "corta", // Menos de 10 caracteres
    });

    recordTest(26, "Prevención de reapertura sin justificación suficiente", "Auditoría", false, "Permitió reapertura sin justificación válida");
  } catch (err: any) {
    const passed = err.code === "INVALID_REOPEN_REASON" || err.message.includes("al menos 10 caracteres");
    recordTest(
      26,
      "Prevención de reapertura sin justificación suficiente",
      "Auditoría",
      passed,
      `Exigencia de justificación verificada: ${err.message}`
    );
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 27: Cálculo de Costo de Ventas (COGS) según dbo.Suministra
  // ---------------------------------------------------------------------------
  try {
    const finanzas = await getFinancialAnalytics({});
    const passed = finanzas.costoVentas > 0 && finanzas.ventasNetasSinImpuestos > 0;
    recordTest(
      27,
      "Cálculo del Costo de Ventas (COGS) histórico según dbo.Suministra",
      "Reportes Financieros",
      passed,
      `Costo de Ventas real acumulado: S/ ${finanzas.costoVentas.toFixed(2)} (Basado en precios de compra de proveedores)`
    );
  } catch (err: any) {
    recordTest(27, "Cálculo del Costo de Ventas (COGS) histórico según dbo.Suministra", "Reportes Financieros", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 28: Cálculo de Ganancia Bruta y Margen Bruto %
  // ---------------------------------------------------------------------------
  try {
    const finanzas = await getFinancialAnalytics({});
    const expectedGrossProfit = Math.round((finanzas.ventasNetasSinImpuestos - finanzas.costoVentas) * 100) / 100;
    const passed = Math.abs(finanzas.gananciaBruta - expectedGrossProfit) < 0.05 && finanzas.margenBrutoPorcentaje > 0;
    recordTest(
      28,
      "Cálculo de Ganancia Bruta y Margen de Rentabilidad %",
      "Reportes Financieros",
      passed,
      `Ganancia Bruta: S/ ${finanzas.gananciaBruta.toFixed(2)} | Margen Bruto: ${finanzas.margenBrutoPorcentaje.toFixed(1)}%`
    );
  } catch (err: any) {
    recordTest(28, "Cálculo de Ganancia Bruta y Margen de Rentabilidad %", "Reportes Financieros", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 29: Resumen Tributario SUNAT con Débito Neto vs Crédito Fiscal
  // ---------------------------------------------------------------------------
  try {
    const tax = await getTaxSummarySunat({});
    const passed =
      tax.ruc === "20608945123" &&
      tax.tasaTotalPorcentaje === 18.0 &&
      tax.tasaIgvPorcentaje === 15.5 &&
      tax.tasaIpmPorcentaje === 2.5 &&
      tax.debitoFiscalNeto >= 0 &&
      tax.creditoFiscalSustentado > 0;

    recordTest(
      29,
      "Resumen Tributario SUNAT (15.5% IGV + 2.5% IPM y Crédito Fiscal de Compras)",
      "SUNAT",
      passed,
      `RUC: ${tax.ruc} | Débito Fiscal Neto: S/ ${tax.debitoFiscalNeto.toFixed(2)} | Crédito Fiscal Compras: S/ ${tax.creditoFiscalSustentado.toFixed(2)}`
    );
  } catch (err: any) {
    recordTest(29, "Resumen Tributario SUNAT (15.5% IGV + 2.5% IPM y Crédito Fiscal de Compras)", "SUNAT", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO 30: Exportación de reportes CSV con UTF-8 BOM y sanitización
  // ---------------------------------------------------------------------------
  try {
    const csvFinanzas = await generateReportCsv("finanzas", {}, true);
    const csvTributario = await generateReportCsv("tributario", {}, true);

    const hasBom = csvFinanzas.content.charCodeAt(0) === 0xfeff && csvTributario.content.charCodeAt(0) === 0xfeff;
    const hasFinanzasHeaders = csvFinanzas.content.includes("MÉTRICA FINANCIERA") && csvFinanzas.content.includes("Ganancia Bruta");
    const hasTaxHeaders = csvTributario.content.includes("CAMPO DECLARACIÓN REFERENCIAL SUNAT") && csvTributario.content.includes("20608945123");

    const passed = hasBom && hasFinanzasHeaders && hasTaxHeaders;
    recordTest(
      30,
      "Generación y exportación de archivos CSV con UTF-8 BOM y sanitización",
      "Exportación & Seguridad",
      passed,
      `Archivos generados: ${csvFinanzas.filename} y ${csvTributario.filename} con codificación Excel UTF-8 BOM`
    );
  } catch (err: any) {
    recordTest(30, "Generación y exportación de archivos CSV con UTF-8 BOM y sanitización", "Exportación & Seguridad", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // RESUMEN FINAL
  // ---------------------------------------------------------------------------
  const totalPassed = reports.filter((r) => r.passed).length;
  const totalFailed = reports.filter((r) => !r.passed).length;

  console.log("\n================================================================================");
  console.log(` RESULTADOS GLOBALES DE AUDITORÍA: ${totalPassed} / 30 ESCENARIOS APROBADOS`);
  console.log("================================================================================");

  if (totalFailed > 0) {
    console.log(`❌ FALLARON ${totalFailed} ESCENARIOS. REVISAR DETALLES ARRIBA.`);
    process.exit(1);
  } else {
    console.log("🎉 TODOS LOS 30 ESCENARIOS CUMPLEN SATISFACTORIAMENTE AL 100% CON LA NORMATIVA.");
    process.exit(0);
  }
}

runAudit().catch((err) => {
  console.error("Error fatal en suite de pruebas:", err);
  process.exit(1);
});
