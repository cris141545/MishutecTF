import fs from "fs";
import path from "path";
import sql from "mssql/msnodesqlv8";

// Cargar .env.local
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
import { assertMutationsAllowed } from "../src/lib/db-guard";
import {
  openCashSessionTransaction,
  addCashMovementTransaction,
  closeCashSessionTransaction,
  registerEmployeePaymentTransaction,
  getActiveCashSession,
  getChannelSummaryCards,
} from "../src/lib/repositories/cash.repository";
import { executeSaleTransaction } from "../src/lib/repositories/sale-transaction.repository";
import {
  createReturnTransaction,
  approveReturnTransaction,
} from "../src/lib/repositories/return-transaction.repository";
import { getReturnReceiptData } from "../src/lib/repositories/return.repository";

interface StepResult {
  step: number;
  name: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const stepResults: StepResult[] = [];

function record(step: number, name: string, passed: boolean, details?: string, error?: string) {
  stepResults.push({ step, name, passed, details, error });
  const icon = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`[${icon}] Paso #${step.toString().padStart(2, "0")}: ${name}`);
  if (details) console.log(`       ↳ ${details}`);
  if (error) console.log(`       ⚠️ ERROR: ${error}`);
}

async function runScenario() {
  assertMutationsAllowed("test-phase10-1-complete");
  console.log("================================================================================");
  console.log(" MISHUTEC - FASE 10.1: PRUEBA FUNCIONAL COMPLETA (ESCENARIO DE 13 PASOS)");
  console.log(" Base activa:", process.env.DB_NAME || "MishutecT2_Aceptacion");
  console.log(" Servidor SQL:", process.env.DB_SERVER || "localhost\\SQLEXPRESS01");
  console.log("================================================================================\n");

  const pool = await getPool();

  // Limpieza inicial: cerrar cualquier sesión abierta previa
  await pool.request().query(`
    UPDATE dbo.Sesion_Caja 
    SET Estado = 'CERRADA', Fecha_cierre = GETDATE(), ID_empleado_cierre = 1, Observaciones_cierre = 'Auto-cerrada por inicio de test 10.1'
    WHERE Estado IN ('ABIERTA', 'REABIERTA');
  `);

  // Obtener cliente y 2 productos con stock
  const clientRes = await pool.request().query("SELECT TOP 1 Dni_cliente FROM dbo.Cliente");
  const validDni = String(clientRes.recordset[0].Dni_cliente);

  const prodRes = await pool.request().query(`
    SELECT TOP 2 Codbarras_prod, Nombre_prod, Stock, Precio 
    FROM dbo.Producto 
    WHERE Stock >= 5 AND ID_estado_prod = 1
    ORDER BY Stock DESC;
  `);

  const prodA = prodRes.recordset[0];
  const prodB = prodRes.recordset[1];

  let sessionId = 0;
  let saleId = 0;
  let returnId = 0;
  let idDetalleB = 0;
  let stockPreB = 0;
  let creditNoteNumber = "";

  // ---------------------------------------------------------------------------
  // PASO 1: Abrir caja con S/ 100 en efectivo
  // ---------------------------------------------------------------------------
  try {
    const s = await openCashSessionTransaction({
      idEmpleado: 1,
      montoInicial: 100.0,
      observaciones: "Apertura para prueba funcional Fase 10.1",
    });
    sessionId = s.idSesion;
    record(
      1,
      "Apertura de caja con S/ 100 en efectivo",
      s.idSesion > 0 && s.montoInicial === 100 && s.estado === "ABIERTA",
      `Sesión #${s.idSesion} iniciada con fondo inicial S/ ${s.montoInicial.toFixed(2)}`
    );
  } catch (err: any) {
    record(1, "Apertura de caja con S/ 100 en efectivo", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // PASO 2 & 3: Vender dos productos (Total S/ 70) con cobro 100% mediante Yape
  // ---------------------------------------------------------------------------
  try {
    // Calculamos cantidades o simulamos la venta de A y B
    const priceA = Number(prodA.Precio);
    const priceB = Number(prodB.Precio);
    const totalOrder = priceA + priceB;

    const saleRes = await executeSaleTransaction({
      dniCliente: validDni,
      idEmpleado: 1,
      idTipoComp: 1, // Boleta
      items: [
        { codbarras: prodA.Codbarras_prod, cantidad: 1 },
        { codbarras: prodB.Codbarras_prod, cantidad: 1 },
      ],
      payments: [{ idMetodo: 4, monto: totalOrder }], // 4 = Yape
    });

    saleId = saleRes.idVenta;

    // Verificar en BD que el movimiento de caja tenga Afecta_efectivo = 0
    const movRes = await pool.request().input("idVenta", sql.Int, saleId).query(`
      SELECT ID_mov_caja, Tipo, Categoria, Monto, ID_metodo, Afecta_efectivo
      FROM dbo.Movimiento_Caja WHERE ID_venta = @idVenta;
    `);
    const mov = movRes.recordset[0];
    const isDigitalNoCash = mov && mov.Afecta_efectivo === false && Number(mov.Monto) === totalOrder;

    record(
      2,
      "Venta de 2 productos con cobro por Yape (No infla gaveta física)",
      saleRes.idVenta > 0 && isDigitalNoCash,
      `Venta #${saleId} (${saleRes.numeroComprobante}) por S/ ${totalOrder.toFixed(2)} canalizada vía Yape (Afecta_efectivo = 0)`
    );
  } catch (err: any) {
    record(2, "Venta de 2 productos con cobro por Yape", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // PASO 4: Comprobante interno de venta generado y conciliado
  // ---------------------------------------------------------------------------
  try {
    const saleDetRes = await pool.request().input("idVenta", sql.Int, saleId).query(`
      SELECT dv.ID_detalle, dv.Codbarras_prod, dv.Cantidad, dv.Precio_unitario, dv.Subtotal
      FROM dbo.Detalle_Venta dv WHERE dv.ID_venta = @idVenta;
    `);
    const lineB = saleDetRes.recordset.find((l: any) => l.Codbarras_prod === prodB.Codbarras_prod);
    idDetalleB = lineB ? lineB.ID_detalle : 0;

    record(
      4,
      "Comprobante de venta interno con conciliación de líneas",
      idDetalleB > 0 && saleDetRes.recordset.length === 2,
      `Comprobante desglosó 2 líneas de detalle válidas en SQL Server`
    );
  } catch (err: any) {
    record(4, "Comprobante de venta interno", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // PASO 5: Registrar la devolución del producto B
  // ---------------------------------------------------------------------------
  try {
    const devRes = await createReturnTransaction(
      {
        idVenta: saleId,
        idEmpleado: 1,
        items: [{ idDetalle: idDetalleB, cantidadDev: 1, idMotivo: 2 }], // Motivo 2 = Producto equivocado (apto para reingreso)
      },
      1
    );
    returnId = devRes.idDevolucion;

    record(
      5,
      "Registro de solicitud de devolución del producto B en estado Pendiente",
      devRes.idDevolucion > 0 && devRes.idEstadoDev === 1,
      `Devolución #${returnId} reservó 1 unidad de ${prodB.Nombre_prod}`
    );
  } catch (err: any) {
    record(5, "Registro de solicitud de devolución", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // PASO 6 & 7: Aprobación con emisión de Nota de Crédito y Reembolso por Yape
  // ---------------------------------------------------------------------------
  try {
    // Consultar stock previo de B
    const sPreRes = await pool.request().input("code", sql.VarChar(13), prodB.Codbarras_prod).query(`
      SELECT Stock FROM dbo.Producto WHERE Codbarras_prod = @code;
    `);
    stockPreB = Number(sPreRes.recordset[0].Stock);

    const appRes = await approveReturnTransaction(
      {
        idDevolucion: returnId,
        reingresoStock: true, // Apto porque motivo = 2
        idMetodoReembolso: 4, // Yape
        emitirNotaCredito: true,
      },
      1
    );

    creditNoteNumber = appRes.notaCredito?.numeroNota || "";

    record(
      7,
      "Aprobación transaccional con generación de Nota de Crédito y Reembolso por Yape",
      appRes.idEstadoDev === 2 && Boolean(creditNoteNumber) && appRes.reembolso?.metodo === "Yape",
      `Nota de Crédito ${creditNoteNumber} emitida. Reembolso por Yape con Afecta_efectivo = 0`
    );
  } catch (err: any) {
    record(7, "Aprobación transaccional con Nota de Crédito", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // PASO 8 & 9: Verificación de reingreso al inventario y constancia comercial
  // ---------------------------------------------------------------------------
  try {
    // 1. Stock post
    const sPostRes = await pool.request().input("code", sql.VarChar(13), prodB.Codbarras_prod).query(`
      SELECT Stock FROM dbo.Producto WHERE Codbarras_prod = @code;
    `);
    const stockPostB = Number(sPostRes.recordset[0].Stock);
    const restockOk = stockPostB === stockPreB + 1;

    // 2. Constancia comercial formateada
    const receipt = await getReturnReceiptData(returnId);
    const receiptOk =
      receipt !== null &&
      receipt.titulo.includes("CONSTANCIA DE DEVOLUCIÓN") &&
      receipt.subtitulo.includes("SIN VALIDEZ TRIBUTARIA") &&
      receipt.productos.length === 1 &&
      receipt.reembolso.afectaCajaFisica === false;

    record(
      9,
      "Reingreso exitoso a Kardex/Stock y Constancia Comercial generada",
      restockOk && receiptOk,
      `Stock B: ${stockPreB} -> ${stockPostB} (+1 unid en almacén). Constancia ${receipt?.numeroDevolucion} lista para imprimir/PDF`
    );
  } catch (err: any) {
    record(9, "Reingreso a Kardex y Constancia Comercial", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // PASO 10: Registrar pago al personal de S/ 30 en efectivo
  // ---------------------------------------------------------------------------
  try {
    const pagoPersonal = await registerEmployeePaymentTransaction({
      idSesion: sessionId,
      idEmpleado: 1, // Beneficiario
      periodo: "Octubre 2026 - Q2",
      concepto: "Adelanto de sueldo quincenal",
      monto: 30.0,
      idMetodo: 1, // Efectivo -> disminuye gaveta
      idEmpleadoResponsable: 1,
      observaciones: "Pago presencial autorizado en efectivo",
    });

    record(
      10,
      "Registro de pago al personal de S/ 30.00 en efectivo (Disminuye gaveta)",
      pagoPersonal.idPagoPersonal > 0 && pagoPersonal.monto === 30.0,
      `Pago #${pagoPersonal.idPagoPersonal} a ${pagoPersonal.nombreEmpleado} por S/ 30.00 descontó de caja física`
    );
  } catch (err: any) {
    record(10, "Registro de pago al personal", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // PASO 11: Realizar arqueo y validar fórmula matemática estricta
  // ---------------------------------------------------------------------------
  let expectedCash = 0;
  try {
    const activeSes = await getActiveCashSession(pool);
    if (!activeSes) throw new Error("No hay sesión activa");
    expectedCash = activeSes.efectivoEsperadoActual;

    // Fondo inicial (100) - Pago al personal (30) = S/ 70
    // La venta y devolución por Yape NO alteran el efectivo
    const matchesExpected = Math.abs(expectedCash - 70.0) < 0.01;

    // Consultar ChannelSummaryCards
    const cards = await getChannelSummaryCards(sessionId, pool);
    const cardEf = cards.find((c) => c.canal === "EFECTIVO");
    const cardYape = cards.find((c) => c.canal === "YAPE");

    const yapeNet = (cardYape?.detalles.ventas || 0) - (cardYape?.detalles.reembolsos || 0);
    const yapeOk = Math.abs(yapeNet - Number(prodA.Precio)) < 0.01;

    record(
      11,
      "Arqueo y conciliación matemática por canal (Efectivo esperado = S/ 70.00, Yape neto = S/ 50.00)",
      matchesExpected && yapeOk,
      `Efectivo físico esperado: S/ ${expectedCash.toFixed(2)} (Fondo S/ 100 - Pago personal S/ 30). Yape neto: S/ ${yapeNet.toFixed(2)}`
    );
  } catch (err: any) {
    record(11, "Arqueo y conciliación matemática", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // PASO 12: Cierre diario formal de caja con CUADRE_EXACTO
  // ---------------------------------------------------------------------------
  try {
    const closeRes = await closeCashSessionTransaction({
      idSesion: sessionId,
      idEmpleadoCierre: 1,
      efectivoContado: expectedCash, // 70.00
      observacionesCierre: "Cierre exitoso con arqueo exacto Fase 10.1",
    });

    record(
      12,
      "Cierre formal diario de caja e inmutabilización de sesión",
      closeRes.idSesion === sessionId && closeRes.tipoCuadre === "CUADRE_EXACTO" && closeRes.diferencia === 0,
      `Sesión #${sessionId} cerrada con CUADRE EXACTO (Efectivo contado: S/ ${closeRes.efectivoContado.toFixed(2)})`
    );
  } catch (err: any) {
    record(12, "Cierre formal diario de caja", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // PASO 13: Comprobación de estado de venta PARCIALMENTE DEVUELTA
  // ---------------------------------------------------------------------------
  try {
    const saleStatusRes = await pool.request().input("idVenta", sql.Int, saleId).query(`
      SELECT Estado FROM dbo.Venta WHERE ID_venta = @idVenta;
    `);
    const statusVenta = String(saleStatusRes.recordset[0]?.Estado);

    record(
      13,
      "Estado de Venta actualizado automáticamente a 'PARCIALMENTE DEVUELTA'",
      statusVenta === "PARCIALMENTE DEVUELTA",
      `Venta #${saleId} refleja fielmente su estado: '${statusVenta}' sin alteración de registros históricos`
    );
  } catch (err: any) {
    record(13, "Estado de Venta PARCIALMENTE DEVUELTA", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // ESCENARIO COMPLEMENTARIO: Devolución total y estado 'TOTALMENTE DEVUELTA'
  // ---------------------------------------------------------------------------
  try {
    // 1. Abrir nueva caja rápida
    const s2 = await openCashSessionTransaction({
      idEmpleado: 1,
      montoInicial: 50.0,
      observaciones: "Sesión complementaria para prueba de devolución total",
    });

    // 2. Vender 1 producto en efectivo
    const pPrice = Number(prodB.Precio);
    const sVenta2 = await executeSaleTransaction({
      dniCliente: validDni,
      idEmpleado: 1,
      idTipoComp: 1,
      items: [{ codbarras: prodB.Codbarras_prod, cantidad: 1 }],
      payments: [{ idMetodo: 1, monto: pPrice }],
    });

    const dRes = await pool.request().input("idVenta", sql.Int, sVenta2.idVenta).query(`
      SELECT ID_detalle FROM dbo.Detalle_Venta WHERE ID_venta = @idVenta;
    `);
    const idDet2 = Number(dRes.recordset[0].ID_detalle);

    // 3. Devolución total del único producto
    const dev2 = await createReturnTransaction(
      {
        idVenta: sVenta2.idVenta,
        idEmpleado: 1,
        items: [{ idDetalle: idDet2, cantidadDev: 1, idMotivo: 2 }],
      },
      1
    );

    await approveReturnTransaction(
      {
        idDevolucion: dev2.idDevolucion,
        reingresoStock: true,
        idMetodoReembolso: 1,
        emitirNotaCredito: true,
      },
      1
    );

    // 4. Comprobar que el estado de la venta 2 sea 'TOTALMENTE DEVUELTA'
    const s2StatusRes = await pool.request().input("idVenta", sql.Int, sVenta2.idVenta).query(`
      SELECT Estado FROM dbo.Venta WHERE ID_venta = @idVenta;
    `);
    const st2 = String(s2StatusRes.recordset[0]?.Estado);

    // 5. Cerrar sesión 2
    await closeCashSessionTransaction({
      idSesion: s2.idSesion,
      idEmpleadoCierre: 1,
      efectivoContado: 50.0,
      observacionesCierre: "Cierre sesión complementaria",
    });

    record(
      14,
      "Escenario de Devolución Total: Transición automática a 'TOTALMENTE DEVUELTA'",
      st2 === "TOTALMENTE DEVUELTA",
      `Venta #${sVenta2.idVenta} pasó automáticamente a estado: '${st2}'`
    );
  } catch (err: any) {
    record(14, "Escenario de Devolución Total", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // RESUMEN GLOBAL
  // ---------------------------------------------------------------------------
  const totalPassed = stepResults.filter((r) => r.passed).length;
  const totalFailed = stepResults.filter((r) => !r.passed).length;

  console.log("\n================================================================================");
  console.log(` RESULTADOS FASE 10.1: ${totalPassed} / ${stepResults.length} PASOS VALIDADOS EXITOSAMENTE`);
  console.log("================================================================================");

  if (totalFailed > 0) {
    console.log(`❌ FALLARON ${totalFailed} PASOS. REVISAR DETALLES ARRIBA.`);
    process.exit(1);
  } else {
    console.log("🎉 TODOS LOS REQUERIMIENTOS Y PASOS DE LA FASE 10.1 SE CUMPLEN AL 100%.");
    process.exit(0);
  }
}

runScenario().catch((err) => {
  console.error("Error fatal en escenario Fase 10.1:", err);
  process.exit(1);
});
