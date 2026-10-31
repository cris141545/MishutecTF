"use client";

import { useState, useEffect } from "react";
import {
  SaleForReturnSearch,
  SaleLineWithBalance,
  TransactionalReturnResult,
} from "@/types/returns";
import {
  searchSaleForReturnAction,
  searchSaleCandidatesAction,
  createReturnAction,
} from "@/lib/actions/return.actions";
import { SaleCandidate } from "@/lib/repositories/return-transaction.repository";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  X,
  Search,
  RotateCcw,
  Package,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  FileText,
  User,
  Clock,
} from "lucide-react";

interface NewReturnModalProps {
  onClose: () => void;
  onSuccess: (result: TransactionalReturnResult) => void;
  motivos: Array<{ id: number; descripcion: string }>;
}

interface SelectedItemState {
  idDetalle: number;
  cantidadDev: number;
  idMotivo: number;
}

export function NewReturnModal({ onClose, onSuccess, motivos }: NewReturnModalProps) {
  // Búsqueda de venta
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [saleData, setSaleData] = useState<SaleForReturnSearch | null>(null);
  const [candidates, setCandidates] = useState<SaleCandidate[]>([]);

  // Selección de ítems para devolución
  const [selectedItems, setSelectedItems] = useState<Map<number, SelectedItemState>>(new Map());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number>(1);

  // Envío
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Cerrar con Escape y bloquear scroll
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Manejador de búsqueda de comprobante
  const handleSearchSale = async (voucherToSearch?: string) => {
    const term = voucherToSearch || searchTerm;
    if (!term.trim()) return;

    try {
      setIsSearching(true);
      setSearchError(null);
      setSubmitError(null);
      setSaleData(null);
      setCandidates([]);
      setSelectedItems(new Map());

      const res = await searchSaleForReturnAction(term.trim());

      if (res.success && res.data) {
        setSaleData(res.data);
        setSelectedEmployeeId(res.data.idEmpleado || 1);
        return;
      }

      // Si no fue encontrado por comprobante directo, intentar búsqueda por coincidencia libre (DNI, cliente, fecha)
      const candRes = await searchSaleCandidatesAction(term.trim());
      if (candRes.success && candRes.data && candRes.data.length > 0) {
        setCandidates(candRes.data);
        return;
      }

      setSearchError(res.error || "No se encontró ninguna venta con el código ingresado.");
    } catch (err: any) {
      setSearchError(err.message || "Error al buscar la venta solicitada.");
    } finally {
      setIsSearching(false);
    }
  };

  // Toggle selección de ítem
  const handleToggleItem = (line: SaleLineWithBalance) => {
    if (line.cantidadDisponible <= 0) return;

    setSelectedItems((prev) => {
      const next = new Map(prev);
      if (next.has(line.idDetalle)) {
        next.delete(line.idDetalle);
      } else {
        next.set(line.idDetalle, {
          idDetalle: line.idDetalle,
          cantidadDev: 1,
          idMotivo: motivos[0]?.id || 1,
        });
      }
      return next;
    });
  };

  // Cambio de cantidad devuelta
  const handleQuantityChange = (idDetalle: number, newCant: number, maxDisponible: number) => {
    const validCant = Math.min(Math.max(1, newCant), maxDisponible);
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const current = next.get(idDetalle);
      if (current) {
        next.set(idDetalle, { ...current, cantidadDev: validCant });
      }
      return next;
    });
  };

  // Cambio de motivo
  const handleMotiveChange = (idDetalle: number, idMotivo: number) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const current = next.get(idDetalle);
      if (current) {
        next.set(idDetalle, { ...current, idMotivo });
      }
      return next;
    });
  };

  // Resumen de cálculo
  const selectedCount = selectedItems.size;
  const totalUnits = Array.from(selectedItems.values()).reduce(
    (acc, it) => acc + it.cantidadDev,
    0
  );
  const estimatedAmount = Array.from(selectedItems.values()).reduce((acc, it) => {
    const line = saleData?.lineas.find((l) => l.idDetalle === it.idDetalle);
    return acc + (line ? it.cantidadDev * line.precioUnitario : 0);
  }, 0);

  // Envío del registro de devolución
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleData || selectedItems.size === 0) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const itemsArray = Array.from(selectedItems.values()).map((it) => ({
        idDetalle: it.idDetalle,
        cantidadDev: it.cantidadDev,
        idMotivo: it.idMotivo,
      }));

      const res = await createReturnAction({
        idVenta: saleData.idVenta,
        idEmpleado: selectedEmployeeId,
        items: itemsArray,
      });

      if (!res.success || !res.data) {
        setSubmitError(res.error || "No se pudo registrar la devolución.");
        return;
      }

      onSuccess(res.data);
    } catch (err: any) {
      setSubmitError(err.message || "Error al procesar la solicitud de devolución.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
        {/* Cabecera */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-600">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  Registrar Solicitud de Devolución
                </h3>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 border border-amber-200 text-amber-700">
                  Estado: Pendiente
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Búsqueda transaccional de comprobante, verificación de saldos y reserva de unidades
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Contenido desplazable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* 1. Buscador de Comprobante */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <label className="block text-xs font-semibold text-slate-700">
              Paso 1: Localizar Venta Original por Comprobante
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchSale()}
                  placeholder="Ej: B001-000001, B001-000002, F001-000001..."
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <button
                type="button"
                onClick={() => handleSearchSale()}
                disabled={isSearching || !searchTerm.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
              >
                {isSearching ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span>Buscar Venta</span>
              </button>
            </div>

            {/* Accesos rápidos a ventas recientes */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 pt-1">
              <span>Sugerencias rápidas:</span>
              {["B001-000001", "B001-000002", "B001-000003", "B001-000004", "B001-000005"].map(
                (v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setSearchTerm(v);
                      handleSearchSale(v);
                    }}
                    className="px-2 py-0.5 rounded bg-white hover:bg-blue-50 text-blue-600 font-mono text-[11px] border border-slate-200 transition-colors shadow-2xs"
                  >
                    {v}
                  </button>
                )
              )}
            </div>

            {candidates.length > 0 && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs space-y-2 mt-2">
                <span className="font-semibold text-blue-900 block">
                  Ventas encontradas para tu búsqueda ({candidates.length}):
                </span>
                <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                  {candidates.map((c) => (
                    <button
                      key={c.idVenta}
                      type="button"
                      onClick={() => {
                        setSearchTerm(c.numeroComprobante);
                        handleSearchSale(c.numeroComprobante);
                      }}
                      className="flex items-center justify-between p-2 rounded-lg bg-white border border-blue-100 hover:border-blue-300 text-left transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold font-mono text-blue-700">{c.numeroComprobante}</span>
                        <span className="text-slate-700">{c.nombreCliente} (DNI: {c.dniCliente})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500">{c.fechaVenta}</span>
                        <span className="font-bold text-slate-900">S/ {c.totalVenta.toFixed(2)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {searchError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{searchError}</span>
              </div>
            )}
          </div>

          {/* 2. Información de la Venta Localizada */}
          {saleData && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Comprobante
                  </span>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <span className="font-mono font-bold text-slate-900">
                      {saleData.numeroComprobante}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-medium">
                      {saleData.tipoComprobante}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Fecha: {formatDate(saleData.fechaVenta)} • Total:{" "}
                    <strong className="text-slate-800">
                      {formatCurrency(saleData.totalVenta)}
                    </strong>
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Cliente Titular
                  </span>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-emerald-600" />
                    <span className="font-medium text-slate-900 text-sm">
                      {saleData.nombreCliente}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">DNI: {saleData.dniCliente}</p>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Vendedor Asignado
                  </span>
                  <p className="text-sm font-medium text-slate-900">
                    {saleData.nombreEmpleado}
                  </p>
                  <p className="text-xs text-slate-500">
                    Venta ID #{saleData.idVenta}
                  </p>
                </div>
              </div>

              {/* 3. Selección de Productos Vendidos y Cantidades */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">
                    Paso 2: Seleccionar Productos a Devolver y Causa
                  </label>
                  <span className="text-xs text-blue-600 font-medium">
                    {selectedCount} de {saleData.lineas.length} ítems seleccionados
                  </span>
                </div>

                <div className="space-y-2.5">
                  {saleData.lineas.map((line) => {
                    const isSelected = selectedItems.has(line.idDetalle);
                    const isAvailable = line.cantidadDisponible > 0;
                    const selectedState = selectedItems.get(line.idDetalle);

                    return (
                      <div
                        key={line.idDetalle}
                        className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
                          isSelected
                            ? "bg-blue-50/50 border-blue-400 shadow-xs"
                            : isAvailable
                            ? "bg-white border-slate-200 hover:border-slate-300"
                            : "bg-slate-50/60 border-slate-200/60 opacity-60"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          {/* Checkbox y Nombre */}
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!isAvailable}
                              onChange={() => handleToggleItem(line)}
                              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-sm font-semibold text-slate-900 truncate">
                                  {line.nombreProd}
                                </h4>
                                <span className="font-mono text-[11px] text-slate-500">
                                  [{line.codbarrasProd}]
                                </span>
                              </div>

                              {/* Badges de Balance y Plazo de Garantía */}
                              <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium border border-slate-200">
                                  Vendidos: {line.cantidadVendida} unid.
                                </span>
                                {line.cantidadAprobada > 0 && (
                                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium border border-emerald-200">
                                    Aprobados: {line.cantidadAprobada}
                                  </span>
                                )}
                                {line.cantidadPendiente > 0 && (
                                  <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-medium border border-amber-200">
                                    Reservados en Pendiente: {line.cantidadPendiente}
                                  </span>
                                )}
                                <span
                                  className={`px-2 py-0.5 rounded font-bold border ${
                                    line.cantidadDisponible > 0
                                      ? "bg-blue-50 text-blue-700 border-blue-200"
                                      : "bg-rose-50 text-rose-700 border-rose-200"
                                  }`}
                                >
                                  Disponible: {line.cantidadDisponible} unid.
                                </span>

                                {/* Indicador de Garantía */}
                                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 border border-slate-200">
                                  {line.garantiaVigente ? (
                                    <>
                                      <ShieldCheck className="h-3 w-3 text-emerald-600" />
                                      <span className="text-emerald-700 font-medium">
                                        Garantía Vigente ({line.diasGarantiaRestantes} d)
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <ShieldAlert className="h-3 w-3 text-rose-600" />
                                      <span className="text-rose-700 font-medium">
                                        Garantía Expirada
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Precio Unitario */}
                          <div className="text-right shrink-0">
                            <span className="text-xs text-slate-500 block">Precio Venta</span>
                            <span className="text-sm font-bold text-slate-900 font-mono">
                              {formatCurrency(line.precioUnitario)}
                            </span>
                          </div>
                        </div>

                        {/* Controles de Entrada (cuando está seleccionado) */}
                        {isSelected && selectedState && (
                          <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Cantidad a Devolver (Máx: {line.cantidadDisponible})
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={1}
                                  max={line.cantidadDisponible}
                                  value={selectedState.cantidadDev}
                                  onChange={(e) =>
                                    handleQuantityChange(
                                      line.idDetalle,
                                      parseInt(e.target.value) || 1,
                                      line.cantidadDisponible
                                    )
                                  }
                                  className="w-24 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm text-center font-bold text-blue-600 focus:outline-none focus:border-blue-500"
                                />
                                <span className="text-xs text-slate-600">
                                  Subtotal devolución:{" "}
                                  <strong className="text-slate-900 font-mono">
                                    {formatCurrency(
                                      selectedState.cantidadDev * line.precioUnitario
                                    )}
                                  </strong>
                                </span>
                              </div>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Causa / Motivo del Trámite
                              </label>
                              <select
                                value={selectedState.idMotivo}
                                onChange={(e) =>
                                  handleMotiveChange(line.idDetalle, Number(e.target.value))
                                }
                                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                              >
                                {motivos.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.descripcion}
                                  </option>
                                ))}
                              </select>
                              <p className="text-[10px] text-slate-500 mt-1">
                                {selectedState.idMotivo === 1
                                  ? "Producto con daño físico o fallo interno (No reingresa a stock vendible)."
                                  : selectedState.idMotivo === 2
                                  ? "Error de despacho. Sellado y apto para reventa tras inspección."
                                  : "Falla de fábrica cubierta por garantía técnica."}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 4. Resumen y Empleado Responsable */}
              {selectedCount > 0 && (
                <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 space-y-3 animate-in fade-in duration-150">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-blue-200/60 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                          Resumen del Trámite RMA
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            estimatedAmount >= saleData.totalVenta - 0.01
                              ? "bg-rose-100 text-rose-800 border border-rose-200"
                              : "bg-blue-100 text-blue-800 border border-blue-200"
                          }`}
                        >
                          {estimatedAmount >= saleData.totalVenta - 0.01
                            ? "Devolución Total (Anulación de Comprobante)"
                            : "Devolución Parcial (Ajuste de Comprobante)"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        {selectedCount} producto(s) seleccionado(s) • Total unidades:{" "}
                        <strong className="text-slate-900">{totalUnits} unid.</strong>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-right">
                      <div>
                        <span className="text-[10px] text-slate-500 block">Venta Original</span>
                        <span className="text-xs font-semibold text-slate-700 font-mono">
                          {formatCurrency(saleData.totalVenta)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-rose-600 block font-semibold">A Devolver</span>
                        <span className="text-sm font-bold text-rose-700 font-mono">
                          -{formatCurrency(estimatedAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-emerald-700 block font-semibold">Conservado</span>
                        <span className="text-sm font-bold text-emerald-700 font-mono">
                          {formatCurrency(Math.max(0, saleData.totalVenta - estimatedAmount))}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Advertencia Transaccional */}
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                    <p className="leading-relaxed">
                      <strong>Política de Reserva Transaccional:</strong> Al registrar este trámite,
                      las {totalUnits} unidades quedarán en estado{" "}
                      <span className="text-amber-900 font-bold">Pendiente</span> y reservadas en la
                      base de datos, impidiendo que otra terminal las devuelva. La mercadería no
                      ingresa al stock físico de almacén hasta su posterior evaluación y aprobación
                      administrativa.
                    </p>
                  </div>
                </div>
              )}

              {submitError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pie Fijo con Acciones */}
        <div className="p-4 sm:p-5 border-t border-slate-200 flex items-center justify-between gap-3 bg-slate-50/80 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || selectedCount === 0 || !saleData}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center gap-2 shadow-xs transition-all cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                <span>Registrando Transacción...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>Registrar Devolución ({totalUnits} unid.)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
