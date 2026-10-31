import sql from "mssql";
import { getPool } from "../db";
import {
  ReturnSummaryItem,
  ReturnDetail,
  ReturnKpiMetrics,
  ReturnFilterMetadata,
  ReturnSaleLineTrace,
  ReturnReceiptData,
} from "@/types/returns";

/**
 * Repositorio de acceso a datos para Devoluciones y Garantías (Fase 7A).
 * Operaciones 100% de solo lectura contra SQL Server.
 */

export async function getReturnFilterMetadata(): Promise<ReturnFilterMetadata> {
  const pool = await getPool();

  const [estadosRes, motivosRes, metodosRes] = await Promise.all([
    pool.request().query(`
      SELECT ID_estado_dev AS id, Nombre_estado AS nombre
      FROM dbo.Estado_Dev
      ORDER BY ID_estado_dev ASC;
    `),
    pool.request().query(`
      SELECT ID_motivo AS id, Descripcion_motivo AS descripcion
      FROM dbo.Motivo_Dev
      ORDER BY ID_motivo ASC;
    `),
    pool.request().query(`
      SELECT ID_metodo AS id, Nombre_metodo AS nombre
      FROM dbo.Metodo_Pago
      ORDER BY ID_metodo ASC;
    `),
  ]);

  return {
    estados: estadosRes.recordset.map((r: any) => ({
      id: Number(r.id),
      nombre: String(r.nombre),
    })),
    motivos: motivosRes.recordset.map((r: any) => ({
      id: Number(r.id),
      descripcion: String(r.descripcion),
    })),
    metodosPago: metodosRes.recordset.map((r: any) => ({
      id: Number(r.id),
      nombre: String(r.nombre),
    })),
  };
}

export async function getReturnKpiMetrics(): Promise<ReturnKpiMetrics> {
  const pool = await getPool();

  const res = await pool.request().query(`
    SELECT 
      COUNT(DISTINCT d.ID_devolucion) AS totalDevoluciones,
      COUNT(DISTINCT CASE WHEN d.ID_estado_dev = 2 THEN d.ID_devolucion END) AS totalAprobadas,
      COUNT(DISTINCT CASE WHEN d.ID_estado_dev = 1 THEN d.ID_devolucion END) AS totalPendientes,
      COUNT(DISTINCT CASE WHEN d.ID_estado_dev = 3 THEN d.ID_devolucion END) AS totalRechazadas,
      ISNULL(SUM(dd.Cantidad_dev), 0) AS totalUnidadesDevueltas,
      COUNT(DISTINCT dv.Codbarras_prod) AS productosInvolucradosCount,
      ISNULL(SUM(CASE WHEN d.ID_estado_dev = 2 THEN dd.Cantidad_dev * dv.Precio_unitario ELSE 0 END), 0) AS montoTotalDevueltoEstimado
    FROM dbo.Devolucion d
    LEFT JOIN dbo.Detalle_Dev dd ON d.ID_devolucion = dd.ID_devolucion
    LEFT JOIN dbo.Detalle_Venta dv ON dd.ID_detalle = dv.ID_detalle;
  `);

  const row = res.recordset[0] || {};
  return {
    totalDevoluciones: Number(row.totalDevoluciones) || 0,
    totalAprobadas: Number(row.totalAprobadas) || 0,
    totalPendientes: Number(row.totalPendientes) || 0,
    totalRechazadas: Number(row.totalRechazadas) || 0,
    totalUnidadesDevueltas: Number(row.totalUnidadesDevueltas) || 0,
    productosInvolucradosCount: Number(row.productosInvolucradosCount) || 0,
    montoTotalDevueltoEstimado: Number(row.montoTotalDevueltoEstimado) || 0,
  };
}

