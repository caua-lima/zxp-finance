import { test, expect } from "@playwright/test";
import { CONTAS, entrar } from "./ajuda";

test("fechar, reabrir com motivo e fechar de novo cria a versão 2", async ({ page }) => {
  await entrar(page, CONTAS.cliente);
  await page.goto("/dre");

  await page.getByRole("button", { name: "Fechar mês" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Fechar" }).click();
  await expect(page.getByText(/Este mês está fechado \(versão 1\)/)).toBeVisible();
  await expect(page.getByText(/Resultado no fechamento/)).toBeVisible();

  await page.getByRole("button", { name: /Reabrir/ }).first().click();
  const dialogo = page.getByRole("dialog", { name: "Reabrir mês" });
  await dialogo.getByLabel("Motivo").fill("lancei a fatura errada");
  await dialogo.getByRole("button", { name: "Reabrir" }).click();
  await expect(page.getByText(/Este mês está fechado/)).toHaveCount(0);

  await page.getByRole("button", { name: "Fechar mês" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Fechar" }).click();
  await expect(page.getByText(/Este mês está fechado \(versão 2\)/)).toBeVisible();

  // deixa aberto pros outros testes
  await page.getByRole("button", { name: /Reabrir/ }).first().click();
  const d2 = page.getByRole("dialog", { name: "Reabrir mês" });
  await d2.getByLabel("Motivo").fill("fim do teste");
  await d2.getByRole("button", { name: "Reabrir" }).click();
  await expect(page.getByText(/Este mês está fechado/)).toHaveCount(0);
});
