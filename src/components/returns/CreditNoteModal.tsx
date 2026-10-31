"use client";

import React from "react";
import {
  X,
  Printer,
  FileCheck2,
  Building2,
  AlertTriangle,
  Receipt,
  Calendar,
  User,
} from "lucide-react";
import { CreditNote } from "@/types/returns";

interface CreditNoteModalProps {
  creditNote: CreditNote | null;
  saleVoucherNumber?: string;
  clientName?: string;
  clientDni?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function CreditNoteModal({
  creditNote,
  saleVoucherNumber,
  clientName,
  clientDni,
  isOpen,
  onClose,
}: CreditNoteModalProps) {
  if (!isOpen || !creditNote) return null;

  const handlePrint = () => {
    window.print();
  };

  const igv155 = Math.round((creditNote.montoSubtotal * 0.155) * 100) / 100;
  const ipm25 = Math.round((creditNote.montoTotal - creditNote.montoSubtotal - igv155) * 100) / 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
        
        {/* Barra de herramientas */}
        <div className="print:hidden flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 text-cyan-800">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Nota de Crédito Electrónica
              </h2>
              <p className="text-xs text-slate-500 font-mono">
                {creditNote.numeroNota} • Documento de Ajuste Referencial SUNAT
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-all"
            >
              <Printer className="h-4 w-4" />
              Imprimir / PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Cuerpo del documento */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50 print:bg-white print:p-0">
          <div className="mx-auto rounded-xl border border-slate-200 bg-white p-8 shadow-sm print:border-none print:shadow-none">
            
            {/* Membrete y Serie */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-6">
              <div>
                <h1 className="text-2xl font-black text-slate-900">MISHUTEC S.A.C.</h1>
                <p className="text-xs text-slate-500 mt-1">RUC: 20608945123</p>
                <p className="text-xs text-slate-500">Av. Universitaria 1801, San Miguel, Lima</p>
                <p className="text-xs text-slate-500">Venta de equipos de cómputo y suministros tecnológicos</p>
              </div>

              <div className="text-right">
                <div className="rounded-xl border-2 border-cyan-800 px-5 py-3 text-center bg-cyan-50/40">
                  <p className="text-[11px] font-black uppercase tracking-wider text-cyan-900">
                    NOTA DE CRÉDITO ELECTRÓNICA
                  </p>
                  <p className="text-xl font-black text-cyan-950 font-mono mt-0.5">
                    {creditNote.numeroNota}
                  </p>
                  <p className="text-[10px] text-slate-500">RUC 20608945123</p>
                </div>
              </div>
            </div>

            {/* Aviso Académico Referencial */}
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-blue-50/80 px-3 py-2 text-xs text-blue-900 border border-blue-200">
              <AlertTriangle className="h-4 w-4 text-blue-600 flex-shrink-0" />
              <span>
                <strong>Emisión Académica Referencial:</strong> Este documento calcula y desglosa impuestos y saldos conforme a la normativa SUNAT 2026. En entorno productivo se firma mediante certificado digital y se remite vía PSE/OSE.
              </span>
            </div>

            {/* Información del documento que modifica y cliente */}
            <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 border border-slate-100 text-xs">
              <div>
                <p className="text-slate-500">Fecha de emisión:</p>
                <p className="font-semibold text-slate-900">{creditNote.fechaEmision}</p>

                <p className="text-slate-500 mt-2">Documento modificado:</p>
                <p className="font-mono font-bold text-slate-900">
                  {saleVoucherNumber || `Venta #${creditNote.idVenta}`}
                </p>

                <p className="text-slate-500 mt-2">Tipo de ajuste:</p>
                <span className="inline-block mt-0.5 rounded-md bg-cyan-100 px-2 py-0.5 text-[11px] font-bold text-cyan-800">
                  {creditNote.tipoAjuste === "TOTAL" ? "01 - ANULACIÓN DE LA OPERACIÓN" : "07 - DEVOLUCIÓN PARCIAL"}
                </span>
              </div>

              <div>
                <p className="text-slate-500">Cliente:</p>
                <p className="font-semibold text-slate-900">{clientName || "Cliente Registrado"}</p>
                <p className="text-slate-600">DNI: {clientDni || "—"}</p>

                <p className="text-slate-500 mt-2">Motivo sustentatorio:</p>
                <p className="font-medium text-slate-800">{creditNote.motivo}</p>

                <p className="text-slate-500 mt-2">Devolución RMA vinculada:</p>
                <p className="font-mono text-slate-700">#{creditNote.idDevolucion}</p>
              </div>
            </div>

            {/* Tabla de liquidación tributaria */}
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Concepto / Ajuste</th>
                    <th className="py-3 px-4 text-center">Tasa Aplicable</th>
                    <th className="py-3 px-4 text-right">Importe Soles (S/)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-3 px-4 text-slate-800 font-medium">
                      Ajuste de Valor de Venta (Base Imponible de bienes devueltos)
                    </td>
                    <td className="py-3 px-4 text-center text-slate-600">—</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">
                      S/ {creditNote.montoSubtotal.toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 text-slate-600">
                      IGV (Impuesto General a las Ventas)
                    </td>
                    <td className="py-2.5 px-4 text-center text-slate-600">15.5%</td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-700">
                      S/ {igv155.toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 text-slate-600">
                      IPM (Impuesto de Promoción Municipal)
                    </td>
                    <td className="py-2.5 px-4 text-center text-slate-600">2.5%</td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-700">
                      S/ {ipm25.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
                <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                  <tr>
                    <td className="py-3 px-4 text-slate-900 text-sm">TOTAL NOTA DE CRÉDITO</td>
                    <td className="py-3 px-4 text-center text-slate-600">18.0% Total</td>
                    <td className="py-3 px-4 text-right font-mono text-base font-black text-cyan-800">
                      S/ {creditNote.montoTotal.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="mt-8 text-center text-[11px] text-slate-400">
              Comprobante de uso interno y auditoría contable. Registrado conforme a las especificaciones técnicas UBL 2.1 SUNAT.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
