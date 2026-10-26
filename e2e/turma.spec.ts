import { test, expect } from "@playwright/test";
import { CONTAS, entrar, gravarNoEmulador, uidNoEmulador, unico } from "./ajuda";

test.afterEach(async () => {
  await gravarNoEmulador("plataforma/config", { exigirConcessao: false });
});

test("turma: convite, aceite, suspensão e reativação — sem expor finanças", async ({ page, browser }) => {
  await entrar(page, CONTAS.admin);
  await page.goto("/acesso");
  const nomeTurma = unico("Turma e2e");
  await page.getByLabel("Nome da turma").fill(nomeTurma);
  await page.getByRole("button", { name: "Criar turma" }).click();
  const mentoria = page.getByRole("region", { name: "Mentoria" });
  const linha = mentoria.getByRole("listitem").filter({ hasText: nomeTurma }).first();
  await linha.getByRole("button", { name: "Gerar convite" }).click();
  const link = await page.getByLabel("Link do convite").inputValue();
  expect(link).toMatch(/\/convite#t=[A-Za-z0-9_-]{43}$/);

  // o aluno abre o link em outro navegador, sem conta
  const aluno = await (await browser.newContext()).newPage();
  const email = `${unico("aluno-turma").replace(/\s/g, "-")}@zxp.local`;
  await aluno.goto(link);
  await aluno.getByLabel("E-mail").fill(email);
  await aluno.getByLabel(/Crie uma senha/).fill("senha-de-teste-123");
  await aluno.getByRole("button", { name: "Criar conta e entrar" }).click();
  await expect(aluno).toHaveURL("http://localhost:3100/");

  // a turma mostra a pessoa ativa — e nada de saldo/registro dela
  const abrir = linha.getByRole("button", { name: new RegExp(nomeTurma) });
  await abrir.click();
  await expect(abrir).toHaveAttribute("aria-expanded", "true");
  // .last(): o item da turma também contém o e-mail (lista dentro de lista);
  // só dentro da região Mentoria (a lista de logins abaixo também tem o e-mail)
  const pessoa = mentoria.getByRole("listitem").filter({ hasText: email }).last();
  await expect(pessoa).toContainText("Ativo");
  await expect(pessoa).not.toContainText("R$");

  // liga a exigência (o admin do seed recebe concessão, como o script de legado faria)
  const adminUid = await uidNoEmulador(CONTAS.admin);
  await gravarNoEmulador(`acessos/${adminUid}`, { estado: "ativo", origem: "legado", inicioEm: 0, versao: 1 });
  await gravarNoEmulador("plataforma/config", { exigirConcessao: true });

  // suspende → o aluno vê o motivo, não uma tela quebrada
  await pessoa.getByRole("button", { name: "Suspender" }).click();
  const dialogo = page.getByRole("dialog", { name: "Suspender acesso" });
  await dialogo.getByLabel("Motivo").fill("pagamento pendente");
  await dialogo.getByRole("button", { name: "Suspender" }).click();
  await expect(pessoa).toContainText("Suspenso");
  await aluno.reload();
  await expect(aluno.getByRole("heading", { name: "Acesso indisponível" })).toBeVisible();
  await expect(aluno.getByText(/suspenso/)).toBeVisible();

  // reativa → o aluno volta
  await pessoa.getByRole("button", { name: "Reativar" }).click();
  await expect(pessoa).toContainText("Ativo");
  await aluno.reload();
  await expect(aluno.getByRole("heading", { name: "Início" })).toBeVisible();
});
