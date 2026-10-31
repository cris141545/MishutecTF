import { z } from "zod";

export const openCashSchema = z.object({
  idEmpleado: z.number().int().positive("Debe seleccionar un empleado responsable válido"),
  montoInicial: z.number().min(0, "El monto inicial en efectivo no puede ser negativo"),
  observaciones: z.string().max(255).optional(),
});

export const addCashMovementSchema = z.object({
  idSesion: z.number().int().positive("ID de sesión inválido"),
  tipo: z.enum(["INGRESO", "EGRESO"], { message: "El tipo debe ser INGRESO o EGRESO" }),
  categoria: z.enum(
    [
      "VENTA",
      "INGRESO_MANUAL",
      "GASTO_OPERATIVO",
      "PAGO_PERSONAL",
      "RETIRO",
      "REEMBOLSO_DEVOLUCION",
      "AJUSTE",
    ],
    { message: "Categoría de movimiento no válida" }
  ),
  monto: z.number().positive("El importe debe ser estrictamente mayor a 0"),
  idMetodo: z.number().int().positive("Método de pago inválido"),
  concepto: z.string().min(3, "El concepto debe tener al menos 3 caracteres").max(255),
  idEmpleado: z.number().int().positive("Empleado responsable inválido"),
  idVenta: z.number().int().positive().optional(),
  idDevolucion: z.number().int().positive().optional(),
});

export const closeCashSchema = z.object({
  idSesion: z.number().int().positive("ID de sesión inválido"),
  idEmpleadoCierre: z.number().int().positive("Empleado responsable de cierre inválido"),
  efectivoContado: z.number().min(0, "El efectivo contado físicamente no puede ser negativo"),
  observacionesCierre: z.string().max(255).optional(),
});

export const reopenCashSchema = z.object({
  idSesion: z.number().int().positive("ID de sesión inválido"),
  idEmpleadoReapertura: z.number().int().positive("Empleado autorizador inválido"),
  motivoReapertura: z.string().min(5, "Debe especificar un motivo detallado de reapertura (mínimo 5 caracteres)").max(255),
});

export const employeePaymentSchema = z.object({
  idSesion: z.number().int().positive("ID de sesión inválido"),
  idEmpleado: z.number().int().positive("Debe seleccionar un empleado beneficiario"),
  periodo: z.string().min(3, "El período debe tener al menos 3 caracteres").max(40),
  concepto: z.string().min(3, "El concepto debe tener al menos 3 caracteres").max(100),
  monto: z.number().positive("El importe a pagar debe ser mayor a 0"),
  idMetodo: z.number().int().positive("Método de pago inválido"),
  idEmpleadoResponsable: z.number().int().positive("Empleado responsable inválido"),
  observaciones: z.string().max(255).optional(),
});

export type OpenCashSchemaInput = z.infer<typeof openCashSchema>;
export type AddCashMovementSchemaInput = z.infer<typeof addCashMovementSchema>;
export type CloseCashSchemaInput = z.infer<typeof closeCashSchema>;
export type ReopenCashSchemaInput = z.infer<typeof reopenCashSchema>;
export type EmployeePaymentSchemaInput = z.infer<typeof employeePaymentSchema>;
