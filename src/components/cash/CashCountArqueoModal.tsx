"use client";

import { useState, useMemo } from "react";
import { Calculator, X, CheckCircle2, AlertTriangle, AlertCircle, ArrowRight } from "lucide-react";

interface CashCountArqueoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceedToClose: (countedAmount: number) => void;
  efectivoEsperado: number;
}

interface Denomination {
  val: number;
  label: string;
  isCoin?: boolean;
}

const DENOMINATIONS: Denomination[] = [
  { val: 200, label: "Billete S/ 200" },
  { val: 100, label: "Billete S/ 100" },
  { val: 50, label: "Billete S/ 50" },
  { val: 20, label: "Billete S/ 20" },
  { val: 10, label: "Billete S/ 10" },
  { val: 5, label: "Moneda S/ 5.00", isCoin: true },
  { val: 2, label: "Moneda S/ 2.00", isCoin: true },
  { val: 1, label: "Moneda S/ 1.00", isCoin: true },
  { val: 0.5, label: "Moneda S/ 0.50", isCoin: true },
  { val: 0.2, label: "Moneda S/ 0.20", isCoin: true },
  { val: 0.1, label: "Moneda S/ 0.10", isCoin: true },
];

export function CashCountArqueoModal({
  isOpen,
  onClose,
  onProceedToClose,
  efectivoEsperado,
}: CashCountArqueoModalProps) {
  const [counts, setCounts] = useState<Record<number, number>>({
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0,
    2: 0,
    1: 0,
    0.5: 0,
    0.2: 0,
    0.1: 0,
  });

  const [manualOverride, setManualOverride] = useState<string>("");
  const [useManual, setUseManual] = useState<boolean>(false);

  const totalCalculado = useMemo(() => {
    if (useManual) {
      const val = parseFloat(manualOverride);
      return isNaN(val) ? 0 : val;
    }
    return Object.entries(counts).reduce((acc, [denom, qty]) => {
      return acc + parseFloat(denom) * (qty || 0);
    }, 0);
  }, [counts, useManual, manualOverride]);
  
  if (!isOpen) return null;

  

  const diferencia = Math.round((totalCalculado - efectivoEsperado) * 100) / 100;
  const isExact = Math.abs(diferencia) < 0.01;
  const isShortage = diferencia < -0.01;
  const isSurplus = diferencia > 0.01;

  const handleQtyChange = (denom: number, value: string) => {
    const qty = parseInt(value, 10);
    setCounts((prev) => ({
      ...prev,
      [denom]: isNaN(qty) || qty < 0 ? 0 : qty,
    }));
  };

  const handleReset = () => {
    setCounts({
      200: 0,
      100: 0,
      50: 0,
      20: 0,
      10: 0,
      5: 0,
      2: 0,
      1: 0,
      0.5: 0,
      0.2: 0,
      0.1: 0,
    });
    setManualOverride("");
    setUseManual(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in zoom-in-95 my-8">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Arqueo y Conteo de Efectivo Físico</h3>
              <p className="text-xs text-slate-400">Calculadora de billetes, monedas y detección de descuadre</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Panel Comparativo Superior */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-center sm:text-left">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Efectivo Físico Esperado
              </span>
              <span className="text-lg font-bold text-slate-900">
                S/ {efectivoEsperado.toFixed(2)}
              </span>
            </div>
            <div className="text-center sm:text-left">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Efectivo Físico Contado
              </span>
              <span className="text-lg font-bold text-cyan-600">
                S/ {totalCalculado.toFixed(2)}
              </span>
            </div>
            <div className="text-center sm:text-left">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Estado del Arqueo
              </span>
              {isExact ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Cuadre Exacto (S/ 0.00)
                </span>
              ) : isShortage ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-1 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Faltante: S/ {diferencia.toFixed(2)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Sobrante: +S/ {diferencia.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {/* Toggle Modo Conteo vs Manual */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-semibold text-slate-700">
              Desglose detallado por denominación
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="text-[11px] text-slate-500 hover:text-slate-800 underline"
              >
                Limpiar campos
              </button>
              <button
                type="button"
                onClick={() => setUseManual(!useManual)}
                className="text-[11px] font-semibold text-cyan-600 hover:text-cyan-700 ml-2"
              >
                {useManual ? "Usar calculadora de billetes" : "Ingresar total manual"}
              </button>
            </div>
          </div>

          {useManual ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Total de Efectivo Físico Contado (S/)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sm font-bold text-slate-400">S/</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualOverride}
                  onChange={(e) => setManualOverride(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Ingrese directamente la suma total física verificada en gaveta.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 max-h-[320px] overflow-y-auto pr-1">
              {DENOMINATIONS.map((d) => {
                const subtotal = (counts[d.val] || 0) * d.val;
                return (
                  <div
                    key={d.val}
                    className="flex items-center justify-between p-2 rounded-xl border border-slate-200 hover:border-slate-300 bg-white"
                  >
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold ${
                          d.isCoin
                            ? "bg-amber-100 text-amber-800 border border-amber-300"
                            : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        }`}
                      >
                        {d.val >= 1 ? `S/${d.val}` : `${d.val * 100}c`}
                      </div>
                      <span className="text-xs font-medium text-slate-700">{d.label}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={counts[d.val] || ""}
                        onChange={(e) => handleQtyChange(d.val, e.target.value)}
                        placeholder="0"
                        className="w-16 px-2 py-1 text-center text-xs font-semibold rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                      />
                      <span className="text-xs font-bold text-slate-700 min-w-[65px] text-right">
                        S/ {subtotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 flex items-center justify-between border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cerrar
            </button>

            <button
              type="button"
              onClick={() => {
                onProceedToClose(totalCalculado);
                onClose();
              }}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 rounded-xl shadow-md shadow-cyan-500/20 transition-all"
            >
              <span>Proceder al Cierre con S/ {totalCalculado.toFixed(2)}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
