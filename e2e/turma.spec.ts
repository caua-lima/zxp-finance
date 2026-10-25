import { test, expect } from "@playwright/test";
import { CONTAS, entrar, unico } from "./ajuda";

test("admin cria turma e convite; aluno aceita; turma mostra acesso, não finanças", async ({ page, browser }) => {
  await entrar(page, CONTAS.admin);
  await page.goto("/acesso");
  const nomeTurma = unico("Turma e2e");
  await page.getByLabel("Nome da turma").fill(nomeTurma);
  await page.getByRole("button", { name: "Criar turma" }).click();
  const linha = page.getByRole("listitem").filter({ hasText: nomeTurma });
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
  await linha.getByRole("button", { name: new RegExp(nomeTurma) }).click();
  // .last(): o item da turma também contém o e-mail (lista dentro de lista)
  const pessoa = page.getByRole("listitem").filter({ hasText: email }).last();
  await expect(pessoa).toContainText("Ativo");
  await expect(pessoa).not.toContainText("R$");
});
