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

async function main() {
  const pool = await getPool();

  console.log("=== 1. Configuracion_Tributaria ===");
  try {
    const configRes = await pool.request().query("SELECT * FROM dbo.Configuracion_Tributaria");
    console.table(configRes.recordset);
  } catch (e: any) {
    console.log("Error querying Configuracion_Tributaria:", e.message);
  }

  console.log("\n=== 2. Proveedor ===");
  const provRes = await pool.request().query("SELECT TOP 5 * FROM dbo.Proveedor");
  console.table(provRes.recordset);

  console.log("\n=== 3. Suministra ===");
  const sumRes = await pool.request().query("SELECT TOP 5 * FROM dbo.Suministra");
  console.table(sumRes.recordset);

  console.log("\n=== 4. Empleado ===");
  const empRes = await pool.request().query("SELECT * FROM dbo.Empleado");
  console.table(empRes.recordset);

  console.log("\n=== 5. Pago_Personal ===");
  const pagoRes = await pool.request().query("SELECT TOP 5 * FROM dbo.Pago_Personal");
  console.table(pagoRes.recordset);

  console.log("\n=== 6. Movimiento_Caja (Columns) ===");
  const movCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Movimiento_Caja'
  `);
  console.table(movCols.recordset);

  console.log("\n=== 7. Metodo_Pago ===");
  const metodosRes = await pool.request().query("SELECT * FROM dbo.Metodo_Pago");
  console.table(metodosRes.recordset);
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
