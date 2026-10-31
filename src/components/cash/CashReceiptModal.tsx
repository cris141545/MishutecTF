"use client";

import { CashClosingSummary } from "@/types/cash-register";
import { Printer, X, CheckCircle2, AlertCircle, AlertTriangle, Building, FileText } from "lucide-react";

interface CashReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: CashClosingSummary;
}

export function CashReceiptModal({ isOpen, onClose, summary }: CashReceiptModalProps) {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const isExact = summary.tipoCuadre === "CUADRE_EXACTO";
  const isShortage = summary.tipoCuadre === "FALTANTE";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in overflow-y-auto print:p-0 print:bg-white">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in zoom-in-95 my-8 print:border-none print:shadow-none print:max-w-none">
        {/* Modal Top Bar (Hidden on print) */}
        <div className="px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-sm">Comprobante de Cierre Diario de Caja</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir Arqueo
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Certificate Content */}
        <div className="p-8 space-y-6 text-slate-900 text-xs font-mono">
          {/* Header */}
          <div className="text-center border-b border-dashed border-slate-300 pb-4">
            <h2 className="text-base font-bold tracking-tight text-slate-950">
              MISHUTEC HARDWARE S.A.C.
            </h2>
            <p className="text-[11px] text-slate-600">RUC: 20608945123 | Régimen MYPE Tributario</p>
            <p className="text-[11px] text-slate-500">Av. Garcilaso de la Vega 1348, Int. 302 - Lima</p>
            <div className="mt-2 inline-block px-3 py-1 rounded bg-slate-100 text-[11px] font-bold uppercase text-slate-800 border border-slate-200">
              ACTA OFICIAL DE ARQUEO Y CIERRE DE CAJA
            </div>
          </div>

          {/* Session Data */}
          <div className="grid grid-cols-2 gap-2 text-[11px] border-b border-dashed border-slate-300 pb-3">
            <div>
              <span className="text-slate-500 block">N° Sesión de Caja:</span>
              <span className="font-bold text-slate-900">#{summary.idSesion}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Fecha y Hora Cierre:</span>
              <span className="font-bold text-slate-900">{summary.fechaCierre}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Aperturado Por:</span>
              <span className="font-semibold text-slate-800">{summary.empleadoApertura}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Cerrado / Certificado Por:</span>
              <span className="font-semibold text-slate-800">{summary.empleadoCierre}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Fecha de Apertura:</span>
              <span className="text-slate-700">{summary.fechaApertura}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Transacciones de Venta:</span>
              <span className="font-bold text-slate-800">{summary.ventasCount} comprobantes</span>
            </div>
          </div>

          {/* Sales Breakdown by Payment Method */}
          <div className="space-y-1.5 border-b border-dashed border-slate-300 pb-3">
            <div className="font-bold text-[11px] uppercase text-slate-700 mb-1">
              Desglose de Ventas por Medio de Pago
            </div>
            {summary.desgloseMetodosPago.map((m) => (
              <div key={m.idMetodo} className="flex justify-between items-center text-[11px]">
                <span className="text-slate-600">
                  {m.nombreMetodo} {m.esEfectivoFisico ? "(Caja Física)" : "(Digital / Banco)"}:
                </span>
                <span className="font-semibold text-slate-900">S/ {m.totalCobrado.toFixed(2)}</span>
              </div>
            ))}
            <div className="pt-1.5 border-t border-slate-200 flex justify-between font-bold text-xs">
              <span>Total Ventas Brutas:</span>
              <span>S/ {summary.ventasBrutas.toFixed(2)}</span>
            </div>
            {summary.devoluciones > 0 && (
              <div className="flex justify-between text-rose-600 text-[11px]">
                <span>(-) Devoluciones / Notas de Crédito:</span>
                <span>-S/ {summary.devoluciones.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Physical Cash Movements */}
          <div className="space-y-1.5 border-b border-dashed border-slate-300 pb-3">
            <div className="font-bold text-[11px] uppercase text-slate-700 mb-1">
              Conciliación Estricta de Efectivo Físico
            </div>
            <div className="flex justify-between text-slate-600">
              <span>(+) Monto Inicial (Fondo de caja):</span>
              <span className="font-semibold">S/ {summary.montoInicial.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>(+) Cobros de Ventas en Efectivo:</span>
              <span className="font-semibold text-emerald-700">
                +S/ {(summary.desgloseMetodosPago.find((p) => p.esEfectivoFisico)?.totalCobrado || 0).toFixed(2)}
              </span>
            </div>
            {summary.otrosIngresosEfectivo > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>(+) Otros Ingresos Manuales:</span>
                <span className="font-semibold text-emerald-700">+S/ {summary.otrosIngresosEfectivo.toFixed(2)}</span>
              </div>
            )}
            {summary.gastosEfectivo > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>(-) Gastos Operativos en Efectivo:</span>
                <span className="font-semibold text-rose-700">-S/ {summary.gastosEfectivo.toFixed(2)}</span>
              </div>
            )}
            {summary.pagosPersonalEfectivo > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>(-) Pagos al Personal en Efectivo:</span>
                <span className="font-semibold text-purple-700">-S/ {summary.pagosPersonalEfectivo.toFixed(2)}</span>
              </div>
            )}
            {summary.retirosEfectivo > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>(-) Retiros Parciales de Seguridad:</span>
                <span className="font-semibold text-rose-700">-S/ {summary.retirosEfectivo.toFixed(2)}</span>
              </div>
            )}
            {summary.reembolsosEfectivo > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>(-) Reembolsos por Devolución:</span>
                <span className="font-semibold text-rose-700">-S/ {summary.reembolsosEfectivo.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Arqueo Comparison & Result */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-300 space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-900">
              <span>Efectivo Físico Esperado:</span>
              <span>S/ {summary.efectivoEsperado.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs font-bold text-cyan-800">
              <span>Efectivo Físico Contado Real:</span>
              <span>S/ {summary.efectivoContado.toFixed(2)}</span>
            </div>
            <div className="pt-2 border-t border-slate-300 flex justify-between items-center text-xs">
              <span className="font-bold">Resultado de Conciliación:</span>
              {isExact ? (
                <span className="font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded border border-emerald-300">
                  CUADRE EXACTO (S/ 0.00)
                </span>
              ) : isShortage ? (
                <span className="font-bold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded border border-rose-300">
                  FALTANTE: S/ {summary.diferencia.toFixed(2)}
                </span>
              ) : (
                <span className="font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded border border-amber-300">
                  SOBRANTE: +S/ {summary.diferencia.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {summary.observacionesCierre && (
            <div className="text-[11px] text-slate-600 italic">
              <strong>Observaciones:</strong> {summary.observacionesCierre}
            </div>
          )}

          {/* Signature lines */}
          <div className="pt-10 grid grid-cols-2 gap-8 text-center text-[10px] text-slate-500">
            <div className="border-t border-slate-400 pt-1">
              <span className="font-bold block text-slate-800">{summary.empleadoCierre}</span>
              <span>Cajero Responsable</span>
            </div>
            <div className="border-t border-slate-400 pt-1">
              <span className="font-bold block text-slate-800">Administración MISHUTEC</span>
              <span>Supervisor / Auditoría</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
