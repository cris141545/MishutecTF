import {
  ReportFilterParams,
  CompleteReportsPageData,
  CustomerAnalyticsItem,
} from "@/types/reports";
import { maskCustomerContact } from "@/lib/formatters";
import { UnauthorizedError } from "@/lib/auth/session";
import {
  getCompleteReportsPageData,
  getReportKpis,
  getFinancialAnalytics,
  getTaxSummarySunat,
  getSalesByDate,
  getTopSellingProducts,
  getCustomerAnalytics,
  getInventoryAnalytics,
  getSupplierAnalytics,
  getReturnsAnalytics,
} from "../repositories/report.repository";

export type ReportCsvType =
  | "kpis"
  | "ventas"
  | "productos"
  | "inventario"
  | "clientes"
  | "proveedores"
  | "devoluciones"
  | "finanzas"
  | "tributario";

/**
 * Normaliza y resuelve los filtros de fecha según los presets rápidos.
 */
export function resolveDateFilters(filters: ReportFilterParams): ReportFilterParams {
  const resolved = { ...filters };

  if (resolved.preset === "today") {
    const today = new Date().toISOString().split("T")[0];
    resolved.fechaDesde = today;
    resolved.fechaHasta = today;
  } else if (resolved.preset === "last7") {
    const now = new Date();
    const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    resolved.fechaDesde = d.toISOString().split("T")[0];
    resolved.fechaHasta = now.toISOString().split("T")[0];
  } else if (resolved.preset === "last30") {
    const now = new Date();
    const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    resolved.fechaDesde = d.toISOString().split("T")[0];
    resolved.fechaHasta = now.toISOString().split("T")[0];
  } else if (resolved.preset === "thisMonth") {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    resolved.fechaDesde = `${y}-${m}-01`;
    resolved.fechaHasta = now.toISOString().split("T")[0];
  } else if (resolved.preset === "all") {
    delete resolved.fechaDesde;
    delete resolved.fechaHasta;
  }

  return resolved;
}

/**
 * Enmascara datos personales de clientes según la Ley 29733 cuando no hay sesión administrativa.
 * Centralizado vía maskCustomerContact de formatters.ts.
 */
export function maskCustomerItem(c: CustomerAnalyticsItem): CustomerAnalyticsItem {
  return maskCustomerContact(c);
}

/**
 * Obtiene el conjunto completo de datos analíticos para la página de reportes.
 * Requiere sesión administrativa autenticada (H-01).
 */
export async function getReportsPageData(
  filters: ReportFilterParams = {},
  isAuthenticated = true
): Promise<CompleteReportsPageData> {
  if (!isAuthenticated) {
    throw new UnauthorizedError(
      "Acceso denegado: se requiere sesión administrativa activa para consultar reportes."
    );
  }

  const resolvedFilters = resolveDateFilters(filters);
  const data = await getCompleteReportsPageData(resolvedFilters);
  return data;
}

/**
 * Sanitiza una celda para evitar CSV Formula Injection y asegurar formato CSV estándar RFC 4180.
 * Neutraliza caracteres gatillo: '=', '+', '-', '@', '\t', '\r' anteponiendo comilla simple.
 */
