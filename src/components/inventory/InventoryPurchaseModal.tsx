"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  Loader2,
  PackagePlus,
  Plus,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { createAccountPayableAction } from "@/lib/actions/expense.actions";
import { getSupplierDetailAction } from "@/lib/actions/supplier.actions";
import { formatCurrency } from "@/lib/formatters";
import { CreateAccountPayableDto } from "@/types/expenses";
import { SuppliedProductItem } from "@/types/entities";

interface InventoryPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  initialProductBarcode?: string | null;
  suppliers: Array<{ id: number; nombre: string }>;
  employees: Array<{ id: number; nombre: string }>;
  paymentMethods: Array<{ id: number; nombre: string }>;
  idSesion: number | null;
  efectivoDisponible: number;
}

interface PurchaseLine {
  codbarras: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
}

function getDateAfterDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function InventoryPurchaseModal({
  isOpen,
  onClose,
  onSuccess,
  isAuthenticated,
  onRequireAuth,
  initialProductBarcode = null,
  suppliers,
  employees,
  paymentMethods,
  idSesion,
  efectivoDisponible,
}: InventoryPurchaseModalProps) {
  const [isPending, startTransition] = useTransition();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? 0);
  const [supplierProducts, setSupplierProducts] = useState<SuppliedProductItem[]>([]);
  const [loadedSupplierId, setLoadedSupplierId] = useState<number | null>(null);
  const [selectedBarcode, setSelectedBarcode] = useState("");
  const [items, setItems] = useState<PurchaseLine[]>([]);
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [fechaEmision, setFechaEmision] = useState(() => new Date().toISOString().slice(0, 10));
  const [fechaVencimiento, setFechaVencimiento] = useState(() => getDateAfterDays(30));
  const [condicionPago, setCondicionPago] = useState<"CONTADO" | "CREDITO">("CREDITO");
  const [pagoInicial, setPagoInicial] = useState("0");
  const [idMetodo, setIdMetodo] = useState(paymentMethods[0]?.id ?? 0);
  const [idEmpleado, setIdEmpleado] = useState(employees[0]?.id ?? 0);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(
    () => items.reduce(
      (sum, item) => sum + Math.round(item.cantidad * item.precioUnitario * 100) / 100,
      0
    ),
    [items]
  );
  const pagoInicialMonto = condicionPago === "CONTADO" ? total : Number(pagoInicial) || 0;
  const loadingProducts = isOpen && supplierId > 0 && loadedSupplierId !== supplierId;
  const productosDisponibles = supplierProducts.filter(
    (product) => !items.some((item) => item.codbarras === product.codbarras)
  );

  useEffect(() => {
    if (!isOpen || supplierId <= 0) {
      return;
    }

    let active = true;
    getSupplierDetailAction(supplierId)
      .then((result) => {
        if (!active) return;
        if (!result.success || !result.data) {
          setError(result.error || "No fue posible cargar el catálogo de este proveedor.");
          return;
        }
        setSupplierProducts(result.data.productos);
        setSelectedBarcode(
          result.data.productos.some((item) => item.codbarras === initialProductBarcode)
            ? initialProductBarcode ?? ""
            : result.data.productos[0]?.codbarras ?? ""
        );
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Error al cargar productos del proveedor.");
        }
      })
      .finally(() => {
        if (active) setLoadedSupplierId(supplierId);
      });

    return () => {
      active = false;
    };
  }, [initialProductBarcode, isOpen, supplierId]);

  const handleClose = () => {
    setSupplierId(suppliers[0]?.id ?? 0);
    setSupplierProducts([]);
    setLoadedSupplierId(null);
    setItems([]);
    setNumeroDocumento("");
    setFechaEmision(new Date().toISOString().slice(0, 10));
    setFechaVencimiento(getDateAfterDays(30));
    setCondicionPago("CREDITO");
    setPagoInicial("0");
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  const addSelectedProduct = () => {
    const product = supplierProducts.find((item) => item.codbarras === selectedBarcode);
    if (!product || items.some((item) => item.codbarras === product.codbarras)) return;
    setItems((current) => [
      ...current,
      {
        codbarras: product.codbarras,
        nombre: product.nombreProducto,
        cantidad: 1,
        precioUnitario: product.precioCompra,
      },
    ]);
    setSelectedBarcode(
      supplierProducts.find((item) =>
        item.codbarras !== product.codbarras &&
        !items.some((line) => line.codbarras === item.codbarras)
      )?.codbarras ?? ""
    );
  };

  const updateLine = (codbarras: string, updates: Partial<PurchaseLine>) => {
    setItems((current) =>
      current.map((item) => item.codbarras === codbarras ? { ...item, ...updates } : item)
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!isAuthenticated) {
      onRequireAuth();
      return;
    }

    if (supplierId <= 0 || !numeroDocumento.trim()) {
      setError("Selecciona un proveedor e ingresa el número del documento.");
      return;
    }
    if (items.length === 0 || items.some((item) =>
      !Number.isInteger(item.cantidad) || item.cantidad <= 0 ||
      !Number.isFinite(item.precioUnitario) || item.precioUnitario <= 0
    )) {
      setError("Agrega al menos un producto e indica cantidades y costos válidos.");
      return;
    }
    if (!Number.isFinite(pagoInicialMonto) || pagoInicialMonto < 0 || pagoInicialMonto > total) {
      setError("El pago inicial debe estar entre cero y el total de la compra.");
      return;
    }
    if (condicionPago === "CONTADO" && Math.abs(pagoInicialMonto - total) > 0.01) {
      setError("La compra al contado debe pagarse por el total.");
      return;
    }
    if (pagoInicialMonto > 0) {
      if (!idSesion) {
        setError("Abre una sesión de Caja para registrar el pago inicial.");
        return;
      }
      if (idMetodo <= 0 || idEmpleado <= 0) {
        setError("Selecciona el método de pago y el empleado responsable.");
        return;
      }
      if (idMetodo === 1 && pagoInicialMonto > efectivoDisponible + 0.001) {
        setError(`Efectivo insuficiente en Caja. Disponible: ${formatCurrency(efectivoDisponible)}.`);
        return;
      }
    }

    const concepto = items
      .map((item) => `${item.cantidad} x ${item.nombre}`)
      .join(", ")
      .slice(0, 200);
    const data: CreateAccountPayableDto = {
      idProveedor: supplierId,
      numeroDocumento: numeroDocumento.trim(),
      fechaEmision,
      fechaVencimiento,
      condicionPago,
      total,
      concepto,
      idEmpleadoResponsable: idEmpleado,
      items: items.map(({ codbarras, cantidad, precioUnitario }) => ({
        codbarras,
        cantidad,
        precioUnitario,
      })),
      ...(pagoInicialMonto > 0 ? {
        pagoInicial: {
          monto: pagoInicialMonto,
          idMetodo,
          idEmpleadoResponsable: idEmpleado,
          idSesion,
        },
      } : {}),
    };

    startTransition(async () => {
      const result = await createAccountPayableAction(data);
      if (!result.success) {
        setError(result.error || "No se pudo registrar la compra.");
        return;
      }
      onSuccess(
        `Compra registrada: ${items.length} producto(s), ${formatCurrency(total)}. Se actualizó el inventario y la cuenta del proveedor.`
      );
      handleClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="supplier-purchase-title"
        className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
      >
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-blue-600" />
            <div>
              <h2 id="supplier-purchase-title" className="font-bold">Registrar compra a proveedor</h2>
              <p className="text-xs text-slate-500">La compra registra el ingreso de inventario y la cuenta por pagar.</p>
            </div>
          </div>
          <button type="button" onClick={handleClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="font-semibold">
              Proveedor *
              <select
                required
                value={supplierId}
                onChange={(event) => {
                  setSupplierId(Number(event.target.value));
                  setSupplierProducts([]);
                  setLoadedSupplierId(null);
                  setItems([]);
                  setError(null);
                }}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-800"
              >
                <option value={0}>Seleccionar proveedor</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.nombre}</option>
                ))}
              </select>
            </label>
            <label className="font-semibold">
              N.º de factura o documento *
              <input
                required
                maxLength={40}
                value={numeroDocumento}
                onChange={(event) => setNumeroDocumento(event.target.value)}
                placeholder="F001-000123"
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-800"
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="mb-3 flex items-end gap-2">
              <label className="flex-1 font-semibold">
                Productos que suministra el proveedor
                <select
                  value={selectedBarcode}
                  onChange={(event) => setSelectedBarcode(event.target.value)}
                  disabled={loadingProducts || productosDisponibles.length === 0}
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800"
                >
                  {productosDisponibles.length === 0 && <option value="">Sin productos disponibles</option>}
                  {productosDisponibles.map((product) => (
                    <option key={product.codbarras} value={product.codbarras}>
                      {product.nombreProducto} — costo {formatCurrency(product.precioCompra)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={addSelectedProduct}
                disabled={!productosDisponibles.some((product) => product.codbarras === selectedBarcode) || loadingProducts}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 font-bold text-white disabled:opacity-50"
              >
                {loadingProducts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Agregar
              </button>
            </div>

            {items.length === 0 ? (
              <div className="py-4 text-center text-slate-500">
                <PackagePlus className="mx-auto mb-1 h-5 w-5" />
                Agrega productos para calcular el total de la compra.
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.codbarras} className="grid grid-cols-[1fr_5rem_7rem_auto] items-center gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/70">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{item.nombre}</div>
                      <div className="font-mono text-[10px] text-slate-500">{item.codbarras}</div>
                    </div>
                    <label className="text-[10px] text-slate-500">
                      Cantidad
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        step={1}
                        value={item.cantidad}
                        onChange={(event) => updateLine(item.codbarras, { cantidad: Number(event.target.value) })}
                        className="mt-0.5 block w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </label>
                    <label className="text-[10px] text-slate-500">
                      Costo unitario
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={item.precioUnitario}
                        onChange={(event) => updateLine(item.codbarras, { precioUnitario: Number(event.target.value) })}
                        className="mt-0.5 block w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setItems((current) => current.filter((entry) => entry.codbarras !== item.codbarras))}
                      aria-label={`Quitar ${item.nombre}`}
                      className="rounded p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <div className="col-span-full text-right font-mono font-semibold">
                      Subtotal: {formatCurrency(item.cantidad * item.precioUnitario)}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {supplierId > 0 && !loadingProducts && supplierProducts.length === 0 && (
              <p className="mt-2 text-amber-700">Este proveedor no tiene productos asociados. Agrégalos en su catálogo antes de registrar la compra.</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="font-semibold">
              Fecha de compra *
              <input type="date" required value={fechaEmision} onChange={(event) => setFechaEmision(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-800" />
            </label>
            <label className="font-semibold">
              Vencimiento *
              <input type="date" required value={fechaVencimiento} onChange={(event) => setFechaVencimiento(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-800" />
            </label>
            <label className="font-semibold">
              Responsable de recepción *
              <select required value={idEmpleado} onChange={(event) => setIdEmpleado(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-800">
                <option value={0}>Seleccionar empleado</option>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.nombre}</option>)}
              </select>
            </label>
          </div>

          <fieldset className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <legend className="px-1 font-semibold">Condición de pago</legend>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={condicionPago === "CREDITO"} onChange={() => setCondicionPago("CREDITO")} />
                Crédito
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={condicionPago === "CONTADO"} onChange={() => setCondicionPago("CONTADO")} />
                Contado
              </label>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="font-semibold">
                Pago inicial
                <input
                  type="number"
                  min={0}
                  max={total}
                  step={0.01}
                  value={pagoInicial}
                  onChange={(event) => setPagoInicial(event.target.value)}
                  disabled={condicionPago === "CONTADO"}
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono font-normal dark:border-slate-700 dark:bg-slate-800"
                />
              </label>
              {pagoInicialMonto > 0 && (
                <>
                  <label className="font-semibold">
                    Método de pago
                    <select value={idMetodo} onChange={(event) => setIdMetodo(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-800">
                      <option value={0}>Seleccionar método</option>
                      {paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.nombre}</option>)}
                    </select>
                  </label>
                  <div className="self-end text-[11px] text-slate-500">
                    {idSesion
                      ? `Pago en sesión #${idSesion}. Disponible en efectivo: ${formatCurrency(efectivoDisponible)}.`
                      : "Caja cerrada: abre una sesión antes de registrar pagos."}
                  </div>
                </>
              )}
            </div>
          </fieldset>

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[11px] text-slate-500">Saldo por pagar: {formatCurrency(Math.max(0, total - pagoInicialMonto))}</div>
              <div className="font-mono text-lg font-bold">Total: {formatCurrency(total)}</div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={handleClose} className="rounded-lg border border-slate-200 px-4 py-2 font-semibold dark:border-slate-700">Cancelar</button>
              <button
                type="submit"
                disabled={isPending || items.length === 0 || suppliers.length === 0 || employees.length === 0}
                className="rounded-lg bg-blue-600 px-5 py-2 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? "Registrando..." : "Registrar compra"}
              </button>
            </div>
          </div>
          <p className="text-[10px] text-slate-500">
            El registro se realiza en una sola transacción: aumenta stock, agrega movimientos al Kardex y crea la obligación del proveedor. El pago inicial también registra un egreso en Caja.
          </p>
        </form>
      </div>
    </div>
  );
}
