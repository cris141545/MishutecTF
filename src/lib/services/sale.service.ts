import { revalidatePath } from "next/cache";
import { requireAdminSession } from "../auth/authorization";
import {
  getSalesData,
  getSaleDetailById,
  getAvailableProductsForPos,
  SalesFilterParams,
} from "../repositories/sale.repository";
import {
  executeSaleTransaction,
  TransactionalSaleResult,
  SaleTransactionError,
} from "../repositories/sale-transaction.repository";
import { saleInputSchema } from "../validations/sale.schema";
import { SalesPageData, SaleDetail, PosProductItem } from "@/types/sales";

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode: number;
}

/**
 * Servicio para consulta de ventas y métricas comerciales.
 */
export async function fetchSales(filters: SalesFilterParams = {}): Promise<SalesPageData> {
  return getSalesData(filters);
}

/**
 * Servicio para consultar el detalle de una venta con trazabilidad y conciliación.
 */
export async function fetchSaleDetail(idVenta: number): Promise<SaleDetail | null> {
  if (isNaN(idVenta) || idVenta <= 0) {
    return null;
  }
  return getSaleDetailById(idVenta);
}

/**
 * Servicio para obtener el catálogo activo disponible en el Terminal POS.
 */
export async function fetchPosCatalog(): Promise<PosProductItem[]> {
  return getAvailableProductsForPos();
}

/**
 * Servicio transaccional para registrar una venta en SQL Server (Fase 6B).
 * Requiere sesión administrativa y opera sobre la base de aceptación.
 */
export async function createSaleTransactional(
  rawInput: unknown
): Promise<ServiceResult<TransactionalSaleResult>> {
  try {
    // 1. Validar sesión administrativa autorizada
    await requireAdminSession();

    // 2. Validación de esquema mediante Zod con diagnóstico controlado
    const parsed = saleInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const issuePath = firstIssue?.path ? firstIssue.path.join(".") : "general";
      console.warn(`[SaleValidationIssue] Campo '${issuePath}':`, {
        code: firstIssue?.code,
        message: firstIssue?.message,
        path: firstIssue?.path,
      });

      let userFriendlyError = firstIssue?.message || "Datos de venta inválidos. Por favor verifique el formulario.";
      if (userFriendlyError.includes("expected number, received string")) {
        userFriendlyError = `El campo '${issuePath}' requiere un valor numérico válido.`;
      }

      return {
        success: false,
        error: userFriendlyError,
        statusCode: 400,
      };
    }

    // 3. Ejecución transaccional ACID en SQL Server
    const result = await executeSaleTransaction(parsed.data);

    // 4. Revalidación de rutas afectadas para refrescar datos en tiempo real
    revalidatePath("/ventas");
    revalidatePath("/dashboard");
    revalidatePath("/inventario");
    revalidatePath("/productos");

    return {
      success: true,
      data: result,
      statusCode: 201,
    };
  } catch (err: any) {
    console.error("Error en createSaleTransactional:", err);

    if (err.name === "UnauthorizedError") {
      return {
        success: false,
        error: "Acceso no autorizado: se requiere sesión administrativa para registrar ventas.",
        statusCode: 401,
      };
    }

    if (err.name === "AcademicDatabaseProtectedError") {
      return {
        success: false,
        error: err.message,
        statusCode: 403,
      };
    }

    if (err instanceof SaleTransactionError) {
      return {
        success: false,
        error: err.message,
        statusCode: 400,
      };
    }

    return {
      success: false,
      error: err.message || "Error interno al procesar la transacción de venta.",
      statusCode: 500,
    };
  }
}
