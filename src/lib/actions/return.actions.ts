"use server";

import {
  fetchReturnDetail,
  fetchSaleForReturn,
  fetchSaleCandidates,
  fetchReturnReceipt,
  registerReturnTransactional,
  approveReturnTransactional,
  rejectReturnTransactional,
  ServiceResult,
} from "@/lib/services/return.service";
import { getSession } from "@/lib/auth/session";
import {
  ReturnDetail,
  SaleForReturnSearch,
  TransactionalReturnResult,
  ReturnReceiptData,
} from "@/types/returns";
import { SaleCandidate } from "@/lib/repositories/return-transaction.repository";
import { maskCustomerContact } from "@/lib/formatters";

/**
 * Server Action para consultar la ficha técnica y trazabilidad de una devolución.
 * Protege datos personales si no hay sesión autenticada (Ley 29733).
 */
export async function getReturnDetailAction(
  idDevolucion: number
): Promise<ServiceResult<ReturnDetail>> {
  try {
    const detail = await fetchReturnDetail(idDevolucion);

    if (!detail) {
      return {
        success: false,
        error: "La devolución solicitada no existe o no pudo ser recuperada.",
        statusCode: 404,
      };
    }

    const session = await getSession();

    if (!session) {
      // Enmascaramiento de datos personales (Ley 29733) en modo público
      const maskedDetail: ReturnDetail = maskCustomerContact(detail);

      return {
        success: true,
        data: maskedDetail,
        statusCode: 200,
      };
    }

    return {
      success: true,
      data: detail,
      statusCode: 200,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Error interno al consultar la devolución.",
      statusCode: 500,
    };
  }
}

/**
 * Server Action para buscar una venta por número de comprobante o ID
 * y calcular sus saldos disponibles para devolución (Fase 7B).
 */
export async function searchSaleForReturnAction(
  identifier: string | number
): Promise<ServiceResult<SaleForReturnSearch>> {
  return fetchSaleForReturn(identifier);
}

/**
 * Server Action para buscar ventas candidatas por texto libre (comprobante, DNI, nombre, fecha).
 */
export async function searchSaleCandidatesAction(
  query: string
): Promise<ServiceResult<SaleCandidate[]>> {
  return fetchSaleCandidates(query);
}

/**
 * Server Action para registrar transaccionalmente una nueva devolución (Fase 7B).
 */
export async function createReturnAction(
  rawInput: unknown
): Promise<ServiceResult<TransactionalReturnResult>> {
  return registerReturnTransactional(rawInput);
}

/**
 * Server Action para aprobar una devolución transaccionalmente (Fase 7B).
 */
export async function approveReturnAction(
  rawInput: unknown
): Promise<ServiceResult<TransactionalReturnResult>> {
  return approveReturnTransactional(rawInput);
}

/**
 * Server Action para rechazar una devolución transaccionalmente (Fase 7B).
 */
export async function rejectReturnAction(
  rawInput: unknown
): Promise<ServiceResult<TransactionalReturnResult>> {
  return rejectReturnTransactional(rawInput);
}

/**
 * Server Action para consultar la Constancia Comercial de Devolución formateada.
 */
export async function getReturnReceiptAction(
  idDevolucion: number
): Promise<ServiceResult<ReturnReceiptData>> {
  return fetchReturnReceipt(idDevolucion);
}
