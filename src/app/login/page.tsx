import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActiveSession } from "@/lib/auth/authorization";
import { sanitizeRedirectUrl } from "@/lib/auth/redirect";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Iniciar sesión | MISHUTEC",
  description: "Acceso seguro al sistema comercial Mishutec.",
};

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await getActiveSession();
  const params = await searchParams;
  const fromUrl = sanitizeRedirectUrl(params?.from);

  if (session) {
    redirect(fromUrl);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center p-4 selection:bg-blue-500/20 selection:text-blue-700">
      <div className="w-full max-w-md space-y-6">
        {/* Encabezado Institucional */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 mb-2 shadow-xs">
            <span className="text-2xl font-black font-mono tracking-tighter">M</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Mishutec Commercial POS
          </h1>
          <p className="text-xs text-slate-500">
            Módulo de Administración y Control Comercial Seguro
          </p>
        </div>

        {/* Formulario de Login */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xl">
          <LoginForm fromUrl={fromUrl} />
        </div>

        {/* Footer Técnico */}
        <div className="text-center text-[11px] text-slate-500 space-y-1">
          <div>Acceso individual &bull; SQL Server &bull; Next.js</div>
        </div>
      </div>
    </main>
  );
}
