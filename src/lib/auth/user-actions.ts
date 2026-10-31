"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPool, sql } from "@/lib/db";
import { hashPassword } from "./password";
import { requireAdminUserSession } from "./authorization";

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "El usuario debe tener al menos 3 caracteres.")
    .max(50, "El usuario no puede exceder 50 caracteres.")
    .regex(/^[a-z0-9._-]+$/, "Usa solo letras, números, punto, guion o guion bajo."),
  password: z
    .string()
    .min(12, "La contraseña debe tener al menos 12 caracteres.")
    .max(128, "La contraseña no puede exceder 128 caracteres."),
});

export interface ManagedUser {
  userId: number;
  username: string;
  isActive: boolean;
  createdAt: string;
}

export interface UserActionState {
  success: boolean;
  message?: string;
  error?: string;
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  await requireAdminUserSession();
  const pool = await getPool();
  const result = await pool
    .request()
    .query(
      "SELECT UserId, Username, IsActive, CreatedAt FROM dbo.AppUser WHERE Role = 'user' ORDER BY Username"
    );

  return result.recordset.map((user) => ({
    userId: Number(user.UserId),
    username: String(user.Username),
    isActive: Boolean(user.IsActive),
    createdAt: new Date(user.CreatedAt).toISOString(),
  }));
}

export async function createManagedUser(
  _previousState: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  await requireAdminUserSession();

  const parsed = createUserSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const { username, password } = parsed.data;
  const bootstrapUsername = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
  if (username === bootstrapUsername) {
    return { success: false, error: "Ese nombre de usuario está reservado para el administrador." };
  }

  const pool = await getPool();
  const existing = await pool
    .request()
    .input("username", sql.NVarChar(50), username)
    .query("SELECT UserId FROM dbo.AppUser WHERE Username = @username");
  if (existing.recordset.length > 0) {
    return { success: false, error: "Ya existe una cuenta con ese nombre de usuario." };
  }

  try {
    await pool
      .request()
      .input("username", sql.NVarChar(50), username)
      .input("passwordHash", sql.VarChar(200), hashPassword(password))
      .query(
        "INSERT INTO dbo.AppUser (Username, PasswordHash, Role, IsActive) VALUES (@username, @passwordHash, 'user', 1)"
      );
  } catch (error) {
    if (
      error instanceof sql.RequestError &&
      (error.number === 2601 || error.number === 2627)
    ) {
      return { success: false, error: "Ya existe una cuenta con ese nombre de usuario." };
    }
    console.error("No se pudo crear la cuenta de usuario.", error);
    return {
      success: false,
      error: "No se pudo crear la cuenta. Revisa la conexión con la base de datos.",
    };
  }

  revalidatePath("/usuarios");
  return { success: true, message: `Cuenta creada para ${username}.` };
}

export async function setManagedUserActive(
  userId: number,
  isActive: boolean
): Promise<UserActionState> {
  await requireAdminUserSession();
  if (!Number.isSafeInteger(userId) || userId <= 0 || typeof isActive !== "boolean") {
    return { success: false, error: "El usuario seleccionado no es válido." };
  }

  const pool = await getPool();
  const result = await pool
    .request()
    .input("userId", sql.Int, userId)
    .input("isActive", sql.Bit, isActive)
    .query(
      "UPDATE dbo.AppUser SET IsActive = @isActive WHERE UserId = @userId AND Role = 'user'"
    );

  if (result.rowsAffected[0] === 0) {
    return { success: false, error: "No se encontró la cuenta o no se pudo actualizar." };
  }

  revalidatePath("/usuarios");
  return {
    success: true,
    message: isActive ? "Cuenta reactivada." : "Cuenta desactivada.",
  };
}
