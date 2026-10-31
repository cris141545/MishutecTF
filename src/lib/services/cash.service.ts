import {
  getActiveCashSession,
  getCashSessionById,
  openCashSessionTransaction,
  addCashMovementTransaction,
  closeCashSessionTransaction,
  reopenCashSessionTransaction,
  getRecentCashMovements,
  getPastCashSessions,
  registerEmployeePaymentTransaction,
  getEmployeePaymentsBySession,
  getChannelSummaryCards,
} from "../repositories/cash.repository";
import { getPool } from "../db";
import {
  OpenCashInput,
  AddCashMovementInput,
  CloseCashInput,
  ReopenCashInput,
  CashDashboardData,
  CashClosingSummary,
  CashSession,
  CashMovement,
  EmployeePaymentInput,
  EmployeePayment,
  ChannelSummaryCard,
} from "@/types/cash-register";
import {
  openCashSchema,
  addCashMovementSchema,
  closeCashSchema,
  reopenCashSchema,
  employeePaymentSchema,
} from "../validations/cash.schema";

export async function getCashDashboardData(): Promise<CashDashboardData> {
  const pool = await getPool();

  const [activeSession, recentMovements, pastSessions, empRes, provRes, metRes] = await Promise.all([
    getActiveCashSession(pool),
    getRecentCashMovements(undefined, 30),
    getPastCashSessions(15),
    pool.request().query("SELECT ID_empleado AS id, (Nombre_emp + ' ' + Apellido_emp) AS nombre FROM dbo.Empleado ORDER BY ID_empleado ASC"),
    pool.request().query("SELECT ID_proveedor AS id, Nombre_prov AS nombre FROM dbo.Proveedor ORDER BY Nombre_prov ASC"),
    pool.request().query("SELECT ID_metodo AS id, Nombre_metodo AS nombre FROM dbo.Metodo_Pago ORDER BY ID_metodo ASC"),
  ]);

  let channelCards: ChannelSummaryCard[] = [];
  let pagosPersonal: EmployeePayment[] = [];

  if (activeSession) {
    [channelCards, pagosPersonal] = await Promise.all([
      getChannelSummaryCards(activeSession.idSesion, pool),
      getEmployeePaymentsBySession(activeSession.idSesion, pool),
    ]);
  }

  return {
    activeSession,
    recentMovements,
    pastSessions,
    employees: empRes.recordset.map((r: any) => ({ id: Number(r.id), nombre: String(r.nombre) })),
    suppliers: provRes.recordset.map((r: any) => ({ id: Number(r.id), nombre: String(r.nombre) })),
    paymentMethods: metRes.recordset.map((r: any) => ({ id: Number(r.id), nombre: String(r.nombre) })),
    channelCards,
    pagosPersonal,
  };
}

export async function registerEmployeePayment(input: EmployeePaymentInput): Promise<EmployeePayment> {
  const validated = employeePaymentSchema.parse(input);
  return await registerEmployeePaymentTransaction({
    idSesion: validated.idSesion,
    idEmpleado: validated.idEmpleado,
    periodo: validated.periodo,
    concepto: validated.concepto,
    monto: validated.monto,
    idMetodo: validated.idMetodo,
    idEmpleadoResponsable: validated.idEmpleadoResponsable,
    observaciones: validated.observaciones,
  });
}

export async function openCashSession(input: OpenCashInput): Promise<CashSession> {
  const validated = openCashSchema.parse(input);
  return await openCashSessionTransaction({
    idEmpleado: validated.idEmpleado,
    montoInicial: validated.montoInicial,
    observaciones: validated.observaciones,
  });
}

export async function addCashMovement(input: AddCashMovementInput): Promise<CashMovement> {
  const validated = addCashMovementSchema.parse(input);
  return await addCashMovementTransaction({
    idSesion: validated.idSesion,
    tipo: validated.tipo,
    categoria: validated.categoria,
    monto: validated.monto,
    idMetodo: validated.idMetodo,
    concepto: validated.concepto,
    idEmpleado: validated.idEmpleado,
    idVenta: validated.idVenta,
    idDevolucion: validated.idDevolucion,
  });
}

export async function closeCashSession(input: CloseCashInput): Promise<CashClosingSummary> {
  const validated = closeCashSchema.parse(input);
  return await closeCashSessionTransaction({
    idSesion: validated.idSesion,
    idEmpleadoCierre: validated.idEmpleadoCierre,
    efectivoContado: validated.efectivoContado,
    observacionesCierre: validated.observacionesCierre,
  });
}

export async function reopenCashSession(input: ReopenCashInput): Promise<CashSession> {
  const validated = reopenCashSchema.parse(input);
  return await reopenCashSessionTransaction({
    idSesion: validated.idSesion,
    idEmpleadoReapertura: validated.idEmpleadoReapertura,
    motivoReapertura: validated.motivoReapertura,
  });
}
