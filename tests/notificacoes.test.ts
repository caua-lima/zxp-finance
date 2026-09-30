/**
 * Integração do servidor de notificações com o Firestore do emulador
 * (auditoria N01/N03, matriz 10 e 12). O provedor de push é simulado: isto
 * prova idempotência, retry e limpeza — NÃO prova que o aviso aparece num
 * iPhone/Android de verdade (isso fica no checklist manual de aparelhos).
 *
 * Roda junto com as regras: npm run test:regras
 * (emulators:exec define FIRESTORE_EMULATOR_HOST pro firestoreRest.)
 */
import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import webpush from "web-push";
import {
  cadastrarAparelho,
  revogarAparelho,
  materializar,
  processarEntregas,
  contadoresZerados,
  idAparelho,
} from "../src/lib/notificacoes/servidor";
import { preferenciasPadrao } from "../src/lib/notificacoes/regras";
import { listarDocumentos, obterDocumento } from "../src/lib/firestoreRest";

const PROJETO = process.env.GCLOUD_PROJECT ?? "demo-zxp";
const HOST = process.env.FIRESTORE_EMULATOR_HOST;

async function limparBanco() {
  await fetch(`http://${HOST}/emulator/v1/projects/${PROJETO}/databases/(default)/documents`, {
    method: "DELETE",
  });
}

const chaves = { p256dh: "B".repeat(87), auth: "a".repeat(22) };
const endpoint = (n: string) => `https://fcm.googleapis.com/fcm/send/${n}`;
const prefs = preferenciasPadrao(false);

function evento(id: string, validoAte = Date.now() + 3_600_000) {
  return {
    id,
    tipo: "vencimento" as const,
    conteudo: { titulo: "Fatura vence amanhã", corpo: "R$ 100,00", url: "/fatura" },
    diaLocal: "2026-10-04",
    validoAte,
  };
}

function simularPush(resposta: () => Promise<{ statusCode: number }>) {
  return mock.method(webpush, "sendNotification", resposta);
}

