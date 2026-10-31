"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  InventoryDashboardStats,
  InventoryProductStockItem,
  KardexMovementItem,
  InventoryFilterMetadata,
} from "@/types/inventory";
import { InventoryKpiCards } from "./InventoryKpiCards";
import { InventoryProductTable } from "./InventoryProductTable";
import { InventoryKardexTable } from "./InventoryKardexTable";
import { InventoryPurchaseModal } from "./InventoryPurchaseModal";
import { InventoryExitModal } from "./InventoryExitModal";
import { InventoryAdjustmentsNotice } from "./InventoryAdjustmentsNotice";
import { LoginModal } from "@/components/auth/LoginModal";
import {
  Boxes,
  History,
  ArrowDownRight,
  ArrowUpRight,
  Lock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  BookOpen,
} from "lucide-react";

interface InventoryDashboardClientProps {
  stats: InventoryDashboardStats;
  products: InventoryProductStockItem[];
  kardex: KardexMovementItem[];
  metadata: InventoryFilterMetadata;
  suppliers: Array<{ id: number; nombre: string }>;
  employees: Array<{ id: number; nombre: string }>;
  paymentMethods: Array<{ id: number; nombre: string }>;
  idSesion: number | null;
  efectivoDisponible: number;
  isAuthenticated: boolean;
  username: string | null;
}

