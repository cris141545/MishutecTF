import {
  getAccountsPayable,
  getAccountPayableById,
  createAccountPayable,
  registerSupplierPayment,
} from "../repositories/supplier-payable.repository";
import {
  getEmployeeObligations,
  getEmployeeObligationById,
  createEmployeeObligation,
  registerEmployeePayment,
} from "../repositories/employee-obligation.repository";
import {
  CuentaPagarProveedor,
  CreateAccountPayableDto,
  RegisterSupplierPaymentDto,
  ObligacionPersonalItem,
  CreateEmployeeObligationDto,
  RegisterEmployeeObligationPaymentDto,
  PagoPersonalDetalleItem,
} from "@/types/expenses";

// --- SERVICIOS DE CUENTAS POR PAGAR (PROVEEDORES) ---

export async function fetchAccountsPayable(filters?: {
  idProveedor?: number;
  estado?: string;
  search?: string;
}): Promise<CuentaPagarProveedor[]> {
  return await getAccountsPayable(filters);
}

export async function fetchAccountPayableById(
  id: number
): Promise<CuentaPagarProveedor | null> {
  return await getAccountPayableById(id);
}

export async function recordAccountPayable(
  data: CreateAccountPayableDto
): Promise<CuentaPagarProveedor> {
  return await createAccountPayable(data);
}

export async function recordSupplierPayment(
  data: RegisterSupplierPaymentDto
): Promise<CuentaPagarProveedor> {
  return await registerSupplierPayment(data);
}

// --- SERVICIOS DE OBLIGACIONES Y PAGOS AL PERSONAL ---

export async function fetchEmployeeObligations(filters?: {
  idEmpleado?: number;
  periodo?: string;
  estado?: string;
}): Promise<ObligacionPersonalItem[]> {
  return await getEmployeeObligations(filters);
}

export async function fetchEmployeeObligationById(
  id: number
): Promise<ObligacionPersonalItem | null> {
  return await getEmployeeObligationById(id);
}

export async function recordEmployeeObligation(
  data: CreateEmployeeObligationDto
): Promise<ObligacionPersonalItem> {
  return await createEmployeeObligation(data);
}

export async function recordEmployeePayment(
  data: RegisterEmployeeObligationPaymentDto
): Promise<PagoPersonalDetalleItem> {
  return await registerEmployeePayment(data);
}
