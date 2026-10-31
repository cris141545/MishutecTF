"use server";

import {
  executeInventoryExit,
  ServiceResult,
} from "@/lib/services/inventory-mutation.service";
import { MovementResult } from "@/lib/repositories/inventory-mutation.repository";
import { InventoryMovementInput } from "@/lib/validations/inventory-mutation.schema";

export async function recordInventoryExitAction(
  data: InventoryMovementInput
): Promise<ServiceResult<MovementResult>> {
  return executeInventoryExit(data);
}
