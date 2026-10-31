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

  console.log("=== 1. TABLAS EXISTENTES ===");
  const tablesRes = await pool.request().query(`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME;
  `);
  console.log("Tablas:", tablesRes.recordset.map((r: any) => r.TABLE_NAME));

  console.log("\n=== 2. COLUMNAS DE dbo.Venta ===");
  const ventaCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Venta';
  `);
  console.table(ventaCols.recordset);

  console.log("\n=== 3. REVISAR SI EXISTE Estado_Venta O SIMILAR ===");
  const estadoVentaRes = await pool.request().query(`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%Venta%' OR TABLE_NAME LIKE '%Estado%';
  `);
  console.log("Tablas con Venta/Estado:", estadoVentaRes.recordset.map((r: any) => r.TABLE_NAME));

  console.log("\n=== 4. COLUMNAS DE dbo.Empleado ===");
  const empCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Empleado';
  `);
  console.table(empCols.recordset);

  console.log("\n=== 5. VALORES ACTUALES EN VENTA ===");
  const sampleVentas = await pool.request().query(`
    SELECT TOP 5 * FROM dbo.Venta ORDER BY ID_venta DESC;
  `);
  console.table(sampleVentas.recordset);

  console.log("\n=== 6. SCRIPTS EN LA CARPETA scripts/ ===");
  const scriptsDir = path.resolve(process.cwd(), "scripts");
  if (fs.existsSync(scriptsDir)) {
    console.log("Scripts encontrados:", fs.readdirSync(scriptsDir));
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error en auditoría:", err);
  process.exit(1);
});
