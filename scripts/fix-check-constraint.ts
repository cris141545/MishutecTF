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

async function fixConstraint() {
  assertMutationsAllowed("fix-check-constraint");
  const pool = await getPool();

  console.log("Actualizando CHK_MovCaja_Categoria en", process.env.DB_NAME);

  // 1. Dropear constraint si existe
  await pool.request().query(`
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CHK_MovCaja_Categoria')
    BEGIN
      ALTER TABLE dbo.Movimiento_Caja DROP CONSTRAINT CHK_MovCaja_Categoria;
      PRINT 'Constraint eliminado.';
    END
  `);

  // 2. Recrear constraint con PAGO_PERSONAL
  await pool.request().query(`
    ALTER TABLE dbo.Movimiento_Caja ADD CONSTRAINT CHK_MovCaja_Categoria CHECK (
      Categoria IN ('VENTA', 'INGRESO_MANUAL', 'GASTO_OPERATIVO', 'PAGO_PERSONAL', 'RETIRO', 'REEMBOLSO_DEVOLUCION', 'AJUSTE')
    );
    PRINT 'Constraint recreado con PAGO_PERSONAL.';
  `);

  console.log("Actualización de constraint completada con éxito.");
  process.exit(0);
}

fixConstraint().catch((err) => {
  console.error("Error al actualizar constraint:", err);
  process.exit(1);
});
