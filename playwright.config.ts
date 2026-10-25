import { defineConfig } from "@playwright/test";

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
  expect: { timeout: 15_000 },
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
  webServer: {
    command: "npm run dev:emulador",
    url: "http://localhost:3100/login",
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
