import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { avaliarAcesso, aplicarAcao, novaConcessao } from "./concessao";

const agora = 1_800_000_000_000;
const DIA = 86_400_000;
const exigir = { exigirConcessao: true };

describe("concessão de acesso da mentoria", () => {
  test("transição: sem exigir concessão, todo mundo logado passa", () => {
    assert.deepEqual(avaliarAcesso(null, { exigirConcessao: false }, agora), { liberado: true, motivo: null });
    assert.equal(avaliarAcesso(null, null, agora).liberado, true);
  });

  test("exigindo: sem concessão, suspensa, encerrada, expirada e futura não passam", () => {
    const c = novaConcessao("convite", agora - DIA);
    assert.equal(avaliarAcesso(null, exigir, agora).motivo, "sem_concessao");
    assert.equal(avaliarAcesso({ ...c, estado: "suspenso" }, exigir, agora).motivo, "suspenso");
    assert.equal(avaliarAcesso({ ...c, estado: "encerrado" }, exigir, agora).motivo, "encerrado");
    assert.equal(avaliarAcesso({ ...c, fimEm: agora }, exigir, agora).motivo, "expirado");
    assert.equal(avaliarAcesso({ ...c, inicioEm: agora + DIA }, exigir, agora).motivo, "ainda_nao_comecou");
    assert.equal(avaliarAcesso(c, exigir, agora).liberado, true);
  });

  test("suspender → reativar preserva tudo e sobe a versão", () => {
    const c = novaConcessao("convite", agora, { turmaId: "t1", fimEm: agora + 30 * DIA });
    const s = aplicarAcao(c, { tipo: "suspender", motivo: "pagamento pendente" }, agora + 1);
    assert.ok(s.ok);
    const r = aplicarAcao(s.concessao, { tipo: "reativar" }, agora + 2);
    assert.ok(r.ok);
    assert.equal(r.concessao.estado, "ativo");
    assert.equal(r.concessao.turmaId, "t1");
    assert.equal(r.concessao.fimEm, agora + 30 * DIA);
    assert.equal(r.concessao.versao, 3);
    assert.equal(r.concessao.motivo, undefined);
  });

  test("regras das ações", () => {
    const c = novaConcessao("admin", agora);
    assert.equal(aplicarAcao(c, { tipo: "reativar" }, agora).ok, false);
    assert.equal(aplicarAcao(c, { tipo: "renovar", fimEm: agora - 1 }, agora).ok, false);
    const enc = aplicarAcao(c, { tipo: "encerrar", motivo: "fim da turma" }, agora);
    assert.ok(enc.ok);
    assert.equal(aplicarAcao(enc.concessao, { tipo: "renovar", fimEm: null }, agora).ok, false);
    assert.equal(aplicarAcao(enc.concessao, { tipo: "suspender", motivo: "x" }, agora).ok, false);
  });
});

describe("concessão legado pra quem já usa o app", async () => {
  const { planejarConcessoesLegado } = await import("./legado");

  test("cria pra quem não tem, não mexe em quem tem, desativado entra suspenso", () => {
    const existentes = new Map([["b", novaConcessao("convite", agora)]]);
    const p = planejarConcessoesLegado(
      [{ uid: "a", disabled: false }, { uid: "b", disabled: false }, { uid: "c", disabled: true }],
      existentes,
      agora
    );
    assert.deepEqual(p.criar.map((c) => [c.uid, c.concessao.estado, c.concessao.origem]), [
      ["a", "ativo", "legado"],
      ["c", "suspenso", "legado"],
    ]);
    assert.equal(p.jaTem, 1);
    assert.equal(p.podeExigir, true);
  });

  test("não deixa ligar a exigência se alguém ativo ficaria trancado", () => {
    const existentes = new Map([["a", { ...novaConcessao("convite", agora), estado: "suspenso" as const }]]);
    const p = planejarConcessoesLegado([{ uid: "a", disabled: false }], existentes, agora);
    assert.equal(p.podeExigir, false);
  });

  test("rodar de novo não cria nada", () => {
    const primeira = planejarConcessoesLegado([{ uid: "a", disabled: false }], new Map(), agora);
    const depois = new Map(primeira.criar.map((c) => [c.uid, c.concessao]));
    assert.equal(planejarConcessoesLegado([{ uid: "a", disabled: false }], depois, agora).criar.length, 0);
  });
});