export async function getReturnsList(): Promise<ReturnSummaryItem[]> {
  const pool = await getPool();

  const query = `
    SELECT 
      d.ID_devolucion,
      CONVERT(VARCHAR(10), d.Fecha_dev, 120) AS FechaDev,
      d.ID_estado_dev,
      ed.Nombre_estado AS EstadoDev,
      v.ID_venta,
      v.Numero_comprobante,
      CONVERT(VARCHAR(10), v.Fecha_venta, 120) AS FechaVenta,
      v.Total_venta,
      c.Dni_cliente,
      CONCAT(c.Nombre_cl, ' ', c.Apellido_cl) AS ClienteNombre,
      e.ID_empleado,
      CONCAT(e.Nombre_emp, ' ', e.Apellido_emp) AS EmpleadoNombre,
      dd.ID_detalle_dev,
      dd.Cantidad_dev,
      dd.ID_motivo,
      md.Descripcion_motivo AS Motivo,
      dv.ID_detalle,
      dv.Codbarras_prod,
      p.Nombre_prod,
      nc.Numero_nota,
      rd.Monto AS Monto_reembolso,
      mpReemb.Nombre_metodo AS Metodo_reembolso
    FROM dbo.Devolucion d
    JOIN dbo.Estado_Dev ed ON d.ID_estado_dev = ed.ID_estado_dev
    JOIN dbo.Venta v ON d.ID_venta = v.ID_venta
    JOIN dbo.Cliente c ON v.Dni_cliente = c.Dni_cliente
    JOIN dbo.Empleado e ON d.ID_empleado = e.ID_empleado
    LEFT JOIN dbo.Detalle_Dev dd ON d.ID_devolucion = dd.ID_devolucion
    LEFT JOIN dbo.Motivo_Dev md ON dd.ID_motivo = md.ID_motivo
    LEFT JOIN dbo.Detalle_Venta dv ON dd.ID_detalle = dv.ID_detalle
    LEFT JOIN dbo.Producto p ON dv.Codbarras_prod = p.Codbarras_prod
    LEFT JOIN dbo.Nota_Credito nc ON d.ID_devolucion = nc.ID_devolucion
    LEFT JOIN dbo.Reembolso_Devolucion rd ON d.ID_devolucion = rd.ID_devolucion
    LEFT JOIN dbo.Metodo_Pago mpReemb ON rd.ID_metodo = mpReemb.ID_metodo
    ORDER BY d.Fecha_dev DESC, d.ID_devolucion DESC;
  `;

  const res = await pool.request().query(query);

  // Agrupar filas por ID_devolucion
  const map = new Map<number, ReturnSummaryItem>();

  for (const row of res.recordset) {
    const idDev = Number(row.ID_devolucion);

    if (!map.has(idDev)) {
      map.set(idDev, {
        idDevolucion: idDev,
        fechaDev: row.FechaDev,
        idEstadoDev: Number(row.ID_estado_dev),
        estadoDev: String(row.EstadoDev),
        idVenta: Number(row.ID_venta),
        numeroComprobante: String(row.Numero_comprobante),
        fechaVenta: row.FechaVenta,
        totalVenta: Number(row.Total_venta),
        dniCliente: String(row.Dni_cliente),
        clienteNombre: String(row.ClienteNombre),
        idEmpleado: Number(row.ID_empleado),
        empleadoNombre: String(row.EmpleadoNombre),
        itemsCount: 0,
        totalUnidadesDevueltas: 0,
        motivos: [],
        productosDevueltos: [],
        tieneNotaCredito: !!row.Numero_nota,
        numeroNotaCredito: row.Numero_nota || null,
        montoReembolsado: row.Monto_reembolso ? Number(row.Monto_reembolso) : undefined,
        metodoReembolso: row.Metodo_reembolso || null,
      });
    }

    const current = map.get(idDev)!;

    if (row.ID_detalle_dev) {
      current.itemsCount += 1;
      const cant = Number(row.Cantidad_dev) || 0;
      current.totalUnidadesDevueltas += cant;

      if (row.Motivo && !current.motivos.includes(row.Motivo)) {
        current.motivos.push(row.Motivo);
      }

      current.productosDevueltos.push({
        codbarras: String(row.Codbarras_prod),
        nombre: String(row.Nombre_prod || "Producto"),
        cantidadDev: cant,
        motivo: String(row.Motivo || "No especificado"),
      });
    }
  }

  return Array.from(map.values());
}

