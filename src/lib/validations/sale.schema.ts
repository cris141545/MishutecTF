import { z } from "zod";

/**
 * Preprocesador para números enteros positivos limpios.
 * Acepta number o string representativo de entero, rechazando decimales, negativos o texto no numérico.
 */
const parseCleanInt = (val: unknown) => {
  if (typeof val === "string" && val.trim() !== "") {
    const n = Number(val);
    return Number.isInteger(n) ? n : val;
  }
  return val;
};

/**
 * Preprocesador para importes monetarios limpios.
 * Acepta number o string representativo de número, rechazando NaN, Infinity o texto no numérico.
 */
const parseCleanAmount = (val: unknown) => {
  if (typeof val === "string" && val.trim() !== "") {
    const n = Number(val);
    return !isNaN(n) && isFinite(n) ? n : val;
  }
  return val;
};

/**
 * Esquema de validación para un ítem del carrito de venta.
 * codbarras se mantiene estrictamente como STRING de 13 dígitos para preservar ceros a la izquierda.
 */
export const cartItemInputSchema = z.object({
  codbarras: z
    .string({ message: "El código de barras es obligatorio." })
    .length(13, "El código de barras debe tener exactamente 13 dígitos.")
    .regex(/^\d{13}$/, "El código de barras solo debe contener dígitos numéricos."),
  cantidad: z.preprocess(
    parseCleanInt,
    z
      .number({ message: "La cantidad debe ser un número entero válido." })
      .int("La cantidad no puede contener decimales.")
      .positive("La cantidad a vender debe ser mayor a 0.")
      .max(999, "La cantidad máxima por línea es 999 unidades.")
  ),
});

/**
 * Esquema de validación para una asignación de medio de pago.
 */
export const paymentInputSchema = z.object({
  idMetodo: z.preprocess(
    parseCleanInt,
    z
      .number({ message: "El método de pago debe ser un identificador numérico." })
      .int("El identificador del método de pago debe ser entero.")
      .positive("Debe seleccionar un método de pago válido.")
  ),
  monto: z.preprocess(
    parseCleanAmount,
    z
      .number({ message: "El monto pagado debe ser un número válido." })
      .positive("El monto pagado debe ser estrictamente mayor a S/. 0.00.")
      .refine(
        (val) => Math.round(val * 100) === val * 100,
        { message: "El monto no puede tener más de dos decimales." }
      )
  ),
});

/**
 * Esquema de validación completo para el registro de una transacción de venta.
 * dniCliente se mantiene estrictamente como STRING de 8 dígitos para preservar ceros a la izquierda.
 */
export const saleInputSchema = z.object({
  dniCliente: z
    .string({ message: "El DNI del cliente es obligatorio." })
    .length(8, "El DNI del cliente debe tener 8 dígitos.")
    .regex(/^\d{8}$/, "El DNI solo puede contener dígitos numéricos."),
  idEmpleado: z.preprocess(
    parseCleanInt,
    z
      .number({ message: "El empleado responsable debe ser un identificador numérico." })
      .int("El identificador del empleado debe ser entero.")
      .positive("Debe seleccionar un empleado responsable.")
  ),
  idTipoComp: z.preprocess(
    parseCleanInt,
    z.union([z.literal(1), z.literal(2)], {
      message: "El tipo de comprobante debe ser 1 (Boleta) o 2 (Factura).",
    })
  ),
  items: z
    .array(cartItemInputSchema)
    .min(1, "La orden de venta debe incluir al menos un producto."),
  payments: z
    .array(paymentInputSchema)
    .min(1, "Debe registrar al menos un método de pago."),
  efectivoRecibido: z.preprocess(
    (val) => (val === undefined || val === null || val === "" ? undefined : parseCleanAmount(val)),
    z
      .number({ message: "El efectivo recibido debe ser un número válido." })
      .positive("El efectivo recibido debe ser mayor a 0.")
      .refine(
        (val) => Math.round(val * 100) === val * 100,
        { message: "El efectivo recibido no puede tener más de dos decimales." }
      )
      .optional()
  ),
  vuelto: z.preprocess(
    (val) => (val === undefined || val === null || val === "" ? undefined : parseCleanAmount(val)),
    z
      .number({ message: "El vuelto debe ser un número válido." })
      .min(0, "El vuelto no puede ser negativo.")
      .refine(
        (val) => Math.round(val * 100) === val * 100,
        { message: "El vuelto no puede tener más de dos decimales." }
      )
      .optional()
  ),
  clientRequestId: z.string().optional(),
});

export type CartItemInput = z.infer<typeof cartItemInputSchema>;
export type PaymentInput = z.infer<typeof paymentInputSchema>;
export type SaleInput = z.infer<typeof saleInputSchema>;
