"use client";

import { Info, AlertTriangle, ShieldCheck, Database, FileText } from "lucide-react";

export function InventoryAdjustmentsNotice() {
  return (
    <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-600">
          <Database className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Auditoría de Esquema: Tipo de Movimiento &quot;Ajuste&quot; (ID 3)
          </h3>
          <p className="text-xs text-slate-500">
            Documentación de limitaciones del modelo relacional original de MishutecT2
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
          <div className="flex items-center gap-1.5 text-amber-800 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            <span>Restricción CHECK de Cantidad</span>
          </div>
          <p className="text-slate-600 text-[11px] leading-relaxed">
            La tabla <code className="text-blue-600 font-semibold">dbo.Mov_Inventario</code> cuenta con la restricción{" "}
            <code className="text-amber-800 font-semibold">CK_Mov_Cantidad ([Cantidad] &gt; 0)</code>, impidiendo valores negativos.
          </p>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
          <div className="flex items-center gap-1.5 text-amber-800 font-semibold">
            <Info className="h-4 w-4" />
            <span>Ausencia de Columna de Sentido</span>
          </div>
          <p className="text-slate-600 text-[11px] leading-relaxed">
            No existe en el esquema una columna que indique la orientación del ajuste (ej. positivo/negativo) ni desglose
            entre <em>Ajuste Entrada</em> y <em>Ajuste Salida</em>.
          </p>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
          <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
            <ShieldCheck className="h-4 w-4" />
            <span>Integridad de Conciliación</span>
          </div>
          <p className="text-slate-600 text-[11px] leading-relaxed">
            Para garantizar que el saldo progresivo del Kardex concilie matemáticamente con el stock físico,
            la funcionalidad de ajustes ambiguos se mantiene retenida hasta una migración autorizada.
          </p>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-slate-700 flex items-start gap-2">
        <FileText className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <span>
          <strong>Decisión Arquitectónica:</strong> Las entradas (+ stock) solo se registran mediante una compra a proveedor;{" "}
          las salidas (- stock) se registran desde Inventario. Esto preserva la conciliación estricta{" "}
          <code className="text-blue-700 font-semibold">Stock = TotalEntradas - TotalSalidas</code> al 100% en SQL Server.
        </span>
      </div>
    </div>
  );
}
