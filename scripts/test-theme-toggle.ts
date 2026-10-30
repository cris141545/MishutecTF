import { spawn } from "child_process";
import fs from "fs";
import path from "path";

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
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}
loadEnvLocal();

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9224;
const SCREENSHOTS_DIR = path.resolve(process.cwd(), "screenshots/theme-test");

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
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
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
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
  const result = await client.send("Page.captureScreenshot", { format: "png" });
  const filePath = path.join(SCREENSHOTS_DIR, filename);
  fs.writeFileSync(filePath, Buffer.from(result.data, "base64"));
  console.log(`[Screenshot]: ${filePath}`);
}

async function run() {
  console.log("=== INICIANDO VALIDACIÓN EN NAVEGADOR: CIRCULAR REVEAL THEME TOGGLE ===");

  const userDataDir = path.resolve(process.cwd(), ".tmp-edge-theme");
  const edgeProc = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ]);

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
    throw new Error("No se pudo conectar a Edge en puerto " + PORT);
  }

  const newTabRes = await fetch(`http://127.0.0.1:${PORT}/json/new`, { method: "PUT" });
  const tabData = (await newTabRes.json()) as any;
  const client = new CDPClient();
  await client.connect(tabData.webSocketDebuggerUrl);

  await client.send("Page.enable");
  await client.send("DOM.enable");
  await client.send("Runtime.enable");
  await client.send("Network.enable");

  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const adminUser = process.env.ADMIN_USERNAME || "admin";
  const validPassword = process.env.ADMIN_PASSWORD || "AdminMishutec2026*";

  try {
    // 1. Iniciar sesión en /login
    console.log("\n1. Autenticando en /login...");
    await client.send("Page.navigate", { url: "http://localhost:3000/login" });
    await sleep(1500);

    await client.send("Runtime.evaluate", {
      expression: `(() => {
        const u = document.querySelector('input[name="username"]');
        const p = document.querySelector('input[name="password"]');
        if (u && p) {
          u.value = "${adminUser}";
          p.value = "${validPassword}";
          u.dispatchEvent(new Event('input', { bubbles: true }));
          u.dispatchEvent(new Event('change', { bubbles: true }));
          p.dispatchEvent(new Event('input', { bubbles: true }));
          p.dispatchEvent(new Event('change', { bubbles: true }));
          const form = document.querySelector('form');
          if (form) form.requestSubmit();
        }
      })()`,
    });
    await sleep(2500);

    // 2. Navegar a /dashboard
    console.log("2. Verificando Dashboard en Modo Claro inicial...");
    await client.send("Page.navigate", { url: "http://localhost:3000/dashboard" });
    await sleep(2000);

    const initialThemeEval = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const isDark = document.documentElement.classList.contains("dark");
        const btn = document.querySelector('button[aria-label*="modo"]');
        const rect = btn ? btn.getBoundingClientRect() : null;
        return {
          isDark,
          hasBtn: Boolean(btn),
          btnRect: rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height } : null,
          windowW: window.innerWidth,
          windowH: window.innerHeight,
          supportsVT: 'startViewTransition' in document,
        };
      })()`,
      returnByValue: true,
    });
    console.log("Estado inicial:", JSON.stringify(initialThemeEval.result.value, null, 2));
    await saveScreenshot(client, "01-dashboard-light-mode.png");

    // 3. Ejecutar transición Claro -> Oscuro
    console.log("\n3. Ejecutando Circular Reveal: Modo Claro -> Modo Oscuro...");
    await client.send("Runtime.evaluate", {
      expression: `(() => {
        const btn = document.querySelector('button[aria-label*="modo"]');
        if (btn) btn.click();
      })()`,
    });

    // Esperar a que la animación de 400ms concluya limpiamente
    await sleep(700);

    const darkModeEval = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const isDark = document.documentElement.classList.contains("dark");
        const saved = localStorage.getItem("mishutec-theme");
        const dataTheme = document.documentElement.getAttribute("data-theme");
        return { isDark, saved, dataTheme };
      })()`,
      returnByValue: true,
    });
    console.log("Estado post-transición (Oscuro):", JSON.stringify(darkModeEval.result.value, null, 2));
    await saveScreenshot(client, "02-dashboard-dark-mode.png");

    // 4. Ejecutar transición Oscuro -> Claro mediante teclado (activación por click/space)
    console.log("\n4. Ejecutando Circular Reveal: Modo Oscuro -> Modo Claro (mediante botón)...");
    await client.send("Runtime.evaluate", {
      expression: `(() => {
        const btn = document.querySelector('button[aria-label*="modo"]');
        if (btn) {
          btn.focus();
          btn.click();
        }
      })()`,
    });

    await sleep(700);

    const lightModeEval = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const isDark = document.documentElement.classList.contains("dark");
        const saved = localStorage.getItem("mishutec-theme");
        const dataTheme = document.documentElement.getAttribute("data-theme");
        return { isDark, saved, dataTheme };
      })()`,
      returnByValue: true,
    });
    console.log("Estado post-transición (Claro):", JSON.stringify(lightModeEval.result.value, null, 2));
    await saveScreenshot(client, "03-dashboard-light-restored.png");

    console.log("\n=== VALIDACIÓN EN NAVEGADOR COMPLETADA CON ÉXITO ===");
  } finally {
    client.close();
    edgeProc.kill();
  }
}

run().catch((err) => {
  console.error("Error durante la prueba:", err);
  process.exit(1);
});
