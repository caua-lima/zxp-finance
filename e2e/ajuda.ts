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

// ---- acesso direto ao emulador (Bearer owner), só pra preparar cenário ----
const FS = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8089";
const BASE_FS = `http://${FS}/v1/projects/demo-zxp/databases/(default)/documents`;

function valorFs(v: unknown): unknown {
  if (v === null) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v) };
}

export async function gravarNoEmulador(caminho: string, dados: Record<string, unknown>) {
  const r = await fetch(`${BASE_FS}/${caminho}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, valorFs(v)])) }),
  });
  if (!r.ok) throw new Error(`emulador: ${caminho} ${r.status}`);
}

/** Convite criado direto no emulador (mesmo formato do servidor). Devolve o token. */
export async function conviteNoEmulador(opcoes: { expiraEm?: number } = {}): Promise<string> {
  const { randomBytes, createHash } = await import("node:crypto");
  const token = randomBytes(32).toString("base64url");
  await gravarNoEmulador(`convites/${createHash("sha256").update(token).digest("hex")}`, {
    turmaId: "turma-e2e",
    criadoPor: "e2e",
    criadoEm: Date.now(),
    expiraEm: opcoes.expiraEm ?? Date.now() + 86_400_000,
    fimAcessoEm: null,
    usadoEm: null,
    usadoPor: null,
    revogadoEm: null,
  });
  return token;
}
