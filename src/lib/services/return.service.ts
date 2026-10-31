import { revalidatePath } from "next/cache";
import { requireAdminSession } from "../auth/authorization";
import {
  getReturnsList,
  getReturnKpiMetrics,
  getReturnFilterMetadata,
  getReturnById,
  getReturnReceiptData,
} from "../repositories/return.repository";
import {
  getSaleWithAvailableBalances,
  searchSaleCandidates,
  SaleCandidate,
  createReturnTransaction,
  approveReturnTransaction,
  rejectReturnTransaction,
  ReturnTransactionError,
} from "../repositories/return-transaction.repository";
import {
  createReturnSchema,
  approveReturnSchema,
  rejectReturnSchema,
} from "../validations/return.schema";
import {
  ReturnsPageData,
  ReturnDetail,
  SaleForReturnSearch,
  TransactionalReturnResult,
  ReturnReceiptData,
} from "@/types/returns";

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode: number;
}

/**
 * Servicio para consultar el listado y métricas del módulo de devoluciones (Fase 7A/7B).
 * Exclusivamente operaciones de lectura.
 */
export async function fetchReturnsPageData(): Promise<ReturnsPageData> {
  try {
    const [returns, kpis, metadata] = await Promise.all([
      getReturnsList(),
      getReturnKpiMetrics(),
      getReturnFilterMetadata(),
    ]);

    return {
      returns,
      kpis,
      metadata,
    };
  } catch (error: any) {
    console.error("Error en fetchReturnsPageData:", error);
    throw new Error(`Error al recuperar datos de devoluciones: ${error.message}`);
  }
}

/**
 * Servicio para consultar el detalle y trazabilidad de una devolución específica.
 */
export async function fetchReturnDetail(idDevolucion: number): Promise<ReturnDetail | null> {
  try {
    if (!idDevolucion || idDevolucion <= 0) {
      return null;
    }
    return await getReturnById(idDevolucion);
  } catch (error: any) {
    console.error(`Error en fetchReturnDetail (#${idDevolucion}):`, error);
    throw new Error(`Error al recuperar detalle de devolución: ${error.message}`);
  }
}

/**
 * Servicio para buscar una venta por comprobante o ID y obtener los saldos
 * disponibles para devolución aplicando la política de reservas (Fase 7B).
 */
export async function fetchSaleForReturn(
  identifier: string | number
): Promise<ServiceResult<SaleForReturnSearch>> {
  try {
    await requireAdminSession();

    if (!identifier || String(identifier).trim().length === 0) {
      return {
        success: false,
        error: "Debe ingresar un número de comprobante o ID de venta válido.",
        statusCode: 400,
      };
    }

    const sale = await getSaleWithAvailableBalances(identifier);
    if (!sale) {
      return {
        success: false,
        error: `No se encontró ninguna venta registrada con el comprobante '${identifier}'.`,
        statusCode: 404,
      };
    }

    return {
      success: true,
      data: sale,
      statusCode: 200,
    };
  } catch (error: any) {
    console.error("Error en fetchSaleForReturn:", error);
    return {
      success: false,
      error: error.message || "Error al buscar comprobante de venta.",
      statusCode: error.name === "UnauthorizedError" ? 401 : 500,
    };
  }
}

/**
 * Servicio transaccional para registrar una nueva devolución en estado Pendiente.
 */
export async function registerReturnTransactional(
  rawInput: unknown
): Promise<ServiceResult<TransactionalReturnResult>> {
  try {
    // 1. Autorización administrativa estricta en servidor
    await requireAdminSession();

    // 2. Validación de esquema con Zod
    const parsed = createReturnSchema.safeParse(rawInput);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => i.message).join(". ");
      return {
        success: false,
        error: `Validación fallida: ${errorMsg}`,
        statusCode: 400,
      };
    }

    // 3. Ejecución transaccional atómica
    const result = await createReturnTransaction(parsed.data, parsed.data.idEmpleado);

    // 4. Revalidar la vista de devoluciones
    revalidatePath("/devoluciones");

    return {
      success: true,
      data: result,
      statusCode: 201,
    };
  } catch (error: any) {
    console.error("Error en registerReturnTransactional:", error);

    let statusCode = 500;
    if (error.name === "UnauthorizedError") statusCode = 401;
    else if (error instanceof ReturnTransactionError) {
      if (error.code === "SALE_NOT_FOUND" || error.code === "RETURN_LINE_NOT_FOUND") statusCode = 404;
      else if (error.code === "RETURN_QUANTITY_EXCEEDS_AVAILABLE" || error.code === "INVALID_RETURN_QUANTITY") statusCode = 400;
      else statusCode = 422;
    }

    return {
      success: false,
      error: error.message || "Error al registrar la devolución transaccional.",
      statusCode,
    };
  }
}

