import { defineConfig } from "@playwright/test";
import { execSync } from "node:child_process";

// Só limpa no fim se FOI este teste que subiu o servidor (porta 3100 livre
// agora). Servidor que você já tinha rodando não é encerrado.
if (process.platform === "win32" && !process.env.CI) {
  let ocupada = false;
  try {
    ocupada = /127\.0\.0\.1:3100\s+\S+\s+LISTENING/.test(execSync("netstat -ano -p tcp", { encoding: "utf8" }));
  } catch {
    ocupada = true;
  }
  if (!ocupada) process.env.PW_EMULADOR_PROPRIO = "1";
}

/**
 * Testes de navegador contra os EMULADORES (auditoria 25/10 A04): o
 * webServer sobe Auth + Firestore locais, semeia usuários sintéticos
 * (scripts/dev-emulador.mjs) e o app em http://localhost:3100. Nada toca
 * produção. Local usa o Chrome instalado; no CI, o Chromium do Playwright.
 *
 *   npm run test:e2e
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  // next dev compila cada rota na primeira chamada: a 1ª vez pode passar de 15 s
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3100",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "celular",
      use: {
        browserName: "chromium",
        ...(process.env.CI ? {} : { channel: "chrome" }),
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  // Windows: fecha o emulador que sobra quando o webServer cai (ver encerrar.ts)
  globalTeardown: "./e2e/encerrar.ts",
  webServer: {
    command: "npm run dev:emulador",
    url: "http://localhost:3100/login",
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