export async function getReturnById(idDevolucion: number): Promise<ReturnDetail | null> {
  const pool = await getPool();

  // 1. Obtener datos de la cabecera de la devolución
  const headerReq = pool.request();
  headerReq.input("idDev", sql.Int, idDevolucion);
  const headerRes = await headerReq.query(`
    SELECT 
      d.ID_devolucion,
      CONVERT(VARCHAR(10), d.Fecha_dev, 120) AS FechaDev,
      d.ID_estado_dev,
      ed.Nombre_estado AS EstadoDev,
      v.ID_venta,
      v.Numero_comprobante,
      CONVERT(VARCHAR(10), v.Fecha_venta, 120) AS FechaVenta,
      v.Total_venta,
      c.Dni_cliente,
      CONCAT(c.Nombre_cl, ' ', c.Apellido_cl) AS ClienteNombre,
      c.Telefono_cl AS ClienteTelefono,
      c.Correo_cl AS ClienteCorreo,
      e.ID_empleado,
      CONCAT(e.Nombre_emp, ' ', e.Apellido_emp) AS EmpleadoNombre
    FROM dbo.Devolucion d
    JOIN dbo.Estado_Dev ed ON d.ID_estado_dev = ed.ID_estado_dev
    JOIN dbo.Venta v ON d.ID_venta = v.ID_venta
    JOIN dbo.Cliente c ON v.Dni_cliente = c.Dni_cliente
    JOIN dbo.Empleado e ON d.ID_empleado = e.ID_empleado
    WHERE d.ID_devolucion = @idDev;
  `);

  if (headerRes.recordset.length === 0) {
    return null;
  }

  const h = headerRes.recordset[0];
  const idVenta = Number(h.ID_venta);

  // 2. Obtener todas las líneas vendidas en la venta original con su historial completo de devoluciones
  const linesReq = pool.request();
  linesReq.input("idVenta", sql.Int, idVenta);
  linesReq.input("idDevActual", sql.Int, idDevolucion);

  const linesRes = await linesReq.query(`
    SELECT 
      dv.ID_detalle,
      dv.Codbarras_prod,
      p.Nombre_prod,
      dv.Precio_unitario,
      dv.Cantidad AS CantidadVendida,
      p.Garantia_meses,
      CONVERT(VARCHAR(10), v.Fecha_venta, 120) AS FechaVenta,
      -- Cantidad devuelta en esta devolución específica
      ISNULL((
        SELECT SUM(ddCurr.Cantidad_dev)
        FROM dbo.Detalle_Dev ddCurr
        WHERE ddCurr.ID_devolucion = @idDevActual AND ddCurr.ID_detalle = dv.ID_detalle
      ), 0) AS CantidadDevEstaDev,
      -- Motivo en esta devolución específica
      (
        SELECT TOP 1 mdCurr.Descripcion_motivo
        FROM dbo.Detalle_Dev ddCurr
        JOIN dbo.Motivo_Dev mdCurr ON ddCurr.ID_motivo = mdCurr.ID_motivo
        WHERE ddCurr.ID_devolucion = @idDevActual AND ddCurr.ID_detalle = dv.ID_detalle
      ) AS MotivoEstaDev,
      (
        SELECT TOP 1 ddCurr.ID_motivo
        FROM dbo.Detalle_Dev ddCurr
        WHERE ddCurr.ID_devolucion = @idDevActual AND ddCurr.ID_detalle = dv.ID_detalle
      ) AS IdMotivoEstaDev,
      -- Total histórico devuelto aprobado en cualquier devolución de esta venta
      ISNULL((
        SELECT SUM(ddHist.Cantidad_dev)
        FROM dbo.Detalle_Dev ddHist
        JOIN dbo.Devolucion dHist ON ddHist.ID_devolucion = dHist.ID_devolucion
        WHERE ddHist.ID_detalle = dv.ID_detalle AND dHist.ID_estado_dev = 2
      ), 0) AS CantidadDevAprobadaTotal,
      -- Total en trámite pendiente en cualquier devolución de esta venta
      ISNULL((
        SELECT SUM(ddPend.Cantidad_dev)
        FROM dbo.Detalle_Dev ddPend
        JOIN dbo.Devolucion dPend ON ddPend.ID_devolucion = dPend.ID_devolucion
        WHERE ddPend.ID_detalle = dv.ID_detalle AND dPend.ID_estado_dev = 1
      ), 0) AS CantidadDevPendienteTotal
    FROM dbo.Detalle_Venta dv
    JOIN dbo.Venta v ON dv.ID_venta = v.ID_venta
    JOIN dbo.Producto p ON dv.Codbarras_prod = p.Codbarras_prod
    WHERE dv.ID_venta = @idVenta
    ORDER BY dv.ID_detalle ASC;
  `);

  const fechaDevObj = new Date(h.FechaDev);
  let totalUnidadesDevueltas = 0;
  let montoEstimadoDevuelto = 0;

  const todasLasLineasVenta: ReturnSaleLineTrace[] = linesRes.recordset.map((row: any) => {
    const cantVendida = Number(row.CantidadVendida) || 0;
    const cantEstaDev = Number(row.CantidadDevEstaDev) || 0;
    const cantAprobadaTotal = Number(row.CantidadDevAprobadaTotal) || 0;
    const cantPendienteTotal = Number(row.CantidadDevPendienteTotal) || 0;
    const precioUnit = Number(row.Precio_unitario) || 0;
    const garantiaMeses = Number(row.Garantia_meses) || 0;

    // Cantidad disponible para devolución: lo vendido menos lo aprobado y pendiente
    const cantDisponible = Math.max(0, cantVendida - cantAprobadaTotal - cantPendienteTotal);

    // Cálculo dinámico de vencimiento de garantía: Fecha_venta + Garantia_meses
    const fechaVentaParts = String(row.FechaVenta).split("-").map(Number);
    const fechaVencGarantia = new Date(fechaVentaParts[0], fechaVentaParts[1] - 1 + garantiaMeses, fechaVentaParts[2]);
    const fechaVencStr = fechaVencGarantia.toISOString().split("T")[0];

    // Comprobar vigencia respecto a la fecha del trámite de devolución
    const garantiaVigente = fechaDevObj.getTime() <= fechaVencGarantia.getTime();
    const diffTime = fechaVencGarantia.getTime() - fechaDevObj.getTime();
    const diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (cantEstaDev > 0) {
      totalUnidadesDevueltas += cantEstaDev;
      montoEstimadoDevuelto += cantEstaDev * precioUnit;
    }

    return {
      idDetalle: Number(row.ID_detalle),
      codbarras: String(row.Codbarras_prod),
      nombreProd: String(row.Nombre_prod),
      precioVentaOriginal: precioUnit,
      cantidadVendidaOriginal: cantVendida,
      cantidadDevueltaEstaDev: cantEstaDev,
      cantidadDevueltaAprobadaTotal: cantAprobadaTotal,
      cantidadDevueltaPendienteTotal: cantPendienteTotal,
      cantidadDisponibleDevolucion: cantDisponible,
      idMotivo: row.IdMotivoEstaDev ? Number(row.IdMotivoEstaDev) : null,
      motivo: row.MotivoEstaDev ? String(row.MotivoEstaDev) : null,
      garantiaMeses,
      fechaVenta: String(row.FechaVenta),
      fechaVencimientoGarantia: fechaVencStr,
      garantiaVigente,
      diasRestantesGarantia: diasRestantes,
    };
  });

  const lineasDevolucion = todasLasLineasVenta.filter((l) => l.cantidadDevueltaEstaDev > 0);

  // 3. Obtener Nota de Crédito si existe
  const ncReq = pool.request();
  ncReq.input("idDev", sql.Int, idDevolucion);
  const ncRes = await ncReq.query(`
    SELECT 
      nc.ID_nota_credito,
      nc.Numero_nota,
      nc.ID_venta,
      nc.ID_devolucion,
      CONVERT(VARCHAR(10), nc.Fecha_emision, 120) AS Fecha_emision,
      nc.Tipo_ajuste,
      nc.Motivo,
      CAST(nc.Monto_subtotal AS FLOAT) AS Monto_subtotal,
      CAST(nc.Monto_igv AS FLOAT) AS Monto_igv,
      CAST(nc.Monto_total AS FLOAT) AS Monto_total,
      nc.ID_empleado,
      CONCAT(e.Nombre_emp, ' ', e.Apellido_emp) AS Nombre_empleado,
      nc.Estado,
      nc.Es_simulacion_academica
    FROM dbo.Nota_Credito nc
    LEFT JOIN dbo.Empleado e ON nc.ID_empleado = e.ID_empleado
    WHERE nc.ID_devolucion = @idDev;
  `);

  let notaCredito: ReturnDetail["notaCredito"] = null;
  if (ncRes.recordset.length > 0) {
    const ncRow = ncRes.recordset[0];
    notaCredito = {
      idNotaCredito: Number(ncRow.ID_nota_credito),
      numeroNota: String(ncRow.Numero_nota),
      idVenta: Number(ncRow.ID_venta),
      idDevolucion: Number(ncRow.ID_devolucion),
      fechaEmision: String(ncRow.Fecha_emision),
      tipoAjuste: ncRow.Tipo_ajuste,
      motivo: String(ncRow.Motivo),
      montoSubtotal: Number(ncRow.Monto_subtotal),
      montoIgv: Number(ncRow.Monto_igv),
      montoTotal: Number(ncRow.Monto_total),
      idEmpleado: Number(ncRow.ID_empleado),
      nombreEmpleado: String(ncRow.Nombre_empleado || "Sistema"),
      estado: String(ncRow.Estado),
      esSimulacionAcademica: Boolean(ncRow.Es_simulacion_academica),
    };
  }

  // 4. Obtener Reembolso si existe
  const reembReq = pool.request();
  reembReq.input("idDev", sql.Int, idDevolucion);
  const reembRes = await reembReq.query(`
    SELECT 
      rd.ID_reembolso,
      rd.ID_devolucion,
      rd.ID_venta,
      rd.ID_metodo,
      mp.Nombre_metodo,
      CAST(rd.Monto AS FLOAT) AS Monto,
      CONVERT(VARCHAR(19), rd.Fecha_hora, 120) AS Fecha_hora,
      rd.ID_empleado,
      rd.ID_sesion,
      rd.Referencia
    FROM dbo.Reembolso_Devolucion rd
    JOIN dbo.Metodo_Pago mp ON rd.ID_metodo = mp.ID_metodo
    WHERE rd.ID_devolucion = @idDev;
  `);

  let reembolso: ReturnDetail["reembolso"] = null;
  if (reembRes.recordset.length > 0) {
    const rRow = reembRes.recordset[0];
    reembolso = {
      idReembolso: Number(rRow.ID_reembolso),
      idDevolucion: Number(rRow.ID_devolucion),
      idVenta: Number(rRow.ID_venta),
      idMetodo: Number(rRow.ID_metodo),
      nombreMetodo: String(rRow.Nombre_metodo),
      monto: Number(rRow.Monto),
      fechaHora: String(rRow.Fecha_hora),
      idEmpleado: Number(rRow.ID_empleado),
      idSesion: rRow.ID_sesion ? Number(rRow.ID_sesion) : null,
      referencia: rRow.Referencia ? String(rRow.Referencia) : null,
      afectaEfectivo: Number(rRow.ID_metodo) === 1,
    };
  }

  const montoConservado = Math.max(0, Number(h.Total_venta) - montoEstimadoDevuelto);

  return {
    idDevolucion: Number(h.ID_devolucion),
    fechaDev: String(h.FechaDev),
    idEstadoDev: Number(h.ID_estado_dev),
    estadoDev: String(h.EstadoDev),
    idVenta,
    numeroComprobante: String(h.Numero_comprobante),
    fechaVenta: String(h.FechaVenta),
    totalVenta: Number(h.Total_venta),
    dniCliente: String(h.Dni_cliente),
    clienteNombre: String(h.ClienteNombre),
    clienteTelefono: h.ClienteTelefono ? String(h.ClienteTelefono) : null,
    clienteCorreo: h.ClienteCorreo ? String(h.ClienteCorreo) : null,
    idEmpleado: Number(h.ID_empleado),
    empleadoNombre: String(h.EmpleadoNombre),
    lineasDevolucion,
    todasLasLineasVenta,
    totalUnidadesDevueltas,
    montoEstimadoDevuelto,
    montoConservado,
    notaCredito,
    reembolso,
  };
}

