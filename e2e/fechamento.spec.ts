import { test, expect, Page } from "@playwright/test";
import { CONTAS, entrar } from "./ajuda";

async function fecharMes(page: Page): Promise<number> {
  await page.getByRole("button", { name: "Fechar mês" }).click();
  const dialogo = page.getByRole("dialog", { name: "Fechar mês" });
  await dialogo.getByRole("button", { name: "Fechar" }).click();
  await expect(dialogo).toBeHidden();
  const aviso = page.getByText(/Este mês está fechado \(versão \d+\)/);
  await expect(aviso).toBeVisible();
  return Number((await aviso.innerText()).match(/versão (\d+)/)![1]);
}

async function reabrirMes(page: Page, motivo: string) {
  await page.getByRole("button", { name: /Reabrir/ }).first().click();
  const dialogo = page.getByRole("dialog", { name: "Reabrir mês" });
  await dialogo.getByLabel("Motivo").fill(motivo);
  await dialogo.getByRole("button", { name: "Reabrir" }).click();
  await expect(dialogo).toBeHidden();
  await expect(page.getByText(/Este mês está fechado/)).toHaveCount(0);
}

test("fechar, reabrir com motivo e fechar de novo cria a versão seguinte", async ({ page }) => {
  await entrar(page, CONTAS.cliente);
  await page.goto("/dre");

  const primeira = await fecharMes(page);
  await expect(page.getByText(/Resultado no fechamento/)).toBeVisible();

  await reabrirMes(page, "lancei a fatura errada");
  const segunda = await fecharMes(page);
  expect(segunda).toBe(primeira + 1);

  // deixa aberto pros outros testes
  await reabrirMes(page, "fim do teste");
});
