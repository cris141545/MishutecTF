import { revalidatePath } from "next/cache";
import { requireAdminSession } from "../auth/authorization";
import {
  getEmployeesList,
  getEmployeeDetail,
  createEmployee,
  updateEmployee,
} from "../repositories/employee.repository";
import {
  employeeSchema,
  employeeUpdateSchema,
} from "../validations/entity.schema";
import { EmployeeListItem, EmployeeDetail } from "@/types/entities";

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode: number;
}

export async function fetchEmployees(query?: string): Promise<EmployeeListItem[]> {
  return getEmployeesList(query);
}

export async function fetchEmployeeDetail(id: number): Promise<EmployeeDetail | null> {
  return getEmployeeDetail(id);
}

export async function registerEmployee(
  rawInput: unknown
): Promise<ServiceResult<{ idEmpleado: number }>> {
  try {
    await requireAdminSession();

    const parsed = employeeSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || "Datos de empleado inválidos.",
        statusCode: 400,
      };
    }

    const res = await createEmployee(parsed.data);
    revalidatePath("/empleados");
    revalidatePath("/inventario");

    return {
      success: true,
      data: res,
      statusCode: 201,
    };
  } catch (err: any) {
    console.error("Error en registerEmployee:", err);

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
      error: err.message || "Error al registrar empleado.",
      statusCode: 500,
    };
  }
}

export async function modifyEmployee(
  id: number,
  rawInput: unknown
): Promise<ServiceResult<{ idEmpleado: number }>> {
  try {
    await requireAdminSession();

    const parsed = employeeUpdateSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || "Datos de actualización inválidos.",
        statusCode: 400,
      };
    }

    const res = await updateEmployee(id, parsed.data);
    revalidatePath("/empleados");
    revalidatePath("/inventario");

    return {
      success: true,
      data: res,
      statusCode: 200,
    };
  } catch (err: any) {
    console.error("Error en modifyEmployee:", err);

    if (err.name === "UnauthorizedError") {
      return { success: false, error: "Sesión administrativa requerida.", statusCode: 401 };
    }
    if (err.name === "AcademicDatabaseProtectedError") {
      return { success: false, error: err.message, statusCode: 403 };
    }
    if (err.name === "EmployeeNotFoundError") {
      return { success: false, error: err.message, statusCode: 404 };
    }

    return {
      success: false,
      error: err.message || "Error al actualizar empleado.",
      statusCode: 500,
    };
  }
}
