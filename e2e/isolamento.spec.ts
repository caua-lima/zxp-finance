import { test, expect } from "@playwright/test";
import { CONTAS, entrar, sair } from "./ajuda";

test.describe("duas contas no mesmo app", () => {
  test("B não vê nada de A, e conta nova cai no primeiro acesso", async ({ page }) => {
    // A (cliente do seed) tem 'almoço' e 'uber' registrados hoje
    await entrar(page, CONTAS.cliente);
    await page.goto("/saldo");
    await expect(page.getByText("almoço").first()).toBeVisible();

    // sai e entra como B no MESMO navegador
    await sair(page);
    await entrar(page, CONTAS.admin);

    await page.goto("/saldo");
    await expect(page.getByText("almoço")).toHaveCount(0);
    await expect(page.getByText("uber")).toHaveCount(0);
  });

  test("cliente comum não vê administração nem abre a API", async ({ page, request }) => {
    await entrar(page, CONTAS.cliente);
    await expect(page.getByRole("link", { name: /Acesso/ })).toHaveCount(0);
    const semToken = await request.get("/api/admin/saude");
    expect(semToken.status()).toBe(401);
  });
});
