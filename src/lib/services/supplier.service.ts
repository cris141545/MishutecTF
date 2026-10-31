import { revalidatePath } from "next/cache";
import { requireAdminSession } from "../auth/authorization";
import {
  getSuppliersList,
  getSupplierDetail,
  createSupplier,
  updateSupplier,
  addOrUpdateSuppliedProduct,
  removeSuppliedProduct,
  getAvailableProductsForLinking,
} from "../repositories/supplier.repository";
import {
  supplierSchema,
  supplierProductAssociationSchema,
} from "../validations/entity.schema";
import { SupplierListItem, SupplierDetail } from "@/types/entities";

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode: number;
}

export async function fetchSuppliers(query?: string): Promise<SupplierListItem[]> {
  return getSuppliersList(query);
}

export async function fetchSupplierDetail(id: number): Promise<SupplierDetail | null> {
  return getSupplierDetail(id);
}

export async function registerSupplier(
  rawInput: unknown
): Promise<ServiceResult<{ idProveedor: number }>> {
  try {
    await requireAdminSession();

    const parsed = supplierSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || "Datos de proveedor inválidos.",
        statusCode: 400,
      };
    }

    const res = await createSupplier(parsed.data);
    revalidatePath("/proveedores");
    revalidatePath("/productos");

    return {
      success: true,
      data: res,
      statusCode: 201,
    };
  } catch (err: any) {
    console.error("Error en registerSupplier:", err);

    if (err.name === "UnauthorizedError") {
      return { success: false, error: "Sesión administrativa requerida.", statusCode: 401 };
    }
    if (err.name === "AcademicDatabaseProtectedError") {
      return { success: false, error: err.message, statusCode: 403 };
    }

    return {
      success: false,
      error: err.message || "Error al registrar proveedor.",
      statusCode: 500,
    };
  }
}

export async function modifySupplier(
  id: number,
  rawInput: unknown
): Promise<ServiceResult<{ idProveedor: number }>> {
  try {
    await requireAdminSession();

    const parsed = supplierSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || "Datos de actualización inválidos.",
        statusCode: 400,
      };
    }

    const res = await updateSupplier(id, parsed.data);
    revalidatePath("/proveedores");
    revalidatePath("/productos");

    return {
      success: true,
      data: res,
      statusCode: 200,
    };
  } catch (err: any) {
    console.error("Error en modifySupplier:", err);

    if (err.name === "UnauthorizedError") {
      return { success: false, error: "Sesión administrativa requerida.", statusCode: 401 };
    }
    if (err.name === "AcademicDatabaseProtectedError") {
      return { success: false, error: err.message, statusCode: 403 };
    }
    if (err.name === "SupplierNotFoundError") {
      return { success: false, error: err.message, statusCode: 404 };
    }

    return {
      success: false,
      error: err.message || "Error al actualizar proveedor.",
      statusCode: 500,
    };
  }
}

export async function linkProductToSupplier(
  rawInput: unknown
): Promise<ServiceResult<{ success: boolean }>> {
  try {
    await requireAdminSession();

    const parsed = supplierProductAssociationSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || "Datos de asociación inválidos.",
        statusCode: 400,
      };
    }

    const res = await addOrUpdateSuppliedProduct(parsed.data);
    revalidatePath("/proveedores");
    revalidatePath("/productos");

    return {
      success: true,
      data: res,
      statusCode: 200,
    };
  } catch (err: any) {
    console.error("Error en linkProductToSupplier:", err);

    if (err.name === "UnauthorizedError") {
      return { success: false, error: "Sesión administrativa requerida.", statusCode: 401 };
    }
    if (err.name === "AcademicDatabaseProtectedError") {
      return { success: false, error: err.message, statusCode: 403 };
    }

    return {
      success: false,
      error: err.message || "Error al asociar producto con proveedor.",
      statusCode: 500,
    };
  }
}

export async function unlinkProductFromSupplier(
  idProveedor: number,
  codbarras: string
): Promise<ServiceResult<{ success: boolean }>> {
  try {
    await requireAdminSession();

    const res = await removeSuppliedProduct(idProveedor, codbarras);
    revalidatePath("/proveedores");
    revalidatePath("/productos");

    return {
      success: true,
      data: res,
      statusCode: 200,
    };
  } catch (err: any) {
    console.error("Error en unlinkProductFromSupplier:", err);

    if (err.name === "UnauthorizedError") {
      return { success: false, error: "Sesión administrativa requerida.", statusCode: 401 };
    }
    if (err.name === "AcademicDatabaseProtectedError") {
      return { success: false, error: err.message, statusCode: 403 };
    }

    return {
      success: false,
      error: err.message || "Error al desvincular producto.",
      statusCode: 500,
    };
  }
}

export async function fetchAvailableProductsForLinking(): Promise<
  { codbarras: string; nombre: string; precio: number }[]
> {
  return getAvailableProductsForLinking();
}
