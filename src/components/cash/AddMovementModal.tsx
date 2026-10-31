"use client";

import { useState } from "react";
import { addCashMovementAction } from "@/lib/actions/cash.actions";
import { CashMovementType, CashMovementCategory } from "@/types/cash-register";
import { PlusCircle, AlertCircle, X, CheckCircle2, ArrowDownCircle, ArrowUpCircle } from "lucide-react";

interface AddMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  idSesion: number;
  employees: Array<{ id: number; nombre: string }>;
  paymentMethods: Array<{ id: number; nombre: string }>;
}

export function AddMovementModal({
  isOpen,
  onClose,
  onSuccess,
  idSesion,
  employees,
  paymentMethods,
}: AddMovementModalProps) {
  const [tipo, setTipo] = useState<CashMovementType>("EGRESO");
  const [categoria, setCategoria] = useState<CashMovementCategory>("GASTO_OPERATIVO");
  const [monto, setMonto] = useState<string>("");
  const [idMetodo, setIdMetodo] = useState<number>(1); // Default 1 = Efectivo
  const [concepto, setConcepto] = useState<string>("");
  const [idEmpleado, setIdEmpleado] = useState<number>(employees[0]?.id || 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsedMonto = parseFloat(monto);
    if (isNaN(parsedMonto) || parsedMonto <= 0) {
      setError("El monto debe ser un valor mayor a cero.");
      return;
    }
    if (!concepto.trim()) {
      setError("Debe especificar el concepto o motivo del movimiento.");
      return;
    }

    setLoading(true);
    try {
      const res = await addCashMovementAction({
        idSesion,
        tipo,
        categoria,
        monto: parsedMonto,
        idMetodo,
        concepto: concepto.trim(),
        idEmpleado,
      });

      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setError(res.error || "Error al registrar movimiento.");
      }
    } catch (err: any) {
      setError(err?.message || "Ocurrió un error inesperado.");
    } finally {
      setLoading(false);
    }
  };

  const isEfectivo = idMetodo === 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Registrar Movimiento de Caja</h3>
              <p className="text-xs text-slate-400">Ingresos manuales, gastos o retiros</p>
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

          {/* Selector de Tipo */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Tipo de Operación
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setTipo("INGRESO");
                  setCategoria("INGRESO_MANUAL");
                }}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  tipo === "INGRESO"
                    ? "bg-emerald-50 border-emerald-500 text-emerald-700 ring-2 ring-emerald-500/20"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <ArrowDownCircle className="w-4 h-4 text-emerald-600" />
                Ingreso a Caja
              </button>
              <button
                type="button"
                onClick={() => {
                  setTipo("EGRESO");
                  setCategoria("GASTO_OPERATIVO");
                }}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  tipo === "EGRESO"
                    ? "bg-rose-50 border-rose-500 text-rose-700 ring-2 ring-rose-500/20"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <ArrowUpCircle className="w-4 h-4 text-rose-600" />
                Egreso / Salida
              </button>
            </div>
          </div>

          {/* Categoría */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Categoría
            </label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as CashMovementCategory)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              {tipo === "INGRESO" ? (
                <>
                  <option value="INGRESO_MANUAL">Ingreso Manual de Efectivo</option>
                  <option value="AJUSTE">Ajuste / Sobrante de Caja</option>
                </>
              ) : (
                <>
                  <option value="GASTO_OPERATIVO">Gasto Operativo (Limpieza, movilidad, útiles)</option>
                  <option value="RETIRO">Retiro Parcial de Seguridad / Depósito</option>
                  <option value="AJUSTE">Ajuste de Caja</option>
                </>
              )}
            </select>
          </div>

          {/* Método de Pago */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Método de Pago / Medio
            </label>
            <select
              value={idMetodo}
              onChange={(e) => setIdMetodo(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} {m.id === 1 ? "(Afecta caja física)" : "(Dinero digital bancarizado)"}
                </option>
              ))}
            </select>
            {!isEfectivo && (
              <p className="text-[11px] text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-200 mt-1.5">
                Al ser un método digital ({paymentMethods.find((p) => p.id === idMetodo)?.nombre}), quedará registrado en la sesión pero <strong>no afectará el arqueo de billetes y monedas físicas en gaveta</strong>.
              </p>
            )}
          </div>

          {/* Monto */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Monto (S/)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-sm font-semibold text-slate-400">S/</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>

          {/* Concepto */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Concepto / Detalle Justificatorio
            </label>
            <textarea
              rows={2}
              required
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder="Ej. Compra de rollos térmicos para impresora de tickets..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          {/* Empleado */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Empleado que Ejecuta
            </label>
            <select
              value={idEmpleado}
              onChange={(e) => setIdEmpleado(Number(e.target.value))}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nombre}
                </option>
              ))}
            </select>
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
              className={`flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white rounded-xl shadow-md transition-all disabled:opacity-50 ${
                tipo === "INGRESO"
                  ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20"
                  : "bg-rose-600 hover:bg-rose-700 shadow-rose-500/20"
              }`}
            >
              {loading ? (
                <>Guardando...</>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Registrar {tipo === "INGRESO" ? "Ingreso" : "Egreso"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
