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
  assertMutationsAllowed("execute-phase10-2-cuentas-pagar");
  const pool = await getPool();

  console.log("Aplicando migración Fase 10.2 (Cuentas por Pagar y Personal) a la base:", process.env.DB_NAME);

  const sqlPath = path.resolve(process.cwd(), "scripts/migrations/phase10_2_cuentas_pagar.sql");
  const sqlContent = fs.readFileSync(sqlPath, "utf-8");

  // Dividir por bloques GO
  const batches = sqlContent
    .split(/\bGO\b/i)
    .map((b) => b.trim())
    .filter((b) => b.length > 0 && !b.startsWith("USE "));

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    try {
      await pool.request().query(batch);
      console.log(`Lote ${i + 1}/${batches.length} ejecutado correctamente.`);
    } catch (err: any) {
      console.error(`Error en lote ${i + 1}:`, err.message);
      throw err;
    }
  }

  console.log("Migración Fase 10.2 (Cuentas por Pagar y Personal) completada con éxito.");
  process.exit(0);
}

runMigration().catch((err) => {
  console.error("Fallo de migración:", err);
  process.exit(1);
});
