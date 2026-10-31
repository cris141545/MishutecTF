import { requireAdminSession } from "@/lib/auth/authorization";
import {
  createProductSchema,
  updateProductSchema,
  CreateProductInput,
  UpdateProductInput,
} from "@/lib/validations/product-mutation.schema";
import {
  createProductTransactional,
  updateProductTransactional,
  discontinueProductLogical,
} from "@/lib/repositories/product-mutation.repository";
import { revalidatePath } from "next/cache";

export interface MutationResult {
  success: boolean;
  message?: string;
  error?: string;
  data?: any;
}

/**
 * Servicio para la creación transaccional de un nuevo producto.
 */
export async function createProductService(
  rawInput: unknown
): Promise<MutationResult> {
  // 1. Autorización administrativa estricta
  await requireAdminSession();

  // 2. Validación de esquema con Zod
  const parseResult = createProductSchema.safeParse(rawInput);
  if (!parseResult.success) {
    const errorMsg = parseResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    return {
      success: false,
      error: `Datos de producto inválidos: ${errorMsg}`,
    };
  }

  try {
    const result = await createProductTransactional(parseResult.data);
    revalidatePath("/productos");
    revalidatePath("/dashboard");
    return {
      success: true,
      message: `Producto '${parseResult.data.nombre}' registrado exitosamente con código ${result.codbarras}.`,
      data: result,
    };
  } catch (error: any) {
    console.error("[Mutation Error] createProductService:", error);
    return {
      success: false,
      error: error.message || "Error al registrar el producto en SQL Server.",
    };
  }
}

/**
 * Servicio para la edición transaccional de un producto existente.
 */
export async function updateProductService(
  rawInput: unknown
): Promise<MutationResult> {
  await requireAdminSession();

  const parseResult = updateProductSchema.safeParse(rawInput);
  if (!parseResult.success) {
    const errorMsg = parseResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    return {
      success: false,
      error: `Datos de edición inválidos: ${errorMsg}`,
    };
  }

  try {
    const result = await updateProductTransactional(parseResult.data);
    revalidatePath("/productos");
    return {
      success: true,
      message: `Producto ${result.codbarras} actualizado exitosamente.`,
      data: result,
    };
  } catch (error: any) {
    console.error("[Mutation Error] updateProductService:", error);
    return {
      success: false,
      error: error.message || "Error al actualizar el producto en SQL Server.",
    };
  }
}

/**
 * Servicio para la descontinuación (baja lógica) de un producto.
 */
export async function discontinueProductService(
  codbarras: string
): Promise<MutationResult> {
  await requireAdminSession();

  const cleanBarcode = codbarras ? codbarras.trim() : "";
  if (!cleanBarcode) {
    return {
      success: false,
      error: "Código de barras no proporcionado.",
    };
  }

  try {
    const result = await discontinueProductLogical(cleanBarcode);
    revalidatePath("/productos");
    revalidatePath("/dashboard");
    return {
      success: true,
      message: `El producto con código ${cleanBarcode} ha sido marcado como '${result.estadoNombre}'. Se preserva su historial comercial.`,
      data: result,
    };
  } catch (error: any) {
    console.error("[Mutation Error] discontinueProductService:", error);
    return {
      success: false,
      error: error.message || "Error al descontinuar el producto.",
    };
  }
}
