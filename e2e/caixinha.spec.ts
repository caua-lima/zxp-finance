import { test, expect } from "@playwright/test";
import { CONTAS, entrar, lerReais, saldoNaTela } from "./ajuda";

// o seed tem a caixinha "Viagem" com R$ 700
test("guardar e resgatar: saldo e caixinha mudam juntos, total conservado", async ({ page }) => {
  await entrar(page, CONTAS.cliente);
  await page.goto("/saldo");
  const saldoAntes = await saldoNaTela(page);

  await page.goto("/caixinhas");
  const item = page.getByRole("listitem").filter({ hasText: "Viagem" });
  // o valor guardado é o número grande do item (o primeiro R$ é a estimativa de rendimento)
  const guardado = async () => lerReais(await item.locator("p.text-lg").innerText());
  const caixinhaAntes = await guardado();

  await item.getByRole("button", { name: "Guardar" }).click();
  const dialogoG = page.getByRole("dialog");
  await dialogoG.getByLabel("Valor").fill("50,00");
  await dialogoG.getByRole("button", { name: "Guardar" }).click();
  await expect.poll(guardado).toBeCloseTo(caixinhaAntes + 50, 2);

  await item.getByRole("button", { name: "Resgatar" }).click();
  const dialogoR = page.getByRole("dialog");
  await dialogoR.getByLabel("Valor").fill("20,00");
  await dialogoR.getByRole("button", { name: "Resgatar" }).click();
  await expect.poll(guardado).toBeCloseTo(caixinhaAntes + 30, 2);

  await page.goto("/saldo");
  await expect.poll(() => saldoNaTela(page)).toBeCloseTo(saldoAntes - 30, 2);

  // com dinheiro dentro, excluir é recusado
  await page.goto("/caixinhas");
  await item.getByRole("button", { name: "Excluir caixinha" }).click();
  await expect(page.getByRole("dialog")).toContainText("Resgate antes");
});
