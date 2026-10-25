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
    const a = await aceitarConvite(token, "alunoA");
    assert.ok(a.ok);
    const c = await obterDocumento<Concessao>("acessos/alunoA");
    assert.equal(c?.estado, "ativo");
    assert.equal(c?.turmaId, "turma-1");
    const b = await aceitarConvite(token, "alunoB");
    assert.deepEqual(b, { ok: false, problema: "usado" });
    assert.equal(await obterDocumento("acessos/alunoB"), null);
  });

  test("a mesma pessoa repetindo o aceite (retry) é sucesso, sem duplicar", async () => {
    const { token } = await criarConvite({ criadoPor: "admin", turmaId: null, validadeLinkDias: 7, fimAcessoEm: null });
    assert.ok((await aceitarConvite(token, "alunoA")).ok);
    const de_novo = await aceitarConvite(token, "alunoA");
    assert.ok(de_novo.ok);
    assert.equal((await obterDocumento<Concessao>("acessos/alunoA"))?.versao, 1);
  });

  test("dois aceites ao mesmo tempo: só um leva", async () => {
    const { token } = await criarConvite({ criadoPor: "admin", turmaId: null, validadeLinkDias: 7, fimAcessoEm: null });
    const [x, y] = await Promise.all([aceitarConvite(token, "alunoX"), aceitarConvite(token, "alunoY")]);
    assert.equal([x, y].filter((r) => r.ok).length, 1);
    const concessoes = [await obterDocumento("acessos/alunoX"), await obterDocumento("acessos/alunoY")].filter(Boolean);
    assert.equal(concessoes.length, 1);
  });

  test("expirado e inexistente", async () => {
    const agora = Date.now();
    const { token } = await criarConvite({ criadoPor: "admin", turmaId: null, validadeLinkDias: 1, fimAcessoEm: null, agora: agora - 2 * DIA });
    assert.deepEqual(await aceitarConvite(token, "alunoA", agora), { ok: false, problema: "expirado" });
    assert.deepEqual(await aceitarConvite(gerarToken(), "alunoA"), { ok: false, problema: "inexistente" });
  });

  test("quem tinha concessão legado passa pra da turma, com versão nova", async () => {
    await criarSeNaoExiste("acessos/alunoA", { ...novaConcessao("legado", Date.now()) });
    const { token } = await criarConvite({ criadoPor: "admin", turmaId: "turma-2", validadeLinkDias: 7, fimAcessoEm: null });
    assert.ok((await aceitarConvite(token, "alunoA")).ok);
    const c = await obterDocumento<Concessao>("acessos/alunoA");
    assert.equal(c?.origem, "convite");
    assert.equal(c?.turmaId, "turma-2");
    assert.equal(c?.versao, 2);
  });
});
