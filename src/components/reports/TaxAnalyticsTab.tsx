"use client";

import { TaxSummarySunat } from "@/types/reports";
import {
  FileText,
  Building,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  Percent,
  CheckCircle2,
  DollarSign,
  ArrowRight,
} from "lucide-react";

interface TaxAnalyticsTabProps {
  tributario: TaxSummarySunat;
}

export function TaxAnalyticsTab({ tributario }: TaxAnalyticsTabProps) {
  const saldoAPagar = tributario.saldoReferencialIgvMes > 0;

  return (
    <div className="space-y-6">
      {/* Tarjeta de Ficha de la Empresa y Régimen */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-500/20">
            <Building className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                {tributario.razonSocial}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                {tributario.regimenTributario}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              RUC: <strong className="font-mono text-slate-800">{tributario.ruc}</strong> • Período Fiscal:{" "}
              <strong className="font-mono text-slate-800">{tributario.periodoFiscal}</strong> • Estado: Habido / Activo
            </p>
          </div>
        </div>

        {/* Badge Tasa 2026 */}
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200">
          <Percent className="w-4 h-4 text-cyan-600" />
          <div className="text-right">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block">
              Tasa Conjunta 2026
            </span>
            <span className="text-xs font-bold text-slate-900">
              {tributario.tasaIgvPorcentaje}% IGV + {tributario.tasaIpmPorcentaje}% IPM = {tributario.tasaTotalPorcentaje}% Total
            </span>
          </div>
        </div>
      </div>

      {/* Grid de Liquidación del Débito y Crédito Fiscal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel Izquierdo: Débito Fiscal (Ventas y Notas de Crédito) */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                1. Débito Fiscal (Ventas del Período)
              </h3>
              <p className="text-xs text-slate-500">
                Impuesto general cobrado en facturas y boletas emitidas
              </p>
            </div>
            <span className="text-xs font-bold text-cyan-700 bg-cyan-50 px-2.5 py-1 rounded-lg border border-cyan-200">
              Ventas Gravadas
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center p-2.5 rounded-xl bg-slate-50">
              <span className="text-slate-600">Total Ventas Facturadas (con IGV):</span>
              <span className="font-bold text-slate-900 font-mono">
                S/ {tributario.ventasGravadasTotal.toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-slate-50">
              <span className="text-slate-600">Base Imponible de Ventas (Total / 1.18):</span>
              <span className="font-semibold text-slate-800 font-mono">
                S/ {tributario.baseImponibleVentas.toFixed(2)}
              </span>
            </div>

            {/* Desglose IGV 15.5% + IPM 2.5% */}
            <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100 space-y-1.5">
              <span className="text-[10px] font-bold text-blue-900 uppercase tracking-wider block">
                Desglose Tributario de Ventas (18.0%)
              </span>
              <div className="flex justify-between text-slate-700">
                <span>• Componente IGV (15.5%):</span>
                <span className="font-semibold font-mono">S/ {tributario.desgloseIgv.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>• Componente IPM (2.5%):</span>
                <span className="font-semibold font-mono">S/ {tributario.desgloseIpm.toFixed(2)}</span>
              </div>
              <div className="pt-1 border-t border-blue-200/60 flex justify-between font-bold text-slate-900">
                <span>Total Débito Fiscal Bruto:</span>
                <span className="font-mono">S/ {tributario.debitoFiscalIgvTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Ajuste por Notas de Crédito */}
            <div className="flex justify-between items-center p-2.5 rounded-xl bg-purple-50 text-purple-900 border border-purple-200">
              <span>(-) Deducción por Notas de Crédito emitidas:</span>
              <span className="font-bold font-mono">
                -S/ {tributario.ajustesNotasCredito.toFixed(2)}
              </span>
            </div>

            {/* Débito Fiscal Neto */}
            <div className="flex justify-between items-center p-3 rounded-xl bg-slate-900 text-white font-bold">
              <span>Débito Fiscal Neto del Mes:</span>
              <span className="text-sm font-mono text-cyan-300">
                S/ {tributario.debitoFiscalNeto.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Panel Derecho: Crédito Fiscal (Compras y Saldo Mensual) */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                2. Crédito Fiscal & Liquidación SUNAT
              </h3>
              <p className="text-xs text-slate-500">
                Deducción por adquisiciones a proveedores y determinación final
              </p>
            </div>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              Formulario 621
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center p-2.5 rounded-xl bg-slate-50">
              <span className="text-slate-600">Total Compras Registradas (dbo.Suministra):</span>
              <span className="font-bold text-slate-900 font-mono">
                S/ {tributario.comprasRegistradasTotal.toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-slate-50">
              <span className="text-slate-600">Base Imponible Compras:</span>
              <span className="font-semibold text-slate-800 font-mono">
                S/ {tributario.baseImponibleCompras.toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between items-center p-2.5 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200">
              <span>Crédito Fiscal Sustentado (18%):</span>
              <span className="font-bold font-mono">
                S/ {tributario.creditoFiscalSustentado.toFixed(2)}
              </span>
            </div>

            {/* Saldo a Pagar o a Favor */}
            <div
              className={`p-3.5 rounded-xl border space-y-1 ${
                saldoAPagar
                  ? "bg-rose-50 border-rose-300 text-rose-950"
                  : "bg-emerald-50 border-emerald-300 text-emerald-950"
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-bold text-xs uppercase tracking-wider">
                  {saldoAPagar ? "Saldo Referencial IGV a Pagar" : "Saldo a Favor del Contribuyente"}
                </span>
                <span className="text-base font-extrabold font-mono">
                  S/ {Math.abs(tributario.saldoReferencialIgvMes).toFixed(2)}
                </span>
              </div>
              <p className="text-[11px] opacity-80">
                {saldoAPagar
                  ? "El Débito Fiscal de ventas supera el Crédito Fiscal de compras."
                  : "El Crédito Fiscal supera al Débito Fiscal, quedando como saldo arrastrable."}
              </p>
            </div>

            {/* Pago a cuenta del Impuesto a la Renta */}
            <div className="flex justify-between items-center p-3 rounded-xl bg-slate-100 text-slate-800 border border-slate-200">
              <div>
                <span className="font-semibold block">Pago a Cuenta Renta Mensual (1.0% MYPE):</span>
                <span className="text-[10px] text-slate-500">1% sobre la Base Imponible de ventas</span>
              </div>
              <span className="font-bold font-mono text-sm text-slate-900">
                S/ {tributario.pagoCuentaRentaEstimado.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Nota Legal y Aclaración Académica */}
      <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="font-bold">Aviso de Simulación y Control Tributario Referencial</h4>
          <p className="leading-relaxed text-amber-800">
            {tributario.advertenciaLegal} Este panel calcula el comportamiento mensual bajo la estructura del Formulario Virtual 621 de SUNAT con fines de auditoría académica y control interno en la base <strong>MishutecT2_Aceptacion</strong>. Las Notas de Crédito registradas son simulaciones referenciales autorizadas para fines pedagógicos universitarios.
          </p>
        </div>
      </div>
    </div>
  );
}
