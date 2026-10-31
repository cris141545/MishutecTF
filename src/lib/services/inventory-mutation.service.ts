import { revalidatePath } from "next/cache";
import { requireAdminSession } from "../auth/authorization";
import {
  inventoryMovementInputSchema,
} from "../validations/inventory-mutation.schema";
import {
  recordInventoryExitTransactional,
  MovementResult,
} from "../repositories/inventory-mutation.repository";

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode: number;
}

/**
 * Conservado para compatibilidad con pruebas antiguas: el stock solo puede aumentar mediante compras.
 */
export async function executeInventoryEntry(
  rawInput: unknown
): Promise<ServiceResult<MovementResult>> {
  void rawInput;
  return {
    success: false,
    error: "El inventario solo puede aumentar al registrar una compra a proveedor.",
    statusCode: 409,
  };
}

/**
 * Servicio para registrar una salida física de inventario.
 */
export async function executeInventoryExit(
  rawInput: unknown
): Promise<ServiceResult<MovementResult>> {
  try {
    // 1. Requerir sesión administrativa activa
    await requireAdminSession();

    // 2. Validar con Zod
    const parsed = inventoryMovementInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Datos de salida inválidos";
      return {
        success: false,
        error: firstError,
        statusCode: 400,
      };
    }

    // 3. Ejecutar transacción
    const result = await recordInventoryExitTransactional(parsed.data);

    // 4. Revalidar rutas afectadas
    revalidatePath("/inventario");
    revalidatePath("/productos");
    revalidatePath("/dashboard");

    return {
      success: true,
      data: result,
      statusCode: 201,
    };
  } catch (err: unknown) {
    console.error("Error en executeInventoryExit:", err);
    const error = err instanceof Error ? err : new Error(String(err));

    if (error.name === "UnauthorizedError") {
      return {
        success: false,
        error: "Sesión administrativa requerida para registrar salidas de inventario.",
        statusCode: 401,
      };
    }

    if (error.name === "AcademicDatabaseProtectedError") {
      return {
        success: false,
        error: error.message,
        statusCode: 403,
      };
    }

    if (error.name === "InsufficientStockError") {
      return {
        success: false,
        error: error.message,
        statusCode: 400,
      };
    }

    if (error.name === "DiscontinuedProductOperationError") {
      return {
        success: false,
        error: error.message,
        statusCode: 422,
      };
    }

    if (error.name === "ProductNotFoundError" || error.name === "EmployeeNotFoundError") {
      return {
        success: false,
        error: error.message,
        statusCode: 404,
      };
    }

    return {
      success: false,
      error: error.message || "Error interno al registrar la salida de inventario.",
      statusCode: 500,
    };
  }
}
