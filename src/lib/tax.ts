/**
 * Motor de Cálculo Tributario Peruano 2026 - MISHUTEC
 * Régimen General y MYPE Tributario:
 * - IGV (Impuesto General a las Ventas): 15.5%
 * - IPM (Impuesto de Promoción Municipal): 2.5%
 * - Tasa Conjunta (IGV + IPM): 18.0%
 *
 * Catálogo MISHUTEC: Los precios al consumidor final incluyen el 18.0% de impuestos.
 * No se debe sumar un 18% extra a las ventas de catálogo.
 */

export const CURRENT_TAX_CONFIG = {
  igv: 15.5,
  ipm: 2.5,
  total: 18.0,
  year: 2026,
};

export interface TaxBreakdown {
  total: number;
  subtotal: number;
  descuento: number;
  baseImponible: number;
  montoExonerado: number;
  montoInafecto: number;
  tasaIgv: number; // Ej. 15.5
  tasaIpm: number; // Ej. 2.5
  tasaTotal: number; // Ej. 18.0
  igv: number; // 15.5%
  ipm: number; // 2.5%
  totalImpuestos: number; // 18.0% (igv + ipm)
  tipoOperacion: "GRAVADA" | "EXONERADA" | "INAFECTA";
}

export interface TaxCalculationOptions {
  isExonerated?: boolean;
  isInafect?: boolean;
  tipoOperacion?: "GRAVADA" | "EXONERADA" | "INAFECTA";
  tasaIgv?: number; // Default: 15.5
  tasaIpm?: number; // Default: 2.5
  descuento?: number;
}

/**
 * Normaliza las opciones de cálculo tributario admitiendo objeto o string
 */
function normalizeOptions(
  opts?: TaxCalculationOptions | "GRAVADA" | "EXONERADA" | "INAFECTA"
): TaxCalculationOptions {
  if (typeof opts === "string") {
    if (opts === "EXONERADA") return { isExonerated: true, tipoOperacion: "EXONERADA" };
    if (opts === "INAFECTA") return { isInafect: true, tipoOperacion: "INAFECTA" };
    return { tipoOperacion: "GRAVADA" };
  }
  const options = opts || {};
  if (options.tipoOperacion === "EXONERADA") options.isExonerated = true;
  if (options.tipoOperacion === "INAFECTA") options.isInafect = true;
  return options;
}

/**
 * Calcula el desglose tributario a partir de un total que YA INCLUYE impuestos (ej. precio de catálogo)
 */
export function calculateTaxFromTotal(
  totalAmount: number,
  optionsInput: TaxCalculationOptions | "GRAVADA" | "EXONERADA" | "INAFECTA" = {}
): TaxBreakdown {
  const options = normalizeOptions(optionsInput);
  const total = Math.max(0, Math.round(Number(totalAmount || 0) * 100) / 100);
  const descuento = Math.max(0, Math.round(Number(options.descuento || 0) * 100) / 100);
  const totalNeto = Math.max(0, Math.round((total - descuento) * 100) / 100);

  const tasaIgv = options.tasaIgv ?? 15.5;
  const tasaIpm = options.tasaIpm ?? 2.5;
  const tasaTotal = Math.round((tasaIgv + tasaIpm) * 10) / 10; // 18.0

  if (options.isExonerated) {
    return {
      total: totalNeto,
      subtotal: total,
      descuento,
      baseImponible: totalNeto,
      montoExonerado: totalNeto,
      montoInafecto: 0,
      tasaIgv: 0,
      tasaIpm: 0,
      tasaTotal: 0,
      igv: 0,
      ipm: 0,
      totalImpuestos: 0,
      tipoOperacion: "EXONERADA",
    };
  }

  if (options.isInafect) {
    return {
      total: totalNeto,
      subtotal: total,
      descuento,
      baseImponible: totalNeto,
      montoExonerado: 0,
      montoInafecto: totalNeto,
      tasaIgv: 0,
      tasaIpm: 0,
      tasaTotal: 0,
      igv: 0,
      ipm: 0,
      totalImpuestos: 0,
      tipoOperacion: "INAFECTA",
    };
  }

  // Operación Gravada con IGV incluido
  const factor = 1 + tasaTotal / 100;
  const baseImponible = Math.round((totalNeto / factor) * 100) / 100;
  const totalImpuestos = Math.round((totalNeto - baseImponible) * 100) / 100;

  // Desglose proporcional de IGV (15.5%) e IPM (2.5%) garantizando la suma exacta
  const igv = Math.round(baseImponible * (tasaIgv / 100) * 100) / 100;
  const ipm = Math.round((totalImpuestos - igv) * 100) / 100;

  return {
    total: totalNeto,
    subtotal: total,
    descuento,
    baseImponible,
    montoExonerado: 0,
    montoInafecto: 0,
    tasaIgv,
    tasaIpm,
    tasaTotal,
    igv,
    ipm,
    totalImpuestos,
    tipoOperacion: "GRAVADA",
  };
}

