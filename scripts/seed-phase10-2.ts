import fs from "fs";
import path from "path";

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

async function seed() {
  assertMutationsAllowed("seed-phase10-2");
  const pool = await getPool();

  console.log("Sembrando datos de prueba Fase 10.2 en", process.env.DB_NAME);

  // 1. Cuentas por pagar a proveedores
  const cpCount = await pool.request().query("SELECT COUNT(*) AS total FROM dbo.Cuenta_Pagar_Proveedor");
  if (cpCount.recordset[0].total === 0) {
    console.log("Insertando cuentas por pagar de prueba...");
    
    // Cuenta 1: Distribuidora Andina de Cómputo (ID 2), Total S/ 2,000, Abono S/ 500, Saldo S/ 1,500
    await pool.request().query(`
      INSERT INTO dbo.Cuenta_Pagar_Proveedor (
        ID_proveedor, Numero_documento, Fecha_emision, Fecha_vencimiento, Condicion_pago,
        Total, Monto_pagado, Saldo_pendiente, Estado, Base_imponible, Impuesto,
        Tiene_credito_fiscal, Concepto, Observaciones
      ) VALUES (
        2, 'F001-000492', '2026-10-15', '2026-11-15', 'CREDITO',
        2000.00, 500.00, 1500.00, 'PARCIALMENTE PAGADA', 1694.92, 305.08,
        1, 'Adquisición de procesadores AMD y tarjetas gráficas RTX',
        'Compra mayorista con condición 30 días. Pago inicial de S/ 500.'
      );
    `);

    const idCuentaRes = await pool.request().query("SELECT @@IDENTITY AS id");
    const idCuenta = idCuentaRes.recordset[0].id;

    // Registrar el abono inicial de S/ 500 en dbo.Pago_Proveedor (Método 4 = Yape, digital)
    await pool.request().query(`
      INSERT INTO dbo.Pago_Proveedor (
        ID_cuenta_pagar, Fecha_pago, Monto, ID_metodo, ID_empleado_responsable,
        Referencia, Observaciones
      ) VALUES (
        ${idCuenta}, '2026-10-15 11:30:00', 500.00, 4, 1,
        'YAPE-OP-829147', 'Pago inicial de garantía mediante Yape comercial'
      );
    `);

    // Cuenta 2: Tecno Import Perú SAC (ID 1), Total S/ 1,250, Pendiente S/ 1,250
    await pool.request().query(`
      INSERT INTO dbo.Cuenta_Pagar_Proveedor (
        ID_proveedor, Numero_documento, Fecha_emision, Fecha_vencimiento, Condicion_pago,
        Total, Monto_pagado, Saldo_pendiente, Estado, Base_imponible, Impuesto,
        Tiene_credito_fiscal, Concepto, Observaciones
      ) VALUES (
        1, 'F002-001204', '2026-10-20', '2026-11-20', 'CREDITO',
        1250.00, 0.00, 1250.00, 'PENDIENTE', 1059.32, 190.68,
        1, 'Lote de memorias RAM DDR5 32GB Kingston Fury',
        'Factura pendiente de pago programada para fin de mes.'
      );
    `);

    // Cuenta 3: Global Hardware SAC (ID 3), Total S/ 800, Totalmente Pagada
    await pool.request().query(`
      INSERT INTO dbo.Cuenta_Pagar_Proveedor (
        ID_proveedor, Numero_documento, Fecha_emision, Fecha_vencimiento, Condicion_pago,
        Total, Monto_pagado, Saldo_pendiente, Estado, Base_imponible, Impuesto,
        Tiene_credito_fiscal, Concepto, Observaciones
      ) VALUES (
        3, 'F003-000891', '2026-10-10', '2026-10-25', 'CONTADO',
        800.00, 800.00, 0.00, 'PAGADA', 677.97, 122.03,
        1, 'Fuentes de poder EVGA 750W Gold',
        'Compra al contado liquidada íntegramente.'
      );
    `);

    console.log("Cuentas por pagar de prueba sembradas exitosamente.");
  } else {
    console.log("Cuentas por pagar ya contienen registros.");
  }

  // 2. Obligaciones y pagos a trabajadores
  const obCount = await pool.request().query("SELECT COUNT(*) AS total FROM dbo.Obligacion_Personal");
  if (obCount.recordset[0].total === 0) {
    console.log("Insertando obligaciones de personal de prueba...");

    // Obligación 1: Juan Pérez (ID 1), Sueldo S/ 1,500, Adelanto S/ 300, Saldo S/ 1,200
    await pool.request().query(`
      INSERT INTO dbo.Obligacion_Personal (
        ID_empleado, Periodo, Concepto, Monto_pactado, Monto_pagado, Saldo_pendiente,
        Estado, ID_empleado_responsable
      ) VALUES (
        1, 'Octubre 2026', 'Remuneración mensual pactada', 1500.00, 300.00, 1200.00,
        'PARCIALMENTE PAGADA', 1
      );
    `);

    const idObRes = await pool.request().query("SELECT @@IDENTITY AS id");
    const idOb = idObRes.recordset[0].id;

    // Vincular o insertar adelanto de S/ 300
    await pool.request().query(`
      INSERT INTO dbo.Pago_Personal (
        ID_empleado, Fecha_pago, Periodo, Concepto, Monto, ID_metodo,
        ID_empleado_responsable, ID_sesion, Observaciones, ID_obligacion, Es_adelanto
      ) VALUES (
        1, '2026-10-18 10:00:00', 'Octubre 2026', 'Adelanto de sueldo quincenal',
        300.00, 1, 1, NULL, 'Adelanto en efectivo autorizado para gastos familiares', ${idOb}, 1
      );
    `);

    // Obligación 2: Carlos Gómez (ID 2), Sueldo S/ 1,400, Saldo S/ 1,400
    await pool.request().query(`
      INSERT INTO dbo.Obligacion_Personal (
        ID_empleado, Periodo, Concepto, Monto_pactado, Monto_pagado, Saldo_pendiente,
        Estado, ID_empleado_responsable
      ) VALUES (
        2, 'Octubre 2026', 'Remuneración mensual pactada', 1400.00, 0.00, 1400.00,
        'PENDIENTE', 1
      );
    `);

    console.log("Obligaciones laborales sembradas exitosamente.");
  } else {
    console.log("Obligaciones de personal ya contienen registros.");
  }

  console.log("Semillero Fase 10.2 completado.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Fallo de semillero:", err);
  process.exit(1);
});
