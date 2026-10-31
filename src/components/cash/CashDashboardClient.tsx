"use client";

import { useState } from "react";
import {
  CashDashboardData,
  CashSession,
  CashMovement,
  CashClosingSummary,
} from "@/types/cash-register";
import { OpenCashModal } from "./OpenCashModal";
import { AddMovementModal } from "./AddMovementModal";
import { AddEmployeePaymentModal } from "./AddEmployeePaymentModal";
import { AddSupplierPaymentModal } from "./AddSupplierPaymentModal";
import { ExpensesManagementClient } from "../expenses/ExpensesManagementClient";
import { ChannelSummaryCards } from "./ChannelSummaryCards";
import { CashCountArqueoModal } from "./CashCountArqueoModal";
import { CloseCashModal } from "./CloseCashModal";
import { ReopenCashModal } from "./ReopenCashModal";
import { CashReceiptModal } from "./CashReceiptModal";
import {
  Wallet,
  DollarSign,
  PlusCircle,
  Calculator,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  History,
  TrendingUp,
  CreditCard,
  ArrowDownCircle,
  ArrowUpCircle,
  RotateCcw,
  Search,
  Filter,
  Printer,
  FileSpreadsheet,
  UserCheck,
  Truck,
  Receipt,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface CashDashboardClientProps {
  initialData: CashDashboardData;
  dbName: string;
  isAcademic: boolean;
}

export function CashDashboardClient({
  initialData,
  dbName,
  isAcademic,
}: CashDashboardClientProps) {
  const router = useRouter();
  const [data, setData] = useState<CashDashboardData>(initialData);
  const [activeTab, setActiveTab] = useState<"movimientos" | "egresos" | "historial">("movimientos");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("todos");

  // Modals state
  const [isOpenCashModalOpen, setIsOpenCashModalOpen] = useState(false);
  const [isAddMovementModalOpen, setIsAddMovementModalOpen] = useState(false);
  const [isAddEmployeePaymentModalOpen, setIsAddEmployeePaymentModalOpen] = useState(false);
  const [isAddSupplierPaymentModalOpen, setIsAddSupplierPaymentModalOpen] = useState(false);
  const [isArqueoModalOpen, setIsArqueoModalOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [reopenTargetSessionId, setReopenTargetSessionId] = useState<number | null>(null);

  // Receipt Modal state
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [selectedReceiptSummary, setSelectedReceiptSummary] = useState<CashClosingSummary | null>(null);

  // Pre-calculated counted amount from Arqueo Calculator
  const [preCountedAmount, setPreCountedAmount] = useState<number | undefined>(undefined);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleRefresh = () => {
    router.refresh();
  };

  const activeSession = data.activeSession;
  const isCajaAbierta = activeSession && activeSession.estado === "ABIERTA";

  // Filter movements
  const filteredMovements = data.recentMovements.filter((m) => {
    const matchesSearch =
      m.concepto.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.nombreEmpleado.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.nombreMetodo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.categoria.toLowerCase().includes(searchTerm.toLowerCase());

    if (filterType === "todos") return matchesSearch;
    if (filterType === "INGRESO") return matchesSearch && m.tipo === "INGRESO";
    if (filterType === "EGRESO") return matchesSearch && m.tipo === "EGRESO";
    if (filterType === "VENTA") return matchesSearch && m.categoria === "VENTA";
    if (filterType === "EFECTIVO") return matchesSearch && m.afectaEfectivo;
    if (filterType === "DIGITAL") return matchesSearch && !m.afectaEfectivo;
    return matchesSearch;
  });

  const handleProceedToClose = (counted: number) => {
    setPreCountedAmount(counted);
    setIsCloseModalOpen(true);
  };

  const handleCloseSuccess = (summary: CashClosingSummary) => {
    setSelectedReceiptSummary(summary);
    setIsReceiptModalOpen(true);
    showToast(`Cierre de caja completado exitosamente con ${summary.tipoCuadre.replace("_", " ")}.`);
    handleRefresh();
  };

  const handleViewReceiptFromHistory = (session: CashSession) => {
    const summary: CashClosingSummary = {
      idSesion: session.idSesion,
      fechaApertura: session.fechaApertura,
      fechaCierre: session.fechaCierre || "En curso",
      empleadoApertura: session.empleadoAperturaNombre,
      empleadoCierre: session.empleadoCierreNombre || "No registrado",
      montoInicial: session.montoInicial,
      ventasCount: session.ventasCount,
      ventasBrutas: session.totalVentasEfectivo + session.totalVentasElectronicas,
      descuentos: 0,
      devoluciones: session.totalReembolsosEfectivo,
      ventasNetas: session.totalVentasEfectivo + session.totalVentasElectronicas - session.totalReembolsosEfectivo,
      desgloseMetodosPago: [
        {
          idMetodo: 1,
          nombreMetodo: "Efectivo",
          totalCobrado: session.totalVentasEfectivo,
          totalDevuelto: session.totalReembolsosEfectivo,
          saldoNeto: session.totalVentasEfectivo - session.totalReembolsosEfectivo,
          esEfectivoFisico: true,
        },
        {
          idMetodo: 4,
          nombreMetodo: "Yape",
          totalCobrado: session.totalVentasElectronicas,
          totalDevuelto: 0,
          saldoNeto: session.totalVentasElectronicas,
          esEfectivoFisico: false,
        },
      ],
      otrosIngresosEfectivo: session.totalOtrosIngresosEfectivo,
      gastosEfectivo: session.totalGastosEfectivo,
      pagosPersonalEfectivo: 0,
      pagosProveedorEfectivo: session.totalPagosProveedorEfectivo ?? 0,
      retirosEfectivo: session.totalRetirosEfectivo,
      reembolsosEfectivo: session.totalReembolsosEfectivo,
      efectivoEsperado: session.efectivoEsperado ?? session.efectivoEsperadoActual,
      efectivoContado: session.efectivoContado ?? 0,
      diferencia: session.diferencia ?? 0,
      tipoCuadre:
        Math.abs(session.diferencia ?? 0) < 0.01
          ? "CUADRE_EXACTO"
          : (session.diferencia ?? 0) < 0
          ? "FALTANTE"
          : "SOBRANTE",
      observacionesCierre: session.observacionesCierre || "Cierre registrado",
    };

    setSelectedReceiptSummary(summary);
    setIsReceiptModalOpen(true);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg border border-emerald-600 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-200" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Gestión y Arqueo Diario de Caja
                </h1>
                {isCajaAbierta ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Caja Abierta (Sesión #{activeSession.idSesion})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                    <Lock className="w-3 h-3 text-slate-500" />
                    Caja Cerrada
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Control de apertura, movimientos en efectivo, conciliación física de gaveta y cierre diario inmutable.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {!isCajaAbierta ? (
            <button
              onClick={() => setIsOpenCashModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-cyan-500/20 transition-all"
            >
              <DollarSign className="w-4 h-4" />
              Aperturar Caja
            </button>
          ) : (
            <>
              <button
                onClick={() => setIsAddMovementModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold rounded-xl shadow-sm transition-all"
              >
                <PlusCircle className="w-4 h-4 text-cyan-600" />
                Registrar Movimiento
              </button>
              <button
                onClick={() => setIsAddEmployeePaymentModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-xs font-bold rounded-xl shadow-xs transition-all"
              >
                <UserCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                Pago al Personal
              </button>
              <button
                onClick={() => setIsAddSupplierPaymentModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-cyan-50 dark:bg-cyan-950/40 hover:bg-cyan-100 dark:hover:bg-cyan-900/60 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 text-xs font-bold rounded-xl shadow-xs transition-all"
              >
                <Truck className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                Pago a Proveedor
              </button>
              <button
                onClick={() => setIsArqueoModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold rounded-xl shadow-sm transition-all"
              >
                <Calculator className="w-4 h-4 text-emerald-600" />
                Arqueo de Efectivo
              </button>
              <button
                onClick={() => {
                  setPreCountedAmount(undefined);
                  setIsCloseModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-md transition-all"
              >
                <Lock className="w-4 h-4 text-rose-400" />
                Cerrar Caja
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI Cards Grid */}
      {isCajaAbierta && activeSession ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          {/* Fondo de apertura: referencia histórica, no saldo disponible */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Fondo Inicial (referencia)
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-lg font-bold text-slate-900">
                S/ {activeSession.montoInicial.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-400">Apertura</span>
            </div>
            <div className="mt-2 text-[10px] text-slate-500 truncate">
              No cambia; no es el saldo actual
            </div>
          </div>

          {/* Ventas en Efectivo */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
            <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">
              Ventas Efectivo
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-lg font-bold text-emerald-600">
                +S/ {activeSession.totalVentasEfectivo.toFixed(2)}
              </span>
              <span className="text-[10px] text-emerald-600 font-semibold">Físico</span>
            </div>
            <div className="mt-2 text-[10px] text-slate-500">
              Suma a gaveta física
            </div>
          </div>

          {/* Cobros Digitales (Yape/Tarjetas) */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
            <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider block">
              Cobros Digitales
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-lg font-bold text-blue-600">
                S/ {activeSession.totalVentasElectronicas.toFixed(2)}
              </span>
              <span className="text-[10px] text-blue-600 font-semibold">Bancarizado</span>
            </div>
            <div className="mt-2 text-[10px] text-slate-500">
              Yape / Tarjetas (No suma a caja)
            </div>
          </div>

          {/* Otros Ingresos */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Otros Ingresos
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-lg font-bold text-slate-800">
                +S/ {activeSession.totalOtrosIngresosEfectivo.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-400">Manuales</span>
            </div>
            <div className="mt-2 text-[10px] text-slate-500">
              Aportes y ajustes
            </div>
          </div>

          {/* Gastos & Reembolsos */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
            <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider block">
              Salidas de Efectivo
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-lg font-bold text-rose-600">
                -S/ {(
                  activeSession.totalGastosEfectivo +
                  activeSession.totalPagosPersonalEfectivo +
                  activeSession.totalPagosProveedorEfectivo +
                  activeSession.totalRetirosEfectivo +
                  activeSession.totalReembolsosEfectivo
                ).toFixed(2)}
              </span>
              <span className="text-[10px] text-rose-500 font-semibold">Salidas</span>
            </div>
            <div className="mt-2 text-[10px] text-slate-500 truncate">
              Proveedores: S/{activeSession.totalPagosProveedorEfectivo.toFixed(2)} | Otros: S/{
                (
                  activeSession.totalGastosEfectivo +
                  activeSession.totalPagosPersonalEfectivo +
                  activeSession.totalRetirosEfectivo +
                  activeSession.totalReembolsosEfectivo
                ).toFixed(2)
              }
            </div>
          </div>

          {/* EFECTIVO FÍSICO ESPERADO EN CAJA */}
          <div className="bg-gradient-to-br from-cyan-600 to-blue-700 text-white rounded-2xl p-4 shadow-md shadow-cyan-600/20">
            <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-100 block">
              Disponible Ahora
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-extrabold text-white">
                S/ {activeSession.efectivoEsperadoActual.toFixed(2)}
              </span>
            </div>
            <div className="mt-2 text-[10px] text-cyan-100 font-medium">
              Saldo actual calculado en gaveta física
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            No hay una sesión de caja abierta actualmente
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Para registrar cobros en efectivo en el punto de venta, controlar gastos operativos y realizar el arqueo diario, inicie una nueva sesión de caja.
          </p>
          <button
            onClick={() => setIsOpenCashModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-cyan-500/20 transition-all mt-2"
          >
            <DollarSign className="w-4 h-4" />
            Aperturar Turno de Caja
          </button>
        </div>
      )}

      {/* Tarjetas de Desglose por Canal de Pago (Efectivo, Yape, Tarjetas, Transferencias) */}
      {isCajaAbierta && activeSession && (
        <ChannelSummaryCards cards={data.channelCards} />
      )}

      {/* Tabs Bar */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-4 sm:gap-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab("movimientos")}
          className={`flex items-center gap-2 pb-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "movimientos"
              ? "border-cyan-600 text-cyan-600 dark:text-cyan-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Movimientos del Turno Actual ({data.recentMovements.length})
        </button>

        <button
          onClick={() => setActiveTab("egresos")}
          className={`flex items-center gap-2 pb-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "egresos"
              ? "border-cyan-600 text-cyan-600 dark:text-cyan-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <Receipt className="w-4 h-4" />
          Gestión de Egresos & Obligaciones
        </button>

        <button
          onClick={() => setActiveTab("historial")}
          className={`flex items-center gap-2 pb-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "historial"
              ? "border-cyan-600 text-cyan-600 dark:text-cyan-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <History className="w-4 h-4" />
          Historial de Cierres de Caja ({data.pastSessions.length})
        </button>
      </div>

      {/* TAB 1: MOVIMIENTOS DEL TURNO */}
      {activeTab === "movimientos" && (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por concepto, cajero, método..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 text-slate-900"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Filtrar:</span>
              {[
                { id: "todos", label: "Todos" },
                { id: "INGRESO", label: "Ingresos" },
                { id: "EGRESO", label: "Egresos" },
                { id: "VENTA", label: "Ventas" },
                { id: "EFECTIVO", label: "Caja Física" },
                { id: "DIGITAL", label: "Digital" },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilterType(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    filterType === f.id
                      ? "bg-slate-900 text-white font-semibold"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Hora</th>
                    <th className="px-4 py-3">Tipo / Operación</th>
                    <th className="px-4 py-3">Categoría</th>
                    <th className="px-4 py-3">Concepto / Detalle</th>
                    <th className="px-4 py-3">Medio de Pago</th>
                    <th className="px-4 py-3">Responsable</th>
                    <th className="px-4 py-3 text-right">Monto (S/)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        No hay movimientos registrados que coincidan con el criterio seleccionado.
                      </td>
                    </tr>
                  ) : (
                    filteredMovements.map((m) => (
                      <tr key={m.idMovCaja} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {m.fechaHora.split(" ")[1] || m.fechaHora}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {m.tipo === "INGRESO" ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              <ArrowDownCircle className="w-3 h-3 text-emerald-600" />
                              Ingreso
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                              <ArrowUpCircle className="w-3 h-3 text-rose-600" />
                              Egreso
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">
                          {m.categoria.replace("_", " ")}
                        </td>
                        <td className="px-4 py-3 max-w-xs truncate text-slate-700">
                          {m.concepto}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {m.afectaEfectivo ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded border border-emerald-200">
                              Efectivo (Gaveta)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-800 bg-blue-100/70 px-2 py-0.5 rounded border border-blue-200">
                              {m.nombreMetodo} (No suma a caja)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {m.nombreEmpleado}
                        </td>
                        <td className="px-4 py-3 text-right font-bold whitespace-nowrap">
                          {m.tipo === "INGRESO" ? (
                            <span className="text-emerald-600">+S/ {m.monto.toFixed(2)}</span>
                          ) : (
                            <span className="text-rose-600">-S/ {m.monto.toFixed(2)}</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: HISTORIAL DE CIERRES */}
      {activeTab === "historial" && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Sesión #</th>
                  <th className="px-4 py-3">Apertura</th>
                  <th className="px-4 py-3">Cierre</th>
                  <th className="px-4 py-3">Responsables</th>
                  <th className="px-4 py-3 text-right">Efectivo Esperado</th>
                  <th className="px-4 py-3 text-right">Efectivo Contado</th>
                  <th className="px-4 py-3 text-center">Diferencia / Cuadre</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.pastSessions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                      No se han registrado sesiones de caja cerradas previamente.
                    </td>
                  </tr>
                ) : (
                  data.pastSessions.map((s) => {
                    const diff = s.diferencia ?? 0;
                    const isExact = Math.abs(diff) < 0.01;
                    const isShort = diff < -0.01;

                    return (
                      <tr key={s.idSesion} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-900">
                          #{s.idSesion}
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {s.fechaApertura}
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {s.fechaCierre || "En curso"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          <span className="font-semibold block">{s.empleadoAperturaNombre}</span>
                          {s.empleadoCierreNombre && (
                            <span className="text-[10px] text-slate-400">Cierre: {s.empleadoCierreNombre}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                          S/ {(s.efectivoEsperado ?? s.efectivoEsperadoActual).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-cyan-700 whitespace-nowrap">
                          {s.efectivoContado !== null ? `S/ ${s.efectivoContado.toFixed(2)}` : "-"}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {s.estado === "ABIERTA" ? (
                            <span className="text-[10px] text-slate-400">En curso</span>
                          ) : isExact ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Exacto (S/ 0.00)
                            </span>
                          ) : isShort ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded border border-rose-300">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              Faltante S/ {diff.toFixed(2)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                              <AlertTriangle className="w-3 h-3 text-amber-700" />
                              Sobrante +S/ {diff.toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                              s.estado === "ABIERTA"
                                ? "bg-emerald-100 text-emerald-800"
                                : s.estado === "REABIERTA"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {s.estado}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleViewReceiptFromHistory(s)}
                              title="Ver / Imprimir Acta de Cierre"
                              className="p-1.5 text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            {s.estado === "CERRADA" && (
                              <button
                                onClick={() => {
                                  setReopenTargetSessionId(s.idSesion);
                                  setIsReopenModalOpen(true);
                                }}
                                title="Reapertura Excepcional"
                                className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              >
                                <Unlock className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: GESTIÓN DE EGRESOS & OBLIGACIONES */}
      {activeTab === "egresos" && (
        <ExpensesManagementClient
          idSesion={activeSession?.idSesion}
          efectivoDisponible={activeSession?.efectivoEsperadoActual || 0}
          initialEmployees={data.employees}
          paymentMethods={data.paymentMethods}
        />
      )}

      {/* MODAL 1: Apertura de Caja */}
      <OpenCashModal
        isOpen={isOpenCashModalOpen}
        onClose={() => setIsOpenCashModalOpen(false)}
        onSuccess={() => {
          showToast("Sesión de caja aperturada correctamente.");
          handleRefresh();
        }}
        employees={data.employees}
      />

      {/* MODAL 2: Registrar Movimiento */}
      {isCajaAbierta && activeSession && (
        <AddMovementModal
          isOpen={isAddMovementModalOpen}
          onClose={() => setIsAddMovementModalOpen(false)}
          onSuccess={() => {
            showToast("Movimiento de caja registrado exitosamente.");
            handleRefresh();
          }}
          idSesion={activeSession.idSesion}
          employees={data.employees}
          paymentMethods={data.paymentMethods}
        />
      )}

      {/* MODAL 2.1: Registro de Pago al Personal */}
      {isCajaAbierta && activeSession && (
        <AddEmployeePaymentModal
          isOpen={isAddEmployeePaymentModalOpen}
          onClose={() => setIsAddEmployeePaymentModalOpen(false)}
          onSuccess={(p) => {
            showToast(`Pago al personal a ${p.nombreEmpleado} por S/ ${p.monto.toFixed(2)} registrado exitosamente.`);
            handleRefresh();
          }}
          idSesion={activeSession.idSesion}
          employees={data.employees}
          paymentMethods={data.paymentMethods}
          efectivoDisponible={activeSession.efectivoEsperadoActual}
        />
      )}

      {/* MODAL 2.2: Registro de Pago a Proveedor */}
      {isCajaAbierta && activeSession && (
        <AddSupplierPaymentModal
          isOpen={isAddSupplierPaymentModalOpen}
          onClose={() => setIsAddSupplierPaymentModalOpen(false)}
          onSuccess={() => {
            showToast("Abono a proveedor registrado exitosamente.");
            handleRefresh();
          }}
          idSesion={activeSession.idSesion}
          paymentMethods={data.paymentMethods}
          efectivoDisponible={activeSession.efectivoEsperadoActual}
        />
      )}

      {/* MODAL 3: Arqueo / Conteo de Efectivo */}
      {isCajaAbierta && activeSession && (
        <CashCountArqueoModal
          isOpen={isArqueoModalOpen}
          onClose={() => setIsArqueoModalOpen(false)}
          onProceedToClose={handleProceedToClose}
          efectivoEsperado={activeSession.efectivoEsperadoActual}
        />
      )}

      {/* MODAL 4: Cierre Diario de Caja */}
      {isCajaAbierta && activeSession && (
        <CloseCashModal
          isOpen={isCloseModalOpen}
          onClose={() => setIsCloseModalOpen(false)}
          onSuccess={handleCloseSuccess}
          session={activeSession}
          employees={data.employees}
          initialCounted={preCountedAmount}
        />
      )}

      {/* MODAL 5: Reapertura Excepcional */}
      {reopenTargetSessionId && (
        <ReopenCashModal
          isOpen={isReopenModalOpen}
          onClose={() => {
            setIsReopenModalOpen(false);
            setReopenTargetSessionId(null);
          }}
          onSuccess={() => {
            showToast("Sesión de caja reabierta con éxito bajo registro de auditoría.");
            handleRefresh();
          }}
          idSesion={reopenTargetSessionId}
          employees={data.employees}
        />
      )}

      {/* MODAL 6: Acta / Comprobante Imprimible de Cierre */}
      {selectedReceiptSummary && (
        <CashReceiptModal
          isOpen={isReceiptModalOpen}
          onClose={() => {
            setIsReceiptModalOpen(false);
            setSelectedReceiptSummary(null);
          }}
          summary={selectedReceiptSummary}
        />
      )}
    </div>
  );
}
