"use client";

import { useState, useMemo } from "react";
import {
  PosProductItem,
  PosCartItem,
  PosPaymentAllocation,
  SalesFilterMetadata,
} from "@/types/sales";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { calculateTaxFromTotal } from "@/lib/tax";
import { createSaleAction } from "@/lib/actions/sale.actions";
import { TransactionalSaleResult } from "@/lib/repositories/sale-transaction.repository";
import { PosReceiptModal } from "./PosReceiptModal";
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  AlertTriangle,
  CreditCard,
  User,
  ShieldCheck,
  Receipt,
  FileText,
  AlertOctagon,
  RotateCcw,
  CheckCircle2,
  Package,
  Layers,
  Loader2,
  AlertCircle,
  X,
} from "lucide-react";

interface PosTerminalClientProps {
  initialProducts: PosProductItem[];
  metadata: SalesFilterMetadata;
  isAuthenticated: boolean;
  username: string | null;
}

export function PosTerminalClient({
  initialProducts,
  metadata,
  isAuthenticated,
  username,
}: PosTerminalClientProps) {
  // Catálogo y Búsqueda
  const [productSearch, setProductSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("todas");

  // Carrito de compras
  const [cart, setCart] = useState<PosCartItem[]>([]);

  // Datos de la transacción
  const [selectedClientDni, setSelectedClientDni] = useState(
    metadata.clientes[0]?.dni || ""
  );
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number>(() => {
    const firstEmp = metadata.empleados[0]?.id;
    return firstEmp !== undefined ? Number(firstEmp) : 1;
  });
  const [selectedTipoCompId, setSelectedTipoCompId] = useState<1 | 2>(1); // 1 = Boleta, 2 = Factura

  // Pagos múltiples
  const [payments, setPayments] = useState<PosPaymentAllocation[]>([
    { idMetodo: 1, nombreMetodo: "Efectivo", monto: 0 },
  ]);

  // Estados de Transacción Fase 6B
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [completedSale, setCompletedSale] = useState<TransactionalSaleResult | null>(null);
  const [clientAttemptId, setClientAttemptId] = useState<string>(() => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "req-" + Date.now();
  });

  // Categorías únicas para filtro rápido
  const categories = useMemo(() => {
    const set = new Set(initialProducts.map((p) => p.categoria));
    return Array.from(set);
  }, [initialProducts]);

  // Productos filtrados
  const filteredProducts = useMemo(() => {
    return initialProducts.filter((p) => {
      const matchQuery =
        !productSearch.trim() ||
        p.nombre.toLowerCase().includes(productSearch.toLowerCase().trim()) ||
        p.codbarras.includes(productSearch.trim()) ||
        p.marca.toLowerCase().includes(productSearch.toLowerCase().trim());

      const matchCat =
        selectedCategory === "todas" || p.categoria === selectedCategory;

      return matchQuery && matchCat;
    });
  }, [initialProducts, productSearch, selectedCategory]);

  // Totales del carrito
  const totalGeneral = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.subtotal, 0);
  }, [cart]);

  const totalItemsCount = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.cantidad, 0);
  }, [cart]);

  // Cálculo de pagos con soporte de vuelto y pagos mixtos
  const paymentCalculations = useMemo(() => {
    const totalNoEfectivo = payments
      .filter((p) => p.idMetodo !== 1)
      .reduce((acc, p) => acc + (p.monto || 0), 0);

    const efectivoRow = payments.find((p) => p.idMetodo === 1);
    const efectivoIngresado = efectivoRow ? (efectivoRow.monto || 0) : 0;
    const tieneEfectivo = !!efectivoRow;

    // Restante que debe ser cubierto por efectivo (redondeo exacto a 2 decimales)
    const restanteEfectivo = Math.max(0, Math.round((totalGeneral - totalNoEfectivo) * 100) / 100);

    let vuelto = 0;
    let efectivoNeto = 0;
    let faltante = 0;
    let esValido = false;

    if (tieneEfectivo) {
      if (efectivoIngresado >= restanteEfectivo && totalGeneral > 0) {
        vuelto = Math.round((efectivoIngresado - restanteEfectivo) * 100) / 100;
        efectivoNeto = restanteEfectivo;
        faltante = 0;
        esValido = true;
      } else {
        vuelto = 0;
        efectivoNeto = efectivoIngresado;
        faltante = Math.round((restanteEfectivo - efectivoIngresado) * 100) / 100;
        esValido = false;
      }
    } else {
      // Sin efectivo (100% digital/electrónico)
      const diff = Math.round((totalGeneral - totalNoEfectivo) * 100) / 100;
      if (Math.abs(diff) < 0.01 && totalGeneral > 0) {
        esValido = true;
        faltante = 0;
      } else if (diff > 0) {
        faltante = diff;
        esValido = false;
      } else {
        // Exceso en medio electrónico no permitido
        faltante = diff;
        esValido = false;
      }
    }

    const totalCobradoNeto = totalNoEfectivo + efectivoNeto;

    return {
      totalNoEfectivo,
      efectivoIngresado,
      tieneEfectivo,
      restanteEfectivo,
      vuelto,
      efectivoNeto,
      faltante,
      esValido,
      totalCobradoNeto,
    };
  }, [payments, totalGeneral]);

  // Desglose Tributario Oficial Perú 2026 (15.5% IGV + 2.5% IPM = 18.0% total)
  const taxBreakdown = useMemo(() => {
    return calculateTaxFromTotal(totalGeneral);
  }, [totalGeneral]);

  // Total de pagos brutos asignados en inputs
  const totalPagado = useMemo(() => {
    return payments.reduce((acc, p) => acc + (p.monto || 0), 0);
  }, [payments]);

  const diferenciaPagos = totalGeneral - totalPagado;

  // Añadir producto al carrito (con consolidación estricta por código de barras)
  const handleAddToCart = (product: PosProductItem) => {
    if (product.stock <= 0) return;

    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.producto.codbarras === product.codbarras
      );

      if (existingIndex >= 0) {
        const currentItem = prev[existingIndex];
        const newQty = currentItem.cantidad + 1;

        // Validar límite contra stock real
        if (newQty > product.stock) {
          return prev;
        }

        const updated = [...prev];
        updated[existingIndex] = {
          ...currentItem,
          cantidad: newQty,
          subtotal: Number((newQty * product.precio).toFixed(2)),
        };
        return updated;
      } else {
        return [
          ...prev,
          {
            producto: product,
            cantidad: 1,
            precioUnitario: product.precio,
            subtotal: product.precio,
          },
        ];
      }
    });
  };

  // Actualizar cantidad de un ítem en el carrito
  const handleUpdateQuantity = (codbarras: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveFromCart(codbarras);
      return;
    }

    setCart((prev) =>
      prev.map((item) => {
        if (item.producto.codbarras !== codbarras) return item;
        const boundedQty = Math.min(newQty, item.producto.stock);
        return {
          ...item,
          cantidad: boundedQty,
          subtotal: Number((boundedQty * item.precioUnitario).toFixed(2)),
        };
      })
    );
  };

  // Quitar ítem del carrito
  const handleRemoveFromCart = (codbarras: string) => {
    setCart((prev) =>
      prev.filter((item) => item.producto.codbarras !== codbarras)
    );
  };

  // Limpiar carrito
  const handleClearCart = () => {
    setCart([]);
    setPayments([{ idMetodo: 1, nombreMetodo: "Efectivo", monto: 0 }]);
  };

  // Auto-llenar monto de pago con el total
  const handleAutoFillPayment = (index: number) => {
    const restante = Math.max(0, totalGeneral - totalPagado + (payments[index].monto || 0));
    setPayments((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], monto: Number(restante.toFixed(2)) };
      return updated;
    });
  };

  // Añadir un nuevo método de pago (con consolidación de métodos repetidos)
  const handleAddPaymentMethod = (idMetodo: number) => {
    const metodoInfo = metadata.metodosPago.find((m) => m.id === idMetodo);
    if (!metodoInfo) return;

    // Verificar si ya existe para consolidar en lugar de duplicar PK
    const existingIndex = payments.findIndex((p) => p.idMetodo === idMetodo);
    if (existingIndex >= 0) {
      // Ya existe en la distribución
      return;
    }

    const restante = Math.max(0, totalGeneral - totalPagado);
    setPayments((prev) => [
      ...prev,
      {
        idMetodo,
        nombreMetodo: metodoInfo.nombre,
        monto: Number(restante.toFixed(2)),
      },
    ]);
  };

  // Modificar monto de un método de pago
  const handlePaymentAmountChange = (index: number, monto: number) => {
    setPayments((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], monto: Math.max(0, monto) };
      return updated;
    });
  };

  // Quitar método de pago
  const handleRemovePaymentMethod = (index: number) => {
    if (payments.length <= 1) return;
    setPayments((prev) => prev.filter((_, i) => i !== index));
  };

  // Ejecutar venta transaccional en SQL Server
  const handleExecuteSale = async () => {
    if (isSubmitting) return;

    if (cart.length === 0) {
      setSubmitError("El carrito de compras no puede estar vacío.");
      return;
    }

    if (!paymentCalculations.esValido) {
      if (paymentCalculations.tieneEfectivo && paymentCalculations.faltante > 0) {
        setSubmitError(
          `El importe recibido no cubre el total de la compra (Faltan ${formatCurrency(paymentCalculations.faltante)}).`
        );
      } else if (!paymentCalculations.tieneEfectivo && paymentCalculations.faltante < 0) {
        setSubmitError("Los pagos con medios electrónicos no pueden superar el total de la orden.");
      } else {
        setSubmitError("Los pagos asignados no cubren el total de la compra.");
      }
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      // Normalización estricta del payload hacia el Server Action
      const payload = {
        dniCliente: String(selectedClientDni).trim(),
        idEmpleado: Number(selectedEmployeeId),
        idTipoComp: Number(selectedTipoCompId) as 1 | 2,
        items: cart.map((item) => ({
          codbarras: String(item.producto.codbarras).trim(),
          cantidad: Number(item.cantidad),
        })),
        payments: payments.map((p) => ({
          idMetodo: Number(p.idMetodo),
          // Si es efectivo y hubo exceso/vuelto, el cobro neto asignado a la venta es el saldo restante
          monto:
            Number(p.idMetodo) === 1
              ? paymentCalculations.efectivoNeto
              : Number(p.monto),
        })),
        efectivoRecibido: paymentCalculations.tieneEfectivo
          ? paymentCalculations.efectivoIngresado
          : undefined,
        vuelto: paymentCalculations.tieneEfectivo
          ? paymentCalculations.vuelto
          : undefined,
        clientRequestId: clientAttemptId,
      };

      const result = await createSaleAction(payload);

      if (!result.success || !result.data) {
        setSubmitError(result.error || "Ocurrió un error al procesar la venta.");
        setIsSubmitting(false);
        return;
      }

      // Éxito: abrir comprobante comercial
      setCompletedSale(result.data);
      setShowConfirmModal(false);
      handleClearCart();

      // Generar nuevo attempt id para la próxima transacción
      if (typeof crypto !== "undefined" && crypto.randomUUID) {
        setClientAttemptId(crypto.randomUUID());
      } else {
        setClientAttemptId("req-" + Date.now());
      }
    } catch (err: any) {
      setSubmitError(
        err?.message || "Error inesperado de comunicación con el servidor al registrar la venta."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Banner Informativo Fase 6B */}
      <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-950 shadow-xs">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <span className="font-bold text-blue-900 block text-sm">
              Terminal POS Transaccional Activo (Fase 6B)
            </span>
            <p className="text-blue-800/90 leading-relaxed">
              Sistema operativo conectado a <code className="bg-blue-100 text-blue-900 px-1 py-0.5 rounded font-mono">MishutecT2_Aceptacion</code>. Cada venta se procesa en una transacción
              atómica (ACID con bloqueo concurrente <code className="bg-blue-100 text-blue-900 px-1 py-0.5 rounded font-mono">sp_getapplock</code>): emite correlativos secuenciales (Boleta B001 / Factura F001),
              valida reglas de negocio, descuenta el stock real y registra las salidas correspondientes en <code className="bg-blue-100 text-blue-900 px-1 py-0.5 rounded font-mono">Mov_Inventario</code>.
            </p>
          </div>
        </div>
      </div>

      {/* Grid Principal: 2 Columnas en Escritorio (Catálogo Izquierda, Carrito/Checkout Derecha) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Columna Izquierda: Buscador y Catálogo de Productos (7 columnas) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-4 sm:p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Catálogo Disponible para Venta
                </h3>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">
                {filteredProducts.length} productos con stock
              </span>
            </div>

            {/* Buscador */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Escanear código de barras o escribir nombre del componente..."
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
              />
            </div>

            {/* Categorías Rápidas */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                type="button"
                onClick={() => setSelectedCategory("todas")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 shadow-xs ${
                  selectedCategory === "todas"
                    ? "bg-blue-600 text-white font-semibold"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Todas
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 shadow-xs ${
                    selectedCategory === cat
                      ? "bg-blue-600 text-white font-semibold"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Grilla de Productos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[550px] overflow-y-auto pr-1">
            {filteredProducts.length === 0 ? (
              <div className="col-span-full py-12 text-center text-slate-500 text-xs bg-white rounded-xl border border-slate-200 shadow-xs">
                No se encontraron productos disponibles con stock en este criterio.
              </div>
            ) : (
              filteredProducts.map((p) => {
                const inCartItem = cart.find(
                  (c) => c.producto.codbarras === p.codbarras
                );
                const currentCartQty = inCartItem ? inCartItem.cantidad : 0;
                const remainingStock = p.stock - currentCartQty;

                return (
                  <div
                    key={p.codbarras}
                    className="p-3.5 rounded-xl bg-white border border-slate-200 hover:border-blue-300 hover:shadow-xs transition-all flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1.5">
                        <span className="font-semibold text-slate-900 text-xs leading-tight line-clamp-2">
                          {p.nombre}
                        </span>
                        <span className="font-mono font-bold text-slate-900 text-xs shrink-0">
                          {formatCurrency(p.precio)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                        <span>{p.codbarras}</span>
                        <span>&bull;</span>
                        <span>{p.marca}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          remainingStock > 2
                            ? "bg-slate-100 text-slate-700 border border-slate-200"
                            : remainingStock > 0
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}
                      >
                        Stock: {remainingStock} ud.
                      </span>

                      <button
                        type="button"
                        disabled={remainingStock <= 0}
                        onClick={() => handleAddToCart(p)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-lg bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-blue-600 text-xs font-semibold border border-blue-200 shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Añadir</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Columna Derecha: Carrito, Parámetros y Checkout (5 columnas) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-4 sm:p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            {/* Cabecera del Carrito */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Orden de Venta ({totalItemsCount} ítems)
                </h3>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearCart}
                  className="text-xs text-rose-600 hover:text-rose-700 font-medium transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Vaciar</span>
                </button>
              )}
            </div>

            {/* Lista de Ítems en Carrito */}
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {cart.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  El carrito se encuentra vacío. Añada productos desde el catálogo para iniciar la orden.
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.producto.codbarras}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-900 block truncate leading-tight">
                          {item.producto.nombre}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {formatCurrency(item.precioUnitario)} c/u
                        </span>
                      </div>
                      <span className="font-mono font-bold text-slate-900 shrink-0">
                        {formatCurrency(item.subtotal)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/80">
                      {/* Control de Cantidades */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateQuantity(
                              item.producto.codbarras,
                              item.cantidad - 1
                            )
                          }
                          className="p-1 rounded bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors shadow-xs"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="font-mono font-bold text-slate-900 px-2">
                          {item.cantidad}
                        </span>
                        <button
                          type="button"
                          disabled={item.cantidad >= item.producto.stock}
                          onClick={() =>
                            handleUpdateQuantity(
                              item.producto.codbarras,
                              item.cantidad + 1
                            )
                          }
                          className="p-1 rounded bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40 transition-colors shadow-xs"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          handleRemoveFromCart(item.producto.codbarras)
                        }
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                        title="Eliminar de la orden"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Parámetros de la Transacción */}
            <div className="pt-2 border-t border-slate-100 space-y-3 text-xs">
              {/* Selector de Tipo de Comprobante */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Comprobante Legal a Emitir
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTipoCompId(1)}
                    className={`p-2 rounded-lg border text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-xs ${
                      selectedTipoCompId === 1
                        ? "bg-blue-50 border-blue-500 text-blue-700"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    <span>Boleta (B001)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTipoCompId(2)}
                    className={`p-2 rounded-lg border text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-xs ${
                      selectedTipoCompId === 2
                        ? "bg-blue-50 border-blue-500 text-blue-700"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Factura (F001)</span>
                  </button>
                </div>
              </div>

              {/* Selector de Cliente */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Cliente Titular
                </label>
                <select
                  value={selectedClientDni}
                  onChange={(e) => setSelectedClientDni(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                >
                  {metadata.clientes.map((c) => (
                    <option key={c.dni} value={c.dni}>
                      {c.nombreCompleto} (DNI: {c.dni})
                    </option>
                  ))}
                </select>
              </div>

              {/* Selector de Empleado */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Empleado Responsable
                </label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                >
                  {metadata.empleados.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombreCompleto}
                    </option>
                  ))}
                </select>
              </div>

              {/* Distribución de Métodos de Pago */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-semibold text-slate-700">
                    Distribución de Pago (Soporte Mixto)
                  </label>
                  {/* Selector rápido para añadir método */}
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddPaymentMethod(Number(e.target.value));
                        e.target.value = "";
                      }
                    }}
                    defaultValue=""
                    className="text-[10px] bg-slate-50 text-blue-600 font-semibold border border-slate-200 rounded px-1.5 py-0.5"
                  >
                    <option value="" disabled>
                      + Añadir método
                    </option>
                    {metadata.metodosPago.map((mp) => (
                      <option key={mp.id} value={mp.id}>
                        {mp.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  {payments.map((p, index) => (
                    <div
                      key={p.idMetodo}
                      className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2"
                    >
                      <span className="font-medium text-slate-700 text-xs w-24 truncate">
                        {p.nombreMetodo}
                      </span>
                      <div className="flex items-center gap-1.5 flex-1 justify-end">
                        <span className="text-slate-400 font-mono text-[10px]">S/.</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={p.monto || ""}
                          onChange={(e) =>
                            handlePaymentAmountChange(index, parseFloat(e.target.value) || 0)
                          }
                          className="w-24 px-2 py-1 rounded bg-white border border-slate-250 text-right font-mono font-bold text-slate-900 text-xs focus:outline-none focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleAutoFillPayment(index)}
                          title="Asignar restante automáticamente"
                          className="px-1.5 py-1 text-[10px] rounded bg-blue-50 hover:bg-blue-100 text-blue-600 font-mono font-semibold border border-blue-200 transition-colors"
                        >
                          Auto
                        </button>
                        {payments.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemovePaymentMethod(index)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Balance y Estado de Pagos con soporte de Vuelto */}
                {paymentCalculations.tieneEfectivo ? (
                  paymentCalculations.vuelto > 0 ? (
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 space-y-1.5 font-mono text-xs">
                      <div className="flex items-center justify-between text-emerald-800">
                        <span className="flex items-center gap-1 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span>Efectivo recibido:</span>
                        </span>
                        <span className="font-bold">{formatCurrency(paymentCalculations.efectivoIngresado)}</span>
                      </div>
                      <div className="flex items-center justify-between text-emerald-900 font-bold text-sm pt-1 border-t border-emerald-200">
                        <span>Vuelto al cliente:</span>
                        <span className="text-emerald-700">{formatCurrency(paymentCalculations.vuelto)}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 text-[11px] pt-0.5">
                        <span>Cobro neto en efectivo:</span>
                        <span className="font-semibold">{formatCurrency(paymentCalculations.efectivoNeto)}</span>
                      </div>
                    </div>
                  ) : paymentCalculations.faltante > 0 ? (
                    <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-1.5 text-xs">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      <span>El importe recibido no cubre el total de la compra (Faltan {formatCurrency(paymentCalculations.faltante)}).</span>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between text-xs font-mono">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span>Pago exacto en efectivo:</span>
                      </span>
                      <span className="font-bold text-emerald-700">{formatCurrency(paymentCalculations.efectivoIngresado)}</span>
                    </div>
                  )
                ) : (
                  paymentCalculations.esValido ? (
                    <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between text-xs font-mono">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span>Total cubierto por medios digitales:</span>
                      </span>
                      <span className="font-bold text-emerald-700">{formatCurrency(paymentCalculations.totalNoEfectivo)}</span>
                    </div>
                  ) : paymentCalculations.faltante > 0 ? (
                    <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-1.5 text-xs">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      <span>Faltan asignar {formatCurrency(paymentCalculations.faltante)} para cubrir la orden.</span>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-1.5 text-xs">
                      <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                      <span>Los pagos con medios electrónicos no pueden superar el total de la orden.</span>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Resumen Comercial y Desglose Tributario (15.5% IGV + 2.5% IPM) */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(totalGeneral)}</span>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Descuentos:</span>
                  <span>{formatCurrency(0)}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Base Imponible (Gravada):</span>
                  <span className="font-semibold">{formatCurrency(taxBreakdown.baseImponible)}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>IGV (15.5%) + IPM (2.5%):</span>
                  <span className="font-semibold">{formatCurrency(taxBreakdown.totalImpuestos)}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  Total General a Pagar
                </span>
                <span className="text-xl sm:text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                  {formatCurrency(totalGeneral)}
                </span>
              </div>
            </div>

              {submitError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-semibold block">Error al procesar la venta:</span>
                    <p className="mt-0.5 text-rose-700/90">{submitError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSubmitError(null)}
                    className="text-rose-500 hover:text-rose-800"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Botón de Confirmación */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setSubmitError(null);
                    setShowConfirmModal(true);
                  }}
                  disabled={
                    cart.length === 0 ||
                    totalGeneral <= 0 ||
                    !paymentCalculations.esValido ||
                    !selectedClientDni ||
                    !selectedEmployeeId ||
                    isSubmitting
                  }
                  className="w-full py-3.5 px-4 min-h-[46px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      <span>Procesando Transacción...</span>
                    </>
                  ) : (
                    <>
                      <Receipt className="h-4 w-4" />
                      <span>Confirmar Venta y Generar Comprobante</span>
                    </>
                  )}
                </button>
                <div className="text-[11px] text-center text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2 flex items-center justify-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                  <span>
                    Transacción atómica segura con bloqueo de correlativos y control de existencias.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

      {/* Modal de Pre-Confirmación de Venta */}
      {showConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="relative w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header Modal */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-50 border border-blue-100 text-blue-600">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Confirmar Transacción Comercial
                  </h3>
                  <p className="text-xs text-slate-500">
                    Revisa los datos antes de emitir el comprobante y descontar el inventario.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSubmitting && setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Cuerpo con Scroll */}
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs">
              {/* Alerta de Transacción Real */}
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Esta acción registrará la venta en <strong>MishutecT2_Aceptacion</strong>, asignará un
                  número correlativo consecutivo e inmutable y descontará el stock físico de forma inmediata.
                </p>
              </div>

              {/* Datos de Comprobante, Cliente y Empleado */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Tipo de Comprobante</span>
                  <span className="text-slate-900 font-semibold">
                    {selectedTipoCompId === 1 ? "Boleta de Venta (B001)" : "Factura Comercial (F001)"}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Operador / Empleado</span>
                  <span className="text-slate-900 font-semibold">
                    {metadata.empleados.find((e) => e.id === selectedEmployeeId)?.nombreCompleto || `ID ${selectedEmployeeId}`}
                  </span>
                </div>
                <div className="col-span-2 pt-2 border-t border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Cliente</span>
                  <span className="text-slate-900 font-semibold">
                    {metadata.clientes.find((c) => c.dni === selectedClientDni)?.nombreCompleto || selectedClientDni} ({selectedClientDni})
                  </span>
                </div>
              </div>

              {/* Resumen de Artículos */}
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                  Artículos en Orden ({cart.length} productos, {totalItemsCount} unidades)
                </span>
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {cart.map((item) => (
                    <div
                      key={item.producto.codbarras}
                      className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-slate-900 truncate font-semibold">{item.producto.nombre}</p>
                        <p className="text-[10px] text-slate-500 font-mono">
                          {item.cantidad} x {formatCurrency(item.precioUnitario)}
                        </p>
                      </div>
                      <span className="font-mono font-bold text-slate-900 shrink-0">
                        {formatCurrency(item.subtotal)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* RESUMEN DE LA COMPRA Y LIQUIDACIÓN TRIBUTARIA */}
              <div className="space-y-2.5 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block tracking-wider">
                  Resumen Comercial y Liquidación Tributaria
                </span>
                <div className="space-y-1.5 font-mono text-xs">
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                    <span>Total de Productos:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {cart.length} ítems ({totalItemsCount} unid.)
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                    <span>Base Imponible (Gravada):</span>
                    <span>{formatCurrency(taxBreakdown.baseImponible)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 text-[11px]">
                    <span className="pl-2">&bull; IGV (15.5%):</span>
                    <span>{formatCurrency(taxBreakdown.igv)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 text-[11px]">
                    <span className="pl-2">&bull; IPM (2.5%):</span>
                    <span>{formatCurrency(taxBreakdown.ipm)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-700 dark:text-slate-200 font-bold pt-1 border-t border-slate-200 dark:border-slate-800">
                    <span>Total de la Operación:</span>
                    <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">{formatCurrency(totalGeneral)}</span>
                  </div>

                  {/* Métodos de Pago */}
                  <div className="pt-2 border-t border-slate-200 space-y-1 text-[11px]">
                    <span className="text-[10px] font-bold text-slate-500 block uppercase font-sans">
                      Métodos de Pago:
                    </span>
                    {payments.map((p) => (
                      <div key={p.idMetodo} className="flex justify-between text-slate-600">
                        <span>{p.nombreMetodo}:</span>
                        <span className="font-bold text-slate-800">
                          {p.idMetodo === 1 && paymentCalculations.vuelto > 0
                            ? `${formatCurrency(paymentCalculations.efectivoNeto)} (Recibido: ${formatCurrency(paymentCalculations.efectivoIngresado)})`
                            : formatCurrency(p.monto)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Efectivo y Vuelto si aplica */}
                  {paymentCalculations.tieneEfectivo && (
                    <div className="pt-2 border-t border-slate-200 space-y-1 text-xs">
                      <div className="flex items-center justify-between text-slate-700">
                        <span>Efectivo Entregado:</span>
                        <span className="font-bold text-slate-900">
                          {formatCurrency(paymentCalculations.efectivoIngresado)}
                        </span>
                      </div>
                      {paymentCalculations.vuelto > 0 && (
                        <div className="flex items-center justify-between text-emerald-700 font-bold">
                          <span>Vuelto al Cliente:</span>
                          <span className="text-emerald-700 text-sm">{formatCurrency(paymentCalculations.vuelto)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cobro Neto */}
                  <div className="pt-2.5 border-t-2 border-slate-300 flex items-center justify-between text-sm font-bold text-slate-900">
                    <span className="uppercase tracking-wide">COBRO NETO:</span>
                    <span className="font-mono text-blue-600 text-base sm:text-lg">
                      {formatCurrency(totalGeneral)}
                    </span>
                  </div>
                </div>
              </div>

              {submitError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}
            </div>

            {/* Footer Modal Acciones */}
            <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-xs transition-colors disabled:opacity-50"
              >
                Volver y Modificar
              </button>
              <button
                type="button"
                onClick={handleExecuteSale}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider shadow-xs disabled:opacity-50 flex items-center gap-2 transition-all active:scale-[0.98]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                    <span>Confirmando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-white" />
                    <span>Confirmar Transacción</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Comprobante Comercial de Venta Emitida */}
      {completedSale && (
        <PosReceiptModal
          sale={completedSale}
          onClose={() => setCompletedSale(null)}
        />
      )}
    </div>
  );
}
