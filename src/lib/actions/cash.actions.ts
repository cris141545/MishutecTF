"use server";

import { revalidatePath } from "next/cache";
import {
  openCashSession,
  addCashMovement,
  closeCashSession,
  reopenCashSession,
  registerEmployeePayment,
  getCashDashboardData,
} from "../services/cash.service";
import {
  OpenCashInput,
  AddCashMovementInput,
  CloseCashInput,
  ReopenCashInput,
  EmployeePaymentInput,
  EmployeePayment,
  CashSession,
  CashMovement,
  CashClosingSummary,
} from "@/types/cash-register";
import { requireAdminSession } from "../auth/authorization";

export interface CashActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export async function openCashAction(input: OpenCashInput): Promise<CashActionResult<CashSession>> {
  try {
    await requireAdminSession();
    const session = await openCashSession(input);
    revalidatePath("/caja");
    revalidatePath("/dashboard");
    revalidatePath("/ventas");
    return { success: true, data: session };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Error al abrir la sesión de caja.",
      code: err.code || "OPEN_CASH_ERROR",
    };
  }
}

export async function addCashMovementAction(input: AddCashMovementInput): Promise<CashActionResult<CashMovement>> {
  try {
    await requireAdminSession();
    const movement = await addCashMovement(input);
    revalidatePath("/caja");
    revalidatePath("/dashboard");
    return { success: true, data: movement };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Error al registrar el movimiento de caja.",
      code: err.code || "ADD_MOVEMENT_ERROR",
    };
  }
}

export async function closeCashAction(input: CloseCashInput): Promise<CashActionResult<CashClosingSummary>> {
  try {
    await requireAdminSession();
    const summary = await closeCashSession(input);
    revalidatePath("/caja");
    revalidatePath("/dashboard");
    revalidatePath("/ventas");
    revalidatePath("/reportes");
    return { success: true, data: summary };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Error al procesar el cierre de caja y arqueo.",
      code: err.code || "CLOSE_CASH_ERROR",
    };
  }
}

export async function reopenCashAction(input: ReopenCashInput): Promise<CashActionResult<CashSession>> {
  try {
    await requireAdminSession();
    const session = await reopenCashSession(input);
    revalidatePath("/caja");
    revalidatePath("/dashboard");
    revalidatePath("/ventas");
    return { success: true, data: session };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Error al solicitar la reapertura de caja.",
      code: err.code || "REOPEN_CASH_ERROR",
    };
  }
}

export async function registerEmployeePaymentAction(
  input: EmployeePaymentInput
): Promise<CashActionResult<EmployeePayment>> {
  try {
    await requireAdminSession();
    const payment = await registerEmployeePayment(input);
    revalidatePath("/caja");
    revalidatePath("/dashboard");
    return { success: true, data: payment };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Error al registrar el pago al personal.",
      code: err.code || "PAYMENT_EMPLOYEE_ERROR",
    };
  }
}
