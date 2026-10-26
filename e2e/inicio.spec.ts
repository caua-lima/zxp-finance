import { test, expect } from "@playwright/test";
import { CONTAS, entrar, lerReais } from "./ajuda";

test("Início separa o que está na conta do que é previsão", async ({ page }) => {
  await entrar(page, CONTAS.cliente);
  await page.goto("/");
  await expect(page.getByText("Saldo na conta agora")).toBeVisible();
  await expect(page.getByText("Sobra", { exact: true })).toHaveCount(0);
  const previsto = page.getByText("Fim do mês (previsto)").locator("xpath=..");
  await expect(previsto).toBeVisible();
  await expect(page.getByText(/Previsto = na conta agora \+ vai entrar − falta pagar/)).toBeVisible();

  // o número previsto é exatamente conta + vai entrar − falta pagar
  const conta = lerReais(await page.getByText("Saldo na conta agora").locator("xpath=../..").innerText());
  const entra = lerReais(await page.getByText("Vai entrar", { exact: true }).first().locator("xpath=..").innerText());
  const paga = lerReais(await page.getByText("Falta pagar", { exact: true }).first().locator("xpath=..").innerText());
  expect(lerReais(await previsto.innerText())).toBeCloseTo(conta + entra - paga, 2);
});
