import { test, expect } from "@playwright/test";
import { CONTAS, entrar, saldoNaTela } from "./ajuda";

// o seed tem "Salário" recorrente de R$ 2.600 (6% de imposto → R$ 2.444 líquidos)
test("recebido entra no saldo uma vez (líquido) e desmarcar desfaz", async ({ page }) => {
  await entrar(page, CONTAS.cliente);

  await page.goto("/perfil");
  const opcao = page.getByRole("checkbox", { name: /Recebido entra no saldo/ });
  await expect(opcao).toBeEnabled();
  // a caixa reflete o valor salvo: clica e espera o banco confirmar
  if (!(await opcao.isChecked())) await opcao.click();
  await expect(opcao).toBeChecked();

  await page.goto("/saldo");
  const antes = await saldoNaTela(page);

  await page.goto("/ganhos");
  await page.getByRole("button", { name: /marcar como recebido/ }).first().click();
  await expect(page.getByRole("button", { name: "✓ Recebido" }).first()).toBeVisible();

  await page.goto("/saldo");
  await expect.poll(() => saldoNaTela(page)).toBeCloseTo(antes + 2444, 2);

  // marcar de novo não duplica (já está recebido): desmarca e confere a volta
  await page.goto("/ganhos");
  await page.getByRole("button", { name: "✓ Recebido" }).first().click();
  await expect(page.getByRole("button", { name: /marcar como recebido/ }).first()).toBeVisible();
  await page.goto("/saldo");
  await expect.poll(() => saldoNaTela(page)).toBeCloseTo(antes, 2);

  // desliga de novo (estado do seed pros outros testes)
  await page.goto("/perfil");
  const desligar = page.getByRole("checkbox", { name: /Recebido entra no saldo/ });
  await expect(desligar).toBeEnabled();
  await desligar.click();
  await expect(desligar).not.toBeChecked();
});
