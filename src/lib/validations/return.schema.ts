import { z } from "zod";

export const createReturnItemSchema = z.object({
  idDetalle: z.number().int().positive("El identificador del detalle de venta debe ser positivo"),
  cantidadDev: z
    .number()
    .int("La cantidad a devolver debe ser un número entero")
    .positive("La cantidad a devolver debe ser estrictamente mayor a 0"),
  idMotivo: z.number().int().positive("Debe seleccionar un motivo de devolución válido"),
});

export const createReturnSchema = z.object({
  idVenta: z.number().int().positive("Debe seleccionar una venta válida"),
  idEmpleado: z.number().int().positive("Debe especificar el empleado responsable"),
  items: z
    .array(createReturnItemSchema)
    .min(1, "Debe seleccionar al menos un producto para registrar la devolución"),
});

export const approveReturnSchema = z.object({
  idDevolucion: z.number().int().positive("El identificador de la devolución debe ser positivo"),
  idEmpleado: z.number().int().positive().optional(),
  reingresoStock: z.boolean().optional(),
  observaciones: z.string().max(250).optional(),
  idMetodoReembolso: z.number().int().positive().optional(),
  referenciaReembolso: z.string().max(100).optional(),
  emitirNotaCredito: z.boolean().optional(),
  motivoNotaCredito: z.string().max(200).optional(),
  idSesionCaja: z.number().int().positive().optional(),
});

export const rejectReturnSchema = z.object({
  idDevolucion: z.number().int().positive("El identificador de la devolución debe ser positivo"),
  idEmpleado: z.number().int().positive().optional(),
  motivoRechazo: z.string().max(250).optional(),
});

export type CreateReturnInputSchema = z.infer<typeof createReturnSchema>;
export type CreateReturnItemInputSchema = z.infer<typeof createReturnItemSchema>;
export type ApproveReturnInputSchema = z.infer<typeof approveReturnSchema>;
export type RejectReturnInputSchema = z.infer<typeof rejectReturnSchema>;
