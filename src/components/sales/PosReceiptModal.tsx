import { useEffect, useRef } from "react";
import { TransactionalSaleResult } from "@/lib/repositories/sale-transaction.repository";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { calculateTaxFromTotal, getTaxDisclaimer } from "@/lib/tax";
import {
  Printer,
  X,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Receipt,
  Cpu,
} from "lucide-react";

interface PosReceiptModalProps {
  sale: TransactionalSaleResult;
  onClose: () => void;
}

export function PosReceiptModal({ sale, onClose }: PosReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const taxBreakdown = calculateTaxFromTotal(sale.totalVenta);

  // Cierre con Escape y bloqueo de scroll
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

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pos-receipt-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-xl max-h-[94vh] flex flex-col rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* Cabecera Fija */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/80 dark:bg-slate-900/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="pos-receipt-title"
                className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"
              >
                <span>¡Venta Confirmada con Éxito!</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                {sale.numeroComprobante} &bull; Transacción ACID Registrada en SQL Server
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Cerrar recibo"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cuerpo del Recibo Imprimible (Scroll Interno) */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 bg-slate-50/50 dark:bg-slate-950/50">
          {/* Tarjeta de Formato Físico / Ticket Imprimible */}
          <div
            ref={receiptRef}
            className="p-5 sm:p-6 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 print:p-0 print:border-none print:shadow-none"
          >
            {/* Encabezado Comercial */}
            <div className="text-center border-b border-dashed border-slate-300 pb-4">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Cpu className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-black tracking-tight text-slate-900">
                  MISHUTEC
                </h3>
              </div>
              <p className="text-xs font-semibold text-slate-700">
                Componentes de PC de Alto Rendimiento
              </p>
              <p className="text-[11px] text-slate-500">
                Sistema Comercial &bull; Terminal Punto de Venta
              </p>

              <div className="mt-3 py-1.5 px-3 rounded bg-slate-100 inline-block border border-slate-200">
                <span className="text-xs font-bold font-mono tracking-wide text-slate-800">
                  {sale.tipoComprobante.toUpperCase()}: {sale.numeroComprobante}
                </span>
              </div>
            </div>

            {/* Metadatos de la Venta */}
            <div className="grid grid-cols-2 gap-2 text-xs py-1 border-b border-dashed border-slate-300">
              <div>
                <span className="text-[10px] text-slate-500 block uppercase font-bold">
                  Fecha de Emisión:
                </span>
                <span className="font-medium text-slate-800">{formatDate(sale.fecha)}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">
                  Operador / Cajero:
                </span>
                <span className="font-medium text-slate-800">{sale.empleadoNombre}</span>
              </div>
              <div className="col-span-2 pt-1">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">
                  Cliente Titular:
                </span>
                <span className="font-semibold text-slate-900">
                  {sale.clienteNombre} &bull; <span className="font-mono font-normal">DNI: {sale.dniCliente}</span>
                </span>
              </div>
            </div>

            {/* Detalle de Artículos */}
            <div className="space-y-1">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] text-slate-500 uppercase font-semibold">
                    <th className="py-1">Cant.</th>
                    <th className="py-1 px-2">Descripción</th>
                    <th className="py-1 text-right">P.U.</th>
                    <th className="py-1 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sale.items.map((item) => (
                    <tr key={item.codbarras}>
                      <td className="py-2 font-mono font-bold text-slate-800">
                        {item.cantidad}
                      </td>
                      <td className="py-2 px-2">
                        <span className="font-semibold text-slate-900 block leading-tight">
                          {item.nombre}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {item.codbarras}
                        </span>
                      </td>
                      <td className="py-2 text-right font-mono text-slate-700">
                        {formatCurrency(item.precioUnitario)}
                      </td>
                      <td className="py-2 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Desglose Tributario Oficial Perú 2026 */}
            <div className="border-t border-dashed border-slate-300 pt-2 space-y-1 font-mono text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal Bruto:</span>
                <span>{formatCurrency(sale.totalVenta)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Descuento Global:</span>
                <span>{formatCurrency(0)}</span>
              </div>
              <div className="flex justify-between text-slate-700 font-semibold">
                <span>Base Imponible (Gravada):</span>
                <span>{formatCurrency(taxBreakdown.baseImponible)}</span>
              </div>
              <div className="flex justify-between text-slate-600 text-[11px] pl-2">
                <span>&bull; IGV (15.5%):</span>
                <span>{formatCurrency(taxBreakdown.igv)}</span>
              </div>
              <div className="flex justify-between text-slate-600 text-[11px] pl-2">
                <span>&bull; IPM (2.5%):</span>
                <span>{formatCurrency(taxBreakdown.ipm)}</span>
              </div>
              <div className="flex justify-between text-slate-800 font-bold border-t border-slate-200 pt-0.5">
                <span>Total Impuestos (18.0%):</span>
                <span>{formatCurrency(taxBreakdown.totalImpuestos)}</span>
              </div>
            </div>

            {/* Resumen Total y Desglose de Pagos */}
            <div className="border-t-2 border-slate-900 pt-2 space-y-2 text-xs">
              <div className="flex items-center justify-between text-base font-black">
                <span className="text-slate-900">TOTAL DE LA VENTA:</span>
                <span className="font-mono text-blue-600">{formatCurrency(sale.totalVenta)}</span>
              </div>

              {/* Detalle de Efectivo Recibido y Vuelto */}
              {sale.efectivoRecibido != null && sale.efectivoRecibido > 0 && (
                <div className="p-2.5 rounded bg-slate-50 border border-slate-200 space-y-1 font-mono text-xs">
                  <div className="flex justify-between text-slate-700">
                    <span>Efectivo Entregado:</span>
                    <span className="font-bold text-slate-900">{formatCurrency(sale.efectivoRecibido)}</span>
                  </div>
                  {sale.vuelto != null && sale.vuelto > 0 && (
                    <div className="flex justify-between text-emerald-700 font-bold">
                      <span>Vuelto al Cliente:</span>
                      <span>{formatCurrency(sale.vuelto)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-900 font-bold pt-1 border-t border-slate-200">
                    <span>Cobro Neto Efectivo:</span>
                    <span>{formatCurrency(sale.efectivoRecibido - (sale.vuelto || 0))}</span>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-dashed border-slate-300 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 block uppercase">
                  Medios de Pago Utilizados:
                </span>
                {sale.pagos.map((p) => (
                  <div key={p.idMetodo} className="flex justify-between text-xs text-slate-700 font-mono">
                    <span>{p.nombreMetodo}:</span>
                    <span className="font-bold">{formatCurrency(p.monto)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Leyenda Legal Obligatoria */}
            <div className="pt-3 border-t border-dashed border-slate-300 text-center">
              <p className="text-[10px] text-slate-500 uppercase font-bold leading-tight">
                Comprobante comercial de uso interno.
              </p>
              <p className="text-[9px] text-slate-400 mt-0.5">
                No constituye comprobante electrónico autorizado por SUNAT.
              </p>
              <p className="text-[9px] text-slate-400 mt-2 font-mono">
                *** GRACIAS POR SU COMPRA ***
              </p>
            </div>
          </div>
        </div>

        {/* Barra de Acciones Inferior */}
        <div className="p-3.5 sm:p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5 shrink-0">
          <div className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Kardex y existencias actualizados</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[42px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors"
            >
              <Printer className="h-4 w-4" />
              <span>Imprimir Comprobante</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 min-h-[42px] rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 shadow-xs transition-colors"
            >
              Nueva Venta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
