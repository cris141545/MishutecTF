import { Metadata } from "next";
import { getInventoryPageData } from "@/lib/services/inventory.service";
import { getSession } from "@/lib/auth/session";
import { isMutationAllowed } from "@/lib/db-guard";
import { InventoryDashboardClient } from "@/components/inventory/InventoryDashboardClient";
import { getCashDashboardData } from "@/lib/services/cash.service";
import { Boxes, ShieldAlert, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Control de Inventario y Kardex | MISHUTEC",
  description:
    "Gestión física de existencias, trazabilidad de movimientos y Kardex con bloqueo atómico en SQL Server.",
};

export const dynamic = "force-dynamic";

interface InventarioPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function InventarioPage({
  searchParams,
}: InventarioPageProps) {
  const resolvedSearchParams = await searchParams;

  const [inventoryData, session, cashData] = await Promise.all([
    getInventoryPageData({
      query: typeof resolvedSearchParams.query === "string" ? resolvedSearchParams.query : undefined,
      categoria: typeof resolvedSearchParams.categoria === "string" ? resolvedSearchParams.categoria : undefined,
      estado: typeof resolvedSearchParams.estado === "string" ? resolvedSearchParams.estado : undefined,
      kardexProducto: typeof resolvedSearchParams.kardexProducto === "string" ? resolvedSearchParams.kardexProducto : undefined,
      kardexTipo: typeof resolvedSearchParams.kardexTipo === "string" ? resolvedSearchParams.kardexTipo : undefined,
      fechaInicio: typeof resolvedSearchParams.fechaInicio === "string" ? resolvedSearchParams.fechaInicio : undefined,
      fechaFin: typeof resolvedSearchParams.fechaFin === "string" ? resolvedSearchParams.fechaFin : undefined,
    }),
    getSession(),
    getCashDashboardData(),
  ]);

  const mutationGuard = isMutationAllowed();

  return (
    <div className="space-y-6">
      {/* Encabezado del Módulo de Inventario */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-xs">
              <Boxes className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                Control de Inventario y Kardex
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Supervisión física de almacén, movimientos transaccionales y balance determinístico en SQL Server.
              </p>
            </div>
          </div>
        </div>

        {/* Indicadores de Entorno y Fase */}
        <div className="flex flex-wrap items-center gap-2">
          {!mutationGuard.allowed ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-medium text-amber-800 shadow-xs">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
              <span>BD Académica Protegida ({mutationGuard.dbName})</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-medium text-emerald-800 shadow-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>Entorno Aceptación Activo ({mutationGuard.dbName})</span>
            </div>
          )}

          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-700 shadow-xs">
            <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
            <span>Fase 4: Inventario y Kardex</span>
          </div>
        </div>
      </div>

      {/* Componente Cliente con KPIs, Tabla de Existencias, Kardex y Modales CRUD */}
      <InventoryDashboardClient
        stats={inventoryData.stats}
        products={inventoryData.products}
        kardex={inventoryData.kardex}
        metadata={inventoryData.metadata}
        suppliers={cashData.suppliers}
        employees={cashData.employees}
        paymentMethods={cashData.paymentMethods}
        idSesion={cashData.activeSession?.idSesion ?? null}
        efectivoDisponible={cashData.activeSession?.efectivoEsperadoActual ?? 0}
        isAuthenticated={!!session}
        username={session?.username ?? null}
      />
    </div>
  );
}
