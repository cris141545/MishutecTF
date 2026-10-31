import sql from "mssql";
import { z } from "zod";

// Validación de variables de entorno mediante Zod
const dbEnvSchema = z.object({
  DB_SERVER: z.string().min(1, "DB_SERVER no puede estar vacío"),
  DB_NAME: z.string().min(1, "DB_NAME no puede estar vacío"),
  DB_AUTH_MODE: z.enum(["windows", "sql"]).default("windows"),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_DRIVER: z.string().default("ODBC Driver 18 for SQL Server"),
  DB_TRUST_SERVER_CERTIFICATE: z.enum(["yes", "no"]).optional(),
});

/**
 * Obtiene y valida la configuración de base de datos desde las variables de entorno.
 */
export function getDbConfig() {
  const parsedConfig = dbEnvSchema.parse({
    DB_SERVER: process.env.DB_SERVER,
    DB_NAME: process.env.DB_NAME,
    DB_AUTH_MODE: process.env.DB_AUTH_MODE,
    DB_USER: process.env.DB_USER,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_DRIVER: process.env.DB_DRIVER,
    DB_TRUST_SERVER_CERTIFICATE: process.env.DB_TRUST_SERVER_CERTIFICATE,
  });

  if (parsedConfig.DB_AUTH_MODE === "sql" && (!parsedConfig.DB_USER || !parsedConfig.DB_PASSWORD)) {
    throw new Error("DB_USER y DB_PASSWORD son obligatorios cuando DB_AUTH_MODE=sql.");
  }

  return {
    ...parsedConfig,
    DB_TRUST_SERVER_CERTIFICATE:
      parsedConfig.DB_TRUST_SERVER_CERTIFICATE ??
      (parsedConfig.DB_AUTH_MODE === "windows" ? "yes" : "no"),
  };
}

/**
 * Construye la cadena de conexión ODBC para msnodesqlv8 con autenticación integrada.
 */
export function buildConnectionString(): string {
  const cfg = getDbConfig();
  if (cfg.DB_AUTH_MODE !== "windows") {
    throw new Error("La cadena ODBC solo está disponible con DB_AUTH_MODE=windows.");
  }
  return `Driver={${cfg.DB_DRIVER}};Server=${cfg.DB_SERVER};Database=${cfg.DB_NAME};Trusted_Connection=Yes;TrustServerCertificate=${cfg.DB_TRUST_SERVER_CERTIFICATE};`;
}

export interface Msnodesqlv8Config extends sql.config {
  connectionString?: string;
  driver?: string;
}

// Declaración global para mantener un único pool durante el Hot Module Replacement (HMR) en desarrollo
declare global {
  // eslint-disable-next-line no-var
  var _sqlPool: sql.ConnectionPool | undefined;
  // eslint-disable-next-line no-var
  var _sqlPoolPromise: Promise<sql.ConnectionPool> | undefined;
}

/**
 * Obtiene el pool de conexiones reutilizable (patrón Singleton).
 * Garantiza que en entorno de desarrollo no se creen conexiones huérfanas por HMR.
 */
export async function getPool(): Promise<sql.ConnectionPool> {
  // Prevenir ejecución accidental en entornos que no sean Node.js
  if (typeof window !== "undefined") {
    throw new Error("getPool solo puede ejecutarse en el entorno Node.js del servidor.");
  }

  if (global._sqlPool && global._sqlPool.connected) {
    return global._sqlPool;
  }

  if (!global._sqlPoolPromise) {
    const cfg = getDbConfig();
    const poolOptions = {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    };
    let pool: sql.ConnectionPool;
    if (cfg.DB_AUTH_MODE === "windows") {
      const { default: windowsSql } = await import("mssql/msnodesqlv8");
      pool = new windowsSql.ConnectionPool({
            server: cfg.DB_SERVER,
            database: cfg.DB_NAME,
            driver: "msnodesqlv8",
            connectionString: buildConnectionString(),
            options: {
              trustedConnection: true,
            },
            pool: poolOptions,
          } as Msnodesqlv8Config);
    } else {
      pool = new sql.ConnectionPool({
            server: cfg.DB_SERVER,
            database: cfg.DB_NAME,
            user: cfg.DB_USER,
            password: cfg.DB_PASSWORD,
            options: {
              encrypt: true,
              trustServerCertificate: cfg.DB_TRUST_SERVER_CERTIFICATE === "yes",
            },
            pool: poolOptions,
          });
    }

    global._sqlPoolPromise = pool
      .connect()
      .then((connectedPool) => {
        global._sqlPool = connectedPool;
        return connectedPool;
      })
      .catch((error: unknown) => {
        global._sqlPoolPromise = undefined;
        global._sqlPool = undefined;
        throw error;
      });
  }

  if (!global._sqlPoolPromise) {
    throw new Error("No se pudo inicializar el pool de conexiones SQL Server.");
  }

  return global._sqlPoolPromise;
}

/**
 * Interfaz con el resultado de la prueba de diagnóstico de conexión.
 */
export interface DbDiagnosticResult {
  success: boolean;
  activeDatabase: string;
  databaseUser: string;
  productCount: number;
  saleCount: number;
  timestamp: string;
  latencyMs: number;
  driver: string;
  authMode: "windows" | "sql";
  server: string;
  error?: string;
}

/**
 * Ejecuta una consulta de diagnóstico de solo lectura sobre la base de datos activa.
 * Verifica DB activa, principal de SQL Server, total de productos y total de ventas.
 */
export async function testDbDiagnostics(): Promise<DbDiagnosticResult> {
  const startTime = Date.now();
  const cfg = getDbConfig();

  try {
    const pool = await getPool();
    const query = `
      SELECT 
        DB_NAME() AS [active_db],
        SUSER_SNAME() AS [database_user],
        (SELECT COUNT(*) FROM dbo.Producto) AS [prod_count],
        (SELECT COUNT(*) FROM dbo.Venta) AS [venta_count]
    `;

    const result = await pool.request().query(query);
    const row = result.recordset[0];
    const latencyMs = Date.now() - startTime;

    return {
      success: true,
      activeDatabase: row.active_db,
      databaseUser: row.database_user,
      productCount: Number(row.prod_count),
      saleCount: Number(row.venta_count),
      timestamp: new Date().toISOString(),
      latencyMs,
      driver: cfg.DB_AUTH_MODE === "windows" ? cfg.DB_DRIVER : "Tedious",
      authMode: cfg.DB_AUTH_MODE,
      server: cfg.DB_SERVER,
    };
  } catch (error: unknown) {
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      activeDatabase: cfg.DB_NAME,
      databaseUser: "Desconocido",
      productCount: 0,
      saleCount: 0,
      timestamp: new Date().toISOString(),
      latencyMs,
      driver: cfg.DB_AUTH_MODE === "windows" ? cfg.DB_DRIVER : "Tedious",
      authMode: cfg.DB_AUTH_MODE,
      server: cfg.DB_SERVER,
      error:
        error instanceof Error
          ? error.message
          : "Error desconocido al conectar a SQL Server",
    };
  }
}

/**
 * Cierra el pool de conexiones de forma controlada.
 */
export async function closePool(): Promise<void> {
  if (global._sqlPool) {
    await global._sqlPool.close();
    global._sqlPool = undefined;
    global._sqlPoolPromise = undefined;
  }
}

export { sql };
export default getPool;
