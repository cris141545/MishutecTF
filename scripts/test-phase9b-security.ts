import fs from "fs";
import path from "path";
import sql from "mssql/msnodesqlv8";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";

// 1. Cargar .env.local
function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadEnvLocal();

// Importaciones del sistema
import {
  maskDni,
  maskPhone,
  maskEmail,
  maskCustomerContact,
} from "../src/lib/formatters";
import { verifySessionToken, SESSION_COOKIE_NAME, UnauthorizedError } from "../src/lib/auth/session";
import { proxy, config as proxyConfig } from "../src/proxy";
import { getFilteredReportsAction, exportReportCsvAction } from "../src/lib/actions/report.actions";
import { getReportsPageData, generateReportCsv } from "../src/lib/services/report.service";
import { getReportKpis, getReturnsAnalytics } from "../src/lib/repositories/report.repository";
import { GET as getProductByBarcodeApi } from "../src/app/api/products/[barcode]/route";

async function runSecurityCertification() {
  console.log("=======================================================================");
  console.log(" MISHUTEC - FASE 9B: CERTIFICACIÓN DE SEGURIDAD Y CIERRE DE HALLAZGOS");
  console.log("=======================================================================\n");

  let passCount = 0;
  let failCount = 0;

  function assert(desc: string, condition: boolean, extraInfo?: string) {
    if (condition) {
      console.log(`  [PASS] ${desc}`);
      passCount++;
    } else {
      console.error(`  [FAIL] ${desc} ${extraInfo ? `-> ${extraInfo}` : ""}`);
      failCount++;
    }
  }

  const driver = process.env.DB_DRIVER || "ODBC Driver 18 for SQL Server";
  const server = process.env.DB_SERVER;
  const dbAceptacion = process.env.DB_NAME || "MishutecT2_Aceptacion";
  const dbAcademica = "MishutecT2";

  const poolAcep = await new sql.ConnectionPool({
    connectionString: `Driver={${driver}};Server=${server};Database=${dbAceptacion};Trusted_Connection=yes;TrustServerCertificate=yes;`,
  } as any).connect();

  const poolAcad = await new sql.ConnectionPool({
    connectionString: `Driver={${driver}};Server=${server};Database=${dbAcademica};Trusted_Connection=yes;TrustServerCertificate=yes;`,
  } as any).connect();

  try {
    // -------------------------------------------------------------------------
    // 1. CERTIFICACIÓN H-06: CENTRALIZACIÓN Y ROBUSTEZ DE ENMASCARAMIENTO
    // -------------------------------------------------------------------------
    console.log("--- 1. CERTIFICACIÓN H-06: Enmascaramiento Centralizado (Ley 29733) ---");
    assert("DNI estándar 8 dígitos (72145890 -> 72****90)", maskDni("72145890") === "72****90");
    assert("DNI con espacios periféricos (' 72145890 ' -> 72****90)", maskDni(" 72145890 ") === "72****90");
    assert("DNI corto (<4 dígitos) retorna '****'", maskDni("123") === "****");
    assert("DNI nulo o vacío retorna '****'", maskDni(null) === "****" && maskDni("") === "****");

    assert("Teléfono 9 dígitos (987654321 -> 987***321)", maskPhone("987654321") === "987***321");
    assert("Teléfono corto (<=4 dígitos) retorna '****'", maskPhone("1234") === "****");
    assert("Teléfono nulo o vacío retorna null", maskPhone(null) === null && maskPhone("  ") === null);

    assert("Correo corporativo estándar (ana.torres@gmail.com -> a***@gmail.com)", maskEmail("ana.torres@gmail.com") === "a***@gmail.com");
    assert("Correo corto de 1 caracter usuario (a@empresa.pe -> *@empresa.pe)", maskEmail("a@empresa.pe") === "*@empresa.pe");
    assert("Correo malformado sin arroba retorna '****@****.***'", maskEmail("correo-invalido") === "****@****.***");
    assert("Correo nulo o vacío retorna '****@****.***'", maskEmail(null) === "****@****.***" && maskEmail("") === "****@****.***");

    const genericCustomer = {
      dniCliente: "72145890",
      clienteTelefono: "987654321",
      clienteCorreo: "cliente@dominio.com",
      nombre: "Carlos Ramos",
    };
    const maskedGeneric = maskCustomerContact(genericCustomer);
    assert("maskCustomerContact procesa dniCliente", maskedGeneric.dniCliente === "72****90");
    assert("maskCustomerContact procesa clienteTelefono", maskedGeneric.clienteTelefono === "987***321");
    assert("maskCustomerContact procesa clienteCorreo", maskedGeneric.clienteCorreo === "c***@dominio.com");
    assert("maskCustomerContact preserva otros campos (nombre intacto)", maskedGeneric.nombre === "Carlos Ramos");

    // -------------------------------------------------------------------------
    // 2. CERTIFICACIÓN H-07: ERRORES SEGUROS EN API SIN FUGA DE METADATOS
    // -------------------------------------------------------------------------
    console.log("\n--- 2. CERTIFICACIÓN H-07: API Routes Seguras y Mitigación de Fuga ---");
    const routeFileContent = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/api/products/[barcode]/route.ts"),
      "utf-8"
    );
    assert("Fichero de ruta API no contiene la cadena 'MishutecT2'", !routeFileContent.includes("MishutecT2"));
    assert("Fichero de ruta API no contiene la cadena 'SQL Server'", !routeFileContent.includes("SQL Server"));

    const fakeReq = new NextRequest("http://localhost:3000/api/products/INEXISTENTE999");
    const res = await getProductByBarcodeApi(fakeReq, {
      params: Promise.resolve({ barcode: "INEXISTENTE999" }),
    });
    const resJson = await res.json();
    assert("API responde con HTTP 401 cuando no hay sesión", res.status === 401);
    assert(
      "Mensaje de acceso denegado neutro",
      resJson.error === "Se requiere iniciar sesión."
    );

    // -------------------------------------------------------------------------
    // 3. CERTIFICACIÓN H-01: BLOQUEO ESTRICTO EN REPORTES SIN SESIÓN
    // -------------------------------------------------------------------------
    console.log("\n--- 3. CERTIFICACIÓN H-01: Autenticación Obligatoria en Reportes ---");
    // Llamada directa anónima a getFilteredReportsAction
    const anonReportsAction = await getFilteredReportsAction({});
    assert("getFilteredReportsAction anónimo denegado con success=false", anonReportsAction.success === false);
    assert(
      "getFilteredReportsAction devuelve mensaje de denegación por falta de sesión",
      anonReportsAction.error?.includes("Acceso denegado") === true
    );

    // Llamada directa anónima a exportReportCsvAction
    const anonCsvAction = await exportReportCsvAction("kpis", {});
    assert("exportReportCsvAction anónimo denegado con success=false", anonCsvAction.success === false);
    assert(
      "exportReportCsvAction devuelve mensaje de denegación por falta de sesión",
      anonCsvAction.error?.includes("Acceso denegado") === true
    );

    // Llamada directa en service layer con isAuthenticated = false
    let serviceRejected = false;
    try {
      await getReportsPageData({}, false);
    } catch (err: any) {
      if (err instanceof UnauthorizedError) serviceRejected = true;
    }
    assert("getReportsPageData(filters, false) arroja UnauthorizedError", serviceRejected);

    let csvServiceRejected = false;
    try {
      await generateReportCsv("kpis", {}, false);
    } catch (err: any) {
      if (err instanceof UnauthorizedError) csvServiceRejected = true;
    }
    assert("generateReportCsv(type, filters, false) arroja UnauthorizedError", csvServiceRejected);

    // Llamada autenticada en service layer (isAuthenticated = true)
    const authServiceData = await getReportsPageData({}, true);
    assert("getReportsPageData(filters, true) responde satisfactoriamente", authServiceData.kpis.ventasTotales === 5500);

    // -------------------------------------------------------------------------
    // 4. CERTIFICACIÓN H-02: CONTROL PERIMETRAL EN NEXT.JS 16 VÍA PROXY.TS
    // -------------------------------------------------------------------------
    console.log("\n--- 4. CERTIFICACIÓN H-02: Next.js 16 src/proxy.ts y Protección Perimetral ---");
    assert("Archivo src/proxy.ts existe físicamente", fs.existsSync(path.resolve(process.cwd(), "src/proxy.ts")));
    assert("Archivo deprecado middleware.ts NO existe", !fs.existsSync(path.resolve(process.cwd(), "src/middleware.ts")) && !fs.existsSync(path.resolve(process.cwd(), "middleware.ts")));
    assert("Página dedicada src/app/login/page.tsx existe", fs.existsSync(path.resolve(process.cwd(), "src/app/login/page.tsx")));

    // Matchers del Proxy: no deben contener /(admin)/
    const matchers = Array.isArray(proxyConfig.matcher) ? proxyConfig.matcher : [proxyConfig.matcher];
    const hasAdminRouteGroup = matchers.some((m) => m.includes("(admin)"));
    assert("Proxy matcher NO contiene el route group '(admin)'", !hasAdminRouteGroup);

    const expectedProtectedPaths = [
      "/dashboard",
      "/productos",
      "/inventario",
      "/ventas",
      "/clientes",
      "/proveedores",
      "/empleados",
      "/devoluciones",
      "/reportes",
      "/usuarios",
    ];
    const protectsAll = expectedProtectedPaths.every((p) => matchers.some((m) => m.startsWith(p)));
    assert("Proxy matcher cubre las rutas protegidas del sistema", protectsAll);

    // Simulación de navegación anónima a /dashboard -> Redirección a /login?from=%2Fdashboard
    const unauthReq = new NextRequest("http://localhost:3000/dashboard");
    const unauthRes = await proxy(unauthReq);
    assert("Petición anónima a /dashboard es interceptada por proxy", unauthRes.status === 307 || unauthRes.status === 308 || unauthRes.status === 302);
    const redirectLocation = unauthRes.headers.get("location");
    assert(
      "Proxy redirige a /login conservando query param 'from=%2Fdashboard'",
      redirectLocation !== null && redirectLocation.includes("/login?from=%2Fdashboard")
    );

    // Simulación con token inválido / adulterado
    const corruptReq = new NextRequest("http://localhost:3000/reportes", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=token_falso_adulterado_xyz` },
    });
    const corruptRes = await proxy(corruptReq);
    assert("Token adulterado es rechazado por proxy y redirigido a /login", corruptRes.status === 307 || corruptRes.status === 308 || corruptRes.status === 302);

    // Simulación con token JWT administrativo válido
    const secretKey = new TextEncoder().encode(process.env.AUTH_SESSION_SECRET || "mishutec_super_secret_admin_key_32chars!");
    const validToken = await new SignJWT({ username: "admin", userId: null, role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secretKey);
    const verifiedSession = await verifySessionToken(validToken);
    assert(
      "JWT administrativo incluye la identidad requerida por las sesiones individuales",
      verifiedSession?.username === "admin" &&
        verifiedSession.userId === null &&
        verifiedSession.role === "admin"
    );

    const validReq = new NextRequest("http://localhost:3000/ventas", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${validToken}` },
    });
    const validRes = await proxy(validReq);
    assert("Petición con JWT válido permite el paso (NextResponse.next())", validRes.status === 200 && !validRes.headers.get("location"));

    // -------------------------------------------------------------------------
    // 5. CERTIFICACIÓN H-03: DESGLOSE DE INDICADORES RMA
    // -------------------------------------------------------------------------
    console.log("\n--- 5. CERTIFICACIÓN H-03: Desglose de Indicadores RMA (A, B y C) ---");
    const retAnalytics = await getReturnsAnalytics({});
    const kpisMetrics = await getReportKpis({});

    const indA = retAnalytics.relacionRetornoVentas.tasaIncidenciaSolicitudes;
    const indB = retAnalytics.relacionRetornoVentas.tasaDevolucionAprobada;
    const indC = retAnalytics.relacionRetornoVentas.tasaReingresoKardex;

    assert("Indicador A: Incidencia bruta de solicitudes RMA = 53.33% (8 solicitudes / 15 ventas)", indA === 53.33);
    assert("Indicador B: Unidades aprobadas en trámites RMA = 40.00% (6 aprobadas / 15 ventas)", indB === 40.00);
    assert("Indicador C: Reingreso comprobado al inventario Kardex = 6.67% (1 reingreso / 15 ventas)", indC === 6.67);

    assert("KPIs globales exponen tasaIncidenciaSolicitudes = 53.33%", kpisMetrics.tasaIncidenciaSolicitudes === 53.33);
    assert("KPIs globales exponen tasaDevolucionAprobada = 40.00%", kpisMetrics.tasaDevolucionAprobada === 40.00);
    assert("KPIs globales exponen tasaReingresoKardex = 6.67%", kpisMetrics.tasaReingresoKardex === 6.67);
    assert("Unidades aprobadas totales = 6", kpisMetrics.unidadesAprobadasTotal === 6);
    assert("Unidades reingresadas a Kardex = 1 (Movimiento Kardex #52)", kpisMetrics.unidadesReingresadasKardex === 1);

    // -------------------------------------------------------------------------
    // 6. CERTIFICACIÓN H-04: DOCUMENTACIÓN DE POLÍTICA DE INVENTARIO
    // -------------------------------------------------------------------------
    console.log("\n--- 6. CERTIFICACIÓN H-04: Política de Restock y Documentación UI ---");
    const kpiCardsFile = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/reports/ReportKpiCards.tsx"),
      "utf-8"
    );
    assert(
      "ReportKpiCards NO contiene el texto equívoco 'Reingreso a almacén efectuado'",
      !kpiCardsFile.includes("Reingreso a almacén efectuado")
    );
    assert(
      "ReportKpiCards explicita el desglose de aprobadas vs en stock",
      kpiCardsFile.includes("unids. aprobadas") && kpiCardsFile.includes("en stock")
    );

    const returnsTabFile = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/reports/ReturnsAnalyticsTab.tsx"),
      "utf-8"
    );
    assert(
      "ReturnsAnalyticsTab documenta expresamente la Política de Reincorporación (H-04)",
      returnsTabFile.includes("Política de Reincorporación a Existencias (H-04)")
    );
    assert(
      "ReturnsAnalyticsTab expone visualmente el desglose metodológico A, B y C",
      returnsTabFile.includes("Indicador A: Incidencia Bruta") &&
      returnsTabFile.includes("Indicador B: Aprobación RMA") &&
      returnsTabFile.includes("Indicador C: Reingreso Kardex")
    );

    // -------------------------------------------------------------------------
    // 7. CERTIFICACIÓN H-05: INTEGRIDAD Y LEAST PRIVILEGE SQL SERVER
    // -------------------------------------------------------------------------
    console.log("\n--- 7. CERTIFICACIÓN H-05: Integridad Estricta y Principio de Menor Privilegio ---");
    const acadCounts = await poolAcad.request().query(`
      SELECT 
        (SELECT COUNT(*) FROM dbo.Producto) AS productos,
        (SELECT ISNULL(SUM(Stock), 0) FROM dbo.Producto) AS stock,
        (SELECT COUNT(*) FROM dbo.Venta) AS ventas,
        (SELECT ISNULL(SUM(Total_venta), 0) FROM dbo.Venta) AS totalVentas,
        (SELECT COUNT(*) FROM dbo.Detalle_Venta) AS detallesVenta,
        (SELECT COUNT(*) FROM dbo.Venta_Metodo_Pago) AS pagos,
        (SELECT COUNT(*) FROM dbo.Mov_Inventario) AS kardex,
        (SELECT COUNT(*) FROM dbo.Devolucion) AS devoluciones;
    `);
    const acad = acadCounts.recordset[0];

    assert("MishutecT2 (Académica) conserva exactamente 10 productos", Number(acad.productos) === 10);
    assert("MishutecT2 (Académica) conserva exactamente 73 unidades de stock", Number(acad.stock) === 73);
    assert("MishutecT2 (Académica) conserva exactamente 5 ventas", Number(acad.ventas) === 5);
    assert("MishutecT2 (Académica) conserva exactamente S/ 4,050.00 facturados", Number(acad.totalVentas) === 4050);
    assert("MishutecT2 (Académica) conserva exactamente 8 detalles de venta", Number(acad.detallesVenta) === 8);
    assert("MishutecT2 (Académica) conserva exactamente 6 pagos", Number(acad.pagos) === 6);
    assert("MishutecT2 (Académica) conserva exactamente 17 movimientos Kardex", Number(acad.kardex) === 17);
    assert("MishutecT2 (Académica) conserva exactamente 1 devolución histórica", Number(acad.devoluciones) === 1);

    const acepCounts = await poolAcep.request().query(`
      SELECT 
        (SELECT COUNT(*) FROM dbo.Producto) AS productos,
        (SELECT ISNULL(SUM(Stock), 0) FROM dbo.Producto) AS stock,
        (SELECT COUNT(*) FROM dbo.Venta) AS ventas,
        (SELECT ISNULL(SUM(Total_venta), 0) FROM dbo.Venta) AS totalVentas,
        (SELECT COUNT(*) FROM dbo.Detalle_Venta) AS detallesVenta,
        (SELECT COUNT(*) FROM dbo.Venta_Metodo_Pago) AS pagos,
        (SELECT COUNT(*) FROM dbo.Mov_Inventario) AS kardex,
        (SELECT COUNT(*) FROM dbo.Devolucion) AS devoluciones;
    `);
    const acep = acepCounts.recordset[0];

    assert("MishutecT2_Aceptacion conserva exactamente 12 productos", Number(acep.productos) === 12);
    assert("MishutecT2_Aceptacion conserva exactamente 76 unidades de stock", Number(acep.stock) === 76);
    assert("MishutecT2_Aceptacion conserva exactamente 9 ventas", Number(acep.ventas) === 9);
    assert("MishutecT2_Aceptacion conserva exactamente S/ 5,500.00 facturados", Number(acep.totalVentas) === 5500);
    assert("MishutecT2_Aceptacion conserva exactamente 13 detalles de venta", Number(acep.detallesVenta) === 13);
    assert("MishutecT2_Aceptacion conserva exactamente 11 pagos", Number(acep.pagos) === 11);
    assert("MishutecT2_Aceptacion conserva exactamente 31 movimientos Kardex", Number(acep.kardex) === 31);
    assert("MishutecT2_Aceptacion conserva exactamente 7 devoluciones", Number(acep.devoluciones) === 7);

    console.log("\n=======================================================================");
    console.log(` RESULTADO FINAL FASE 9B: ${passCount} PRUEBAS EXITOSAS / ${failCount} FALLIDAS`);
    console.log("=======================================================================");

    if (failCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Error inesperado en certificación de Fase 9B:", err);
    process.exit(1);
  } finally {
    await poolAcep.close();
    await poolAcad.close();
  }
}

runSecurityCertification();
