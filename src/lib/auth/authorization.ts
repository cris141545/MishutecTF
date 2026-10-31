import "server-only";

import { getPool, sql } from "@/lib/db";
import {
  AuthConfigurationError,
  getSession,
  UnauthorizedError,
  type SessionPayload,
} from "./session";

export async function getActiveSession(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session) return null;

  if (session.userId === null) {
    const bootstrapUsername = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
    if (session.role !== "admin" || session.username !== bootstrapUsername) return null;
    return session;
  }

  const pool = await getPool();
  const result = await pool
    .request()
    .input("userId", sql.Int, session.userId)
    .query("SELECT Role FROM dbo.AppUser WHERE UserId = @userId AND IsActive = 1");
  const user = result.recordset[0];

  if (!user || (user.Role !== "admin" && user.Role !== "user")) {
    return null;
  }

  return { ...session, role: user.Role };
}

export async function requireAdminSession(): Promise<SessionPayload> {
  if (!process.env.ADMIN_PASSWORD_HASH || !process.env.AUTH_SESSION_SECRET) {
    throw new AuthConfigurationError(
      "La autenticación no está configurada en las variables de entorno. Acceso denegado."
    );
  }

  const session = await getActiveSession();
  if (!session) {
    throw new UnauthorizedError("Operación rechazada: requiere una sesión activa.");
  }

  return session;
}

export async function requireAdminUserSession(): Promise<SessionPayload> {
  const session = await requireAdminSession();
  if (session.role !== "admin") {
    throw new UnauthorizedError("Operación rechazada: requiere permisos de administrador.");
  }

  return session;
}
