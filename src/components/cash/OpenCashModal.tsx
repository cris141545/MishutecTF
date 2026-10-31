"use client";

import { useState } from "react";
import { openCashAction } from "@/lib/actions/cash.actions";
import { DollarSign, AlertCircle, X, CheckCircle2, Lock } from "lucide-react";

interface OpenCashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  employees: Array<{ id: number; nombre: string }>;
}

export function OpenCashModal({
  isOpen,
  onClose,
  onSuccess,
  employees,
}: OpenCashModalProps) {
  const [idEmpleado, setIdEmpleado] = useState<number>(employees[0]?.id || 1);
  const [montoInicial, setMontoInicial] = useState<string>("100.00");
  const [observaciones, setObservaciones] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const monto = parseFloat(montoInicial);
    if (isNaN(monto) || monto < 0) {
      setError("El monto inicial debe ser un número mayor o igual a cero.");
      return;
    }

    setLoading(true);
    try {
      const res = await openCashAction({
        idEmpleado,
        montoInicial: monto,
        observaciones: observaciones.trim() || undefined,
      });

      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setError(res.error || "Error al aperturar la caja.");
      }
    } catch (err: any) {
      setError(err?.message || "Ocurrió un error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95">
        <div className="px-6 py-4 bg-gradient-to-r from-cyan-600 to-blue-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-white/10 backdrop-blur-md">
              <DollarSign className="w-5 h-5 text-cyan-200" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Apertura de Caja</h3>
              <p className="text-xs text-cyan-100">Iniciar nuevo turno comercial</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
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

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Empleado Responsable de Turno
            </label>
            <select
              value={idEmpleado}
              onChange={(e) => setIdEmpleado(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
              Monto Inicial de Efectivo en Caja (S/)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-sm font-semibold text-slate-400">S/</span>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={montoInicial}
                onChange={(e) => setMontoInicial(e.target.value)}
                placeholder="100.00"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Fondo fijo para cambio y vueltos entregado al cajero al inicio de jornada.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Observaciones de Apertura (Opcional)
            </label>
            <textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ej. Billetes y monedas contadas y verificadas con supervisor..."
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
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 rounded-xl shadow-md shadow-cyan-500/20 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>Abriendo...</>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Confirmar Apertura
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
