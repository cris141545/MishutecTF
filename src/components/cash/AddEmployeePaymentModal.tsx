"use client";

import React, { useState } from "react";
import {
  X,
  UserCheck,
  Wallet,
  AlertCircle,
  CheckCircle2,
  Calendar,
  FileText,
  DollarSign,
} from "lucide-react";
import { registerEmployeePaymentAction } from "@/lib/actions/cash.actions";
import { EmployeePayment } from "@/types/cash-register";

interface AddEmployeePaymentModalProps {
  idSesion: number;
  employees: Array<{ id: number; nombre: string }>;
  paymentMethods: Array<{ id: number; nombre: string }>;
  efectivoDisponible: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (payment: EmployeePayment) => void;
}

export function AddEmployeePaymentModal({
  idSesion,
  employees,
  paymentMethods,
  efectivoDisponible,
  isOpen,
  onClose,
  onSuccess,
}: AddEmployeePaymentModalProps) {
  const [idEmpleado, setIdEmpleado] = useState<number>(employees[0]?.id || 1);
  const [periodo, setPeriodo] = useState<string>("Octubre 2026 - Quincena 2");
  const [concepto, setConcepto] = useState<string>("Pago de sueldo regular");
  const [monto, setMonto] = useState<string>("");
  const [idMetodo, setIdMetodo] = useState<number>(1); // 1 = Efectivo
  const [observaciones, setObservaciones] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const numMonto = parseFloat(monto) || 0;
  const esEfectivo = idMetodo === 1;
  const saldoInsuficiente = esEfectivo && numMonto > efectivoDisponible;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (numMonto <= 0) {
      setErrorMsg("El importe a pagar debe ser estrictamente mayor a S/ 0.00.");
      return;
    }

    if (saldoInsuficiente) {
      setErrorMsg(
        `Efectivo insuficiente en gaveta física. Saldo disponible: S/ ${efectivoDisponible.toFixed(2)}, Requerido: S/ ${numMonto.toFixed(2)}.`
      );
      return;
    }

    if (!periodo.trim()) {
      setErrorMsg("Debe especificar el período de pago.");
      return;
    }

    if (!concepto.trim()) {
      setErrorMsg("Debe ingresar el concepto del desembolso.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await registerEmployeePaymentAction({
        idSesion,
        idEmpleado,
        periodo: periodo.trim(),
        concepto: concepto.trim(),
        monto: numMonto,
        idMetodo,
        idEmpleadoResponsable: 1, // Usuario administrador en sesión
        observaciones: observaciones.trim() || undefined,
      });

      if (!res.success || !res.data) {
        setErrorMsg(res.error || "No se pudo registrar el pago al personal.");
        return;
      }

      onSuccess(res.data);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Error al procesar el pago.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Registrar Pago al Personal
              </h3>
              <p className="text-xs text-slate-500">
                Turno #{idSesion} • Desembolso clasificado de egresos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-rose-800">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Empleado Beneficiario */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Empleado Beneficiario *
            </label>
            <select
              value={idEmpleado}
              onChange={(e) => setIdEmpleado(Number(e.target.value))}
              disabled={isSubmitting}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nombre} (ID #{emp.id})
                </option>
              ))}
            </select>
          </div>

          {/* Período y Concepto */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Período Correspondiente *
              </label>
              <input
                type="text"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                placeholder="ej. Octubre 2026 - Q2"
                disabled={isSubmitting}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Concepto del Pago *
              </label>
              <select
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              >
                <option value="Pago de sueldo regular">Pago de sueldo regular</option>
                <option value="Adelanto de sueldo">Adelanto de sueldo</option>
                <option value="Bono por metas de venta">Bono por metas de venta</option>
                <option value="Compensación de horas extras">Horas extras</option>
                <option value="Movilidad y refrigerio">Movilidad y refrigerio</option>
                <option value="Liquidación / Honorarios">Liquidación / Honorarios</option>
              </select>
            </div>
          </div>

          {/* Monto y Método de Pago */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Importe a Pagar (S/) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 font-bold">S/</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0.00"
                  disabled={isSubmitting}
                  className={`w-full rounded-xl border pl-8 pr-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 ${
                    saldoInsuficiente
                      ? "border-rose-400 bg-rose-50/50 focus:ring-rose-500"
                      : "border-slate-300 bg-white focus:ring-purple-500"
                  }`}
                  required
                />
              </div>
              {esEfectivo && (
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Gaveta física disponible: S/ {efectivoDisponible.toFixed(2)}
                </span>
              )}
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Canal / Método de Pago *
              </label>
              <select
                value={idMetodo}
                onChange={(e) => setIdMetodo(Number(e.target.value))}
                disabled={isSubmitting}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              >
                {paymentMethods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} {m.id === 1 ? "(Gaveta física)" : "(Digital / Banco)"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Aviso sobre afectación de caja */}
          <div
            className={`rounded-xl p-3 border text-[11px] leading-relaxed flex items-start gap-2 ${
              esEfectivo
                ? "bg-amber-50 border-amber-200 text-amber-900"
                : "bg-blue-50 border-blue-200 text-blue-900"
            }`}
          >
            <Wallet className={`h-4 w-4 shrink-0 mt-0.5 ${esEfectivo ? "text-amber-600" : "text-blue-600"}`} />
            <div>
              {esEfectivo ? (
                <span>
                  <strong>Afecta Efectivo Físico:</strong> Este pago se restará inmediatamente del efectivo en gaveta y disminuirá el dinero esperado en el arqueo diario.
                </span>
              ) : (
                <span>
                  <strong>No Afecta Gaveta Física:</strong> El pago se registra como desembolso digital/bancario. No disminuye los billetes y monedas del cajón.
                </span>
              )}
            </div>
          </div>

          {/* Observaciones */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Observaciones (Opcional)
            </label>
            <textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Detalles adicionales del pago autorizado..."
              disabled={isSubmitting}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Botones */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || saldoInsuficiente}
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-5 py-2 font-bold text-white shadow-sm hover:bg-purple-700 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Registrando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Confirmar Pago</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