/**
 * Servicio transaccional para aprobar una devolución (Pendiente -> Aprobada).
 */
export async function approveReturnTransactional(
  rawInput: unknown
): Promise<ServiceResult<TransactionalReturnResult>> {
  try {
    await requireAdminSession();

    const parsed = approveReturnSchema.safeParse(rawInput);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => i.message).join(". ");
      return {
        success: false,
        error: `Validación fallida: ${errorMsg}`,
        statusCode: 400,
      };
    }

    const result = await approveReturnTransaction(parsed.data, parsed.data.idEmpleado || 1);

    revalidatePath("/devoluciones");
    revalidatePath("/caja");
    revalidatePath("/reportes");
    if (result.reingresoKardexRealizado) {
      revalidatePath("/inventario");
      revalidatePath("/dashboard");
    }

    return {
      success: true,
      data: result,
      statusCode: 200,
    };
  } catch (error: any) {
    console.error("Error en approveReturnTransactional:", error);

    let statusCode = 500;
    if (error.name === "UnauthorizedError") statusCode = 401;
    else if (error instanceof ReturnTransactionError) {
      if (error.code === "RETURN_NOT_FOUND") statusCode = 404;
      else if (error.code === "INVALID_STATE_TRANSITION" || error.code === "RESTOCK_NOT_ALLOWED" || error.code === "PRODUCT_DISCONTINUED_RESTOCK") statusCode = 409;
      else statusCode = 400;
    }

    return {
      success: false,
      error: error.message || "Error al aprobar la devolución.",
      statusCode,
    };
  }
}

/**
 * Servicio transaccional para rechazar una devolución (Pendiente -> Rechazada).
 */
export async function rejectReturnTransactional(
  rawInput: unknown
): Promise<ServiceResult<TransactionalReturnResult>> {
  try {
    await requireAdminSession();

    const parsed = rejectReturnSchema.safeParse(rawInput);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues.map((i) => i.message).join(". ");
      return {
        success: false,
        error: `Validación fallida: ${errorMsg}`,
        statusCode: 400,
      };
    }

    const result = await rejectReturnTransaction(parsed.data, parsed.data.idEmpleado || 1);

    revalidatePath("/devoluciones");

    return {
      success: true,
      data: result,
      statusCode: 200,
    };
  } catch (error: any) {
    console.error("Error en rejectReturnTransactional:", error);

    let statusCode = 500;
    if (error.name === "UnauthorizedError") statusCode = 401;
    else if (error instanceof ReturnTransactionError) {
      if (error.code === "RETURN_NOT_FOUND") statusCode = 404;
      else if (error.code === "INVALID_STATE_TRANSITION") statusCode = 409;
      else statusCode = 400;
    }

    return {
      success: false,
      error: error.message || "Error al rechazar la devolución.",
      statusCode,
    };
  }
}

/**
 * Servicio para buscar ventas candidatas (por comprobante, DNI, cliente o fecha).
 */
export async function fetchSaleCandidates(
  query: string
): Promise<ServiceResult<SaleCandidate[]>> {
  try {
    await requireAdminSession();
    if (!query || query.trim().length < 2) {
      return {
        success: true,
        data: [],
        statusCode: 200,
      };
    }
    const candidates = await searchSaleCandidates(query);
    return {
      success: true,
      data: candidates,
      statusCode: 200,
    };
  } catch (error: any) {
    console.error("Error en fetchSaleCandidates:", error);
    return {
      success: false,
      error: error.message || "Error al buscar candidatos de venta.",
      statusCode: 500,
    };
  }
}

/**
 * Servicio para obtener los datos de la Constancia Comercial de Devolución.
 */
export async function fetchReturnReceipt(
  idDevolucion: number
): Promise<ServiceResult<ReturnReceiptData>> {
  try {
    await requireAdminSession();
    const receipt = await getReturnReceiptData(idDevolucion);
    if (!receipt) {
      return {
        success: false,
        error: `No se encontró la devolución con ID #${idDevolucion}.`,
        statusCode: 404,
      };
    }
    return {
      success: true,
      data: receipt,
      statusCode: 200,
    };
  } catch (error: any) {
    console.error("Error en fetchReturnReceipt:", error);
    return {
      success: false,
      error: error.message || "Error al recuperar la constancia de devolución.",
      statusCode: 500,
    };
  }
}