/**
 * Obtiene la Constancia Comercial de Devolución formateada para visualización e impresión.
 * Documento comercial interno sin valor tributario.
 */
export async function getReturnReceiptData(idDevolucion: number): Promise<ReturnReceiptData | null> {
  const detail = await getReturnById(idDevolucion);
  if (!detail) return null;

  const pool = await getPool();
  let conf: any = {
    Ruc: "20608945123",
    Razon_social: "MISHUTEC S.A.C.",
    Direccion_fiscal: "Av. Universitaria 1801, San Miguel, Lima",
  };
  try {
    const confRes = await pool.request().query(`
      SELECT TOP 1 Ruc, Razon_social, Regimen_tributario
      FROM dbo.Configuracion_Tributaria;
    `);
    if (confRes.recordset.length > 0) {
      conf = { ...conf, ...confRes.recordset[0] };
    }
  } catch {}

  const subtotalDevuelto = Math.round((detail.montoEstimadoDevuelto / 1.18) * 100) / 100;
  const igvDevuelto = Math.round((detail.montoEstimadoDevuelto - subtotalDevuelto) * 100) / 100;

  const productos = detail.lineasDevolucion.map((l) => ({
    codbarras: l.codbarras,
    nombre: l.nombreProd,
    cantidadDevuelta: l.cantidadDevueltaEstaDev,
    precioUnitario: l.precioVentaOriginal,
    subtotal: Math.round(l.cantidadDevueltaEstaDev * l.precioVentaOriginal * 100) / 100,
    motivo: l.motivo || "No especificado",
  }));

  return {
    titulo: "CONSTANCIA DE DEVOLUCIÓN — MISHUTEC",
    subtitulo: "DOCUMENTO COMERCIAL INTERNO (SIN VALIDEZ TRIBUTARIA)",
    empresa: {
      nombre: String(conf.Razon_social || "MISHUTEC S.A.C."),
      ruc: String(conf.Ruc || "20608945123"),
      direccion: String(conf.Direccion_fiscal || "Av. Universitaria 1801, San Miguel, Lima"),
      telefono: "+51 1 614-7800",
    },
    numeroDevolucion: `DEV-${String(detail.idDevolucion).padStart(6, "0")}`,
    fechaHora: detail.fechaDev,
    idVenta: detail.idVenta,
    numeroComprobanteOriginal: detail.numeroComprobante,
    fechaVentaOriginal: detail.fechaVenta,
    cliente: {
      dni: detail.dniCliente,
      nombre: detail.clienteNombre,
    },
    responsable: {
      idEmpleado: detail.idEmpleado,
      nombre: detail.empleadoNombre,
    },
    productos,
    resumenFinanciero: {
      subtotalDevuelto,
      igvDevuelto,
      totalDevuelto: detail.montoEstimadoDevuelto,
      totalVentaOriginal: detail.totalVenta,
      montoConservado: detail.montoConservado,
    },
    reembolso: {
      metodo: detail.reembolso ? detail.reembolso.nombreMetodo : "Pendiente de liquidación",
      monto: detail.reembolso ? detail.reembolso.monto : detail.montoEstimadoDevuelto,
      estado: detail.reembolso ? "COMPLETADO" : "PENDIENTE",
      afectaCajaFisica: detail.reembolso ? detail.reembolso.afectaEfectivo : false,
    },
    notaCredito: detail.notaCredito
      ? {
          numeroNota: detail.notaCredito.numeroNota,
          fechaEmision: detail.notaCredito.fechaEmision,
          tipoAjuste: detail.notaCredito.tipoAjuste,
          baseImponible: detail.notaCredito.montoSubtotal,
          igv: detail.notaCredito.montoIgv,
          total: detail.notaCredito.montoTotal,
        }
      : null,
  };
}
