"use client";

import { useState } from "react";
import { closeCashAction } from "@/lib/actions/cash.actions";
import { CashSession, CashClosingSummary } from "@/types/cash-register";
import { Lock, AlertCircle, X, CheckCircle2, AlertTriangle, Printer } from "lucide-react";

interface CloseCashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (summary: CashClosingSummary) => void;
  session: CashSession;
  employees: Array<{ id: number; nombre: string }>;
  initialCounted?: number;
}

export function CloseCashModal({
  isOpen,
  onClose,
  onSuccess,
  session,
  employees,
  initialCounted,
}: CloseCashModalProps) {
  const [idEmpleadoCierre, setIdEmpleadoCierre] = useState<number>(employees[0]?.id || 1);
  const [efectivoContado, setEfectivoContado] = useState<string>(
    initialCounted !== undefined ? initialCounted.toFixed(2) : session.efectivoEsperadoActual.toFixed(2)
  );
  const [observacionesCierre, setObservacionesCierre] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const esperado = session.efectivoEsperadoActual;
  const contadoNum = parseFloat(efectivoContado) || 0;
  const diferencia = Math.round((contadoNum - esperado) * 100) / 100;
  const isExact = Math.abs(diferencia) < 0.01;
  const isShortage = diferencia < -0.01;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isNaN(contadoNum) || contadoNum < 0) {
      setError("El efectivo contado debe ser un número válido mayor o igual a cero.");
      return;
    }

    setLoading(true);
    try {
      const res = await closeCashAction({
        idSesion: session.idSesion,
        idEmpleadoCierre,
        efectivoContado: contadoNum,
        observacionesCierre: observacionesCierre.trim() || undefined,
      });

      if (res.success && res.data) {
        onSuccess(res.data);
        onClose();
      } else {
        setError(res.error || "Error al cerrar la sesión de caja.");
      }
    } catch (err: any) {
      setError(err?.message || "Ocurrió un error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden animate-in zoom-in-95 text-slate-900 dark:text-slate-100">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Cierre y Arqueo Diario de Caja</h3>
              <p className="text-xs text-slate-400">Sesión #{session.idSesion} - Finalizar turno e inmutabilizar</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Resumen Financiero del Turno */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs font-mono">
            <div className="flex justify-between text-slate-600">
              <span>Monto Inicial de Apertura:</span>
              <span className="font-semibold text-slate-800">S/ {session.montoInicial.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Ventas en Efectivo Físico:</span>
              <span className="font-semibold text-emerald-600">+S/ {session.totalVentasEfectivo.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Cobros Electrónicos (Yape / Tarjetas):</span>
              <span className="font-semibold text-blue-600">S/ {session.totalVentasElectronicas.toFixed(2)} (Bancarizado)</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Otros Ingresos en Efectivo:</span>
              <span className="font-semibold text-slate-700">+S/ {session.totalOtrosIngresosEfectivo.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Gastos Operativos & Retiros:</span>
              <span className="font-semibold text-rose-600 dark:text-rose-400">-S/ {(session.totalGastosEfectivo + session.totalRetirosEfectivo).toFixed(2)}</span>
            </div>
            {(session.totalPagosPersonalEfectivo || 0) > 0 && (
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Pagos al Personal (Efectivo):</span>
                <span className="font-semibold text-purple-600 dark:text-purple-400">-S/ {session.totalPagosPersonalEfectivo.toFixed(2)}</span>
              </div>
            )}
            {(session.totalPagosProveedorEfectivo || 0) > 0 && (
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Pagos a Proveedores (Efectivo):</span>
                <span className="font-semibold text-cyan-600 dark:text-cyan-400">-S/ {session.totalPagosProveedorEfectivo.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Reembolsos por Devoluciones:</span>
              <span className="font-semibold text-rose-600 dark:text-rose-400">-S/ {session.totalReembolsosEfectivo.toFixed(2)}</span>
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between font-bold text-sm text-slate-900 dark:text-slate-100">
              <span>Efectivo Físico Esperado en Caja:</span>
              <span className="text-cyan-600 dark:text-cyan-400">S/ {esperado.toFixed(2)}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Empleado que Cierra y Certifica
            </label>
            <select
              value={idEmpleadoCierre}
              onChange={(e) => setIdEmpleadoCierre(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nombre} (ID #{emp.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Efectivo Físico Contado Real en Gaveta (S/)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-sm font-semibold text-slate-400">S/</span>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={efectivoContado}
                onChange={(e) => setEfectivoContado(e.target.value)}
                placeholder="0.00"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>

          {/* Detección de Descuadre en Vivo */}
          <div className="p-3 rounded-xl border flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700">Diferencia de Arqueo:</span>
            {isExact ? (
              <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Cuadre Exacto (S/ 0.00)
              </span>
            ) : isShortage ? (
              <span className="font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Faltante: S/ {diferencia.toFixed(2)}
              </span>
            ) : (
              <span className="font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Sobrante: +S/ {diferencia.toFixed(2)}
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Observaciones del Cierre / Justificación de Descuadre (Opcional)
            </label>
            <textarea
              rows={2}
              value={observacionesCierre}
              onChange={(e) => setObservacionesCierre(e.target.value)}
              placeholder="Ej. Billetes embolsados y entregados a administración para depósito bancario..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-md transition-all disabled:opacity-50"
            >
              {loading ? (
                <>Cerrando e Inmutabilizando...</>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Confirmar Cierre Diario
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
