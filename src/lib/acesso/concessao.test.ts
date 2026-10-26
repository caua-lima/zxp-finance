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

describe("convite: token e validade", async () => {
  const { gerarToken, hashDoToken, tokenBemFormado, avaliarConvite } = await import("./convite");
  const conv = { turmaId: null, criadoPor: "adm", criadoEm: agora, expiraEm: agora + DIA, fimAcessoEm: null };

  test("token aleatório de 43 caracteres; o banco guarda só o hash", () => {
    const t = gerarToken();
    assert.ok(tokenBemFormado(t));
    assert.notEqual(gerarToken(), t);
    assert.match(hashDoToken(t), /^[0-9a-f]{64}$/);
    assert.ok(!tokenBemFormado("curto"));
    assert.ok(!tokenBemFormado(42));
  });

  test("usado, revogado e expirado não valem", () => {
    assert.equal(avaliarConvite(conv, agora), null);
    assert.equal(avaliarConvite({ ...conv, usadoEm: agora }, agora), "usado");
    assert.equal(avaliarConvite({ ...conv, revogadoEm: agora }, agora), "revogado");
    assert.equal(avaliarConvite(conv, agora + DIA), "expirado");
    assert.equal(avaliarConvite(null, agora), "inexistente");
  });
});

describe("turma: acesso sem finanças", async () => {
  const { idDeTurma, pessoaDaTurma, resumoDaTurma } = await import("./turmas");

  test("id legível e seguro pra caminho", () => {
    assert.equal(idDeTurma("Mentoria Março/2027 — Turma 1"), "mentoria-marco-2027-turma-1");
    assert.equal(idDeTurma("!!!"), "turma");
  });

  test("pessoa da turma: só acesso e login, dias restantes, resumo", () => {
    const c = novaConcessao("convite", agora, { fimEm: agora + 5 * DIA });
    const p = pessoaDaTurma("u1", c, { email: "a@b.c", ultimoLogin: null }, agora);
    assert.equal(p.diasRestantes, 5);
    assert.deepEqual(Object.keys(p).sort(), ["diasRestantes", "email", "estado", "fimEm", "inicioEm", "origem", "uid", "ultimoLogin"]);
    assert.deepEqual(resumoDaTurma([p]), { ativo: 1, suspenso: 0, encerrado: 0, vencendo: 1 });
  });
});

describe("convite em lote: prévia", async () => {
  const { prepararLote } = await import("./lote");
  const { avaliarConvite } = await import("./convite");

  test("válido, inválido, repetido e quem já tem acesso", () => {
    const linhas = prepararLote("Ana@Ex.com\nbeto@ex.com; ana@ex.com, nao-e-email\ncarla@ex.com", new Set(["carla@ex.com"]));
    assert.deepEqual(linhas.map((l) => [l.email, l.situacao]), [
      ["ana@ex.com", "novo"],
      ["beto@ex.com", "novo"],
      ["ana@ex.com", "repetido"],
      ["nao-e-email", "invalido"],
      ["carla@ex.com", "ja_tem_acesso"],
    ]);
  });

  test("convite amarrado confere o e-mail sem ligar pra maiúscula", () => {
    const c = { turmaId: null, criadoPor: "a", criadoEm: agora, expiraEm: agora + DIA, fimAcessoEm: null, paraEmail: "ana@ex.com" };
    assert.equal(avaliarConvite(c, agora, "ANA@ex.com"), null);
    assert.equal(avaliarConvite(c, agora, "beto@ex.com"), "outro_email");
    assert.equal(avaliarConvite(c, agora, null), "outro_email");
  });
});
