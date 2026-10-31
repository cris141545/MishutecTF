"use client";

import React from "react";
import {
  Wallet,
  Smartphone,
  CreditCard,
  Building2,
  ArrowUpRight,
  ArrowDownRight,
  Scale,
  Info,
} from "lucide-react";
import { ChannelSummaryCard } from "@/types/cash-register";

interface ChannelSummaryCardsProps {
  cards?: ChannelSummaryCard[];
}

export function ChannelSummaryCards({ cards }: ChannelSummaryCardsProps) {
  if (!cards || cards.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900 tracking-tight">
            Desglose Financiero por Canal de Pago
          </h3>
          <p className="text-xs text-slate-500">
            Diferenciación estricta entre gaveta física y canales digitales/bancarizados
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => {
          let icon = <Wallet className="h-5 w-5 text-emerald-600" />;
          let headerBg = "bg-emerald-50 text-emerald-900 border-emerald-200";
          let badgeColor = "bg-emerald-100 text-emerald-800";

          if (card.canal === "YAPE") {
            icon = <Smartphone className="h-5 w-5 text-purple-600" />;
            headerBg = "bg-purple-50 text-purple-900 border-purple-200";
            badgeColor = "bg-purple-100 text-purple-800";
          } else if (card.canal === "TARJETAS") {
            icon = <CreditCard className="h-5 w-5 text-blue-600" />;
            headerBg = "bg-blue-50 text-blue-900 border-blue-200";
            badgeColor = "bg-blue-100 text-blue-800";
          } else if (card.canal === "TRANSFERENCIAS") {
            icon = <Building2 className="h-5 w-5 text-cyan-600" />;
            headerBg = "bg-cyan-50 text-cyan-900 border-cyan-200";
            badgeColor = "bg-cyan-100 text-cyan-800";
          }

          return (
            <div
              key={card.canal}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <div>
                {/* Header de la tarjeta */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100">
                      {icon}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{card.titulo}</h4>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block ${badgeColor}`}>
                        {card.esEfectivoFisico ? "Gaveta Física" : "Canal Digital"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Importe Neto Destacado */}
                <div className="py-3">
                  <span className="text-[11px] text-slate-500 font-medium block">
                    {card.esEfectivoFisico ? "Saldo Físico Esperado" : "Importe Neto Registrado"}
                  </span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-xl font-black text-slate-900 font-mono tracking-tight">
                      S/ {card.saldoNeto.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Desglose de Operaciones */}
                <div className="space-y-1.5 text-xs border-t border-slate-100 pt-3">
                  {card.canal === "EFECTIVO" && (
                    <>
                      <div className="flex justify-between text-slate-500">
                        <span>Fondo inicial:</span>
                        <span className="font-mono text-slate-700">S/ {(card.detalles.fondoInicial || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Ingresos (Cobros POS):</span>
                        <span className="font-mono text-emerald-700 font-medium">+S/ {card.detalles.ventas.toFixed(2)}</span>
                      </div>
                      {(card.detalles.otrosIngresos || 0) > 0 && (
                        <div className="flex justify-between text-slate-500">
                          <span>Otros ingresos:</span>
                          <span className="font-mono text-emerald-700">+S/ {(card.detalles.otrosIngresos || 0).toFixed(2)}</span>
                        </div>
                      )}
                      {(card.detalles.gastosOperativos || 0) > 0 && (
                        <div className="flex justify-between text-slate-500">
                          <span>Gastos operativos:</span>
                          <span className="font-mono text-rose-700">-S/ {(card.detalles.gastosOperativos || 0).toFixed(2)}</span>
                        </div>
                      )}
                      {(card.detalles.pagosPersonal || 0) > 0 && (
                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                          <span>Pagos al personal:</span>
                          <span className="font-mono text-purple-700 dark:text-purple-400 font-semibold">-S/ {(card.detalles.pagosPersonal || 0).toFixed(2)}</span>
                        </div>
                      )}
                      {(card.detalles.pagosProveedor || 0) > 0 && (
                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                          <span>Pagos a proveedores:</span>
                          <span className="font-mono text-cyan-700 dark:text-cyan-400 font-semibold">-S/ {(card.detalles.pagosProveedor || 0).toFixed(2)}</span>
                        </div>
                      )}
                      {(card.detalles.retiros || 0) > 0 && (
                        <div className="flex justify-between text-slate-500">
                          <span>Retiros a caja fuerte:</span>
                          <span className="font-mono text-rose-700">-S/ {(card.detalles.retiros || 0).toFixed(2)}</span>
                        </div>
                      )}
                      {(card.detalles.reembolsos || 0) > 0 && (
                        <div className="flex justify-between text-slate-500">
                          <span>Reembolsos dev.:</span>
                          <span className="font-mono text-rose-700">-S/ {(card.detalles.reembolsos || 0).toFixed(2)}</span>
                        </div>
                      )}
                    </>
                  )}

                  {card.canal !== "EFECTIVO" && (
                    <>
                      <div className="flex justify-between text-slate-500">
                        <span>Cobros registrados:</span>
                        <span className="font-mono text-emerald-700 font-medium">+S/ {card.detalles.ventas.toFixed(2)}</span>
                      </div>
                      {(card.detalles.reembolsos || 0) > 0 && (
                        <div className="flex justify-between text-slate-500">
                          <span>Reembolsos devueltos:</span>
                          <span className="font-mono text-rose-700">-S/ {(card.detalles.reembolsos || 0).toFixed(2)}</span>
                        </div>
                      )}
                      {(card.detalles.pagosPersonal || 0) > 0 && (
                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                          <span>Pagos personal:</span>
                          <span className="font-mono text-purple-700 dark:text-purple-400">-S/ {(card.detalles.pagosPersonal || 0).toFixed(2)}</span>
                        </div>
                      )}
                      {(card.detalles.pagosProveedor || 0) > 0 && (
                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                          <span>Pagos proveedor:</span>
                          <span className="font-mono text-cyan-700 dark:text-cyan-400">-S/ {(card.detalles.pagosProveedor || 0).toFixed(2)}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Pie de tarjeta */}
              <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                <span>{card.esEfectivoFisico ? "Afecta conteo físico" : "No suma a gaveta"}</span>
                <span className="font-semibold text-slate-600">
                  {card.canal === "EFECTIVO" ? "100% Líquido" : "Bancarizado"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Nota aclaratoria */}
      <div className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-900 p-3 text-[11px] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
        <Info className="h-4 w-4 text-slate-400 shrink-0" />
        <span>
          <strong>Nota de Control:</strong> Los importes mostrados corresponden a los cobros y egresos registrados en el sistema POS. Los canales digitales no afectan el arqueo físico de billetes y monedas.
        </span>
      </div>
    </div>
  );
}
