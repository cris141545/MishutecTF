import fs from "fs";
import path from "path";
import sql from "mssql/msnodesqlv8";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

loadEnvLocal();

async function runMigration() {
  console.log("=== EJECUTANDO MIGRACIÓN SQL PARA CAJA, DEVOLUCIONES Y FINANZAS ===");
  console.log(`Base de datos objetivo: ${process.env.DB_NAME}`);
  console.log(`Servidor: ${process.env.DB_SERVER}`);

  if (process.env.DB_NAME?.toLowerCase() === "mishutect2") {
    throw new Error("ERROR CRÍTICO: No está permitido ejecutar migraciones destructivas o estructurales sobre la base académica MishutecT2.");
  }

  const pool = await new sql.ConnectionPool({
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    driver: "msnodesqlv8",
    connectionString: `Driver={${process.env.DB_DRIVER}};Server=${process.env.DB_SERVER};Database=${process.env.DB_NAME};Trusted_Connection=Yes;TrustServerCertificate=${process.env.DB_TRUST_SERVER_CERTIFICATE};`,
    options: { trustedConnection: true },
  } as any).connect();

  try {
    const migrationFile = path.resolve(process.cwd(), "scripts/migrations/01_caja_devoluciones_finanzas.sql");
    const sqlContent = fs.readFileSync(migrationFile, "utf-8");

    // Ejecutar el script bloque por bloque o completo
    const request = pool.request();
    await request.batch(sqlContent);

    console.log("✓ Migración ejecutada exitosamente.");

    // Verificar las tablas creadas
    const tablesCheck = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME IN ('Sesion_Caja', 'Movimiento_Caja', 'Nota_Credito', 'Reembolso_Devolucion', 'Configuracion_Tributaria')
    `);
    console.log("Tablas verificadas en base de datos:");
    console.table(tablesCheck.recordset);
  } finally {
    await pool.close();
  }
}

runMigration().catch((e) => {
  console.error("Error en migración:", e);
  process.exit(1);
});
