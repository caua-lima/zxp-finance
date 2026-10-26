import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  idNotificacao,
  marcoDeVencimento,
  decidirAposEnvio,
  rotaSegura,
  endpointPushValido,
  chavesPushValidas,
  payloadPush,
  tipoPermitido,
  preferenciasPadrao,
  fimDoDia,
  TENTATIVAS_MAXIMAS,
} from "./regras";
import { eventosDoDia, eventosDeVencimento, DadosDoUsuario } from "./eventos";
import type { Parcela } from "@/lib/types";

/**
 * Regras de notificação (auditoria N01–N08, matriz 12–14). Puras — a parte
 * que fala com o Firestore é testada no emulador (tests/notificacoes.test.ts).
 */

function dados(over: Partial<DadosDoUsuario> = {}): DadosDoUsuario {
  return {
    saldo: null,
    pagamentos: [],
    diasComComissao: new Set(),
    ganhos: [],
    contas: [],
    assinaturas: [],
    parcelas: [],
    faturas: [],
    gastos: [],
    diaVencimentoPorCartao: {},
    ...over,
  };
}

const parcelaNubank = (over: Partial<Parcela> = {}): Parcela => ({
  id: "p1",
  tipo: "cartao",
  nome: "Treinamento",
  valorParcela: 239.62,
  totalParcelas: 10,
  parcelasRestantes: 9,
  naFatura: true,
  cartao: "Nubank CNPJ",
  mesReferencia: "2026-10",
  criadoEm: 0,
  ...over,
});

describe("idempotência (N03)", () => {
  test("mesmo evento, mesmo id — reexecução não duplica", () => {
    assert.equal(
      idNotificacao("vencimento", "fatura__x", "2026-10-05", "5"),
      idNotificacao("vencimento", "fatura__x", "2026-10-05", "5")
    );
    assert.notEqual(
      idNotificacao("vencimento", "fatura__x", "2026-10-05", "5"),
      idNotificacao("vencimento", "fatura__x", "2026-10-05", "1")
    );
  });

  test("gerar os eventos do dia duas vezes dá os mesmos ids", () => {
    const d = dados({
      parcelas: [parcelaNubank()],
      diaVencimentoPorCartao: { "Nubank CNPJ": 5 },
    });
    const a = eventosDoDia(d, "2026-09-30").map((e) => e.id);
    const b = eventosDoDia(d, "2026-09-30").map((e) => e.id);
    assert.deepEqual(a, b);
  });
});

describe("vencimentos por data efetiva e virada de mês (N05, matriz 14)", () => {
  test("fatura que vence dia 5 do mês que vem é avisada no fim deste mês", () => {
    const eventos = eventosDeVencimento(
      dados({ parcelas: [parcelaNubank()], diaVencimentoPorCartao: { "Nubank CNPJ": 5 } }),
      "2026-09-30"
    );
    assert.equal(eventos.length, 1);
    // data absoluta: na central o aviso continua certo nos dias seguintes (N10)
    assert.match(eventos[0].conteudo.titulo, /vence dia 05\/10/);
    assert.equal(eventos[0].estimado, true);
    // push só no dia em que foi gerado; e sabe qual pagamento o torna obsoleto (E40)
    assert.equal(eventos[0].validoAte, fimDoDia("2026-09-30"));
    assert.equal(eventos[0].pagamentoId, "2026-10__fatura__2026-10__Nubank CNPJ");
  });

  test("execução perdida é recuperada: no dia 4 antes ainda sai o aviso 'em breve', com o mesmo id do dia 5", () => {
    const d = dados({ parcelas: [parcelaNubank()], diaVencimentoPorCartao: { "Nubank CNPJ": 5 } });
    const noDia5 = eventosDeVencimento(d, "2026-09-30")[0];
    const noDia4 = eventosDeVencimento(d, "2026-10-01")[0];
    assert.ok(noDia4, "aviso recuperado");
    assert.equal(noDia4.id, noDia5.id, "não repete se já tinha saído");
  });

  test("marcos por faixa", () => {
    assert.equal(marcoDeVencimento(6), null);
    assert.equal(marcoDeVencimento(5), "5");
    assert.equal(marcoDeVencimento(3), "5");
    assert.equal(marcoDeVencimento(1), "1");
    assert.equal(marcoDeVencimento(0), "0");
    assert.equal(marcoDeVencimento(-1), null);
  });

  test("conta já paga não gera aviso", () => {
    const d = dados({
      contas: [
        { id: "c1", nome: "Internet", valor: 100, categoria: "Internet", ativa: true, diaVencimento: 2, criadoEm: 0 },
      ],
      pagamentos: [{ id: "2026-10__conta__c1", valor: 100, pagoEm: 1, origem: "conta", afetaSaldo: true }],
    });
    const eventos = eventosDeVencimento(d, "2026-09-30").filter((e) => /Internet/.test(e.conteudo.titulo));
    assert.equal(eventos.length, 0);
  });

  test("aviso de 'hoje' vale só até o fim do dia", () => {
    assert.equal(fimDoDia("2026-10-05"), new Date("2026-10-05T23:59:59-03:00").getTime());
  });
});

