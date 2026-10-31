import { revalidatePath } from "next/cache";
import { requireAdminSession } from "../auth/authorization";
import {
  getClientsList,
  getClientDetail,
  createClient,
  updateClient,
} from "../repositories/client.repository";
import {
  clientSchema,
  clientUpdateSchema,
} from "../validations/entity.schema";
import { ClientListItem, ClientDetail } from "@/types/entities";

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode: number;
}

export async function fetchClients(query?: string): Promise<ClientListItem[]> {
  return getClientsList(query);
}

export async function fetchClientDetail(dni: string): Promise<ClientDetail | null> {
  return getClientDetail(dni);
}

export async function registerClient(rawInput: unknown): Promise<ServiceResult<{ dni: string }>> {
  try {
    await requireAdminSession();

    const parsed = clientSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || "Datos de cliente inválidos.",
        statusCode: 400,
      };
    }

    const res = await createClient(parsed.data);
    revalidatePath("/clientes");
    revalidatePath("/ventas");

    return {
      success: true,
      data: res,
      statusCode: 201,
    };
  } catch (err: any) {
    console.error("Error en registerClient:", err);

    if (err.name === "UnauthorizedError") {
      return { success: false, error: "Sesión administrativa requerida.", statusCode: 401 };
    }
    if (err.name === "AcademicDatabaseProtectedError") {
      return { success: false, error: err.message, statusCode: 403 };
    }
    if (err.name === "DuplicateDniError") {
      return { success: false, error: err.message, statusCode: 409 };
    }

    return {
      success: false,
      error: err.message || "Error al registrar cliente.",
      statusCode: 500,
    };
  }
}

export async function modifyClient(
  dni: string,
  rawInput: unknown
): Promise<ServiceResult<{ dni: string }>> {
  try {
    await requireAdminSession();

    const parsed = clientUpdateSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || "Datos de actualización inválidos.",
        statusCode: 400,
      };
    }

    const res = await updateClient(dni, parsed.data);
    revalidatePath("/clientes");
    revalidatePath("/ventas");

    return {
      success: true,
      data: res,
      statusCode: 200,
    };
  } catch (err: any) {
    console.error("Error en modifyClient:", err);

    if (err.name === "UnauthorizedError") {
      return { success: false, error: "Sesión administrativa requerida.", statusCode: 401 };
    }
    if (err.name === "AcademicDatabaseProtectedError") {
      return { success: false, error: err.message, statusCode: 403 };
    }
    if (err.name === "ClientNotFoundError") {
      return { success: false, error: err.message, statusCode: 404 };
    }

    return {
      success: false,
      error: err.message || "Error al actualizar cliente.",
      statusCode: 500,
    };
  }
}
