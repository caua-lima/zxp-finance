/**
 * Convites e concessões no emulador do Firestore (auditoria 25/10 B11).
 * Roda dentro de `npm run test:regras`.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { criarConvite, aceitarConvite } from "../src/lib/acesso/convitesServidor";
import { obterDocumento, criarSeNaoExiste } from "../src/lib/firestoreRest";
import { novaConcessao, Concessao } from "../src/lib/acesso/concessao";
import { gerarToken } from "../src/lib/acesso/convite";
import { aplicarAcaoNoServidor } from "../src/lib/acesso/acoesServidor";

const PROJETO = process.env.GCLOUD_PROJECT ?? "demo-zxp";
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const DIA = 86_400_000;

async function limparBanco() {
  await fetch(`http://${HOST}/emulator/v1/projects/${PROJETO}/databases/(default)/documents`, { method: "DELETE" });
}

describe("convite de uso único (B11)", () => {
  beforeEach(limparBanco);

  test("aceito cria a concessão da turma; segundo uso por outra pessoa é recusado", async () => {
    const { token } = await criarConvite({ criadoPor: "admin", turmaId: "turma-1", validadeLinkDias: 7, fimAcessoEm: Date.now() + 90 * DIA });
    const a = await aceitarConvite(token, "alunoA", null);
    assert.ok(a.ok);
    const c = await obterDocumento<Concessao>("acessos/alunoA");
    assert.equal(c?.estado, "ativo");
    assert.equal(c?.turmaId, "turma-1");
    const b = await aceitarConvite(token, "alunoB", null);
    assert.deepEqual(b, { ok: false, problema: "usado" });
    assert.equal(await obterDocumento("acessos/alunoB"), null);
  });

  test("a mesma pessoa repetindo o aceite (retry) é sucesso, sem duplicar", async () => {
    const { token } = await criarConvite({ criadoPor: "admin", turmaId: null, validadeLinkDias: 7, fimAcessoEm: null });
    assert.ok((await aceitarConvite(token, "alunoA", null)).ok);
    const de_novo = await aceitarConvite(token, "alunoA", null);
    assert.ok(de_novo.ok);
    assert.equal((await obterDocumento<Concessao>("acessos/alunoA"))?.versao, 1);
  });

  test("dois aceites ao mesmo tempo: só um leva", async () => {
    const { token } = await criarConvite({ criadoPor: "admin", turmaId: null, validadeLinkDias: 7, fimAcessoEm: null });
    const [x, y] = await Promise.all([aceitarConvite(token, "alunoX", null), aceitarConvite(token, "alunoY", null)]);
    assert.equal([x, y].filter((r) => r.ok).length, 1);
    const concessoes = [await obterDocumento("acessos/alunoX"), await obterDocumento("acessos/alunoY")].filter(Boolean);
    assert.equal(concessoes.length, 1);
  });

  test("convite amarrado a um e-mail: outro e-mail não aceita, o certo sim", async () => {
    const { token } = await criarConvite({ criadoPor: "admin", turmaId: null, validadeLinkDias: 7, fimAcessoEm: null, paraEmail: "Ana@Exemplo.com" });
    assert.deepEqual(await aceitarConvite(token, "intruso", "outro@exemplo.com"), { ok: false, problema: "outro_email" });
    assert.ok((await aceitarConvite(token, "ana", "ana@exemplo.com")).ok);
  });

  test("expirado e inexistente", async () => {
    const agora = Date.now();
    const { token } = await criarConvite({ criadoPor: "admin", turmaId: null, validadeLinkDias: 1, fimAcessoEm: null, agora: agora - 2 * DIA });
    assert.deepEqual(await aceitarConvite(token, "alunoA", null, agora), { ok: false, problema: "expirado" });
    assert.deepEqual(await aceitarConvite(gerarToken(), "alunoA", null), { ok: false, problema: "inexistente" });
  });

  test("quem tinha concessão legado passa pra da turma, com versão nova", async () => {
    await criarSeNaoExiste("acessos/alunoA", { ...novaConcessao("legado", Date.now()) });
    const { token } = await criarConvite({ criadoPor: "admin", turmaId: "turma-2", validadeLinkDias: 7, fimAcessoEm: null });
    assert.ok((await aceitarConvite(token, "alunoA", null)).ok);
    const c = await obterDocumento<Concessao>("acessos/alunoA");
    assert.equal(c?.origem, "convite");
    assert.equal(c?.turmaId, "turma-2");
    assert.equal(c?.versao, 2);
  });
});

describe("suspender, reativar e renovar (B14)", () => {
  beforeEach(limparBanco);

  test("suspender cancela as entregas pendentes e preserva as outras", async () => {
    await criarSeNaoExiste("acessos/alunoA", { ...novaConcessao("convite", Date.now(), { turmaId: "t1" }) });
    await criarSeNaoExiste("usuarios/alunoA/entregas/e1", { status: "pendente", proximaTentativaEm: 0 });
    await criarSeNaoExiste("usuarios/alunoA/entregas/e2", { status: "aceita" });
    const r = await aplicarAcaoNoServidor("alunoA", { tipo: "suspender", motivo: "pagamento pendente" });
    assert.ok(r.ok);
    assert.equal(r.ok && r.entregasCanceladas, 1);
    assert.equal((await obterDocumento<{ status: string }>("usuarios/alunoA/entregas/e1"))?.status, "cancelada");
    assert.equal((await obterDocumento<{ status: string }>("usuarios/alunoA/entregas/e2"))?.status, "aceita");
  });

  test("reativar e renovar preservam turma; versão sobe a cada ação", async () => {
    await criarSeNaoExiste("acessos/alunoA", { ...novaConcessao("convite", Date.now(), { turmaId: "t1" }) });
    await aplicarAcaoNoServidor("alunoA", { tipo: "suspender", motivo: "teste" });
    await aplicarAcaoNoServidor("alunoA", { tipo: "reativar" });
    const fim = Date.now() + 30 * DIA;
    await aplicarAcaoNoServidor("alunoA", { tipo: "renovar", fimEm: fim });
    const c = await obterDocumento<Concessao>("acessos/alunoA");
    assert.equal(c?.estado, "ativo");
    assert.equal(c?.turmaId, "t1");
    assert.equal(c?.fimEm, fim);
    assert.equal(c?.versao, 4);
  });

  test("duas ações ao mesmo tempo: nenhuma some (pré-condição de versão)", async () => {
    await criarSeNaoExiste("acessos/alunoA", { ...novaConcessao("convite", Date.now()) });
    const fim = Date.now() + 10 * DIA;
    const [a, b] = await Promise.all([
      aplicarAcaoNoServidor("alunoA", { tipo: "renovar", fimEm: fim }),
      aplicarAcaoNoServidor("alunoA", { tipo: "suspender", motivo: "teste" }),
    ]);
    assert.ok(a.ok && b.ok);
    const c = await obterDocumento<Concessao>("acessos/alunoA");
    assert.equal(c?.estado, "suspenso");
    assert.equal(c?.fimEm, fim);
    assert.equal(c?.versao, 3);
  });
});
