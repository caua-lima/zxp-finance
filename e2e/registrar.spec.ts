import { test, expect } from "@playwright/test";
import { CONTAS, entrar, saldoNaTela, unico } from "./ajuda";

test.describe("registrar no dia a dia", () => {
  test("registro da conta sai do saldo uma vez (valor + cofrinho)", async ({ page }) => {
    await entrar(page, CONTAS.cliente);
    await page.goto("/saldo");
    const antes = await saldoNaTela(page);

    const descricao = unico("e2e padaria");
    await page.getByPlaceholder(/25 almoço/).fill(`12,34 ${descricao}`);
    await page.getByRole("button", { name: "Anotar" }).click();
    await expect(page.locator("#previa-categoria")).toHaveValue("Alimentação");
    await page.getByRole("button", { name: "Confirmar" }).click();

    await expect(page.getByText("✓ Salvo: R$ 12,34")).toBeVisible();
    await expect(page.getByText(descricao)).toBeVisible();
    // o seed tem uma caixinha que guarda R$ 0,10 por registro
    await expect.poll(() => saldoNaTela(page)).toBeCloseTo(antes - 12.44, 2);
  });

  test("compra no crédito não sai do saldo (só o cofrinho)", async ({ page }) => {
    await entrar(page, CONTAS.cliente);
    await page.goto("/saldo");
    const antes = await saldoNaTela(page);

    const descricao = unico("e2e perfume");
    await page.getByPlaceholder(/25 almoço/).fill(`200 ${descricao} no cartão`);
    await page.getByRole("button", { name: "Anotar" }).click();
    await expect(page.getByRole("radio", { name: "Cartão de crédito" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Confirmar" }).click();

    await expect(page.getByText(descricao)).toBeVisible();
    await expect.poll(() => saldoNaTela(page)).toBeCloseTo(antes - 0.1, 2);
  });

  test("clique duplo no Confirmar grava um registro só", async ({ page }) => {
    await entrar(page, CONTAS.cliente);
    await page.goto("/saldo");
    const descricao = unico("e2e duplo");
    await page.getByPlaceholder(/25 almoço/).fill(`5 ${descricao}`);
    await page.getByRole("button", { name: "Anotar" }).click();
    const confirmar = page.getByRole("button", { name: "Confirmar" });
    await confirmar.dblclick();
    await expect(page.getByText(descricao)).toHaveCount(1);
  });
});