describe("política de falha do envio (N03, matriz 12)", () => {
  const agora = 1_000_000;
  test("2xx aceita; 404/410 encerra; 401/403 é incidente de configuração", () => {
    assert.equal(decidirAposEnvio(201, 1, agora).acao, "aceita");
    assert.equal(decidirAposEnvio(404, 1, agora).acao, "encerrar_inscricao");
    assert.equal(decidirAposEnvio(410, 1, agora).acao, "encerrar_inscricao");
    assert.equal(decidirAposEnvio(401, 1, agora).acao, "incidente_config");
    assert.equal(decidirAposEnvio(403, 1, agora).acao, "incidente_config");
  });

  test("429 respeita Retry-After", () => {
    const d = decidirAposEnvio(429, 1, agora, 120);
    assert.deepEqual(d, { acao: "retentar", proximaTentativaEm: agora + 120_000 });
  });

  test("5xx e erro de rede: espera crescente com jitter, até o limite", () => {
    const d1 = decidirAposEnvio(503, 1, agora, null, () => 0);
    const d2 = decidirAposEnvio(null, 2, agora, null, () => 0);
    assert.equal(d1.acao, "retentar");
    assert.equal(d2.acao, "retentar");
    if (d1.acao === "retentar" && d2.acao === "retentar") {
      assert.ok(d2.proximaTentativaEm - agora > d1.proximaTentativaEm - agora);
    }
    assert.equal(decidirAposEnvio(500, TENTATIVAS_MAXIMAS, agora).acao, "desistir");
  });
});

describe("segurança do push (S08/N07)", () => {
  test("só provedores de push reais, só https", () => {
    assert.equal(endpointPushValido("https://fcm.googleapis.com/fcm/send/abc"), true);
    assert.equal(endpointPushValido("https://web.push.apple.com/QGx"), true);
    assert.equal(endpointPushValido("https://updates.push.services.mozilla.com/wpush/v2/x"), true);
    assert.equal(endpointPushValido("https://wns2-bl2p.notify.windows.com/w/?token=x"), true);
    assert.equal(endpointPushValido("http://fcm.googleapis.com/x"), false);
    assert.equal(endpointPushValido("https://127.0.0.1/x"), false);
    assert.equal(endpointPushValido("https://localhost/x"), false);
    assert.equal(endpointPushValido("https://169.254.169.254/latest/meta-data"), false);
    assert.equal(endpointPushValido("https://fcm.googleapis.com.evil.com/x"), false);
    assert.equal(endpointPushValido("https://fcm.googleapis.com:8443/x"), false);
    assert.equal(endpointPushValido(123), false);
  });

  test("chaves precisam ter formato de chave", () => {
    assert.equal(chavesPushValidas({ p256dh: "B".repeat(87), auth: "a".repeat(22) }), true);
    assert.equal(chavesPushValidas({ p256dh: "x", auth: "y" }), false);
    assert.equal(chavesPushValidas({ p256dh: "B".repeat(87) }), false);
    assert.equal(chavesPushValidas(null), false);
  });

  test("clique só abre rota do app", () => {
    assert.equal(rotaSegura("/fatura"), "/fatura");
    assert.equal(rotaSegura("/fatura?x=1"), "/fatura");
    assert.equal(rotaSegura("https://evil.com"), "/notificacoes");
    assert.equal(rotaSegura("//evil.com/fatura"), "/notificacoes");
    assert.equal(rotaSegura("/acesso"), "/notificacoes");
    assert.equal(rotaSegura(undefined), "/notificacoes");
  });

  test("push discreto por padrão: sem valores na tela bloqueada", () => {
    const conteudo = { titulo: "Fatura Nubank vence amanhã", corpo: "R$ 588,81.", url: "/fatura" };
    const discreto = JSON.parse(payloadPush("n1", "vencimento", conteudo, false));
    assert.equal(discreto.title, "ZXP Finance");
    assert.doesNotMatch(discreto.body, /R\$/);
    assert.equal(discreto.url, "/notificacoes");
    const detalhado = JSON.parse(payloadPush("n1", "vencimento", conteudo, true));
    assert.match(detalhado.body, /588/);
    assert.equal(detalhado.id, "n1");
  });
});

describe("preferências (N06)", () => {
  test("comissão é opt-in: só liga sozinha pra quem usa o módulo", () => {
    assert.equal(preferenciasPadrao(false).comissao, false);
    assert.equal(preferenciasPadrao(true).comissao, true);
    assert.equal(tipoPermitido("comissao", preferenciasPadrao(false)), false);
    assert.equal(tipoPermitido("teste", preferenciasPadrao(false)), true);
  });

  test("valores no push desligados por padrão", () => {
    assert.equal(preferenciasPadrao(true).detalhesNoPush, false);
  });
});

describe("resumo do dia usa o mesmo contrato da tela (F01)", () => {
  test("último dia: saldo 100, gasto 30 → o aviso fala de R$ 70, não R$ 40", () => {
    const ref = new Date("2026-09-30T08:00:00-03:00").getTime();
    const d = dados({
      saldo: { valor: 100, atualizadoEm: ref },
      gastos: [
        {
          id: "g1",
          descricao: "almoço",
          valor: 30,
          categoria: "Alimentação",
          mes: "2026-09",
          data: "2026-09-30",
          criadoEm: ref + 3_600_000,
        },
      ],
    });
    const resumo = eventosDoDia(d, "2026-09-30").find((e) => e.tipo === "saldo_diario");
    assert.ok(resumo);
    assert.doesNotMatch(`${resumo!.conteudo.titulo} ${resumo!.conteudo.corpo}`, /40,00/);
  });
});
