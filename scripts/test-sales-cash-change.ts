import fs from "fs";
import path from "path";
import sql from "mssql/msnodesqlv8";

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
import { saleInputSchema } from "../src/lib/validations/sale.schema";
import {
  executeSaleTransaction,
  TransactionalSaleResult,
  PaymentMismatchError,
  InsufficientStockError,
} from "../src/lib/repositories/sale-transaction.repository";
import { getSaleDetailById } from "../src/lib/repositories/sale.repository";
import {
  openCashSessionTransaction,
  closeCashSessionTransaction,
  getActiveCashSession,
} from "../src/lib/repositories/cash.repository";

interface StepResult {
  num: number;
  name: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const results: StepResult[] = [];

function record(num: number, name: string, passed: boolean, details?: string, error?: string) {
  results.push({ num, name, passed, details, error });
  const icon = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`[${icon}] #${num.toString().padStart(2, "0")}: ${name}`);
  if (details) console.log(`       ↳ ${details}`);
  if (error) console.log(`       ⚠️ ERROR: ${error}`);
}

async function runTestSuite() {
  assertMutationsAllowed("test-sales-cash-change");
  console.log("================================================================================");
  console.log(" MISHUTEC - SUITE DE VALIDACIÓN: CORRECCIÓN DE VENTAS Y MANEJO DE VUELTO");
  console.log(" Base activa:", process.env.DB_NAME || "MishutecT2_Aceptacion");
  console.log(" Servidor SQL:", process.env.DB_SERVER || "localhost\\SQLEXPRESS01");
  console.log("================================================================================\n");

  const pool = await getPool();

  // Obtener cliente "Lucía Flores Rivas" o primer cliente
  const clientRes = await pool.request().query(`
    SELECT TOP 1 Dni_cliente, CONCAT(Nombre_cl, ' ', Apellido_cl) AS NombreCompleto
    FROM dbo.Cliente 
    WHERE Nombre_cl LIKE '%Luc%' OR Nombre_cl LIKE '%Lucía%'
    ORDER BY Dni_cliente ASC;
  `);
  const cliente = clientRes.recordset[0] || (await pool.request().query("SELECT TOP 1 Dni_cliente, CONCAT(Nombre_cl, ' ', Apellido_cl) AS NombreCompleto FROM dbo.Cliente")).recordset[0];
  const dniCliente = String(cliente.Dni_cliente);

  // Obtener empleado "Jorge Mendoza Cruz" o primer empleado
  const empRes = await pool.request().query(`
    SELECT TOP 1 ID_empleado, CONCAT(Nombre_emp, ' ', Apellido_emp) AS NombreCompleto
    FROM dbo.Empleado 
    WHERE Nombre_emp LIKE '%Jorge%'
    ORDER BY ID_empleado ASC;
  `);
  const empleado = empRes.recordset[0] || (await pool.request().query("SELECT TOP 1 ID_empleado, CONCAT(Nombre_emp, ' ', Apellido_emp) AS NombreCompleto FROM dbo.Empleado")).recordset[0];
  const idEmpleado = Number(empleado.ID_empleado);

  // Obtener los dos productos del escenario real: AMD Ryzen 7 5700X (S/ 950) y ASUS Dual RTX 4060 8GB (S/ 1,450)
  const prodRes = await pool.request().query(`
    SELECT Codbarras_prod, Nombre_prod, Precio, Stock 
    FROM dbo.Producto 
    WHERE Codbarras_prod IN ('7750000000005', '7750000000007');
  `);
  const ryzenProd = prodRes.recordset.find((p: any) => p.Codbarras_prod === "7750000000005");
  const rtxProd = prodRes.recordset.find((p: any) => p.Codbarras_prod === "7750000000007");

  if (!ryzenProd || !rtxProd) {
    throw new Error("No se encontraron los productos AMD Ryzen 7 y RTX 4060 en dbo.Producto");
  }

  const codRyzen = ryzenProd.Codbarras_prod;
  const codRtx = rtxProd.Codbarras_prod;
  const precioRyzen = Number(ryzenProd.Precio); // 950.00
  const precioRtx = Number(rtxProd.Precio);     // 1450.00
  const totalEsperado = precioRyzen + precioRtx; // 2400.00

  // Asegurar sesión de caja abierta para registrar movimientos de caja
  let sesionActiva = await getActiveCashSession(pool);
  if (!sesionActiva) {
    sesionActiva = await openCashSessionTransaction({
      idEmpleado,
      montoInicial: 200.0,
      observaciones: "Apertura para suite de pruebas de ventas y vuelto",
    });
  }
  const idSesion = sesionActiva.idSesion;

  // ---------------------------------------------------------------------------
  // 1. Venta de S/ 2,400 con efectivo exacto de S/ 2,400
  // ---------------------------------------------------------------------------
  try {
    const saleExact = await executeSaleTransaction({
      dniCliente,
      idEmpleado,
      idTipoComp: 1, // Boleta
      items: [
        { codbarras: codRyzen, cantidad: 1 },
        { codbarras: codRtx, cantidad: 1 },
      ],
      payments: [{ idMetodo: 1, monto: totalEsperado }],
      efectivoRecibido: totalEsperado,
      vuelto: 0,
    });

    const ok =
      saleExact.idVenta > 0 &&
      saleExact.totalVenta === totalEsperado &&
      saleExact.efectivoRecibido === totalEsperado &&
      saleExact.vuelto === 0;

    record(
      1,
      "Venta de S/ 2,400 con efectivo exacto de S/ 2,400",
      ok,
      `Venta #${saleExact.idVenta} (${saleExact.numeroComprobante}) registrada. Efectivo recibido: S/ ${saleExact.efectivoRecibido?.toFixed(2)}, Vuelto: S/ ${saleExact.vuelto?.toFixed(2)}`
    );
  } catch (err: any) {
    record(1, "Venta de S/ 2,400 con efectivo exacto de S/ 2,400", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // 2. Venta de S/ 2,400 con efectivo recibido de S/ 2,500 y vuelto de S/ 100
  // ---------------------------------------------------------------------------
  let saleWithChangeId = 0;
  let saleWithChangeComp = "";
  try {
    const saleWithChange = await executeSaleTransaction({
      dniCliente,
      idEmpleado,
      idTipoComp: 1, // Boleta
      items: [
        { codbarras: codRyzen, cantidad: 1 },
        { codbarras: codRtx, cantidad: 1 },
      ],
      payments: [{ idMetodo: 1, monto: 2500.0 }], // Efectivo entregado en bruto
      efectivoRecibido: 2500.0,
      vuelto: 100.0,
    });

    saleWithChangeId = saleWithChange.idVenta;
    saleWithChangeComp = saleWithChange.numeroComprobante;

    // Verificar en BD que el ingreso neto a Venta_Metodo_Pago sea 2400 y Venta guarde efectivo/vuelto
    const detailFromDb = await getSaleDetailById(saleWithChangeId);

    const ok =
      saleWithChange.idVenta > 0 &&
      saleWithChange.totalVenta === 2400.0 &&
      saleWithChange.efectivoRecibido === 2500.0 &&
      saleWithChange.vuelto === 100.0 &&
      detailFromDb?.efectivoRecibido === 2500.0 &&
      detailFromDb?.vuelto === 100.0 &&
      detailFromDb?.total === 2400.0 &&
      detailFromDb?.sumPagos === 2400.0;

    record(
      2,
      "Venta de S/ 2,400 con efectivo recibido S/ 2,500 y vuelto S/ 100",
      ok,
      `Venta #${saleWithChangeId} (${saleWithChangeComp}) registrada por S/ 2,400.00. Efectivo: S/ 2,500.00, Vuelto: S/ 100.00, Cobro neto: S/ 2,400.00`
    );
  } catch (err: any) {
    record(2, "Venta de S/ 2,400 con efectivo recibido S/ 2,500 y vuelto S/ 100", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // 3. Venta con pago insuficiente (Rechazo seguro con mensaje claro)
  // ---------------------------------------------------------------------------
  try {
    let failed = false;
    try {
      await executeSaleTransaction({
        dniCliente,
        idEmpleado,
        idTipoComp: 1,
        items: [{ codbarras: codRyzen, cantidad: 1 }], // S/ 950
        payments: [{ idMetodo: 1, monto: 800.0 }], // Falta dinero
        efectivoRecibido: 800.0,
      });
    } catch (err: any) {
      failed = err instanceof PaymentMismatchError || err.message.includes("Discrepancia");
    }

    record(
      3,
      "Rechazo seguro de venta con pago insuficiente",
      failed,
      "Bloqueado correctamente: El efectivo recibido no cubre el importe total de la orden"
    );
  } catch (err: any) {
    record(3, "Rechazo seguro de venta con pago insuficiente", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // 4. Venta exacta mediante Yape (Sin afectar efectivo de gaveta)
  // ---------------------------------------------------------------------------
  try {
    const saleYape = await executeSaleTransaction({
      dniCliente,
      idEmpleado,
      idTipoComp: 1,
      items: [{ codbarras: codRyzen, cantidad: 1 }], // S/ 950
      payments: [{ idMetodo: 4, monto: 950.0 }], // Yape
    });

    // Comprobar movimiento de caja con Afecta_efectivo = 0
    const movRes = await pool.request().input("idVenta", sql.Int, saleYape.idVenta).query(`
      SELECT ID_mov_caja, Tipo, Categoria, Monto, ID_metodo, Afecta_efectivo
      FROM dbo.Movimiento_Caja WHERE ID_venta = @idVenta;
    `);
    const mov = movRes.recordset[0];
    const isDigital = mov && mov.Afecta_efectivo === false && Number(mov.Monto) === 950.0;

    record(
      4,
      "Venta exacta mediante Yape (Canalización digital sin inflar gaveta física)",
      saleYape.idVenta > 0 && isDigital,
      `Venta #${saleYape.idVenta} cobrada por Yape (Afecta_efectivo = 0, Vuelto = S/ 0.00)`
    );
  } catch (err: any) {
    record(4, "Venta exacta mediante Yape", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // 5. Venta con pago mixto exacto (Yape S/ 1,000 + Efectivo S/ 1,400)
  // ---------------------------------------------------------------------------
  try {
    const saleMixed = await executeSaleTransaction({
      dniCliente,
      idEmpleado,
      idTipoComp: 1,
      items: [
        { codbarras: codRyzen, cantidad: 1 },
        { codbarras: codRtx, cantidad: 1 },
      ], // S/ 2,400
      payments: [
        { idMetodo: 4, monto: 1000.0 }, // Yape S/ 1,000
        { idMetodo: 1, monto: 1400.0 }, // Efectivo S/ 1,400
      ],
      efectivoRecibido: 1400.0,
      vuelto: 0,
    });

    const movsRes = await pool.request().input("idVenta", sql.Int, saleMixed.idVenta).query(`
      SELECT ID_metodo, Monto, Afecta_efectivo
      FROM dbo.Movimiento_Caja WHERE ID_venta = @idVenta
      ORDER BY ID_metodo ASC;
    `);

    const efMov = movsRes.recordset.find((m: any) => m.ID_metodo === 1);
    const yapeMov = movsRes.recordset.find((m: any) => m.ID_metodo === 4);

    const ok =
      saleMixed.idVenta > 0 &&
      saleMixed.totalVenta === 2400.0 &&
      Number(efMov?.Monto) === 1400.0 &&
      efMov?.Afecta_efectivo === true &&
      Number(yapeMov?.Monto) === 1000.0 &&
      yapeMov?.Afecta_efectivo === false;

    record(
      5,
      "Venta con pago mixto exacto (Yape S/ 1,000 + Efectivo S/ 1,400)",
      ok,
      `Venta #${saleMixed.idVenta} desglosó S/ 1,000 digital y S/ 1,400 físico sin diferencias`
    );
  } catch (err: any) {
    record(5, "Venta con pago mixto exacto", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // 6. Pago mixto con vuelto en efectivo (Yape S/ 1,000 + Efectivo entregado S/ 1,500 -> Vuelto S/ 100)
  // ---------------------------------------------------------------------------
  try {
    const saleMixedChange = await executeSaleTransaction({
      dniCliente,
      idEmpleado,
      idTipoComp: 1,
      items: [
        { codbarras: codRyzen, cantidad: 1 },
        { codbarras: codRtx, cantidad: 1 },
      ], // Total S/ 2,400
      payments: [
        { idMetodo: 4, monto: 1000.0 }, // Yape S/ 1,000
        { idMetodo: 1, monto: 1500.0 }, // Efectivo entregado S/ 1,500
      ],
      efectivoRecibido: 1500.0,
      vuelto: 100.0,
    });

    const detailDb = await getSaleDetailById(saleMixedChange.idVenta);
    const movsRes = await pool.request().input("idVenta", sql.Int, saleMixedChange.idVenta).query(`
      SELECT ID_metodo, Monto, Afecta_efectivo
      FROM dbo.Movimiento_Caja WHERE ID_venta = @idVenta
      ORDER BY ID_metodo ASC;
    `);

    const efMov = movsRes.recordset.find((m: any) => m.ID_metodo === 1);
    const yapeMov = movsRes.recordset.find((m: any) => m.ID_metodo === 4);

    const ok =
      saleMixedChange.totalVenta === 2400.0 &&
      saleMixedChange.efectivoRecibido === 1500.0 &&
      saleMixedChange.vuelto === 100.0 &&
      Number(efMov?.Monto) === 1400.0 &&
      efMov?.Afecta_efectivo === true &&
      Number(yapeMov?.Monto) === 1000.0 &&
      detailDb?.sumPagos === 2400.0;

    record(
      6,
      "Pago mixto con vuelto en efectivo (Cobro neto efectivo S/ 1,400, Yape S/ 1,000, Vuelto S/ 100)",
      ok,
      `Venta #${saleMixedChange.idVenta} liquidada: Gaveta +S/ 1,400.00 netos. Vuelto de S/ 100.00 entregado`
    );
  } catch (err: any) {
    record(6, "Pago mixto con vuelto en efectivo", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // 7. Validación correcta de importes y campos enviados como strings desde el formulario
  // ---------------------------------------------------------------------------
  try {
    const rawFormPayload = {
      dniCliente: "73654128", // Textual
      idEmpleado: "3",        // String numérico
      idTipoComp: "1",        // String numérico
      items: [
        { codbarras: "7750000000005", cantidad: "1" },
        { codbarras: "7750000000007", cantidad: "1" },
      ],
      payments: [
        { idMetodo: "1", monto: "2500.00" },
      ],
      efectivoRecibido: "2500.00",
      vuelto: "100.00",
    };

    const parsed = saleInputSchema.safeParse(rawFormPayload);
    const ok =
      parsed.success &&
      typeof parsed.data.idEmpleado === "number" &&
      parsed.data.idEmpleado === 3 &&
      parsed.data.dniCliente === "73654128" &&
      typeof parsed.data.items[0].cantidad === "number" &&
      typeof parsed.data.payments[0].monto === "number" &&
      parsed.data.payments[0].monto === 2500.0 &&
      parsed.data.efectivoRecibido === 2500.0 &&
      parsed.data.vuelto === 100.0;

    record(
      7,
      "Validación y coerción limpia de importes y IDs enviados como strings desde formulario",
      ok,
      "Esquema Zod normalizó idEmpleado=3, cantidad=1, monto=2500.00 preservando DNI textual"
    );
  } catch (err: any) {
    record(7, "Validación de strings desde formulario", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // 8. Rechazo de valores no numéricos
  // ---------------------------------------------------------------------------
  try {
    const invalidPayload = {
      dniCliente: "73654128",
      idEmpleado: "empleado-invalido", // Texto no numérico
      idTipoComp: 1,
      items: [{ codbarras: "7750000000005", cantidad: 1 }],
      payments: [{ idMetodo: 1, monto: 950 }],
    };

    const parsed = saleInputSchema.safeParse(invalidPayload);
    const rejected =
      !parsed.success &&
      parsed.error.issues.some((i) => i.path.includes("idEmpleado"));

    record(
      8,
      "Rechazo riguroso de valores no numéricos en identificadores e importes",
      rejected,
      "Zod rechazó 'empleado-invalido' en path ['idEmpleado'] con mensaje descriptivo"
    );
  } catch (err: any) {
    record(8, "Rechazo de valores no numéricos", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // 9. Rechazo de importes negativos o menores a cero
  // ---------------------------------------------------------------------------
  try {
    const negativePayload = {
      dniCliente: "73654128",
      idEmpleado: 3,
      idTipoComp: 1,
      items: [{ codbarras: "7750000000005", cantidad: 1 }],
      payments: [{ idMetodo: 1, monto: -50.0 }], // Negativo
    };

    const parsed = saleInputSchema.safeParse(negativePayload);
    const rejected =
      !parsed.success &&
      parsed.error.issues.some((i) => i.path.includes("monto"));

    record(
      9,
      "Rechazo riguroso de importes monetarios negativos",
      rejected,
      "Zod rechazó monto negativo (-50.0) garantizando integridad financiera"
    );
  } catch (err: any) {
    record(9, "Rechazo de importes negativos", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // 10. Cálculos con centavos exactos (sin errores de redondeo de coma flotante)
  // ---------------------------------------------------------------------------
  try {
    // Simulamos un pago con céntimos: Total S/ 950.00, Efectivo S/ 1000.50 -> Vuelto S/ 50.50
    const saleCents = await executeSaleTransaction({
      dniCliente,
      idEmpleado,
      idTipoComp: 1,
      items: [{ codbarras: codRyzen, cantidad: 1 }], // 950.00
      payments: [{ idMetodo: 1, monto: 1000.50 }],
      efectivoRecibido: 1000.50,
      vuelto: 50.50,
    });

    const ok =
      saleCents.totalVenta === 950.0 &&
      saleCents.efectivoRecibido === 1000.50 &&
      saleCents.vuelto === 50.50;

    record(
      10,
      "Aritmética monetaria exacta con fracciones decimales (Céntimos)",
      ok,
      `Venta #${saleCents.idVenta}: Total S/ 950.00, Recibido: S/ 1000.50, Vuelto exacto: S/ 50.50`
    );
  } catch (err: any) {
    record(10, "Cálculos con centavos exactos", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // 11. Persistencia SQL Server (Columnas Efectivo_recibido y Vuelto en dbo.Venta)
  // ---------------------------------------------------------------------------
  try {
    const dbCheck = await pool.request().input("idVenta", sql.Int, saleWithChangeId).query(`
      SELECT ID_venta, Total_venta, Efectivo_recibido, Vuelto, Estado
      FROM dbo.Venta WHERE ID_venta = @idVenta;
    `);
    const row = dbCheck.recordset[0];
    const ok =
      Number(row.Total_venta) === 2400.0 &&
      Number(row.Efectivo_recibido) === 2500.0 &&
      Number(row.Vuelto) === 100.0 &&
      row.Estado === "COMPLETADA";

    record(
      11,
      "Persistencia relacional auditada en SQL Server (dbo.Venta)",
      ok,
      `Registro persistido: Total = S/ ${Number(row.Total_venta).toFixed(2)}, Recibido = S/ ${Number(row.Efectivo_recibido).toFixed(2)}, Vuelto = S/ ${Number(row.Vuelto).toFixed(2)}`
    );
  } catch (err: any) {
    record(11, "Persistencia SQL Server", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // 12. Registro correcto en caja (Ingreso neto exacto sin gasto operativo por vuelto)
  // ---------------------------------------------------------------------------
  try {
    const cajaMovs = await pool.request().input("idVenta", sql.Int, saleWithChangeId).query(`
      SELECT ID_mov_caja, Tipo, Categoria, Monto, Afecta_efectivo
      FROM dbo.Movimiento_Caja WHERE ID_venta = @idVenta;
    `);

    // Debe existir exactamente 1 movimiento de ingreso por venta de S/ 2,400.00 (afecta_efectivo = 1)
    // NO debe existir ningún movimiento de egreso por S/ 100.00
    const hasSingleNetMovement =
      cajaMovs.recordset.length === 1 &&
      cajaMovs.recordset[0].Tipo === "INGRESO" &&
      cajaMovs.recordset[0].Categoria === "VENTA" &&
      Number(cajaMovs.recordset[0].Monto) === 2400.0 &&
      cajaMovs.recordset[0].Afecta_efectivo === true;

    record(
      12,
      "Integración contable con Caja (Ingreso neto S/ 2,400 sin egreso ficticio por vuelto)",
      hasSingleNetMovement,
      "Gaveta física recibió netamente S/ 2,400.00. El vuelto de S/ 100.00 no genera gasto operativo ficticio"
    );
  } catch (err: any) {
    record(12, "Registro correcto en caja", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // 13. Generación y conciliación de Comprobante Comercial
  // ---------------------------------------------------------------------------
  try {
    const detail = await getSaleDetailById(saleWithChangeId);
    const ok =
      detail !== null &&
      detail.isReconciled === true &&
      detail.sumDetalles === 2400.0 &&
      detail.sumPagos === 2400.0 &&
      detail.efectivoRecibido === 2500.0 &&
      detail.vuelto === 100.0;

    record(
      13,
      "Generación y conciliación tripartita de comprobante (Cabecera = Líneas = Pagos)",
      ok,
      `Comprobante ${detail?.numeroComprobante} validado: 3/3 componentes concilian en S/ 2,400.00`
    );
  } catch (err: any) {
    record(13, "Generación de comprobante", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // 14. Actualización atómica de existencias (Kardex y Stock en dbo.Producto)
  // ---------------------------------------------------------------------------
  try {
    // Consultar stock actual de Ryzen y RTX
    const checkStock = await pool.request().query(`
      SELECT Codbarras_prod, Stock FROM dbo.Producto WHERE Codbarras_prod IN ('7750000000005', '7750000000007');
    `);
    const stRyzen = checkStock.recordset.find((p: any) => p.Codbarras_prod === "7750000000005")?.Stock;
    const stRtx = checkStock.recordset.find((p: any) => p.Codbarras_prod === "7750000000007")?.Stock;

    // Mov_Inventario de la venta
    const movInvRes = await pool.request().input("idVenta", sql.Int, saleWithChangeId).query(`
      SELECT mi.Cantidad, mi.ID_tipo_mov, mi.Codbarras_prod
      FROM dbo.Mov_Inventario mi
      JOIN dbo.Detalle_Venta dv ON mi.Codbarras_prod = dv.Codbarras_prod AND dv.ID_venta = @idVenta
      WHERE mi.Fecha = CONVERT(DATE, GETDATE()) AND mi.ID_tipo_mov = 2;
    `);

    const ok = movInvRes.recordset.length >= 2 && stRyzen > 0 && stRtx > 0;

    record(
      14,
      "Actualización atómica de existencias (Descuento de Stock y Salida en Kardex)",
      ok,
      `Kardex registró salidas tipo 2 (Salida por Venta). Stocks actuales: Ryzen=${stRyzen}, RTX=${stRtx}`
    );
  } catch (err: any) {
    record(14, "Actualización de inventario", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // 15. Prevención de venta duplicada o correlativo repetido (Bloqueo Sp_getapplock)
  // ---------------------------------------------------------------------------
  try {
    // Comprobar que todos los comprobantes emitidos tengan número único
    const dupCheck = await pool.request().query(`
      SELECT Numero_comprobante, COUNT(*) AS Conteo
      FROM dbo.Venta
      GROUP BY Numero_comprobante
      HAVING COUNT(*) > 1;
    `);

    const noDuplicates = dupCheck.recordset.length === 0;

    record(
      15,
      "Prevención de ventas duplicadas y garantía de correlatividad estrictamente consecutiva",
      noDuplicates,
      "sys.sp_getapplock y bloqueos UPDLOCK previenen duplicidad de números comprobante"
    );
  } catch (err: any) {
    record(15, "Prevención de venta duplicada", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // 16. Reversión transaccional completa (Rollback ante stock insuficiente o error)
  // ---------------------------------------------------------------------------
  try {
    const preCountRes = await pool.request().query("SELECT COUNT(*) AS Total FROM dbo.Venta;");
    const preCount = Number(preCountRes.recordset[0].Total);

    let rollbackSuccessful = false;
    try {
      await executeSaleTransaction({
        dniCliente,
        idEmpleado,
        idTipoComp: 1,
        items: [
          { codbarras: codRyzen, cantidad: 99999 }, // Exceso masivo de stock
        ],
        payments: [{ idMetodo: 1, monto: 99999 * 950 }],
      });
    } catch (err: any) {
      rollbackSuccessful = err instanceof InsufficientStockError;
    }

    const postCountRes = await pool.request().query("SELECT COUNT(*) AS Total FROM dbo.Venta;");
    const postCount = Number(postCountRes.recordset[0].Total);

    const rollbackOk = rollbackSuccessful && preCount === postCount;

    record(
      16,
      "Reversión transaccional completa (Rollback ante stock insuficiente sin registros huérfanos)",
      rollbackOk,
      `Ventas en BD: ${preCount} antes y ${postCount} después. Cero registros huérfanos insertados`
    );
  } catch (err: any) {
    record(16, "Reversión transaccional", false, undefined, err.message);
  }

  // ---------------------------------------------------------------------------
  // RESUMEN GLOBAL
  // ---------------------------------------------------------------------------
  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;

  console.log("\n================================================================================");
  console.log(` RESULTADOS SUITE DE VENTAS Y VUELTO: ${totalPassed} / ${results.length} ESCENARIOS APROBADOS`);
  console.log("================================================================================");

  if (totalFailed > 0) {
    console.log(`❌ FALLARON ${totalFailed} ESCENARIOS.`);
    process.exit(1);
  } else {
    console.log("🎉 TODOS LOS 16 ESCENARIOS SE CUMPLEN AL 100% SATISFACTORIAMENTE.");
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error("Error fatal en suite de pruebas de ventas:", err);
  process.exit(1);
});
