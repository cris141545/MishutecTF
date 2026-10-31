"use client";

import React, { useState } from "react";
import {
  X,
  Printer,
  Download,
  Receipt,
  CheckCircle2,
  AlertCircle,
  FileText,
  User,
  Calendar,
  Building2,
  Wallet,
  ArrowLeftRight,
} from "lucide-react";
import { ReturnReceiptData } from "@/types/returns";

interface ReturnReceiptModalProps {
  receipt: ReturnReceiptData | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ReturnReceiptModal({
  receipt,
  isOpen,
  onClose,
}: ReturnReceiptModalProps) {
  const [printFormat, setPrintFormat] = useState<"A4" | "THERMAL">("A4");

  if (!isOpen || !receipt) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Contenedor Modal */}
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
        
        {/* Barra superior de herramientas (no se imprime) */}
        <div className="print:hidden flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Constancia Comercial de Devolución
              </h2>
              <p className="text-xs text-slate-500">
                {receipt.numeroDevolucion} • Comprobante comercial interno para el cliente
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Selector de Formato */}
            <div className="flex items-center rounded-lg bg-slate-200/80 p-1 text-xs font-medium">
              <button
                type="button"
                onClick={() => setPrintFormat("A4")}
                className={`rounded-md px-3 py-1.5 transition-all ${
                  printFormat === "A4"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Formato A4
              </button>
              <button
                type="button"
                onClick={() => setPrintFormat("THERMAL")}
                className={`rounded-md px-3 py-1.5 transition-all ${
                  printFormat === "THERMAL"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Ticket 80 mm
              </button>
            </div>

            {/* Botón Imprimir / PDF */}
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-cyan-700 active:scale-95 transition-all"
            >
              <Printer className="h-4 w-4" />
              Imprimir / Guardar PDF
            </button>

            {/* Cerrar */}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Área del documento imprimible */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-100/60 print:bg-white print:p-0">
          
          {/* FORMATO A4 */}
          {printFormat === "A4" && (
            <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm print:border-none print:shadow-none print:p-0">
              
              {/* Encabezado */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-6">
                <div>
                  <h1 className="text-2xl font-black tracking-tight text-slate-900">
                    {receipt.empresa.nombre}
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">RUC: {receipt.empresa.ruc}</p>
                  <p className="text-xs text-slate-500">{receipt.empresa.direccion}</p>
                  <p className="text-xs text-slate-500">Tel: {receipt.empresa.telefono}</p>
                </div>

                <div className="text-right">
                  <div className="inline-block rounded-xl border-2 border-slate-900 px-4 py-2.5 text-center bg-slate-50">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      Constancia de Devolución
                    </p>
                    <p className="text-lg font-black text-slate-900 font-mono">
                      {receipt.numeroDevolucion}
                    </p>
                  </div>
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 border border-amber-200">
                    <AlertCircle className="h-3 w-3" />
                    Documento Interno Sin Validez Tributaria
                  </div>
                </div>
              </div>

              {/* Metadatos de la operación */}
              <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 border border-slate-100 text-xs">
                <div>
                  <p className="text-slate-500">Fecha y hora:</p>
                  <p className="font-semibold text-slate-900">{receipt.fechaHora}</p>
                  
                  <p className="text-slate-500 mt-2">Venta original asociada:</p>
                  <p className="font-semibold text-slate-900">
                    Comprobante {receipt.numeroComprobanteOriginal} (Orden #{receipt.idVenta})
                  </p>
                  
                  <p className="text-slate-500 mt-2">Fecha de venta original:</p>
                  <p className="font-medium text-slate-800">{receipt.fechaVentaOriginal}</p>
                </div>

                <div>
                  <p className="text-slate-500">Cliente:</p>
                  <p className="font-semibold text-slate-900">
                    {receipt.cliente.nombre} (DNI {receipt.cliente.dni})
                  </p>

                  <p className="text-slate-500 mt-2">Atendido por:</p>
                  <p className="font-semibold text-slate-900">
                    {receipt.responsable.nombre} (Emp. #{receipt.responsable.idEmpleado})
                  </p>

                  <p className="text-slate-500 mt-2">Nota de Crédito referencial:</p>
                  <p className="font-mono font-semibold text-cyan-700">
                    {receipt.notaCredito ? receipt.notaCredito.numeroNota : "Sin emisión de NC"}
                  </p>
                </div>
              </div>

              {/* Tabla de Productos Devueltos */}
              <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-3">Código</th>
                      <th className="py-3 px-3">Descripción del Producto</th>
                      <th className="py-3 px-3 text-center">Cant.</th>
                      <th className="py-3 px-3 text-right">P. Unitario</th>
                      <th className="py-3 px-3 text-right">Total Devuelto</th>
                      <th className="py-3 px-3">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {receipt.productos.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-mono text-slate-500">{p.codbarras}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{p.nombre}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-900">{p.cantidadDevuelta}</td>
                        <td className="py-2.5 px-3 text-right text-slate-700">S/ {p.precioUnitario.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">S/ {p.subtotal.toFixed(2)}</td>
                        <td className="py-2.5 px-3 text-slate-600">{p.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Liquidación Financiera */}
              <div className="mt-6 flex justify-between items-start pt-4 border-t border-slate-200">
                <div className="max-w-xs text-xs space-y-2">
                  <div className="rounded-lg bg-emerald-50 p-3 border border-emerald-100">
                    <p className="font-bold text-emerald-900 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Reembolso {receipt.reembolso.estado}
                    </p>
                    <p className="text-emerald-800 mt-1">
                      Método: <span className="font-bold">{receipt.reembolso.metodo}</span>
                    </p>
                    <p className="text-emerald-700 text-[11px] mt-0.5">
                      {receipt.reembolso.afectaCajaFisica
                        ? "Desembolsado en efectivo físico desde gaveta de caja"
                        : "Canalizado por medio digital / bancarizado"}
                    </p>
                  </div>

                  <p className="text-[11px] text-slate-400 italic">
                    Este comprobante acredita la entrega o cancelación física de los bienes señalados.
                  </p>
                </div>

                <div className="w-64 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Base Imponible devuelta:</span>
                    <span className="font-mono">S/ {receipt.resumenFinanciero.subtotalDevuelto.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>IGV 18% devuelto:</span>
                    <span className="font-mono">S/ {receipt.resumenFinanciero.igvDevuelto.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-black text-slate-900 border-t border-slate-200 pt-2">
                    <span>Total Devolución:</span>
                    <span className="font-mono text-cyan-700">S/ {receipt.resumenFinanciero.totalDevuelto.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                    <span>Monto conservado en venta:</span>
                    <span className="font-mono">S/ {receipt.resumenFinanciero.montoConservado.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Firmas de constancia */}
              <div className="mt-12 grid grid-cols-2 gap-12 pt-8 border-t border-dashed border-slate-300 text-center text-xs">
                <div>
                  <div className="mx-auto w-48 border-b border-slate-400 pb-1"></div>
                  <p className="font-semibold text-slate-900 mt-1">{receipt.cliente.nombre}</p>
                  <p className="text-slate-500">Firma del Cliente (DNI {receipt.cliente.dni})</p>
                </div>
                <div>
                  <div className="mx-auto w-48 border-b border-slate-400 pb-1"></div>
                  <p className="font-semibold text-slate-900 mt-1">{receipt.responsable.nombre}</p>
                  <p className="text-slate-500">Firma del Encargado / Cajero MISHUTEC</p>
                </div>
              </div>
            </div>
          )}

          {/* FORMATO TICKET TÉRMICO (80 mm) */}
          {printFormat === "THERMAL" && (
            <div className="mx-auto w-full max-w-[340px] rounded-lg border border-slate-300 bg-white p-5 font-mono text-[11px] leading-tight text-slate-900 shadow-sm print:border-none print:shadow-none print:p-0">
              <div className="text-center pb-3 border-b border-dashed border-slate-300">
                <p className="text-sm font-black uppercase tracking-wider">{receipt.empresa.nombre}</p>
                <p className="text-[10px]">RUC: {receipt.empresa.ruc}</p>
                <p className="text-[10px]">{receipt.empresa.direccion}</p>
                <p className="text-[10px] mt-1 font-bold">CONSTANCIA DE DEVOLUCIÓN</p>
                <p className="text-xs font-black">{receipt.numeroDevolucion}</p>
                <p className="text-[9px] text-slate-500 mt-0.5">DOCUMENTO INTERNO SIN VALIDEZ TRIB.</p>
              </div>

              <div className="py-2.5 border-b border-dashed border-slate-300 space-y-1 text-[10px]">
                <p>Fecha/Hora: {receipt.fechaHora}</p>
                <p>Venta Ref.: {receipt.numeroComprobanteOriginal} (#{receipt.idVenta})</p>
                <p>Cliente: {receipt.cliente.nombre}</p>
                <p>DNI: {receipt.cliente.dni}</p>
                <p>Atendido: {receipt.responsable.nombre}</p>
                {receipt.notaCredito && (
                  <p className="font-bold text-cyan-800">Nota Crédito: {receipt.notaCredito.numeroNota}</p>
                )}
              </div>

              <div className="py-2.5 border-b border-dashed border-slate-300">
                <p className="font-bold mb-1">DETALLE DE PRODUCTOS:</p>
                {receipt.productos.map((p, idx) => (
                  <div key={idx} className="mb-2">
                    <p className="font-bold">{p.nombre}</p>
                    <div className="flex justify-between text-[10px]">
                      <span>{p.cantidadDevuelta} x S/ {p.precioUnitario.toFixed(2)}</span>
                      <span className="font-bold">S/ {p.subtotal.toFixed(2)}</span>
                    </div>
                    <p className="text-[9px] text-slate-600 italic">Motivo: {p.motivo}</p>
                  </div>
                ))}
              </div>

              <div className="py-2.5 border-b border-dashed border-slate-300 space-y-1">
                <div className="flex justify-between">
                  <span>Base Imponible:</span>
                  <span>S/ {receipt.resumenFinanciero.subtotalDevuelto.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>IGV (18%):</span>
                  <span>S/ {receipt.resumenFinanciero.igvDevuelto.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs font-black pt-1 border-t border-slate-200">
                  <span>TOTAL DEVUELTO:</span>
                  <span>S/ {receipt.resumenFinanciero.totalDevuelto.toFixed(2)}</span>
                </div>
              </div>

              <div className="pt-2 text-center text-[10px] space-y-1">
                <p className="font-bold">REEMBOLSO: {receipt.reembolso.metodo.toUpperCase()}</p>
                <p className="text-[9px]">Estado: {receipt.reembolso.estado}</p>
                <p className="text-[9px] text-slate-500 pt-2">
                  ¡Gracias por su preferencia!
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
