"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "../auth/authorization";
import {
  fetchAccountsPayable,
  fetchAccountPayableById,
  recordAccountPayable,
  recordSupplierPayment,
  fetchEmployeeObligations,
  fetchEmployeeObligationById,
  recordEmployeeObligation,
  recordEmployeePayment,
} from "../services/expense.service";
import {
  CuentaPagarProveedor,
  CreateAccountPayableDto,
  RegisterSupplierPaymentDto,
  ObligacionPersonalItem,
  CreateEmployeeObligationDto,
  RegisterEmployeeObligationPaymentDto,
  PagoPersonalDetalleItem,
} from "@/types/expenses";

export interface ExpenseActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// 1. Cuentas por Pagar (Proveedores)
export async function getAccountsPayableAction(filters?: {
  idProveedor?: number;
  estado?: string;
  search?: string;
}): Promise<ExpenseActionResult<CuentaPagarProveedor[]>> {
  try {
    await requireAdminSession();
    const list = await fetchAccountsPayable(filters);
    return { success: true, data: list };
  } catch (err: any) {
    return { success: false, error: err.message || "Error al obtener cuentas por pagar." };
  }
}

export async function createAccountPayableAction(
  data: CreateAccountPayableDto
): Promise<ExpenseActionResult<CuentaPagarProveedor>> {
  try {
    await requireAdminSession();
    const created = await recordAccountPayable(data);
    revalidatePath("/proveedores");
    revalidatePath("/caja");
    revalidatePath("/inventario");
    revalidatePath("/productos");
    revalidatePath("/dashboard");
    revalidatePath("/reportes");
    return { success: true, data: created };
  } catch (err: any) {
    return { success: false, error: err.message || "Error al registrar la compra o cuenta por pagar." };
  }
}

export async function registerSupplierPaymentAction(
  data: RegisterSupplierPaymentDto
): Promise<ExpenseActionResult<CuentaPagarProveedor>> {
  try {
    await requireAdminSession();
    const updated = await recordSupplierPayment(data);
    revalidatePath("/proveedores");
    revalidatePath("/caja");
    revalidatePath("/reportes");
    revalidatePath("/dashboard");
    return { success: true, data: updated };
  } catch (err: any) {
    return { success: false, error: err.message || "Error al registrar abono al proveedor." };
  }
}

// 2. Obligaciones y Pagos al Personal
export async function getEmployeeObligationsAction(filters?: {
  idEmpleado?: number;
  periodo?: string;
  estado?: string;
}): Promise<ExpenseActionResult<ObligacionPersonalItem[]>> {
  try {
    await requireAdminSession();
    const list = await fetchEmployeeObligations(filters);
    return { success: true, data: list };
  } catch (err: any) {
    return { success: false, error: err.message || "Error al obtener obligaciones laborales." };
  }
}

export async function createEmployeeObligationAction(
  data: CreateEmployeeObligationDto
): Promise<ExpenseActionResult<ObligacionPersonalItem>> {
  try {
    await requireAdminSession();
    const created = await recordEmployeeObligation(data);
    revalidatePath("/empleados");
    revalidatePath("/caja");
    revalidatePath("/reportes");
    return { success: true, data: created };
  } catch (err: any) {
    return { success: false, error: err.message || "Error al registrar obligación laboral." };
  }
}

export async function registerEmployeePaymentAction(
  data: RegisterEmployeeObligationPaymentDto
): Promise<ExpenseActionResult<PagoPersonalDetalleItem>> {
  try {
    await requireAdminSession();
    const pago = await recordEmployeePayment(data);
    revalidatePath("/empleados");
    revalidatePath("/caja");
    revalidatePath("/reportes");
    revalidatePath("/dashboard");
    return { success: true, data: pago };
  } catch (err: any) {
    return { success: false, error: err.message || "Error al procesar el pago al personal." };
  }
}
