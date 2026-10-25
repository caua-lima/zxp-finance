import { test, expect } from "@playwright/test";
import { conviteNoEmulador, gravarNoEmulador, sair, unico } from "./ajuda";

test.describe("convite da mentoria", () => {
  test.afterEach(async () => {
    // volta pra transição: não tranca as contas sem concessão dos outros testes
    await gravarNoEmulador("plataforma/config", { exigirConcessao: false });
  });

  test("abre o link, cria a conta e usa o app com a exigência ligada; o link não vale de novo", async ({ page }) => {
    await gravarNoEmulador("plataforma/config", { exigirConcessao: true });
    const token = await conviteNoEmulador();
    const email = `${unico("aluno").replace(/\s/g, "-")}@zxp.local`;

    await page.goto(`/convite#t=${token}`);
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel(/Crie uma senha/).fill("senha-de-teste-123");
    await page.getByRole("button", { name: "Criar conta e entrar" }).click();
    await expect(page).toHaveURL("http://localhost:3100/");

    // as regras exigem concessão: registrar só funciona se o convite criou uma
    await page.goto("/saldo");
    const descricao = unico("e2e primeiro registro");
    await page.getByPlaceholder(/25 almoço/).fill(`9,90 ${descricao}`);
    await page.getByRole("button", { name: "Anotar" }).click();
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText(descricao)).toBeVisible();

    await sair(page);
    await page.goto(`/convite#t=${token}`);
    await page.getByLabel("E-mail").fill(`outra-${email}`);
    await page.getByLabel(/Crie uma senha/).fill("senha-de-teste-123");
    await page.getByRole("button", { name: "Criar conta e entrar" }).click();
    await expect(page.getByText(/já foi usado/)).toBeVisible();
  });

  test("link expirado ou cortado explica o que fazer", async ({ page }) => {
    const vencido = await conviteNoEmulador({ expiraEm: Date.now() - 1000 });
    await page.goto(`/convite#t=${vencido}`);
    await page.getByLabel("E-mail").fill("x@zxp.local");
    await page.getByLabel(/Crie uma senha/).fill("senha-de-teste-123");
    await page.getByRole("button", { name: "Criar conta e entrar" }).click();
    await expect(page.getByText(/expirou/)).toBeVisible();

    await page.goto("/convite#t=cortado");
    await expect(page.getByText(/não está completo/)).toBeVisible();
  });
});
