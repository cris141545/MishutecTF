"use client";

import React, { useState, useEffect } from "react";
import {
  Wallet,
  Truck,
  Users,
  Receipt,
  Plus,
  Search,
  Filter,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
  Building2,
  TrendingDown,
  X,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  CuentaPagarProveedor,
  ObligacionPersonalItem,
  PagoPersonalDetalleItem,
} from "@/types/expenses";
import {
  getAccountsPayableAction,
  getEmployeeObligationsAction,
  createEmployeeObligationAction,
} from "@/lib/actions/expense.actions";
import { AddSupplierPaymentModal } from "../cash/AddSupplierPaymentModal";
import { AddEmployeePaymentModal } from "../cash/AddEmployeePaymentModal";

interface ExpensesManagementClientProps {
  idSesion?: number | null;
  efectivoDisponible?: number;
  initialEmployees?: Array<{ id: number; nombre: string }>;
  paymentMethods?: Array<{ id: number; nombre: string }>;
}

export function ExpensesManagementClient({
  idSesion = null,
  efectivoDisponible = 0,
  initialEmployees = [],
  paymentMethods = [
    { id: 1, nombre: "Efectivo" },
    { id: 2, nombre: "Tarjeta" },
    { id: 3, nombre: "Transferencia" },
    { id: 4, nombre: "Yape" },
  ],
}: ExpensesManagementClientProps) {
  const [activeTab, setActiveTab] = useState<"proveedores" | "trabajadores" | "generales" | "historial">("proveedores");
  const [searchTerm, setSearchTerm] = useState("");
  const [cuentas, setCuentas] = useState<CuentaPagarProveedor[]>([]);
  const [obligaciones, setObligaciones] = useState<ObligacionPersonalItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Modales
  const [isSupplierPaymentOpen, setIsSupplierPaymentOpen] = useState(false);
  const [isEmployeePaymentOpen, setIsEmployeePaymentOpen] = useState(false);
  const [isNewObligationOpen, setIsNewObligationOpen] = useState(false);

  // Form states for new employee obligation
  const [newObEmpId, setNewObEmpId] = useState<number>(initialEmployees[0]?.id || 1);
  const [newObPeriodo, setNewObPeriodo] = useState("Octubre 2026");
  const [newObConcepto, setNewObConcepto] = useState("Remuneración mensual pactada");
  const [newObMonto, setNewObMonto] = useState("");
  const [isCreatingObligation, setIsCreatingObligation] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cpRes, obRes] = await Promise.all([
        getAccountsPayableAction(),
        getEmployeeObligationsAction(),
      ]);
      if (cpRes.success && cpRes.data) setCuentas(cpRes.data);
      if (obRes.success && obRes.data) setObligaciones(obRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Totales
  const totalDeudaProveedores = cuentas.reduce((acc, c) => acc + (c.estado !== "ANULADA" ? c.saldoPendiente : 0), 0);
  const totalPagadoProveedores = cuentas.reduce((acc, c) => acc + c.montoPagado, 0);
  const totalDeudaTrabajadores = obligaciones.reduce((acc, o) => acc + (o.estado !== "ANULADA" ? o.saldoPendiente : 0), 0);
  const totalPagadoTrabajadores = obligaciones.reduce((acc, o) => acc + o.montoPagado, 0);

  // Filtrado de cuentas
  const filteredCuentas = cuentas.filter((c) =>
    c.nombreProveedor.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.numeroDocumento.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.concepto.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filtrado de obligaciones
  const filteredObligaciones = obligaciones.filter((o) =>
    o.nombreEmpleado.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.periodo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.concepto.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateObligation = async (e: React.FormEvent) => {
    e.preventDefault();
    const m = parseFloat(newObMonto) || 0;
    if (m <= 0 || !newObPeriodo.trim() || !newObConcepto.trim()) return;

    setIsCreatingObligation(true);
    try {
      const res = await createEmployeeObligationAction({
        idEmpleado: newObEmpId,
        periodo: newObPeriodo.trim(),
        concepto: newObConcepto.trim(),
        montoPactado: m,
        idEmpleadoResponsable: 1,
      });
      if (res.success) {
        setIsNewObligationOpen(false);
        setNewObMonto("");
        await loadData();
      }
    } finally {
      setIsCreatingObligation(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tarjetas KPI de Egresos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Deuda a Proveedores</span>
            <Truck className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-rose-600 dark:text-rose-400">
            {formatCurrency(totalDeudaProveedores)}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">
            Pagado a la fecha: {formatCurrency(totalPagadoProveedores)}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Haberes por Liquidar</span>
            <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {formatCurrency(totalDeudaTrabajadores)}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">
            Adelantos/Abonos: {formatCurrency(totalPagadoTrabajadores)}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Efectivo en Gaveta</span>
            <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {formatCurrency(efectivoDisponible)}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">
            {idSesion ? `Caja activa #${idSesion}` : "Caja cerrada (sin sesión)"}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Compromisos Totales</span>
            <TrendingDown className="h-4 w-4 text-slate-600 dark:text-slate-400" />
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-slate-900 dark:text-slate-100">
            {formatCurrency(totalDeudaProveedores + totalDeudaTrabajadores)}
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">
            Exigible en el corto plazo
          </span>
        </div>
      </div>

      {/* Navegación por pestañas */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setActiveTab("proveedores")}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === "proveedores"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50"
            }`}
          >
            <Truck className="h-3.5 w-3.5" />
            <span>Proveedores & Cuentas por Pagar</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-white/20 ml-1">
              {cuentas.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("trabajadores")}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === "trabajadores"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Trabajadores & Remuneraciones</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-white/20 ml-1">
              {obligaciones.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("historial")}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === "historial"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50"
            }`}
          >
            <Receipt className="h-3.5 w-3.5" />
            <span>Historial Consolidado de Egresos</span>
          </button>
        </div>

        {/* Acciones principales */}
        <div className="flex items-center gap-2">
          {activeTab === "proveedores" && (
            <>
              <button
                type="button"
                onClick={() => setIsSupplierPaymentOpen(true)}
                className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <DollarSign className="h-3.5 w-3.5" />
                <span>Abonar a Proveedor</span>
              </button>
            </>
          )}

          {activeTab === "trabajadores" && (
            <>
              <button
                type="button"
                onClick={() => setIsNewObligationOpen(true)}
                className="px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>+ Nueva Obligación</span>
              </button>
              <button
                type="button"
                onClick={() => setIsEmployeePaymentOpen(true)}
                className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <DollarSign className="h-3.5 w-3.5" />
                <span>Pagar Haberes / Adelanto</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Barra de Búsqueda */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por beneficiario, factura o concepto..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* CONTENIDO DE PESTAÑAS */}

      {/* PESTAÑA 1: PROVEEDORES */}
      {activeTab === "proveedores" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[10px]">
                  <th className="py-2.5 px-3">Proveedor / RUC</th>
                  <th className="py-2.5 px-3">Documento</th>
                  <th className="py-2.5 px-3">Emisión / Venc.</th>
                  <th className="py-2.5 px-3">Condición</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                  <th className="py-2.5 px-3 text-right">Pagado</th>
                  <th className="py-2.5 px-3 text-right">Saldo Pendiente</th>
                  <th className="py-2.5 px-3 text-center">Estado</th>
                  <th className="py-2.5 px-3 text-center">Abonos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {filteredCuentas.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      No se encontraron cuentas por pagar con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredCuentas.map((c) => (
                    <tr key={c.idCuentaPagar} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                          {c.nombreProveedor}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {c.correoProveedor || c.telefonoProveedor}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {c.numeroDocumento}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        <div>{c.fechaEmision}</div>
                        <div className="text-[10px] text-slate-400">Vence: {c.fechaVencimiento}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          c.condicionPago === "CONTADO"
                            ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                            : "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                        }`}>
                          {c.condicionPago}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {formatCurrency(c.total)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                        {formatCurrency(c.montoPagado)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                        {formatCurrency(c.saldoPendiente)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          c.estado === "PAGADA"
                            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                            : c.estado === "PARCIALMENTE PAGADA"
                            ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                            : c.estado === "VENCIDA"
                            ? "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                        }`}>
                          {c.estado}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="font-mono text-slate-500 dark:text-slate-400">
                          {c.pagos.length} {c.pagos.length === 1 ? "abono" : "abonos"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA 2: TRABAJADORES */}
      {activeTab === "trabajadores" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[10px]">
                  <th className="py-2.5 px-3">Colaborador / DNI</th>
                  <th className="py-2.5 px-3">Período Laboral</th>
                  <th className="py-2.5 px-3">Concepto</th>
                  <th className="py-2.5 px-3 text-right">Remun. Pactada</th>
                  <th className="py-2.5 px-3 text-right">Adelantos / Pagado</th>
                  <th className="py-2.5 px-3 text-right">Saldo Restante</th>
                  <th className="py-2.5 px-3 text-center">Estado</th>
                  <th className="py-2.5 px-3 text-center">Desembolsos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {filteredObligaciones.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No se encontraron obligaciones laborales registradas.
                    </td>
                  </tr>
                ) : (
                  filteredObligaciones.map((o) => (
                    <tr key={o.idObligacion} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                          {o.nombreEmpleado}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          DNI: {o.dniEmpleado}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                        {o.periodo}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                        {o.concepto}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {formatCurrency(o.montoPactado)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                        {formatCurrency(o.montoPagado)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                        {formatCurrency(o.saldoPendiente)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          o.estado === "PAGADA"
                            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                            : o.estado === "PARCIALMENTE PAGADA"
                            ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                        }`}>
                          {o.estado}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-500 dark:text-slate-400">
                        {o.pagos.length} {o.pagos.length === 1 ? "pago" : "pagos"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA 3: HISTORIAL CONSOLIDADO DE EGRESOS */}
      {activeTab === "historial" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[10px]">
                  <th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3">Beneficiario / Concepto</th>
                  <th className="py-2.5 px-3">Categoría de Egreso</th>
                  <th className="py-2.5 px-3">Canal de Pago</th>
                  <th className="py-2.5 px-3 text-right">Importe Desembolsado</th>
                  <th className="py-2.5 px-3 text-center">Afectación de Caja</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {/* Consolidar pagos a proveedores y pagos al personal */}
                {(() => {
                  const items: Array<{
                    id: string;
                    fecha: string;
                    beneficiario: string;
                    concepto: string;
                    categoria: string;
                    metodo: string;
                    monto: number;
                    afectaGaveta: boolean;
                  }> = [];

                  cuentas.forEach((c) => {
                    c.pagos.forEach((p) => {
                      items.push({
                        id: `prov-${p.idPagoProveedor}`,
                        fecha: p.fechaPago,
                        beneficiario: c.nombreProveedor,
                        concepto: `Doc #${c.numeroDocumento} - ${p.observaciones || "Abono comercial"}`,
                        categoria: "PAGO_PROVEEDOR",
                        metodo: p.nombreMetodo,
                        monto: p.monto,
                        afectaGaveta: p.idMetodo === 1,
                      });
                    });
                  });

                  obligaciones.forEach((o) => {
                    o.pagos.forEach((p) => {
                      items.push({
                        id: `emp-${p.idPagoPersonal}`,
                        fecha: p.fechaPago,
                        beneficiario: o.nombreEmpleado,
                        concepto: `${p.concepto} (${p.periodo})`,
                        categoria: "PAGO_PERSONAL",
                        metodo: p.nombreMetodo,
                        monto: p.monto,
                        afectaGaveta: p.idMetodo === 1,
                      });
                    });
                  });

                  items.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

                  if (items.length === 0) {
                    return (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          Aún no se registran pagos en el período.
                        </td>
                      </tr>
                    );
                  }

                  return items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono text-slate-500 dark:text-slate-400">
                        {item.fecha}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                          {item.beneficiario}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {item.concepto}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.categoria === "PAGO_PROVEEDOR"
                            ? "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800"
                            : "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                        }`}>
                          {item.categoria}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">
                        {item.metodo}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(item.monto)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.afectaGaveta
                            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                        }`}>
                          {item.afectaGaveta ? "Descuenta Gaveta Física" : "Desembolso Digital"}
                        </span>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: REGISTRAR PAGO A PROVEEDOR */}
      <AddSupplierPaymentModal
        isOpen={isSupplierPaymentOpen}
        onClose={() => setIsSupplierPaymentOpen(false)}
        idSesion={idSesion}
        paymentMethods={paymentMethods}
        efectivoDisponible={efectivoDisponible}
        onSuccess={() => {
          loadData();
        }}
      />

      {/* MODAL 2: REGISTRAR PAGO A PERSONAL */}
      <AddEmployeePaymentModal
        isOpen={isEmployeePaymentOpen}
        onClose={() => setIsEmployeePaymentOpen(false)}
        idSesion={idSesion || 0}
        employees={initialEmployees}
        paymentMethods={paymentMethods}
        efectivoDisponible={efectivoDisponible}
        onSuccess={() => {
          loadData();
        }}
      />

      {/* MODAL 4: REGISTRAR OBLIGACIÓN SALARIAL */}
      {isNewObligationOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4 text-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                <span>Registrar Obligación de Remuneración</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsNewObligationOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateObligation} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Colaborador:</label>
                <select
                  value={newObEmpId}
                  onChange={(e) => setNewObEmpId(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  {initialEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Período Laboral:</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Octubre 2026"
                  value={newObPeriodo}
                  onChange={(e) => setNewObPeriodo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Concepto:</label>
                <input
                  type="text"
                  required
                  placeholder="Remuneración mensual pactada"
                  value={newObConcepto}
                  onChange={(e) => setNewObConcepto(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Remuneración Pactada (S/):</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="1500.00"
                  value={newObMonto}
                  onChange={(e) => setNewObMonto(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono font-bold"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewObligationOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingObligation}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  {isCreatingObligation ? "Guardando..." : "Registrar Obligación"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
