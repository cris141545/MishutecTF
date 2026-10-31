import { useState } from "react";
import { SaleListItem } from "@/types/sales";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  FileText,
  Calendar,
  User,
  CreditCard,
  Eye,
  ChevronLeft,
  ChevronRight,
  Package,
} from "lucide-react";

interface SaleTableProps {
  sales: SaleListItem[];
  onViewDetail: (idVenta: number) => void;
}

const ITEMS_PER_PAGE = 8;

export function SaleTable({ sales, onViewDetail }: SaleTableProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(sales.length / ITEMS_PER_PAGE) || 1;
  const paginatedSales = sales.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const renderSaleStatusBadge = (estado?: string) => {
    const st = estado?.toUpperCase() || "COMPLETADA";
    switch (st) {
      case "TOTALMENTE DEVUELTA":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 border border-rose-200 text-rose-700">
            Totalmente Devuelta
          </span>
        );
      case "PARCIALMENTE DEVUELTA":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-700">
            Parcialmente Devuelta
          </span>
        );
      case "PENDIENTE":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 border border-blue-200 text-blue-700">
            Pendiente
          </span>
        );
      case "ANULADA":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 border border-slate-300 text-slate-600">
            Anulada
          </span>
        );
      case "COMPLETADA":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-700">
            Completada
          </span>
        );
    }
  };

  if (sales.length === 0) {
    return (
      <div className="p-8 text-center rounded-xl bg-white border border-slate-200 text-slate-500 shadow-xs">
        <FileText className="h-10 w-10 mx-auto text-slate-400 mb-2 opacity-50" />
        <p className="text-sm font-semibold text-slate-900">
          No se encontraron ventas con los filtros seleccionados.
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Intente ajustando el término de búsqueda o rango de fechas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Vista Móvil (< 768px): Tarjetas Adaptables */}
      <div className="md:hidden space-y-3">
        {paginatedSales.map((sale) => (
          <div
            key={sale.idVenta}
            className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3 hover:border-blue-300 transition-colors"
          >
            {/* Fila 1: Comprobante, Tipo y Monto */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                <div>
                  <span className="font-mono font-bold text-slate-900 text-sm block">
                    {sale.numeroComprobante}
                  </span>
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${
                      sale.tipoComprobante === "Factura"
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : "bg-slate-100 text-slate-700 border border-slate-200"
                    }`}
                  >
                    {sale.tipoComprobante}
                  </span>
                  <div className="mt-1">
                    {renderSaleStatusBadge(sale.estado)}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="font-mono font-bold text-slate-900 text-base block">
                  {formatCurrency(sale.total)}
                </span>
                <span className="text-[10px] text-slate-500">
                  {sale.totalItems} {sale.totalItems === 1 ? "ítem" : "ítems"}
                </span>
              </div>
            </div>

            {/* Fila 2: Cliente y Fecha */}
            <div className="text-xs space-y-1 pt-1 border-t border-slate-100">
              <div className="flex items-center justify-between text-slate-800">
                <span className="font-semibold truncate">{sale.clienteNombre}</span>
                <span className="text-slate-500 font-mono text-[11px] shrink-0">
                  DNI: {sale.dniCliente}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span className="truncate">Atendido por: {sale.empleadoNombre}</span>
                <span className="shrink-0">{formatDate(sale.fecha)}</span>
              </div>
            </div>

            {/* Fila 3: Método de pago y Botón de Acción */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-700 border border-slate-200 truncate max-w-[170px]">
                {sale.metodosPago}
              </span>

              <button
                type="button"
                onClick={() => onViewDetail(sale.idVenta)}
                className="inline-flex items-center gap-1.5 px-3 min-h-[42px] rounded-lg bg-white hover:bg-blue-50 active:bg-blue-100 text-blue-600 text-xs font-semibold border border-slate-200 hover:border-blue-300 transition-colors shadow-xs"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Ver Detalle</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Vista Escritorio (>= 768px): Tabla Densa */}
      <div className="hidden md:block rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase text-[11px] tracking-wider font-semibold">
                <th className="py-3 px-4">Comprobante</th>
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4">Atendido por</th>
                <th className="py-3 px-4">Método de Pago</th>
                <th className="py-3 px-4 text-center">Estado</th>
                <th className="py-3 px-4 text-center">Ítems</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {paginatedSales.map((sale) => (
                <tr
                  key={sale.idVenta}
                  className="hover:bg-slate-50/80 transition-colors"
                >
                  {/* Comprobante */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                      <div>
                        <span className="font-mono font-semibold text-slate-900 block">
                          {sale.numeroComprobante}
                        </span>
                        <span
                          className={`inline-block px-1.5 py-0.2 rounded text-[9px] uppercase font-bold tracking-wider ${
                            sale.tipoComprobante === "Factura"
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : "bg-slate-100 text-slate-700 border border-slate-200"
                          }`}
                        >
                          {sale.tipoComprobante}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Fecha */}
                  <td className="py-3 px-4 whitespace-nowrap text-slate-600 font-mono">
                    {formatDate(sale.fecha)}
                  </td>

                  {/* Cliente */}
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">
                      {sale.clienteNombre}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      DNI: {sale.dniCliente}
                    </div>
                  </td>

                  {/* Empleado */}
                  <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                    {sale.empleadoNombre}
                  </td>

                  {/* Métodos de Pago */}
                  <td className="py-3 px-4">
                    <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-slate-50 text-slate-700 border border-slate-200 font-medium whitespace-nowrap">
                      {sale.metodosPago}
                    </span>
                  </td>

                  {/* Estado */}
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    {renderSaleStatusBadge(sale.estado)}
                  </td>

                  {/* Ítems */}
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    <span className="font-mono text-slate-600 font-medium">
                      {sale.totalItems} unid.
                    </span>
                  </td>

                  {/* Total */}
                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 text-sm whitespace-nowrap">
                    {formatCurrency(sale.total)}
                  </td>

                  {/* Acciones */}
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onViewDetail(sale.idVenta)}
                      title="Ver Detalle y Conciliación"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 hover:border-blue-300 transition-colors text-xs font-semibold shadow-xs"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Ficha</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 px-1">
          <span>
            Página <strong className="text-slate-800">{currentPage}</strong> de <strong className="text-slate-800">{totalPages}</strong> ({sales.length} comprobantes)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors shadow-xs"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors shadow-xs"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
