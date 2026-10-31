import { ReturnSummaryItem } from "@/types/returns";
import { formatDate, formatNumber } from "@/lib/formatters";
import {
  RotateCcw,
  Eye,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  User,
  Package,
} from "lucide-react";

interface ReturnTableProps {
  returns: ReturnSummaryItem[];
  onSelectReturn: (idDevolucion: number) => void;
  isLoading?: boolean;
}

export function ReturnTable({
  returns,
  onSelectReturn,
  isLoading,
}: ReturnTableProps) {
  if (isLoading) {
    return (
      <div className="p-8 text-center rounded-xl bg-white border border-slate-200">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3" />
        <p className="text-xs text-slate-500">Cargando registros de devoluciones...</p>
      </div>
    );
  }

  if (returns.length === 0) {
    return (
      <div className="p-12 text-center rounded-xl bg-white border border-slate-200">
        <RotateCcw className="h-10 w-10 text-slate-300 mx-auto mb-3" />
        <h4 className="text-sm font-semibold text-slate-800">
          No se encontraron trámites de devolución
        </h4>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          No existen registros que coincidan con los criterios de búsqueda o filtros seleccionados.
        </p>
      </div>
    );
  }

  // Renderizador de badge de estado
  const renderStatusBadge = (estado: string, idEstado: number) => {
    switch (idEstado) {
      case 2: // Aprobada
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700">
            <CheckCircle2 className="h-3 w-3" />
            <span>Aprobada</span>
          </span>
        );
      case 1: // Pendiente
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 border border-amber-200 text-amber-700">
            <Clock className="h-3 w-3" />
            <span>Pendiente</span>
          </span>
        );
      case 3: // Rechazada
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 border border-rose-200 text-rose-700">
            <XCircle className="h-3 w-3" />
            <span>Rechazada</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
            {estado}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Vista de Tabla para Pantallas Medianas y Grandes (Escritorio / Tablet) */}
      <div className="hidden md:block rounded-xl bg-white border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase text-[11px] tracking-wider">
                <th className="py-3 px-4">N° Trámite / Fecha</th>
                <th className="py-3 px-4">Venta Original</th>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4">Operador</th>
                <th className="py-3 px-4">Causa / Motivo</th>
                <th className="py-3 px-4 text-center">Unidades</th>
                <th className="py-3 px-4 text-center">Estado</th>
                <th className="py-3 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {returns.map((ret) => (
                <tr
                  key={ret.idDevolucion}
                  className="hover:bg-slate-50/80 transition-colors group"
                >
                  {/* N° Trámite y Fecha */}
                  <td className="py-3.5 px-4 font-mono">
                    <span className="text-blue-600 font-bold block">
                      DEV-#{ret.idDevolucion.toString().padStart(4, "0")}
                    </span>
                    <span className="text-[11px] text-slate-500 font-sans">
                      {formatDate(ret.fechaDev)}
                    </span>
                  </td>

                  {/* Venta Original */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                      <div>
                        <span className="font-mono font-bold text-slate-900 block">
                          {ret.numeroComprobante}
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          Vendido el {formatDate(ret.fechaVenta)}
                        </span>
                        {ret.tieneNotaCredito && ret.numeroNotaCredito && (
                          <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-mono font-semibold">
                            NC: {ret.numeroNotaCredito}
                          </span>
                        )}
                        {ret.montoReembolsado && ret.montoReembolsado > 0 && (
                          <span className="inline-flex items-center gap-1 mt-0.5 ml-1 px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono">
                            Reemb: S/{ret.montoReembolsado.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Cliente */}
                  <td className="py-3.5 px-4">
                    <span className="font-medium text-slate-900 block truncate max-w-[160px]">
                      {ret.clienteNombre}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      DNI: {ret.dniCliente}
                    </span>
                  </td>

                  {/* Operador Responsable */}
                  <td className="py-3.5 px-4 text-slate-700">
                    <span className="truncate block max-w-[140px]">
                      {ret.empleadoNombre}
                    </span>
                  </td>

                  {/* Motivos */}
                  <td className="py-3.5 px-4">
                    <div className="flex flex-wrap gap-1 max-w-[180px]">
                      {ret.motivos.map((m, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 border border-slate-200 font-medium"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* Unidades Devueltas */}
                  <td className="py-3.5 px-4 text-center">
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      {ret.totalUnidadesDevueltas}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {ret.itemsCount} {ret.itemsCount === 1 ? "artículo" : "artículos"}
                    </span>
                  </td>

                  {/* Estado */}
                  <td className="py-3.5 px-4 text-center">
                    {renderStatusBadge(ret.estadoDev, ret.idEstadoDev)}
                  </td>

                  {/* Acción */}
                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => onSelectReturn(ret.idDevolucion)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 hover:border-blue-300 font-semibold text-xs transition-all shadow-xs cursor-pointer"
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

      {/* Vista de Tarjetas para Dispositivos Móviles (< 768px) */}
      <div className="md:hidden space-y-3">
        {returns.map((ret) => (
          <div
            key={ret.idDevolucion}
            className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3"
          >
            {/* Header Tarjeta */}
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
              <div>
                <span className="font-mono font-bold text-blue-600 text-sm block">
                  DEV-#{ret.idDevolucion.toString().padStart(4, "0")}
                </span>
                <span className="text-[11px] text-slate-500">
                  Registrado el {formatDate(ret.fechaDev)}
                </span>
              </div>
              <div>{renderStatusBadge(ret.estadoDev, ret.idEstadoDev)}</div>
            </div>

            {/* Datos Venta y Cliente */}
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Comprobante Original:</span>
                <span className="font-mono font-bold text-slate-900">
                  {ret.numeroComprobante}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Cliente:</span>
                <span className="text-slate-900 font-medium truncate max-w-[200px]">
                  {ret.clienteNombre}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Operador:</span>
                <span className="text-slate-700 truncate max-w-[200px]">
                  {ret.empleadoNombre}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Unidades Devueltas:</span>
                <span className="font-mono font-bold text-blue-600">
                  {ret.totalUnidadesDevueltas} unid. ({ret.itemsCount} ítems)
                </span>
              </div>
            </div>

            {/* Motivos */}
            <div className="flex flex-wrap gap-1 pt-1">
              {ret.motivos.map((m, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 border border-slate-200 font-medium"
                >
                  {m}
                </span>
              ))}
            </div>

            {/* Botón Ver Ficha */}
            <button
              type="button"
              onClick={() => onSelectReturn(ret.idDevolucion)}
              className="w-full py-2.5 px-3 min-h-[44px] rounded-lg bg-white hover:bg-slate-50 text-blue-600 border border-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Eye className="h-4 w-4" />
              <span>Ver Ficha de Trazabilidad</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
