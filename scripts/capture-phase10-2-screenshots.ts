import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9228;
const OUT_DIR = path.resolve(process.cwd(), "screenshots/phase10-2");
const ARTIFACT_DIR = "C:\\Users\\María Belén\\.gemini\\antigravity\\brain\\64874c06-ac7a-4d47-9605-a4e7fa94cea1";

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

class CDPClient {
  private ws!: WebSocket;
  private id = 1;
  private pending = new Map<number, { resolve: (res: any) => void; reject: (err: any) => void }>();

  async connect(wsUrl: string) {
    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data.toString());
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) {
            reject(new Error(msg.error.message));
          } else {
            resolve(msg.result);
          }
        }
      };
    });
  }

  async send(method: string, params: any = {}): Promise<any> {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function saveScreenshot(client: CDPClient, filename: string) {
  const res = await client.send("Page.captureScreenshot", { format: "png" });
  const buf = Buffer.from(res.data, "base64");
  const localPath = path.join(OUT_DIR, filename);
  const artifactPath = path.join(ARTIFACT_DIR, filename);
  fs.writeFileSync(localPath, buf);
  fs.writeFileSync(artifactPath, buf);
  console.log(`  ✓ Guardado: ${filename} (${buf.length} bytes)`);
}

async function run() {
  console.log("Iniciando Edge headless para captura de capturas Fase 10.2 (Claro vs Oscuro)...");
  const edgeArgs = [
    `--remote-debugging-port=${PORT}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${path.resolve(process.cwd(), ".tmp-edge-phase10-2-profile")}`,
    "about:blank",
  ];

  const edgeProc = spawn(EDGE_PATH, edgeArgs, { stdio: "ignore" });

  let wsUrl = "";
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) {
        const data = (await res.json()) as any;
        wsUrl = data.webSocketDebuggerUrl;
        break;
      }
    } catch {}
    await sleep(300);
  }

  if (!wsUrl) {
    edgeProc.kill();
    throw new Error("No fue posible conectar con Edge vía CDP en el puerto " + PORT);
  }

  const newTabRes = await fetch(`http://127.0.0.1:${PORT}/json/new`, { method: "PUT" });
  const tabData = (await newTabRes.json()) as any;
  const client = new CDPClient();
  await client.connect(tabData.webSocketDebuggerUrl);

  await client.send("Page.enable");
  await client.send("DOM.enable");
  await client.send("Runtime.enable");

  // Resolución de captura: 1440x900
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const views = [
    { name: "01-ventas", url: "http://localhost:3000/ventas", desc: "Módulo POS y Desglose IGV" },
    { name: "02-caja", url: "http://localhost:3000/caja", desc: "Caja Diaria y Pestaña Egresos" },
    { name: "03-proveedores", url: "http://localhost:3000/proveedores", desc: "Proveedores y Suministro" },
    { name: "04-empleados", url: "http://localhost:3000/empleados", desc: "Empleados y Personal" },
    { name: "05-reportes", url: "http://localhost:3000/reportes", desc: "Reportes Financieros y Tributarios" },
  ];

  for (const v of views) {
    console.log(`\nCapturando ${v.desc}...`);

    // Modo Claro
    await client.send("Page.navigate", { url: v.url });
    await sleep(1500);
    await client.send("Runtime.evaluate", {
      expression: `
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('mishutec-theme', 'light');
      `,
    });
    await sleep(500);
    await saveScreenshot(client, `${v.name}-light.png`);

    // Modo Oscuro
    await client.send("Runtime.evaluate", {
      expression: `
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('mishutec-theme', 'dark');
      `,
    });
    await sleep(500);
    await saveScreenshot(client, `${v.name}-dark.png`);
  }

  // Captura especial: Pestaña de Egresos en Caja en Modo Oscuro
  console.log("\nCapturando Pestaña de Egresos en Caja (Modo Oscuro)...");
  await client.send("Page.navigate", { url: "http://localhost:3000/caja" });
  await sleep(1500);
  await client.send("Runtime.evaluate", {
    expression: `
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      // Buscar botón de la pestaña egresos y hacer click
      const buttons = Array.from(document.querySelectorAll('button'));
      const egresosBtn = buttons.find(b => b.textContent && b.textContent.includes('Gestión de Egresos'));
      if (egresosBtn) egresosBtn.click();
    `,
  });
  await sleep(800);
  await saveScreenshot(client, `06-caja-egresos-dark.png`);

  client.close();
  edgeProc.kill();
  console.log("\n✨ ¡Todas las capturas comparativas (Claro vs Oscuro) fueron generadas exitosamente! ✨");
}

run().catch((err) => {
  console.error("Error capturando pantallas:", err);
  process.exit(1);
});
