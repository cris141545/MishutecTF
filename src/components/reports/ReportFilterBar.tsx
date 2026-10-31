"use client";

import { useState } from "react";
import {
  ReportFilterParams,
  ReportsFilterMetadata,
} from "@/types/reports";
import { ReportCsvType } from "@/lib/services/report.service";
import {
  Filter,
  RotateCcw,
  Download,
  Calendar,
  Building2,
  Tag,
  UserCheck,
  CreditCard,
  Receipt,
  FileSpreadsheet,
} from "lucide-react";

interface ReportFilterBarProps {
  filters: ReportFilterParams;
  metadata: ReportsFilterMetadata;
  onFilterChange: (newFilters: ReportFilterParams) => void;
  onExportCsv: (type: ReportCsvType) => void;
  isExporting: boolean;
  isLoading: boolean;
}

export function ReportFilterBar({
  filters,
  metadata,
  onFilterChange,
  onExportCsv,
  isExporting,
  isLoading,
}: ReportFilterBarProps) {
  const [showExportModal, setShowExportModal] = useState(false);

  // Contar filtros activos
  let activeCount = 0;
  if (filters.fechaDesde || filters.fechaHasta || (filters.preset && filters.preset !== "all")) activeCount++;
  if (filters.idCategoria) activeCount++;
  if (filters.idMarca) activeCount++;
  if (filters.idEmpleado) activeCount++;
  if (filters.idTipoComp) activeCount++;
  if (filters.idMetodoPago) activeCount++;

  const handlePresetClick = (preset: ReportFilterParams["preset"]) => {
    onFilterChange({
      ...filters,
      preset,
      fechaDesde: undefined,
      fechaHasta: undefined,
    });
  };

  const handleReset = () => {
    onFilterChange({ preset: "all" });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-4 mb-6 transition-all">
      {/* Encabezado y presets rápidos */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
            <Filter className="w-4 h-4" />
          </div>
          <span className="text-sm font-semibold text-slate-800">
            Filtros Analíticos Multicriterio
          </span>
          {activeCount > 0 && (
            <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">
              {activeCount} activo{activeCount > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Presets de fecha */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500 mr-1 hidden sm:inline">Período:</span>
          {(
            [
              { id: "all", label: "Histórico Total" },
              { id: "today", label: "Hoy" },
              { id: "last7", label: "Últimos 7 días" },
              { id: "last30", label: "Últimos 30 días" },
              { id: "thisMonth", label: "Este mes" },
            ] as const
          ).map((p) => {
            const isActive =
              (filters.preset === p.id) ||
              (!filters.preset && p.id === "all" && !filters.fechaDesde && !filters.fechaHasta);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePresetClick(p.id)}
                className={`text-xs font-medium px-3 py-1 rounded-md transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Controles de filtrado detallados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-3">
        {/* Fecha Desde */}
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            Fecha Desde
          </label>
          <input
            type="date"
            value={filters.fechaDesde || ""}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                fechaDesde: e.target.value || undefined,
                preset: undefined,
              })
            }
            className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          />
        </div>

        {/* Fecha Hasta */}
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            Fecha Hasta
          </label>
          <input
            type="date"
            value={filters.fechaHasta || ""}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                fechaHasta: e.target.value || undefined,
                preset: undefined,
              })
            }
            className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          />
        </div>

        {/* Categoría */}
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
            <Tag className="w-3.5 h-3.5 text-slate-400" />
            Categoría
          </label>
          <select
            value={filters.idCategoria || ""}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                idCategoria: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="">Todas las categorías</option>
            {metadata.categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Marca */}
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            Marca
          </label>
          <select
            value={filters.idMarca || ""}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                idMarca: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="">Todas las marcas</option>
            {metadata.marcas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Empleado */}
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
            <UserCheck className="w-3.5 h-3.5 text-slate-400" />
            Empleado
          </label>
          <select
            value={filters.idEmpleado || ""}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                idEmpleado: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="">Todos los empleados</option>
            {metadata.empleados.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Tipo Comprobante & Método */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
              <Receipt className="w-3.5 h-3.5 text-slate-400" />
              Comprobante
            </label>
            <select
              value={filters.idTipoComp || ""}
              onChange={(e) =>
                onFilterChange({
                  ...filters,
                  idTipoComp: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              <option value="">Todos</option>
              {metadata.tiposComprobante.map((tc) => (
                <option key={tc.id} value={tc.id}>
                  {tc.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
              <CreditCard className="w-3.5 h-3.5 text-slate-400" />
              Pago
            </label>
            <select
              value={filters.idMetodoPago || ""}
              onChange={(e) =>
                onFilterChange({
                  ...filters,
                  idMetodoPago: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              className="w-full text-xs px-2 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              <option value="">Todos</option>
              {metadata.metodosPago.map((mp) => (
                <option key={mp.id} value={mp.id}>
                  {mp.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Botones de acción inferior */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 mt-3 border-t border-slate-100">
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-red-600 transition-colors font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Limpiar filtros
            </button>
          )}
          {isLoading && (
            <span className="text-xs text-blue-600 animate-pulse font-medium">
              Actualizando analítica...
            </span>
          )}
        </div>

        {/* Botón de Exportación CSV con Menú */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowExportModal(!showExportModal)}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 active:scale-95 transition-all shadow-xs disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Exportar CSV</span>
            <Download className="w-3.5 h-3.5 ml-0.5" />
          </button>

          {showExportModal && (
            <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-30 p-2 text-xs">
              <div className="font-semibold text-slate-800 px-2 py-1 border-b border-slate-100 mb-1 flex items-center justify-between">
                <span>Seleccionar Tipo de Reporte</span>
                <span className="text-[10px] text-emerald-600 font-mono">Excel UTF-8</span>
              </div>

              {[
                { type: "kpis" as const, label: "Resumen Ejecutivo de KPIs", desc: "Métricas consolidadas" },
                { type: "finanzas" as const, label: "Finanzas & Rentabilidad Real", desc: "COGS, margen bruto y utilidad" },
                { type: "tributario" as const, label: "Resumen SUNAT (Formulario 621)", desc: "15.5% IGV + 2.5% IPM y crédito fiscal" },
                { type: "ventas" as const, label: "Evolución de Ventas", desc: "Ventas por fecha y acumulados" },
                { type: "productos" as const, label: "Top Productos Vendidos", desc: "Cantidades, facturación y stock" },
                { type: "inventario" as const, label: "Inventario & Valoración", desc: "Categorías, stock bajo y retail" },
                { type: "clientes" as const, label: "Comportamiento de Clientes", desc: "Gasto, recurrencia y Ley 29733" },
                { type: "proveedores" as const, label: "Proveedores & Suministro", desc: "Dispersión de costos" },
                { type: "devoluciones" as const, label: "Devoluciones RMA", desc: "Estados, motivos e impactos" },
              ].map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => {
                    setShowExportModal(false);
                    onExportCsv(opt.type);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 transition-colors flex flex-col"
                >
                  <span className="font-medium text-xs">{opt.label}</span>
                  <span className="text-[10px] text-slate-400">{opt.desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
