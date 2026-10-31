"use client";

import { useMemo } from "react";
import { FinancialAnalytics, TopSellingProduct } from "@/types/reports";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  DollarSign,
  TrendingUp,
  Percent,
  Receipt,
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  Package,
} from "lucide-react";

interface FinancialAnalyticsTabProps {
  finanzas: FinancialAnalytics;
  topProductos: TopSellingProduct[];
}

export function FinancialAnalyticsTab({
  finanzas,
  topProductos,
}: FinancialAnalyticsTabProps) {
  // Datos para gráfico de cascada / desglose financiero
  const financialFlowData = useMemo(() => {
    return [
      { name: "Ventas Netas", amount: finanzas.ventasNetasSinImpuestos, color: "#06b6d4" },
      { name: "Costo Ventas (COGS)", amount: finanzas.costoVentas, color: "#f43f5e" },
      { name: "Ganancia Bruta", amount: finanzas.gananciaBruta, color: "#10b981" },
      { name: "Gastos Caja", amount: finanzas.gastosOperativos, color: "#f59e0b" },
      { name: "Utilidad Operativa", amount: finanzas.utilidadOperativa, color: "#3b82f6" },
    ];
  }, [finanzas]);

  return (
    <div className="space-y-6">
      {/* KPI Cards de Finanzas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Ventas Netas */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Ventas Netas (Sin Impuestos)
            </span>
            <div className="p-2 rounded-xl bg-cyan-50 text-cyan-600">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-bold text-slate-900">
              S/ {finanzas.ventasNetasSinImpuestos.toFixed(2)}
            </span>
            <span className="text-xs text-slate-500 font-medium">Base Imponible</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Total facturado (con IGV): S/ {finanzas.ventasNetasTotal.toFixed(2)}
          </p>
        </div>

        {/* Costo de Ventas (COGS) */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">
              Costo de Ventas (COGS)
            </span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-bold text-rose-600">
              S/ {finanzas.costoVentas.toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-rose-600">dbo.Suministra</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Costo real de compra abastecido por proveedores
          </p>
        </div>

        {/* Ganancia Bruta y Margen % */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
              Ganancia Bruta & Margen
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-bold text-emerald-600">
              S/ {finanzas.gananciaBruta.toFixed(2)}
            </span>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-lg">
              {finanzas.margenBrutoPorcentaje.toFixed(1)}% Margen
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Margen bruto comercial sobre ventas netas
          </p>
        </div>

        {/* Utilidad Operativa Estimada */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-4 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-cyan-200 uppercase tracking-wider">
              Utilidad Operativa
            </span>
            <div className="p-2 rounded-xl bg-white/10 text-cyan-400">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-white">
              S/ {finanzas.utilidadOperativa.toFixed(2)}
            </span>
            <span className="text-xs font-bold text-cyan-300 bg-white/10 px-2 py-0.5 rounded-lg">
              {finanzas.margenNetoPorcentaje.toFixed(1)}% Operativo
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-300">
            Deduciendo gastos de caja: S/ {finanzas.gastosOperativos.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Gráfico y Desglose Financiero */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico de barras de flujo */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Estructura de Ingresos, Costos y Rentabilidad (PEN)
            </h3>
            <p className="text-xs text-slate-500">
              Comparativo directo entre ventas netas, costos de adquisición de proveedores, gastos operativos y utilidad final
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financialFlowData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickFormatter={(val) => `S/${val}`}
                />
                <Tooltip
                  formatter={(value: any) => [`S/ ${Number(value).toFixed(2)}`, "Monto"]}
                  contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "12px" }}
                />
                <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                  {financialFlowData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Resumen de Flujo de Efectivo en Caja */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Conciliación y Flujo de Caja
            </h3>
            <p className="text-xs text-slate-500">
              Movimientos reales de dinero físico en gaveta
            </p>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-slate-600">Devoluciones / Reembolsos:</span>
              <span className="font-semibold text-rose-600">-S/ {finanzas.devolucionesMonto.toFixed(2)}</span>
            </div>
            <div className="flex justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-slate-600">Gastos Operativos Registrados:</span>
              <span className="font-semibold text-amber-700">-S/ {finanzas.gastosOperativos.toFixed(2)}</span>
            </div>
            <div className="flex justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-slate-600">Retiros de Seguridad (Caja):</span>
              <span className="font-semibold text-slate-700">S/ {finanzas.retirosEfectivo.toFixed(2)}</span>
            </div>
            <div className="flex justify-between p-3 rounded-xl bg-cyan-50/70 border border-cyan-200 text-cyan-900 font-bold">
              <span>Flujo Neto en Efectivo (Caja):</span>
              <span className="text-sm">S/ {finanzas.flujoEfectivoNeto.toFixed(2)}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              Los costos unitarios están calculados a partir de los precios de compra históricos registrados en <code>dbo.Suministra</code>, garantizando rentabilidad real sin inventar márgenes.
            </span>
          </div>
        </div>
      </div>

      {/* Tabla de Rentabilidad por Producto */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">
            Rentabilidad y Margen Real por Producto Vendido
          </h3>
          <p className="text-xs text-slate-500">
            Comparación de Costo de Compra Proveedor (dbo.Suministra) vs Precio de Venta y Margen de Utilidad
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Producto / Código</th>
                <th className="px-4 py-3">Categoría / Marca</th>
                <th className="px-4 py-3 text-right">Costo Unit. (Suministra)</th>
                <th className="px-4 py-3 text-right">Precio Venta</th>
                <th className="px-4 py-3 text-center">Unidades</th>
                <th className="px-4 py-3 text-right">Facturación</th>
                <th className="px-4 py-3 text-right">Ganancia Bruta</th>
                <th className="px-4 py-3 text-center">Margen %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topProductos.map((p) => (
                <tr key={p.codbarras} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <div>{p.nombreProd}</div>
                    <span className="font-mono text-[10px] text-slate-400">{p.codbarras}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{p.categoria}</div>
                    <span className="text-[10px] text-slate-400">{p.marca}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-rose-600 font-semibold">
                    S/ {p.costoUnitario.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-900 font-semibold">
                    S/ {p.precioUnitario.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-slate-800">
                    {p.unidadesVendidas} unid.
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-900 font-bold">
                    S/ {p.totalFacturado.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-600 font-bold">
                    +S/ {p.gananciaGenerada.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        p.margenPorcentaje >= 40
                          ? "bg-emerald-100 text-emerald-800"
                          : p.margenPorcentaje >= 20
                          ? "bg-blue-100 text-blue-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {p.margenPorcentaje.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
