import { expect, Page } from "@playwright/test";

/** Contas sintéticas criadas por scripts/dev-emulador.mjs — só existem no emulador. */
export const CONTAS = {
  cliente: { email: "teste@zxp.local", senha: "senha-de-teste-123" },
  admin: { email: "admin@zxp.local", senha: "senha-de-teste-123" },
};

export async function entrar(page: Page, conta: { email: string; senha: string }) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(conta.email);
  await page.getByLabel("Senha", { exact: true }).fill(conta.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** "R$ 1.148,60" → 1148.6 */
export function lerReais(texto: string): number {
  const m = texto.match(/-?\s?R\$\s?-?[\d.]+,\d{2}/);
  if (!m) throw new Error(`sem valor em reais: ${texto}`);
  const negativo = m[0].includes("-");
  const n = Number(m[0].replace(/[^\d,]/g, "").replace(",", "."));
  return negativo ? -n : n;
}

/** Saldo do cartão "Na conta agora" na tela de Saldo. */
export async function saldoNaTela(page: Page): Promise<number> {
  const bloco = page.getByText(/na conta agora/i).locator("xpath=..");
  await expect(bloco).toContainText("R$");
  return lerReais(await bloco.innerText());
}

/** Descrição única por execução, pra o teste não depender de estado anterior. */
export const unico = (prefixo: string) => `${prefixo} ${Date.now().toString(36)}`;

/** Sair: no celular o botão fica dentro de "Mais". */
export async function sair(page: Page) {
  const sairVisivel = page.getByRole("button", { name: "Sair" }).filter({ visible: true });
  if ((await sairVisivel.count()) === 0) {
    await page.getByRole("button", { name: "Abrir todas as seções" }).filter({ visible: true }).first().click();
  }
  await page.getByRole("button", { name: "Sair" }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/login/);
}
