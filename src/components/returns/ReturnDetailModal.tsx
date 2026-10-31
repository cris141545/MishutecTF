"use client";

import { useState, useEffect } from "react";
import { ReturnDetail, ReturnReceiptData } from "@/types/returns";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  approveReturnAction,
  rejectReturnAction,
  getReturnReceiptAction,
} from "@/lib/actions/return.actions";
import { ReturnReceiptModal } from "./ReturnReceiptModal";
import { CreditNoteModal } from "./CreditNoteModal";
import {
  X,
  RotateCcw,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  ShieldCheck,
  ShieldAlert,
  User,
  AlertTriangle,
  Info,
  Calendar,
  Layers,
  ArrowRight,
  Package,
  Receipt,
  FileCheck2,
} from "lucide-react";

interface ReturnDetailModalProps {
  detail: ReturnDetail;
  onClose: () => void;
  onActionComplete?: () => void;
}

export function ReturnDetailModal({ detail, onClose, onActionComplete }: ReturnDetailModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [reingresoStock, setReingresoStock] = useState(false);
  const [idMetodoReembolso, setIdMetodoReembolso] = useState<number>(1); // 1 = Efectivo
  const [emitirNotaCredito, setEmitirNotaCredito] = useState<boolean>(true);
  const [motivoNotaCredito, setMotivoNotaCredito] = useState<string>("");
  const [receiptData, setReceiptData] = useState<ReturnReceiptData | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showCreditNoteModal, setShowCreditNoteModal] = useState(false);
  const [loadingReceipt, setLoadingReceipt] = useState(false);

  const handleOpenReceipt = async () => {
    try {
      setLoadingReceipt(true);
      const res = await getReturnReceiptAction(detail.idDevolucion);
      if (res.success && res.data) {
        setReceiptData(res.data);
        setShowReceiptModal(true);
      } else {
        setActionError(res.error || "No se pudo cargar la constancia de devolución.");
      }
    } catch (err: any) {
      setActionError(err.message || "Error al generar constancia.");
    } finally {
      setLoadingReceipt(false);
    }
  };

  // Comprobar si tiene algún ítem con motivo 'Producto equivocado' (ID = 2)
  const hasWrongProduct = detail.lineasDevolucion.some((l) => l.idMotivo === 2);
  const isPending = detail.idEstadoDev === 1;

  // Manejo de tecla Escape y bloqueo de scroll de fondo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isProcessing) onClose();
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, isProcessing]);

  const handleApprove = async () => {
    try {
      setIsProcessing(true);
      setActionError(null);
      setActionSuccess(null);

      const res = await approveReturnAction({
        idDevolucion: detail.idDevolucion,
        reingresoStock: hasWrongProduct ? reingresoStock : false,
        idMetodoReembolso,
        emitirNotaCredito,
        motivoNotaCredito: motivoNotaCredito.trim() || undefined,
      });

      if (!res.success || !res.data) {
        setActionError(res.error || "No se pudo aprobar la devolución.");
        return;
      }

      const ncMsg = res.data.notaCredito
        ? ` Nota de Crédito ${res.data.notaCredito.numeroNota} emitida.`
        : "";

      setActionSuccess(
        (res.data.reingresoKardexRealizado
          ? `Devolución #${detail.idDevolucion} aprobada exitosamente. Se reingresaron ${res.data.unidadesReingresadas} unidades al inventario (Kardex).`
          : `Devolución #${detail.idDevolucion} aprobada exitosamente. Sin alteración de stock comercial.`) +
          ncMsg
      );

      if (onActionComplete) {
        setTimeout(() => {
          onActionComplete();
        }, 1200);
      }
    } catch (err: any) {
      setActionError(err.message || "Error al procesar la aprobación.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    try {
      setIsProcessing(true);
      setActionError(null);
      setActionSuccess(null);

      const res = await rejectReturnAction({
        idDevolucion: detail.idDevolucion,
      });

      if (!res.success || !res.data) {
        setActionError(res.error || "No se pudo rechazar la devolución.");
        return;
      }

      setActionSuccess(
        `Devolución #${detail.idDevolucion} rechazada. Las unidades reservadas han sido liberadas para el comprobante original.`
      );

      if (onActionComplete) {
        setTimeout(() => {
          onActionComplete();
        }, 1200);
      }
    } catch (err: any) {
      setActionError(err.message || "Error al procesar el rechazo.");
    } finally {
      setIsProcessing(false);
    }
  };

  const renderStatusBadge = (estado: string, idEstado: number) => {
    switch (idEstado) {
      case 2:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Aprobada</span>
          </span>
        );
      case 1:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 border border-amber-200 text-amber-700">
            <Clock className="h-3.5 w-3.5" />
            <span>En Revisión (Pendiente)</span>
          </span>
        );
      case 3:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 border border-rose-200 text-rose-700">
            <XCircle className="h-3.5 w-3.5" />
            <span>Rechazada</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
            {estado}
          </span>
        );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-return-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
        {/* Cabecera Fija */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 shrink-0">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3
                  id="modal-return-title"
                  className="text-base sm:text-lg font-bold text-slate-900 truncate"
                >
                  Ficha de Devolución DEV-#{detail.idDevolucion.toString().padStart(4, "0")}
                </h3>
                {renderStatusBadge(detail.estadoDev, detail.idEstadoDev)}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Trámite registrado el {formatDate(detail.fechaDev)} en SQL Server
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Contenido desplazable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 text-sm">
          {/* Mensajes de Acción Transaccional */}
          {actionSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5 animate-in fade-in duration-150">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {actionError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5 animate-in fade-in duration-150">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Bloque 1: Resumen de Venta Original y Titular */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Comprobante de Venta
              </span>
              <div className="flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-blue-600" />
                <span className="font-mono font-bold text-slate-900">
                  {detail.numeroComprobante}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Emisión: {formatDate(detail.fechaVenta)}
              </p>
              <p className="text-xs text-blue-600 font-semibold font-mono">
                Total Venta: {formatCurrency(detail.totalVenta)}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Cliente Titular
              </span>
              <div className="flex items-center gap-1.5">
                <User className="h-4 w-4 text-slate-500" />
                <span className="font-semibold text-slate-900 truncate">
                  {detail.clienteNombre}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono">
                DNI: {detail.dniCliente}
              </p>
              {detail.clienteCorreo && (
                <p className="text-[11px] text-slate-500 truncate">
                  {detail.clienteCorreo}
                </p>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Operador Responsable
              </span>
              <p className="font-semibold text-slate-900">
                {detail.empleadoNombre}
              </p>
              <p className="text-xs text-slate-500">
                ID Empleado #{detail.idEmpleado}
              </p>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 font-medium inline-block">
                Área de Soporte Técnico / Caja
              </span>
            </div>
          </div>

          {/* Desglose Financiero: Devuelto vs Conservado */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-slate-50 to-blue-50/40 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Desglose Financiero de la Operación
              </span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                  detail.montoEstimadoDevuelto >= detail.totalVenta - 0.01
                    ? "bg-rose-100 text-rose-800 border border-rose-200"
                    : "bg-blue-100 text-blue-800 border border-blue-200"
                }`}
              >
                {detail.montoEstimadoDevuelto >= detail.totalVenta - 0.01
                  ? "Devolución Total (Anulación de Comprobante)"
                  : "Devolución Parcial (Ajuste de Comprobante)"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 block uppercase font-semibold">Total Venta Original</span>
                <span className="text-sm font-bold text-slate-900 font-mono">{formatCurrency(detail.totalVenta)}</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] text-rose-600 block uppercase font-semibold">Importe Devuelto / Reembolsado</span>
                <span className="text-sm font-bold text-rose-600 font-mono">-{formatCurrency(detail.montoEstimadoDevuelto)}</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] text-emerald-600 block uppercase font-semibold">Importe Conservado por Cliente</span>
                <span className="text-sm font-bold text-emerald-700 font-mono">
                  {formatCurrency(detail.montoConservado ?? Math.max(0, detail.totalVenta - detail.montoEstimadoDevuelto))}
                </span>
              </div>
            </div>
          </div>

          {/* Tarjeta de Nota de Crédito si ya fue emitida */}
          {detail.notaCredito && (
            <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-700" />
                  <span className="text-xs font-bold text-purple-900 uppercase tracking-wider">
                    Nota de Crédito Vinculada: {detail.notaCredito.numeroNota}
                  </span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-200 text-purple-900">
                  {detail.notaCredito.esSimulacionAcademica ? "Simulación Académica / Referencial SUNAT" : "Emitida"}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 block">Fecha Emisión:</span>
                  <span className="font-semibold text-slate-800">{formatDate(detail.notaCredito.fechaEmision)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Tipo Ajuste:</span>
                  <span className="font-bold text-purple-800">{detail.notaCredito.tipoAjuste}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Base Imponible:</span>
                  <span className="font-semibold font-mono text-slate-800">{formatCurrency(detail.notaCredito.montoSubtotal)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Monto Total NC (con IGV):</span>
                  <span className="font-bold font-mono text-purple-900">{formatCurrency(detail.notaCredito.montoTotal)}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-600 italic">
                <strong>Motivo NC:</strong> {detail.notaCredito.motivo}
              </p>
            </div>
          )}

          {/* Tarjeta de Reembolso si ya fue efectuado */}
          {detail.reembolso && (
            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-emerald-700" />
                  <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                    Reembolso Efectuado: {detail.reembolso.nombreMetodo}
                  </span>
                </div>
                <span className="text-xs font-bold text-emerald-800 font-mono">
                  {formatCurrency(detail.reembolso.monto)}
                </span>
              </div>
              <div className="text-xs text-slate-700 flex flex-wrap gap-x-4 gap-y-1">
                <span>Fecha: <strong>{detail.reembolso.fechaHora}</strong></span>
                <span>
                  Afectación:{" "}
                  <strong className={detail.reembolso.afectaEfectivo ? "text-emerald-800" : "text-blue-800"}>
                    {detail.reembolso.afectaEfectivo ? "Descontado de efectivo en caja física" : "Medio digital (no descuenta gaveta)"}
                  </strong>
                </span>
                {detail.reembolso.referencia && (
                  <span>Referencia: <em>{detail.reembolso.referencia}</em></span>
                )}
              </div>
            </div>
          )}

          {/* Bloque 2: Líneas Involucradas en esta Devolución */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-600" />
                <span>Líneas Afectadas en esta Devolución</span>
              </h4>
              <span className="text-xs text-slate-500">
                {detail.totalUnidadesDevueltas} unid. en este trámite
              </span>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                      <th className="py-2.5 px-3">Producto / Código</th>
                      <th className="py-2.5 px-3 text-right">Precio Venta</th>
                      <th className="py-2.5 px-3 text-center">Vendidos</th>
                      <th className="py-2.5 px-3 text-center">Devueltos</th>
                      <th className="py-2.5 px-3 text-center">Disponibles</th>
                      <th className="py-2.5 px-3 text-center">Causa / Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.lineasDevolucion.map((line) => (
                      <tr key={line.idDetalle} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3">
                          <span className="font-medium text-slate-900 block truncate max-w-[200px]">
                            {line.nombreProd}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500">
                            {line.codbarras}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                          {formatCurrency(line.precioVentaOriginal)}
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-700">
                          {line.cantidadVendidaOriginal} unid.
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="font-bold text-blue-600 text-sm font-mono">
                            {line.cantidadDevueltaEstaDev}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-slate-500">
                          {line.cantidadDisponibleDevolucion} unid.
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                            {line.motivo || "No especificado"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Bloque 3: Análisis de Garantía Legal por Producto */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>Análisis de Garantía Legal por Producto</span>
            </h4>

            <div className="space-y-2">
              {detail.lineasDevolucion.map((line) => (
                <div
                  key={`garantia-${line.idDetalle}`}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <span className="font-medium text-slate-900 text-xs block">
                      {line.nombreProd}
                    </span>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span>Plazo: <strong>{line.garantiaMeses} meses</strong></span>
                      <span>•</span>
                      <span>Venta: {formatDate(line.fechaVenta)}</span>
                      <span>•</span>
                      <span>Vencimiento Estimado: {formatDate(line.fechaVencimientoGarantia)}</span>
                    </div>
                  </div>

                  <div>
                    {line.garantiaVigente ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>Garantía Vigente ({line.diasRestantesGarantia} días restantes)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 border border-rose-200 text-rose-700">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        <span>Garantía Expirada hace {Math.abs(line.diasRestantesGarantia)} días</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Observación de Esquema */}
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Observación de Esquema:</strong> El cálculo de vigencia se deriva de{" "}
                <code>dbo.Producto.Garantia_meses</code> sumado a <code>Fecha_venta</code>. Dado que la
                tabla <code>Detalle_Venta</code> no almacena una captura histórica del plazo de garantía al
                momento de la compra, cualquier modificación posterior en el catálogo alteraría este cálculo
                prospectivamente.
              </p>
            </div>
          </div>

          {/* Bloque 4: Panel de Aprobación / Rechazo para Trámites Pendientes (Fase 7B) */}
          {isPending && !actionSuccess && (
            <div className="p-4 rounded-xl bg-slate-50 border border-blue-200 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <span>Resolución Administrativa del Trámite</span>
                </h4>
                <span className="text-[11px] text-amber-800 font-semibold bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                  Requiere Autorización
                </span>
              </div>

              {/* Opciones de Reembolso y Ajuste Documentario */}
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-3">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                  Configuración de Reembolso y Nota de Crédito
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Medio para Efectuar el Reembolso
                    </label>
                    <select
                      value={idMetodoReembolso}
                      onChange={(e) => setIdMetodoReembolso(Number(e.target.value))}
                      disabled={isProcessing}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value={1}>Efectivo (Descuenta saldo físico de caja)</option>
                      <option value={4}>Yape / Plin (Digital - No descuenta efectivo de gaveta)</option>
                      <option value={2}>Tarjeta de Crédito / Débito (Bancarizado)</option>
                      <option value={3}>Transferencia Bancaria (BCP / BBVA)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Emisión de Nota de Crédito
                    </label>
                    <label className="flex items-center gap-2 mt-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={emitirNotaCredito}
                        onChange={(e) => setEmitirNotaCredito(e.target.checked)}
                        disabled={isProcessing}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className="text-xs font-medium text-slate-800">
                        Generar correlativo NC01 (SUNAT Formulario 621)
                      </span>
                    </label>
                  </div>
                </div>

                {emitirNotaCredito && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Motivo de la Nota de Crédito (Opcional)
                    </label>
                    <input
                      type="text"
                      value={motivoNotaCredito}
                      onChange={(e) => setMotivoNotaCredito(e.target.value)}
                      disabled={isProcessing}
                      placeholder="Ej. Devolución de producto y reembolso al cliente..."
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>

              {/* Opción de Reingreso Físico (Solo si hay Producto equivocado) */}
              {hasWrongProduct ? (
                <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-2">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reingresoStock}
                      onChange={(e) => setReingresoStock(e.target.checked)}
                      disabled={isProcessing}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <div className="text-xs">
                      <span className="font-semibold text-slate-900 block">
                        Confirmar inspección técnica y reingreso físico a almacén (Kardex)
                      </span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Aplica únicamente a ítems con motivo "Producto equivocado". Al marcar esta
                        opción, el stock del producto aumentará en almacén y se registrará un movimiento
                        de Entrada en Kardex.
                      </p>
                    </div>
                  </label>
                </div>
              ) : (
                <div className="p-2.5 rounded-lg bg-white text-xs text-slate-600 flex items-center gap-2 border border-slate-200">
                  <Info className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>
                    Este trámite corresponde a producto defectuoso o garantía; su aprobación{" "}
                    <strong>no incrementará el stock comercial ni generará Kardex de reingreso</strong>.
                  </span>
                </div>
              )}

              {/* Botones de Resolución Transaccional */}
              <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={isProcessing}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  <XCircle className="h-4 w-4 text-rose-600" />
                  <span>Rechazar Devolución (Liberar Reserva)</span>
                </button>

                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={isProcessing}
                  className="w-full sm:w-auto px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                      <span>Procesando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Aprobar Devolución Definitiva</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Bloque 5: Constancia Interna */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Constancia Interna de Trámite:</strong> Este documento acredita el control físico
              y administrativo de la devolución en <strong>MishutecT2_Aceptacion</strong>. No constituye
              ni reemplaza una Nota de Crédito Electrónica emitida ante la administración tributaria (SUNAT).
            </p>
          </div>
        </div>

        {/* Pie Fijo */}
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-500 font-mono">
            ID Trámite: #{detail.idDevolucion} | Venta: #{detail.idVenta}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {detail.idEstadoDev === 2 && (
              <>
                <button
                  type="button"
                  onClick={handleOpenReceipt}
                  disabled={loadingReceipt}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer"
                >
                  <Receipt className="h-4 w-4" />
                  <span>{loadingReceipt ? "Cargando..." : "Constancia Comercial"}</span>
                </button>

                {detail.notaCredito && (
                  <button
                    type="button"
                    onClick={() => setShowCreditNoteModal(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer"
                  >
                    <FileCheck2 className="h-4 w-4 text-cyan-400" />
                    <span>Nota de Crédito</span>
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs transition-colors shadow-xs"
            >
              Cerrar Ficha
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Constancia Comercial Imprimible */}
      <ReturnReceiptModal
        receipt={receiptData}
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
      />

      {/* Modal de Nota de Crédito */}
      <CreditNoteModal
        creditNote={detail.notaCredito || null}
        saleVoucherNumber={detail.numeroComprobante}
        clientName={detail.clienteNombre}
        clientDni={detail.dniCliente}
        isOpen={showCreditNoteModal}
        onClose={() => setShowCreditNoteModal(false)}
      />
    </div>
  );
}
