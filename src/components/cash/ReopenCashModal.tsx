"use client";

import { useState } from "react";
import { reopenCashAction } from "@/lib/actions/cash.actions";
import { Unlock, AlertTriangle, AlertCircle, X, CheckCircle2 } from "lucide-react";

interface ReopenCashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  idSesion: number;
  employees: Array<{ id: number; nombre: string }>;
}

export function ReopenCashModal({
  isOpen,
  onClose,
  onSuccess,
  idSesion,
  employees,
}: ReopenCashModalProps) {
  const [idEmpleadoReapertura, setIdEmpleadoReapertura] = useState<number>(employees[0]?.id || 1);
  const [motivoReapertura, setMotivoReapertura] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!motivoReapertura.trim() || motivoReapertura.trim().length < 10) {
      setError("Debe ingresar una justificación detallada de al menos 10 caracteres para la auditoría.");
      return;
    }

    setLoading(true);
    try {
      const res = await reopenCashAction({
        idSesion,
        idEmpleadoReapertura,
        motivoReapertura: motivoReapertura.trim(),
      });

      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setError(res.error || "Error al reabrir la sesión de caja.");
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
        <div className="px-6 py-4 bg-amber-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-white/20">
              <Unlock className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Reapertura Excepcional de Caja</h3>
              <p className="text-xs text-amber-100">Sesión #{idSesion} (Auditoría Administrativa)</p>
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
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <strong>Aviso de Auditoría:</strong> La reapertura es un evento excepcional que quedará registrado en el historial de trazabilidad con fecha, hora, responsable y justificación obligatoria.
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Administrador / Supervisor que Autoriza
            </label>
            <select
              value={idEmpleadoReapertura}
              onChange={(e) => setIdEmpleadoReapertura(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
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
              Motivo / Justificación de Reapertura (Mínimo 10 caracteres)
            </label>
            <textarea
              rows={3}
              required
              value={motivoReapertura}
              onChange={(e) => setMotivoReapertura(e.target.value)}
              placeholder="Ej. Corrección por cobro de venta pendiente no sincronizado al momento del cierre..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
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
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md transition-all disabled:opacity-50"
            >
              {loading ? (
                <>Reabriendo...</>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Autorizar Reapertura
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