export function InventoryDashboardClient({
  stats,
  products,
  kardex,
  metadata,
  suppliers,
  employees,
  paymentMethods,
  idSesion,
  efectivoDisponible,
  isAuthenticated,
  username,
}: InventoryDashboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Estados de navegación por pestañas y deep-linking
  const initialTab = searchParams.get("tab") || "existencias";
  const modalParam = searchParams.get("modal");
  const kardexProductParam = searchParams.get("kardexProducto") || "todos";

  const [activeTab, setActiveTab] = useState<"existencias" | "kardex" | "politicas">(
    initialTab === "kardex" ? "kardex" : initialTab === "politicas" ? "politicas" : "existencias"
  );

  const [isPurchaseOpen, setIsPurchaseOpen] = useState(modalParam === "entrada" || modalParam === "compra");
  const [isExitOpen, setIsExitOpen] = useState(modalParam === "salida");
  const [isLoginOpen, setIsLoginOpen] = useState(modalParam === "login");
  const [selectedProductForAction, setSelectedProductForAction] =
    useState<InventoryProductStockItem | null>(null);

  const [kardexFilterBarcode, setKardexFilterBarcode] = useState<string>(kardexProductParam);

  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showFeedback = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback(null);
    }, 6000);
  };

  // Registrar la compra del producto seleccionado desde existencias.
  const handleOpenEntry = (product: InventoryProductStockItem) => {
    setSelectedProductForAction(product);
    setIsPurchaseOpen(true);
  };

  // Abrir salida para producto específico
  const handleOpenExit = (product: InventoryProductStockItem) => {
    setSelectedProductForAction(product);
    setIsExitOpen(true);
  };

  // Navegar a Kardex filtrado por producto
  const handleViewKardex = (codbarras: string) => {
    setKardexFilterBarcode(codbarras);
    setActiveTab("kardex");
  };

  return (
    <div className="space-y-6">
      {/* Banner de Retroalimentación */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs animate-in slide-in-from-top-2 duration-200 ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800 shadow-xs"
              : "bg-rose-50 border-rose-200 text-rose-800 shadow-xs"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs hover:underline opacity-80"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* KPI Cards de Resumen General */}
      <InventoryKpiCards stats={stats} />

      {/* Barra de Acciones Operativas y Sesión */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 text-xs">
          {isAuthenticated ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold text-[11px]">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Sesión Activa: {username}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-600 text-[11px]">
              <Lock className="h-3 w-3" />
              <span>Modo Consulta (Sin autenticar)</span>
            </div>
          )}
          <span className="text-slate-300 hidden sm:inline">•</span>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Control de existencias y trazabilidad con bloqueo de sobreventa
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto sm:justify-end">
          {!isAuthenticated ? (
            <button
              type="button"
              onClick={() => setIsLoginOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[42px] rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold whitespace-nowrap transition-colors shadow-xs"
            >
              <Lock className="h-3.5 w-3.5 text-blue-600 shrink-0" />
              <span>Acceso Admin</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => {
              if (!isAuthenticated) {
                setIsLoginOpen(true);
              } else {
                setSelectedProductForAction(null);
                setIsPurchaseOpen(true);
              }
            }}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[42px] rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-700 text-white font-semibold text-xs shadow-xs whitespace-nowrap transition-colors"
          >
            <ArrowDownRight className="h-4 w-4 shrink-0" />
            <span>+ Registrar Compra</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (!isAuthenticated) {
                setIsLoginOpen(true);
              } else {
                setSelectedProductForAction(null);
                setIsExitOpen(true);
              }
            }}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[42px] rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-700 text-white font-semibold text-xs shadow-xs whitespace-nowrap transition-colors"
          >
            <ArrowUpRight className="h-4 w-4 shrink-0" />
            <span>- Registrar Salida</span>
          </button>
        </div>
      </div>

      {/* Selector de Pestañas Adaptable */}
      <div className="flex items-center gap-1.5 sm:gap-2 border-b border-slate-200 overflow-x-auto pb-0.5">
        <button
          type="button"
          onClick={() => setActiveTab("existencias")}
          className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap shrink-0 transition-all ${
            activeTab === "existencias"
              ? "border-blue-600 text-blue-600 bg-blue-50/50"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <Boxes className="h-4 w-4 shrink-0" />
          <span>Existencias ({products.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("kardex")}
          className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap shrink-0 transition-all ${
            activeTab === "kardex"
              ? "border-blue-600 text-blue-600 bg-blue-50/50"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <History className="h-4 w-4 shrink-0" />
          <span>Kardex ({kardex.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("politicas")}
          className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap shrink-0 transition-all ${
            activeTab === "politicas"
              ? "border-blue-600 text-blue-600 bg-blue-50/50"
              : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
          }`}
        >
          <BookOpen className="h-4 w-4 shrink-0" />
          <span>Auditoría de Esquema</span>
        </button>
      </div>

      {/* Contenido según Pestaña Activa */}
      {activeTab === "existencias" && (
        <InventoryProductTable
          products={products}
          categorias={metadata.categorias}
          estados={metadata.estados}
          onOpenEntry={handleOpenEntry}
          onOpenExit={handleOpenExit}
          onViewKardex={handleViewKardex}
        />
      )}

      {activeTab === "kardex" && (
        <InventoryKardexTable
          kardex={kardex}
          metadata={metadata}
          initialProductFilter={kardexFilterBarcode}
        />
      )}

      {activeTab === "politicas" && <InventoryAdjustmentsNotice />}

      <InventoryPurchaseModal
        isOpen={isPurchaseOpen}
        onClose={() => {
          setIsPurchaseOpen(false);
          setSelectedProductForAction(null);
        }}
        initialProductBarcode={selectedProductForAction?.codbarras}
        suppliers={suppliers}
        employees={employees}
        paymentMethods={paymentMethods}
        idSesion={idSesion}
        efectivoDisponible={efectivoDisponible}
        onSuccess={(msg) => {
          showFeedback("success", msg);
          router.refresh();
        }}
        onRequireAuth={() => setIsLoginOpen(true)}
        isAuthenticated={isAuthenticated}
      />

      {/* Modal de Salida de Inventario */}
      <InventoryExitModal
        isOpen={isExitOpen}
        onClose={() => {
          setIsExitOpen(false);
          setSelectedProductForAction(null);
        }}
        metadata={metadata}
        initialProduct={selectedProductForAction}
        isAuthenticated={isAuthenticated}
        onRequireAuth={() => setIsLoginOpen(true)}
        onSuccess={(msg) => {
          showFeedback("success", msg);
          router.refresh();
        }}
      />

      {/* Modal de Acceso Administrativo */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onSuccess={() => {
          showFeedback("success", "Sesión administrativa validada con éxito.");
          router.refresh();
        }}
      />
    </div>
  );
}