export function sanitizeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  let str = String(value).trim();
  if (/^[=\+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Genera el archivo CSV con codificación UTF-8 BOM para soporte total en Microsoft Excel.
 */
export async function generateReportCsv(
  type: ReportCsvType,
  filters: ReportFilterParams = {},
  isAuthenticated = true
): Promise<{ filename: string; content: string }> {
  if (!isAuthenticated) {
    throw new UnauthorizedError(
      "Acceso denegado: se requiere sesión administrativa activa para exportar reportes."
    );
  }

  const resolved = resolveDateFilters(filters);
  const nowStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  let filename = `mishutec-reporte-${type}-${nowStr}.csv`;
  const rows: string[] = [];

  // UTF-8 BOM
  const BOM = "\uFEFF";

  switch (type) {
    case "kpis": {
      const kpis = await getReportKpis(resolved);
      rows.push(["Métrica", "Valor", "Observaciones"].map(sanitizeCsvCell).join(","));
      rows.push(["Ventas Totales (S/)", kpis.ventasTotales.toFixed(2), "Total facturado"].map(sanitizeCsvCell).join(","));
      rows.push(["Comprobantes Emitidos", kpis.comprobantesCount, "Boletas y Facturas"].map(sanitizeCsvCell).join(","));
      rows.push(["Ticket Promedio (S/)", kpis.ticketPromedio.toFixed(2), "Venta promedio"].map(sanitizeCsvCell).join(","));
      rows.push(["Unidades Vendidas", kpis.unidadesVendidas, "Cantidad física vendida"].map(sanitizeCsvCell).join(","));
      rows.push(["Productos en Catálogo", kpis.productosCatalogo, "Total catálogo"].map(sanitizeCsvCell).join(","));
      rows.push(["Productos Agotados", kpis.productosAgotados, "Stock = 0"].map(sanitizeCsvCell).join(","));
      rows.push(["Productos Stock Bajo", kpis.productosStockBajo, "Stock 1 a 5"].map(sanitizeCsvCell).join(","));
      rows.push(["Stock Total en Almacén", kpis.stockTotal, "Unidades físicas"].map(sanitizeCsvCell).join(","));
      rows.push(["Valor Inventario (Precio Venta S/)", kpis.valorInventarioVenta.toFixed(2), "Valor potencial retail (No costo)"].map(sanitizeCsvCell).join(","));
      rows.push(["Total Devoluciones", kpis.totalDevoluciones, "Casos RMA"].map(sanitizeCsvCell).join(","));
      rows.push(["Devoluciones Aprobadas", kpis.devolucionesAprobadas, "Resueltas favorablemente"].map(sanitizeCsvCell).join(","));
      rows.push(["Devoluciones Pendientes", kpis.devolucionesPendientes, "En revisión"].map(sanitizeCsvCell).join(","));
      rows.push(["Devoluciones Rechazadas", kpis.devolucionesRechazadas, "No procedentes"].map(sanitizeCsvCell).join(","));
      rows.push(["Tasa Retorno Unidades (%)", `${kpis.tasaRetornoUnidades.toFixed(2)}%`, "Unidades devueltas vs vendidas"].map(sanitizeCsvCell).join(","));
      break;
    }

    case "ventas": {
      const sales = await getSalesByDate(resolved);
      rows.push(["Fecha", "Total Facturado (S/)", "Comprobantes", "Unidades Vendidas", "Acumulado (S/)"].map(sanitizeCsvCell).join(","));
      for (const s of sales) {
        rows.push([
          s.fecha,
          s.totalVenta.toFixed(2),
          s.comprobantesCount,
          s.unidadesVendidas,
          s.acumulado.toFixed(2),
        ].map(sanitizeCsvCell).join(","));
      }
      break;
    }

    case "productos": {
      const prods = await getTopSellingProducts(resolved);
      rows.push([
        "Código de Barras",
        "Nombre del Producto",
        "Categoría",
        "Marca",
        "Precio Unitario (S/)",
        "Unidades Vendidas",
        "Total Facturado (S/)",
        "Stock Actual",
      ].map(sanitizeCsvCell).join(","));
      for (const p of prods) {
        rows.push([
          p.codbarras,
          p.nombreProd,
          p.categoria,
          p.marca,
          p.precioUnitario.toFixed(2),
          p.unidadesVendidas,
          p.totalFacturado.toFixed(2),
          p.stockActual,
        ].map(sanitizeCsvCell).join(","));
      }
      break;
    }

    case "inventario": {
      const inv = await getInventoryAnalytics();
      rows.push(["--- RESUMEN POR CATEGORÍA ---"].map(sanitizeCsvCell).join(","));
      rows.push(["Categoría", "Stock Físico", "Valoración Potencial Retail (S/)", "Productos"].map(sanitizeCsvCell).join(","));
      for (const c of inv.stockPorCategoria) {
        rows.push([c.categoria, c.stockTotal, c.valorVenta.toFixed(2), c.productosCount].map(sanitizeCsvCell).join(","));
      }

      rows.push("");
      rows.push(["--- PRODUCTOS CON STOCK CRÍTICO O AGOTADO ---"].map(sanitizeCsvCell).join(","));
      rows.push(["Código", "Producto", "Categoría", "Marca", "Stock", "Estado"].map(sanitizeCsvCell).join(","));
      for (const a of inv.productosAgotados) {
        rows.push([a.codbarras, a.nombreProd, a.categoria, a.marca, 0, "AGOTADO"].map(sanitizeCsvCell).join(","));
      }
      for (const b of inv.productosStockBajo) {
        rows.push([b.codbarras, b.nombreProd, b.categoria, b.marca, b.stock, "STOCK BAJO"].map(sanitizeCsvCell).join(","));
      }
      break;
    }

    case "clientes": {
      const custData = await getCustomerAnalytics(resolved);
      rows.push([
        "DNI Cliente",
        "Nombre Completo",
        "Teléfono",
        "Correo Electrónico",
        "Total Compras",
        "Unidades Compradas",
        "Total Gastado (S/)",
        "Ticket Promedio (S/)",
        "Primera Compra",
        "Última Compra",
        "Recurrente",
      ].map(sanitizeCsvCell).join(","));

      const list = isAuthenticated ? custData.lista : custData.lista.map(maskCustomerItem);
      for (const c of list) {
        rows.push([
          c.dniCliente,
          c.nombreCliente,
          c.telefono || "N/A",
          c.correo,
          c.comprasCount,
          c.unidadesCompradas,
          c.totalGastado.toFixed(2),
          c.ticketPromedio.toFixed(2),
          c.primeraCompra,
          c.ultimaCompra,
          c.esRecurrente ? "SÍ" : "NO",
        ].map(sanitizeCsvCell).join(","));
      }
      break;
    }

    case "proveedores": {
      const supp = await getSupplierAnalytics();
      rows.push(["ID Proveedor", "Razón Social", "Correo", "Teléfono", "Productos Suministrados", "Costo Promedio (S/)"].map(sanitizeCsvCell).join(","));
      for (const p of supp.proveedores) {
        rows.push([
          p.idProveedor,
          p.nombreProveedor,
          p.correo,
          p.telefono || "N/A",
          p.productosSuministradosCount,
          p.costoPromedioCompra.toFixed(2),
        ].map(sanitizeCsvCell).join(","));
      }

      rows.push("");
      rows.push(["--- PRODUCTOS CON MÚLTIPLES PROVEEDORES (DISPERSIÓN DE PRECIO DE COMPRA) ---"].map(sanitizeCsvCell).join(","));
      rows.push(["Código", "Producto", "Cant. Proveedores", "Rango de Costos", "Proveedores"].map(sanitizeCsvCell).join(","));
      for (const m of supp.productosConMultiplesProveedores) {
        rows.push([m.codbarras, m.nombreProd, m.cantidadProveedores, m.rangoPreciosCompra, m.proveedoresNombres].map(sanitizeCsvCell).join(","));
      }
      break;
    }

    case "devoluciones": {
      const ret = await getReturnsAnalytics(resolved);
      rows.push(["Estado RMA", "Total Devoluciones", "Porcentaje"].map(sanitizeCsvCell).join(","));
      for (const e of ret.porEstado) {
        rows.push([e.estado, e.total, `${e.porcentaje.toFixed(2)}%`].map(sanitizeCsvCell).join(","));
      }

      rows.push("");
      rows.push(["Motivo de Devolución", "Casos", "Unidades Afectadas"].map(sanitizeCsvCell).join(","));
      for (const m of ret.porMotivo) {
        rows.push([m.motivo, m.total, m.unidadesDevueltas].map(sanitizeCsvCell).join(","));
      }

      rows.push("");
      rows.push(["Producto Afectado", "Código", "Casos", "Unidades", "Impacto Valor Venta (S/)"].map(sanitizeCsvCell).join(","));
      for (const p of ret.productosMasDevueltos) {
        rows.push([p.nombreProd, p.codbarras, p.vecesDevuelto, p.unidadesDevueltas, p.impactoValorVenta.toFixed(2)].map(sanitizeCsvCell).join(","));
      }
      break;
    }

    case "finanzas": {
      const f = await getFinancialAnalytics(resolved);
      rows.push(["MÉTRICA FINANCIERA", "MONTO (PEN / %)"].map(sanitizeCsvCell).join(","));
      rows.push(["Ventas Brutas", `S/ ${f.ventasBrutas.toFixed(2)}`].map(sanitizeCsvCell).join(","));
      rows.push(["Devoluciones y Reembolsos", `- S/ ${f.devolucionesMonto.toFixed(2)}`].map(sanitizeCsvCell).join(","));
      rows.push(["Ventas Netas (con IGV)", `S/ ${f.ventasNetasTotal.toFixed(2)}`].map(sanitizeCsvCell).join(","));
      rows.push(["Ventas Netas (sin impuestos)", `S/ ${f.ventasNetasSinImpuestos.toFixed(2)}`].map(sanitizeCsvCell).join(","));
      rows.push(["Costo de Ventas (COGS - Suministra)", `- S/ ${f.costoVentas.toFixed(2)}`].map(sanitizeCsvCell).join(","));
      rows.push(["Ganancia Bruta", `S/ ${f.gananciaBruta.toFixed(2)}`].map(sanitizeCsvCell).join(","));
      rows.push(["Margen Bruto %", `${f.margenBrutoPorcentaje.toFixed(2)}%`].map(sanitizeCsvCell).join(","));
      rows.push(["Gastos Operativos (Caja)", `- S/ ${f.gastosOperativos.toFixed(2)}`].map(sanitizeCsvCell).join(","));
      rows.push(["Utilidad Operativa Estimada", `S/ ${f.utilidadOperativa.toFixed(2)}`].map(sanitizeCsvCell).join(","));
      rows.push(["Margen Operativo Neto %", `${f.margenNetoPorcentaje.toFixed(2)}%`].map(sanitizeCsvCell).join(","));
      rows.push(["Flujo Neto de Efectivo en Caja", `S/ ${f.flujoEfectivoNeto.toFixed(2)}`].map(sanitizeCsvCell).join(","));
      break;
    }

    case "tributario": {
      const t = await getTaxSummarySunat(resolved);
      rows.push(["CAMPO DECLARACIÓN REFERENCIAL SUNAT", "VALOR"].map(sanitizeCsvCell).join(","));
      rows.push(["RUC", t.ruc].map(sanitizeCsvCell).join(","));
      rows.push(["Razón Social", t.razonSocial].map(sanitizeCsvCell).join(","));
      rows.push(["Régimen Tributario", t.regimenTributario].map(sanitizeCsvCell).join(","));
      rows.push(["Período Fiscal", t.periodoFiscal].map(sanitizeCsvCell).join(","));
      rows.push(["Ventas Gravadas Totales", `S/ ${t.ventasGravadasTotal.toFixed(2)}`].map(sanitizeCsvCell).join(","));
      rows.push(["Base Imponible Ventas", `S/ ${t.baseImponibleVentas.toFixed(2)}`].map(sanitizeCsvCell).join(","));
      rows.push(["Débito Fiscal Bruto (18%)", `S/ ${t.debitoFiscalIgvTotal.toFixed(2)}`].map(sanitizeCsvCell).join(","));
      rows.push(["Desglose IGV (15.5%)", `S/ ${t.desgloseIgv.toFixed(2)}`].map(sanitizeCsvCell).join(","));
      rows.push(["Desglose IPM (2.5%)", `S/ ${t.desgloseIpm.toFixed(2)}`].map(sanitizeCsvCell).join(","));
      rows.push(["Ajustes por Notas de Crédito", `- S/ ${t.ajustesNotasCredito.toFixed(2)}`].map(sanitizeCsvCell).join(","));
      rows.push(["Débito Fiscal Neto", `S/ ${t.debitoFiscalNeto.toFixed(2)}`].map(sanitizeCsvCell).join(","));
      rows.push(["Compras Registradas (Suministra)", `S/ ${t.comprasRegistradasTotal.toFixed(2)}`].map(sanitizeCsvCell).join(","));
      rows.push(["Base Imponible Compras", `S/ ${t.baseImponibleCompras.toFixed(2)}`].map(sanitizeCsvCell).join(","));
      rows.push(["Crédito Fiscal Sustentado (18%)", `S/ ${t.creditoFiscalSustentado.toFixed(2)}`].map(sanitizeCsvCell).join(","));
      rows.push(["Saldo Referencial IGV a Pagar/Favor", `S/ ${t.saldoReferencialIgvMes.toFixed(2)}`].map(sanitizeCsvCell).join(","));
      rows.push(["Pago a Cuenta Renta (1.0% MYPE)", `S/ ${t.pagoCuentaRentaEstimado.toFixed(2)}`].map(sanitizeCsvCell).join(","));
      rows.push(["Nota Legal", t.advertenciaLegal].map(sanitizeCsvCell).join(","));
      break;
    }
  }

  return {
    filename,
    content: BOM + rows.join("\r\n"),
  };
}
