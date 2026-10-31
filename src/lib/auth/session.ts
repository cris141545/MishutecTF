import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "mishutec_session_v2";
const SESSION_DURATION_SECONDS = 8 * 60 * 60; // 8 horas

export interface SessionPayload {
  username: string;
  userId: number | null;
  role: "admin" | "user";
  issuedAt: number;
}

export class UnauthorizedError extends Error {
  constructor(message = "Sesión no autorizada o expirada") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class AuthConfigurationError extends Error {
  constructor(message = "Autenticación no configurada en las variables de entorno") {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new AuthConfigurationError(
      "AUTH_SESSION_SECRET no está configurada o tiene menos de 32 caracteres."
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Crea y firma un JWT de sesión para el usuario autenticado.
 */
export async function createSession(
  user: Pick<SessionPayload, "username" | "userId" | "role">
): Promise<string> {
  const secretKey = getSecretKey();
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(secretKey);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });

  return token;
}

/**
 * Verifica un token JWT de sesión y extrae su payload.
 * Compatible con Node.js y Edge runtime (utilizado por src/proxy.ts).
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    if (!token) return null;
    const secretKey = getSecretKey();
    const { payload } = await jwtVerify(token, secretKey);
    const userId = payload.userId;
    if (
      typeof payload.username !== "string" ||
      (payload.role !== "admin" && payload.role !== "user") ||
      (userId !== null &&
        (typeof userId !== "number" || !Number.isSafeInteger(userId) || userId <= 0))
    ) {
      return null;
    }

    return {
      username: payload.username,
      userId,
      role: payload.role,
      issuedAt: Number(payload.iat),
    };
  } catch {
    return null;
  }
}

/**
 * Obtiene la sesión actual a partir de las cookies HTTP.
 */
export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    return await verifySessionToken(token);
  } catch {
    // Si el token es inválido o expiró, retornamos null
    return null;
  }
}

/**
 * Cierra la sesión activa eliminando la cookie de sesión.
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
