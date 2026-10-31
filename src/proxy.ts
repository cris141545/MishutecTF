import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * Proxy oficial de Next.js 16 para control perimetral de acceso (H-02).
 * Reemplaza la convención deprecada de middleware.ts.
 * Protege exclusivamente los endpoints HTTP reales del sistema.
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  const session = await verifySessionToken(token);
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", request.nextUrl.pathname + request.nextUrl.search);
    const response = NextResponse.redirect(loginUrl);
    // Limpiar cookie corrupta o expirada
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }

  return NextResponse.next();
}

/**
 * Matcher de URLs reales de la aplicación.
 * IMPORTANTE: Nunca utilizar /(admin)/ ya que los route groups no forman parte del path HTTP.
 * Rutas excluidas de este matcher (estáticos, /login, /api/auth, /api/products) no son interceptadas.
 */
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/productos/:path*",
    "/inventario/:path*",
    "/ventas/:path*",
    "/clientes/:path*",
    "/proveedores/:path*",
    "/empleados/:path*",
    "/devoluciones/:path*",
    "/reportes/:path*",
    "/usuarios/:path*",
    "/diagnostico/:path*",
  ],
};
