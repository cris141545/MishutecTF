"use client";

import { useState, useTransition } from "react";
import {
  CompleteReportsPageData,
  ReportFilterParams,
} from "@/types/reports";
import { ReportFilterBar } from "./ReportFilterBar";
import { ReportKpiCards } from "./ReportKpiCards";
import { SalesAnalyticsTab } from "./SalesAnalyticsTab";
import { InventoryAnalyticsTab } from "./InventoryAnalyticsTab";
import { ReturnsAnalyticsTab } from "./ReturnsAnalyticsTab";
import { SuppliersAnalyticsTab } from "./SuppliersAnalyticsTab";
import { FinancialAnalyticsTab } from "./FinancialAnalyticsTab";
import { TaxAnalyticsTab } from "./TaxAnalyticsTab";
import {
  getFilteredReportsAction,
  exportReportCsvAction,
} from "@/lib/actions/report.actions";
import { ReportCsvType } from "@/lib/services/report.service";
import {
  BarChart3,
  TrendingUp,
  Package,
  RotateCcw,
  Truck,
  LayoutDashboard,
  Database,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  DollarSign,
} from "lucide-react";

interface ReportsDashboardClientProps {
  initialData: CompleteReportsPageData;
  dbName: string;
  isAcademic: boolean;
  isAuthenticated: boolean;
}

type TabKey =
  | "general"
  | "finanzas"
  | "tributario"
  | "ventas"
  | "inventario"
  | "devoluciones"
  | "proveedores";

export function ReportsDashboardClient({
  initialData,
  dbName,
  isAcademic,
  isAuthenticated,
}: ReportsDashboardClientProps) {
  const [data, setData] = useState<CompleteReportsPageData>(initialData);
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleFilterChange = (newFilters: ReportFilterParams) => {
    startTransition(async () => {
      setErrorMsg(null);
      const res = await getFilteredReportsAction(newFilters);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setErrorMsg(res.error || "No se pudieron aplicar los filtros.");
      }
    });
  };

  const handleExportCsv = async (type: ReportCsvType) => {
    setIsExporting(true);
    try {
      const res = await exportReportCsvAction(type, data.filtrosAplicados);
      if (res.success && res.data) {
        // Generar descarga directa en el navegador
        const blob = new Blob([res.data.content], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", res.data.filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showToast(`Reporte CSV exportado exitosamente: ${res.data.filename}`);
      } else {
        setErrorMsg(res.error || "Error al exportar archivo CSV");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Ocurrió un error al preparar la exportación CSV");
    } finally {
      setIsExporting(false);
    }
  };

  const tabs: Array<{ key: TabKey; label: string; icon: any }> = [
    { key: "general", label: "Visión General", icon: LayoutDashboard },
    { key: "finanzas", label: "Finanzas & Márgenes", icon: DollarSign },
    { key: "tributario", label: "SUNAT (Formulario 621)", icon: FileSpreadsheet },
    { key: "ventas", label: "Ventas & Clientes", icon: TrendingUp },
    { key: "inventario", label: "Inventario & Kardex", icon: Package },
    { key: "devoluciones", label: "Garantías & RMA", icon: RotateCcw },
    { key: "proveedores", label: "Proveedores & Suministro", icon: Truck },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg border border-emerald-600 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-200" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Error Banner */}
      {errorMsg && (
        <div className="flex items-center justify-between p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-500 hover:text-rose-700 font-bold ml-2"
          >
            &times;
          </button>
        </div>
      )}

      {/* 1. CABECERA PRINCIPAL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
              <BarChart3 className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Centro de Analítica Comercial y Reportes
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Inteligencia de negocios, trazabilidad de ingresos, flujo de existencias y calidad postventa
          </p>
        </div>

        {/* Database Badge */}
        <div className="flex items-center gap-2">
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${
              isAcademic
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-emerald-50 border-emerald-200 text-emerald-800"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Base: {dbName}</span>
            {isAcademic && <span className="font-bold text-[10px] uppercase">(Solo Lectura)</span>}
          </div>
        </div>
      </div>

      {/* 2. BARRA DE FILTROS MULTICRITERIO Y ACCIONES */}
      <ReportFilterBar
        filters={data.filtrosAplicados}
        metadata={data.metadata}
        onFilterChange={handleFilterChange}
        onExportCsv={handleExportCsv}
        isExporting={isExporting}
        isLoading={isPending}
      />

      {/* 3. RESUMEN EJECUTIVO DE KPIS */}
      <ReportKpiCards kpis={data.kpis} />

      {/* 4. PESTAÑAS DE NAVEGACIÓN TEMÁTICA */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-2 sm:space-x-4 overflow-x-auto pb-1" aria-label="Pestañas de Reportes">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 py-2.5 px-3.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-400"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* 5. CONTENIDO DE LA PESTAÑA ACTIVA */}
      <div className="mt-4">
        {activeTab === "general" && (
          <div className="space-y-6">
            <FinancialAnalyticsTab
              finanzas={data.finanzas}
              topProductos={data.topProductos}
            />
            <SalesAnalyticsTab
              ventasPorFecha={data.ventasPorFecha}
              ventasPorComprobante={data.ventasPorComprobante}
              ventasPorMetodoPago={data.ventasPorMetodoPago}
              topProductos={data.topProductos}
              ventasPorCategoria={data.ventasPorCategoria}
              ventasPorEmpleado={data.ventasPorEmpleado}
              clientesAnalytics={data.clientesAnalytics}
            />
          </div>
        )}

        {activeTab === "finanzas" && (
          <FinancialAnalyticsTab
            finanzas={data.finanzas}
            topProductos={data.topProductos}
          />
        )}

        {activeTab === "tributario" && (
          <TaxAnalyticsTab tributario={data.tributario} />
        )}

        {activeTab === "ventas" && (
          <SalesAnalyticsTab
            ventasPorFecha={data.ventasPorFecha}
            ventasPorComprobante={data.ventasPorComprobante}
            ventasPorMetodoPago={data.ventasPorMetodoPago}
            topProductos={data.topProductos}
            ventasPorCategoria={data.ventasPorCategoria}
            ventasPorEmpleado={data.ventasPorEmpleado}
            clientesAnalytics={data.clientesAnalytics}
          />
        )}

        {activeTab === "inventario" && (
          <InventoryAnalyticsTab inventario={data.inventarioAnalytics} />
        )}

        {activeTab === "devoluciones" && (
          <ReturnsAnalyticsTab devoluciones={data.devolucionesAnalytics} />
        )}

        {activeTab === "proveedores" && (
          <SuppliersAnalyticsTab proveedores={data.proveedoresAnalytics} />
        )}
      </div>
    </div>
  );
}
