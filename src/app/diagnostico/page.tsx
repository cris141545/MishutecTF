import { testDbDiagnostics, getPool } from "@/lib/db";
import { getActiveSession } from "@/lib/auth/authorization";
import { redirect } from "next/navigation";
import {
  Database,
  Server,
  UserCheck,
  Package,
  ShoppingCart,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

export const runtime = "nodejs";

interface ProductRow {
  Codbarras_prod: string;
  Nombre_prod: string;
  Precio: number;
  Stock: number;
  Garantia_meses: number;
  Estado: string;
  Categoria: string;
  Marca: string;
}

async function getProductsPreview(): Promise<ProductRow[]> {
  try {
    const pool = await getPool();
    const result = await pool.request().query<ProductRow>(`
      SELECT 
        p.Codbarras_prod,
        p.Nombre_prod,
        p.Precio,
        p.Stock,
        p.Garantia_meses,
        e.Estado,
        c.Nombre_cat AS Categoria,
        m.Nombre_marca AS Marca
      FROM dbo.Producto p
      JOIN dbo.Estado_Prod e ON p.ID_estado_prod = e.ID_estado_prod
      JOIN dbo.Categoria c ON p.ID_categoria = c.ID_categoria
      JOIN dbo.Marca m ON p.ID_marca = m.ID_marca
      ORDER BY p.Codbarras_prod ASC
    `);
    return result.recordset;
  } catch {
    return [];
  }
}

export default async function DiagnosticoPage() {
  const session = await getActiveSession();
  if (!session) {
    redirect("/login?from=/diagnostico");
  }

  const diagnostics = await testDbDiagnostics();
  const products = diagnostics.success ? await getProductsPreview() : [];

  const isValidDb = diagnostics.success;
  const isAllValid = diagnostics.success;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-6 md:p-10 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Cabecera Principal */}
        <header className="border-b border-slate-200 pb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-xs">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  MISHUTEC &bull; Diagnóstico Técnico
                </h1>
                <p className="text-sm text-slate-500">
                  Panel de Verificación de Conexión a SQL Server
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors shadow-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Ir al Dashboard
            </Link>
            <span
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border ${
                isAllValid
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-rose-50 text-rose-700 border-rose-200"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isAllValid ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                }`}
              />
              {isAllValid ? "Conexión Validada" : "Error de Conexión"}
            </span>
          </div>
        </header>

        {/* Tarjetas de Métricas Clave */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <span>Base de Datos</span>
              <Database className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {diagnostics.activeDatabase}
              </span>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                {isValidDb ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 inline" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-rose-600 inline" />
                )}
                {isValidDb ? "Base verificada y conectada" : "Base no coincide"}
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <span>Principal SQL Server</span>
              <UserCheck className="h-4 w-4 text-blue-600" />
            </div>
            <div className="mt-3">
              <span className="text-base font-bold tracking-tight text-slate-900 truncate block">
                {diagnostics.databaseUser}
              </span>
              <p className="text-xs text-slate-500 mt-1">
                {diagnostics.authMode === "windows" ? "Windows Auth" : "SQL Auth"}
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <span>dbo.Producto</span>
              <Package className="h-4 w-4 text-amber-600" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {diagnostics.productCount}
              </span>
              <span className="text-xs text-slate-500 font-medium">registros activos</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <span>dbo.Venta</span>
              <ShoppingCart className="h-4 w-4 text-blue-600" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {diagnostics.saleCount}
              </span>
              <span className="text-xs text-slate-500 font-medium">ventas registradas</span>
            </div>
          </div>
        </div>

        {/* Tabla de Productos Existentes */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Layers className="h-4 w-4 text-blue-600" />
              <span>Productos en dbo.Producto ({products.length} registros)</span>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              Latencia: {diagnostics.latencyMs} ms
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase text-[11px] font-semibold tracking-wider">
                  <th className="py-2.5 px-3">Código</th>
                  <th className="py-2.5 px-3">Nombre</th>
                  <th className="py-2.5 px-3">Categoría</th>
                  <th className="py-2.5 px-3">Marca</th>
                  <th className="py-2.5 px-3 text-right">Precio (S/.)</th>
                  <th className="py-2.5 px-3 text-center">Stock</th>
                  <th className="py-2.5 px-3 text-center">Garantía</th>
                  <th className="py-2.5 px-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {products.map((p) => (
                  <tr key={p.Codbarras_prod} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-slate-500">{p.Codbarras_prod}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-900">{p.Nombre_prod}</td>
                    <td className="py-2.5 px-3 text-slate-600">{p.Categoria}</td>
                    <td className="py-2.5 px-3 text-slate-600">{p.Marca}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-600">
                      S/. {Number(p.Precio).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900">
                      {p.Stock}
                    </td>
                    <td className="py-2.5 px-3 text-center text-slate-500">
                      {p.Garantia_meses} m
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                          p.Estado === "Disponible"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {p.Estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
