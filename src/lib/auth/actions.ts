"use server";

import { verifyPassword } from "./password";
import { createSession, destroySession } from "./session";
import { revalidatePath } from "next/cache";
import { getPool, sql } from "@/lib/db";
import { getActiveSession } from "./authorization";

export interface AuthActionResult {
  success: boolean;
  error?: string;
  user?: { username: string; role: string };
}

/**
 * Server Action para iniciar sesión administrativa.
 */
export async function loginAdminAction(
  _prevState: AuthActionResult,
  formData: FormData
): Promise<AuthActionResult> {
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  const configuredUser = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
  const configuredHash = process.env.ADMIN_PASSWORD_HASH;

  if (!configuredHash) {
    return {
      success: false,
      error: "La autenticación no está configurada en el servidor. Acceso bloqueado.",
    };
  }

  let authenticatedUser: { username: string; userId: number | null; role: "admin" | "user" } | null =
    null;

  if (username === configuredUser && verifyPassword(password, configuredHash)) {
    authenticatedUser = { username: configuredUser, userId: null, role: "admin" };
  } else if (username !== configuredUser) {
    let user: {
      UserId: number;
      Username: string;
      PasswordHash: string;
      Role: string;
    } | undefined;
    try {
      const pool = await getPool();
      const result = await pool
        .request()
        .input("username", sql.NVarChar(50), username)
        .query(
          "SELECT UserId, Username, PasswordHash, Role FROM dbo.AppUser WHERE Username = @username AND IsActive = 1"
        );
      user = result.recordset[0];
    } catch (error) {
      console.error("No se pudo consultar la cuenta de usuario.", error);
      return {
        success: false,
        error: "No se pudo verificar la cuenta. Revisa la conexión y la migración de usuarios.",
      };
    }

    if (
      user &&
      (user.Role === "admin" || user.Role === "user") &&
      verifyPassword(password, String(user.PasswordHash))
    ) {
      authenticatedUser = {
        username: String(user.Username),
        userId: Number(user.UserId),
        role: user.Role,
      };
    }
  }

  if (!authenticatedUser) {
    return {
      success: false,
      error: "Usuario o contraseña incorrectos.",
    };
  }

  await createSession(authenticatedUser);
  revalidatePath("/productos");

  return {
    success: true,
    user: { username: authenticatedUser.username, role: authenticatedUser.role },
  };
}

/**
 * Server Action para cerrar sesión administrativa.
 */
export async function logoutAdminAction(): Promise<AuthActionResult> {
  await destroySession();
  revalidatePath("/productos");
  return { success: true };
}

/**
 * Consulta rápida del estado de autenticación.
 */
export async function getSessionStatusAction() {
  const session = await getActiveSession();
  return {
    isAuthenticated: !!session,
    user: session ? { username: session.username, role: session.role } : null,
  };
}
