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

async function runMigration() {
  assertMutationsAllowed("execute-phase10-2-migration");
  console.log("Iniciando migración Fase 10.2 (Efectivo Recibido y Vuelto)...");
  console.log("Base de datos destino:", process.env.DB_NAME || "MishutecT2_Aceptacion");

  const pool = await getPool();
  const sqlPath = path.resolve(process.cwd(), "scripts/migrations/phase10_2_vuelto.sql");
  const rawSql = fs.readFileSync(sqlPath, "utf-8");

  // Dividir por GO o ejecutar bloques limpios
  const statements = rawSql
    .split(/^\s*GO\s*$/gim)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    if (stmt.toLowerCase().startsWith("use ")) continue;
    await pool.request().query(stmt);
  }

  console.log("✅ Migración Fase 10.2 aplicada exitosamente.");

  // Verificar columnas creadas
  const checkRes = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Venta' AND COLUMN_NAME IN ('Efectivo_recibido', 'Vuelto')
  `);
  console.log("Columnas verificadas en dbo.Venta:", checkRes.recordset);
}

runMigration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error en migración:", err);
    process.exit(1);
  });