describe("notificações no servidor (emulador)", { skip: !HOST && "sem emulador" }, () => {
  beforeEach(async () => {
    mock.restoreAll();
    await limparBanco();
  });

  test("cadastro recusa endereço interno (SSRF) e aceita provedor real", async () => {
    const ruim = await cadastrarAparelho("userA", "https://169.254.169.254/x", chaves);
    assert.equal(ruim.ok, false);
    const bom = await cadastrarAparelho("userA", endpoint("a1"), chaves);
    assert.equal(bom.ok, true);
  });

  test("mesmo aparelho em outra conta: o vínculo anterior some (N01, matriz 10)", async () => {
    await cadastrarAparelho("userA", endpoint("compartilhado"), chaves);
    await cadastrarAparelho("userB", endpoint("compartilhado"), chaves);
    const id = idAparelho(endpoint("compartilhado"));
    assert.equal(await obterDocumento(`usuarios/userA/pushInscricoes/${id}`), null);
    assert.notEqual(await obterDocumento(`usuarios/userB/pushInscricoes/${id}`), null);
    assert.deepEqual((await obterDocumento<{ uid: string }>(`pushAparelhos/${id}`))?.uid, "userB");
  });

  test("revogar pelo aparelho (logout, até sem sessão) remove vínculo e índice", async () => {
    const r = await cadastrarAparelho("userA", endpoint("sair"), chaves);
    assert.ok(r.ok);
    await revogarAparelho(idAparelho(endpoint("sair")));
    assert.equal((await listarDocumentos("usuarios/userA/pushInscricoes")).length, 0);
  });

  test("materializar duas vezes não duplica aviso nem entrega (N03)", async () => {
    const r = await cadastrarAparelho("userA", endpoint("a1"), chaves);
    assert.ok(r.ok);
    const c1 = contadoresZerados();
    await materializar("userA", [evento("n1")], [r.aparelho], prefs, c1);
    const c2 = contadoresZerados();
    await materializar("userA", [evento("n1")], [r.aparelho], prefs, c2);
    assert.equal(c1.notificacoesCriadas, 1);
    assert.equal(c2.notificacoesCriadas, 0);
    assert.equal(c2.entregasCriadas, 0);
    assert.equal((await listarDocumentos("usuarios/userA/entregas")).length, 1);
  });

  test("aceito uma vez, nunca reenviado", async () => {
    const r = await cadastrarAparelho("userA", endpoint("a1"), chaves);
    assert.ok(r.ok);
    await materializar("userA", [evento("n1")], [r.aparelho], prefs, contadoresZerados());
    const envio = simularPush(async () => ({ statusCode: 201 }));
    const c = contadoresZerados();
    await processarEntregas("userA", prefs, Date.now(), c);
    await processarEntregas("userA", prefs, Date.now(), c);
    assert.equal(envio.mock.callCount(), 1);
    assert.equal(c.aceitas, 1);
  });

  test("5xx reagenda com espera; antes da hora não tenta de novo", async () => {
    const r = await cadastrarAparelho("userA", endpoint("a1"), chaves);
    assert.ok(r.ok);
    await materializar("userA", [evento("n1")], [r.aparelho], prefs, contadoresZerados());
    const envio = simularPush(async () => {
      throw Object.assign(new Error("indisponível"), { statusCode: 503, headers: {} });
    });
    const c = contadoresZerados();
    const agora = Date.now();
    await processarEntregas("userA", prefs, agora, c);
    await processarEntregas("userA", prefs, agora + 1000, c);
    assert.equal(envio.mock.callCount(), 1);
    assert.equal(c.reagendadas, 1);
  });

  test("404/410 encerra a inscrição (N03)", async () => {
    const r = await cadastrarAparelho("userA", endpoint("morto"), chaves);
    assert.ok(r.ok);
    await materializar("userA", [evento("n1")], [r.aparelho], prefs, contadoresZerados());
    simularPush(async () => {
      throw Object.assign(new Error("gone"), { statusCode: 410, headers: {} });
    });
    const c = contadoresZerados();
    await processarEntregas("userA", prefs, Date.now(), c);
    assert.equal(c.inscricoesEncerradas, 1);
    assert.equal((await listarDocumentos("usuarios/userA/pushInscricoes")).length, 0);
  });

  test("VAPID inválida (401) é incidente de configuração e NÃO apaga inscrição", async () => {
    const r = await cadastrarAparelho("userA", endpoint("a1"), chaves);
    assert.ok(r.ok);
    await materializar("userA", [evento("n1")], [r.aparelho], prefs, contadoresZerados());
    simularPush(async () => {
      throw Object.assign(new Error("unauthorized"), { statusCode: 401, headers: {} });
    });
    const c = contadoresZerados();
    const resultado = await processarEntregas("userA", prefs, Date.now(), c);
    assert.equal(resultado.incidenteConfig, true);
    assert.equal((await listarDocumentos("usuarios/userA/pushInscricoes")).length, 1);
  });

  test("aviso vencido expira sem ser enviado (catch-up não manda mensagem velha)", async () => {
    const r = await cadastrarAparelho("userA", endpoint("a1"), chaves);
    assert.ok(r.ok);
    await materializar("userA", [evento("velho", Date.now() - 1000)], [r.aparelho], prefs, contadoresZerados());
    const envio = simularPush(async () => ({ statusCode: 201 }));
    const c = contadoresZerados();
    await processarEntregas("userA", prefs, Date.now(), c);
    assert.equal(envio.mock.callCount(), 0);
    assert.equal(c.expiradas, 1);
  });

  test("preferência desligada: aviso não vira push", async () => {
    const r = await cadastrarAparelho("userA", endpoint("a1"), chaves);
    assert.ok(r.ok);
    const semVencimentos = { ...prefs, vencimentos: false };
    const c = contadoresZerados();
    await materializar("userA", [evento("n1")], [r.aparelho], semVencimentos, c);
    assert.equal(c.notificacoesCriadas, 0);
  });
});

describe("cota diária por usuário (S07)", { skip: !HOST && "sem emulador" }, () => {
  test("contador atômico: a 4ª chamada com limite 3 é barrada, e cada usuário tem a sua", async () => {
    const { consumirCota } = await import("../src/lib/cota");
    const resultados = await Promise.all([1, 2, 3, 4].map(() => consumirCota("userCota", "teste", 3)));
    assert.equal(resultados.filter(Boolean).length, 3);
    assert.equal(await consumirCota("outroUser", "teste", 3), true);
  });
});
