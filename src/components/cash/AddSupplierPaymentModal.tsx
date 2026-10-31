"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Truck,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { registerSupplierPaymentAction, getAccountsPayableAction } from "@/lib/actions/expense.actions";
import { CuentaPagarProveedor } from "@/types/expenses";
import { formatCurrency } from "@/lib/formatters";

interface AddSupplierPaymentModalProps {
  idSesion?: number | null;
  paymentMethods: Array<{ id: number; nombre: string }>;
  efectivoDisponible: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddSupplierPaymentModal({
  idSesion,
  paymentMethods,
  efectivoDisponible,
  isOpen,
  onClose,
  onSuccess,
}: AddSupplierPaymentModalProps) {
  const [cuentas, setCuentas] = useState<CuentaPagarProveedor[]>([]);
  const [hasLoadedCuentas, setHasLoadedCuentas] = useState(false);
  const [selectedCuentaId, setSelectedCuentaId] = useState<number | null>(null);
  const [monto, setMonto] = useState<string>("");
  const [idMetodo, setIdMetodo] = useState<number>(1); // 1 = Efectivo
  const [referencia, setReferencia] = useState<string>("");
  const [observaciones, setObservaciones] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const loadingCuentas = isOpen && !hasLoadedCuentas;

  useEffect(() => {
    if (isOpen) {
      getAccountsPayableAction()
        .then((res) => {
          if (!res.success || !res.data) {
            setErrorMsg(res.error || "No fue posible cargar las cuentas por pagar.");
            return;
          }
          const pendientes = res.data.filter((c) => c.estado !== "PAGADA" && c.estado !== "ANULADA");
          setCuentas(pendientes);
          if (pendientes.length > 0) {
            setSelectedCuentaId(pendientes[0].idCuentaPagar);
            setMonto(pendientes[0].saldoPendiente.toString());
          }
        })
        .catch((cause: unknown) => {
          setErrorMsg(cause instanceof Error ? cause.message : "Error al cargar las cuentas por pagar.");
        })
        .finally(() => setHasLoadedCuentas(true));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedCuenta = cuentas.find((c) => c.idCuentaPagar === selectedCuentaId);
  const numMonto = parseFloat(monto) || 0;
  const esEfectivo = idMetodo === 1;
  const saldoInsuficiente = esEfectivo && idSesion != null && numMonto > efectivoDisponible;
  const sobrepago = selectedCuenta ? numMonto > selectedCuenta.saldoPendiente + 0.001 : false;

  const handleSelectCuenta = (id: number) => {
    setSelectedCuentaId(id);
    const c = cuentas.find((item) => item.idCuentaPagar === id);
    if (c) {
      setMonto(c.saldoPendiente.toString());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (idSesion == null) {
      setErrorMsg("Abre una sesión de Caja antes de registrar un pago al proveedor.");
      return;
    }

    if (!selectedCuenta) {
      setErrorMsg("Debe seleccionar una cuenta por pagar o factura pendiente.");
      return;
    }

    if (numMonto <= 0) {
      setErrorMsg("El importe a abonar debe ser estrictamente mayor a S/ 0.00.");
      return;
    }

    if (sobrepago) {
      setErrorMsg(
        `El importe ingresado (S/ ${numMonto.toFixed(2)}) supera el saldo pendiente (S/ ${selectedCuenta.saldoPendiente.toFixed(2)}).`
      );
      return;
    }

    if (saldoInsuficiente) {
      setErrorMsg(
        `Efectivo insuficiente en gaveta física. Saldo disponible: S/ ${efectivoDisponible.toFixed(2)}, Requerido: S/ ${numMonto.toFixed(2)}.`
      );
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await registerSupplierPaymentAction({
        idCuentaPagar: selectedCuenta.idCuentaPagar,
        monto: numMonto,
        idMetodo,
        idEmpleadoResponsable: 1, // Administrador en sesión
        idSesion: idSesion || undefined,
        referencia: referencia.trim() || undefined,
        observaciones: observaciones.trim() || undefined,
      });

      if (!res.success) {
        setErrorMsg(res.error || "No se pudo registrar el abono al proveedor.");
        return;
      }

      onSuccess();
      onClose();
    } catch (cause: unknown) {
      setErrorMsg(cause instanceof Error ? cause.message : "Error al procesar el abono.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-xl max-h-[92vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100">
        {/* Cabecera */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/80 dark:bg-slate-900/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-200 dark:border-cyan-800 text-cyan-600 dark:text-cyan-400 shrink-0">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>Registrar Pago a Proveedor</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Abono o liquidación de cuentas por pagar a proveedores comerciales
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {idSesion == null && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Caja está cerrada. Abre una sesión para registrar el pago y reflejarlo en el saldo de efectivo.
            </div>
          )}

          {loadingCuentas ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              Cargando cuentas por pagar de SQL Server...
            </div>
          ) : cuentas.length === 0 ? (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>Todas las deudas comerciales con proveedores están actualmente al día y pagadas.</span>
            </div>
          ) : (
            <>
              {/* Selector de Obligación */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Factura / Cuenta por Pagar Pendiente:
                </label>
                <select
                  value={selectedCuentaId || ""}
                  onChange={(e) => handleSelectCuenta(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {cuentas.map((c) => (
                    <option key={c.idCuentaPagar} value={c.idCuentaPagar}>
                      {c.nombreProveedor} — Doc #{c.numeroDocumento} (Saldo: S/ {c.saldoPendiente.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Ficha Resumen de la Deuda Seleccionada */}
              {selectedCuenta && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs font-mono">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Proveedor:</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100 font-sans">{selectedCuenta.nombreProveedor}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Documento:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedCuenta.numeroDocumento}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Total Compra:</span>
                    <span>{formatCurrency(selectedCuenta.total)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Monto Pagado a la Fecha:</span>
                    <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(selectedCuenta.montoPagado)}</span>
                  </div>
                  <div className="flex justify-between text-slate-900 dark:text-slate-100 font-bold pt-1.5 border-t border-slate-200 dark:border-slate-700">
                    <span>Saldo Pendiente de Pago:</span>
                    <span className="text-rose-600 dark:text-rose-400 text-sm">{formatCurrency(selectedCuenta.saldoPendiente)}</span>
                  </div>
                </div>
              )}

              {/* Monto del Abono */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Importe del Pago (S/):
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    S/
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 py-2 text-sm font-mono font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {selectedCuenta && numMonto > 0 && (
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Nuevo saldo restante tras este abono:{" "}
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      S/ {Math.max(0, selectedCuenta.saldoPendiente - numMonto).toFixed(2)}
                    </span>
                  </p>
                )}
              </div>

              {/* Método de Pago */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Método de Pago:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {paymentMethods.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setIdMetodo(m.id)}
                      className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-between transition-colors ${
                        idMetodo === m.id
                          ? "bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-700 dark:text-blue-300"
                          : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      }`}
                    >
                      <span>{m.nombre}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {m.id === 1 ? "Gaveta física" : "Digital / Banco"}
                      </span>
                    </button>
                  ))}
                </div>

                {esEfectivo && idSesion != null && (
                  <div className="mt-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between">
                    <span>Efectivo disponible en caja activa:</span>
                    <span className="font-mono font-bold">{formatCurrency(efectivoDisponible)}</span>
                  </div>
                )}
              </div>

              {/* Referencia (Transferencia / Yape) */}
              {!esEfectivo && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Código de Operación / Referencia Bancaria:
                  </label>
                  <input
                    type="text"
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    placeholder="Ej. BCP-892147 o YAPE-0014"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Observaciones */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Observaciones / Comentarios (opcional):
                </label>
                <input
                  type="text"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Detalles sobre el desembolso o acuerdo con el proveedor..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Botón de Confirmación */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || idSesion == null || saldoInsuficiente || sobrepago || numMonto <= 0}
                  className="px-5 py-2 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Registrando Pago..." : `Confirmar Abono de ${formatCurrency(numMonto)}`}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