/**
 * Calcula el total y desglose a partir de un valor de adquisición / base imponible SIN IGV
 */
export function calculateTaxFromBase(
  baseAmount: number,
  optionsInput: TaxCalculationOptions | "GRAVADA" | "EXONERADA" | "INAFECTA" = {}
): TaxBreakdown {
  const options = normalizeOptions(optionsInput);
  const base = Math.max(0, Math.round(Number(baseAmount || 0) * 100) / 100);
  const descuento = Math.max(0, Math.round(Number(options.descuento || 0) * 100) / 100);
  const baseNeta = Math.max(0, Math.round((base - descuento) * 100) / 100);

  const tasaIgv = options.tasaIgv ?? 15.5;
  const tasaIpm = options.tasaIpm ?? 2.5;
  const tasaTotal = Math.round((tasaIgv + tasaIpm) * 10) / 10; // 18.0

  if (options.isExonerated) {
    return {
      total: baseNeta,
      subtotal: base,
      descuento,
      baseImponible: baseNeta,
      montoExonerado: baseNeta,
      montoInafecto: 0,
      tasaIgv: 0,
      tasaIpm: 0,
      tasaTotal: 0,
      igv: 0,
      ipm: 0,
      totalImpuestos: 0,
      tipoOperacion: "EXONERADA",
    };
  }

  if (options.isInafect) {
    return {
      total: baseNeta,
      subtotal: base,
      descuento,
      baseImponible: baseNeta,
      montoExonerado: 0,
      montoInafecto: baseNeta,
      tasaIgv: 0,
      tasaIpm: 0,
      tasaTotal: 0,
      igv: 0,
      ipm: 0,
      totalImpuestos: 0,
      tipoOperacion: "INAFECTA",
    };
  }

  const igv = Math.round(baseNeta * (tasaIgv / 100) * 100) / 100;
  const ipm = Math.round(baseNeta * (tasaIpm / 100) * 100) / 100;
  const totalImpuestos = Math.round((igv + ipm) * 100) / 100;
  const total = Math.round((baseNeta + totalImpuestos) * 100) / 100;

  return {
    total,
    subtotal: base,
    descuento,
    baseImponible: baseNeta,
    montoExonerado: 0,
    montoInafecto: 0,
    tasaIgv,
    tasaIpm,
    tasaTotal,
    igv,
    ipm,
    totalImpuestos,
    tipoOperacion: "GRAVADA",
  };
}

/**
 * Calcula el ajuste tributario para una nota de crédito o devolución proporcional
 * manteniendo la tasa histórica aplicada en la venta
 */
export function calculateReturnTaxAdjustment(
  refundAmount: number,
  historicalTaxRate: number = 18.0
): {
  baseDevuelta: number;
  impuestoAjustado: number;
  totalDevolucion: number;
} {
  const totalDevolucion = Math.round(Number(refundAmount || 0) * 100) / 100;
  const factor = 1 + historicalTaxRate / 100;
  const baseDevuelta = Math.round((totalDevolucion / factor) * 100) / 100;
  const impuestoAjustado = Math.round((totalDevolucion - baseDevuelta) * 100) / 100;
  return {
    baseDevuelta,
    impuestoAjustado,
    totalDevolucion,
  };
}

/**
 * Formatea la leyenda comercial tributaria oficial
 */
export function getTaxDisclaimer(comprobanteNombre?: string): string {
  const prefijo = comprobanteNombre ? `${comprobanteNombre}. ` : "";
  return `${prefijo}Documento comercial de uso interno. Resumen tributario referencial según Art. 1 y 2 Ley del IGV (15.5% IGV + 2.5% IPM = 18.0% total). No constituye comprobante de pago electrónico SUNAT.`;
}
