import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { paraCentavos, deCentavos, somarReais, centavosDeLegado, ehCentavos, MAX_CENTAVOS, ValorInvalido, formatarCentavos } from "./dinheiro";

describe("contrato do dinheiro em centavos", () => {
  test("conversão exata, inclusive os casos de ponto flutuante", () => {
    assert.equal(paraCentavos(0.1), 10);
    assert.equal(paraCentavos(1.005), 101);
    assert.equal(paraCentavos(1234.56), 123456);
    assert.equal(paraCentavos(-15.5), -1550);
    assert.equal(Object.is(paraCentavos(-0), 0), true);
    assert.equal(deCentavos(123456), 1234.56);
  });

  test("soma sem resíduo: 0,10 + 0,20 = 0,30 exatos, mil vezes", () => {
    assert.equal(somarReais([0.1, 0.2]), 0.3);
    assert.equal(somarReais(Array(1000).fill(0.1)), 100);
  });

  test("recusa NaN, infinito, texto e fora da faixa", () => {
    for (const ruim of [Number.NaN, Infinity, "10" as unknown as number, (MAX_CENTAVOS + 100) / 100 + 1]) {
      assert.throws(() => paraCentavos(ruim), ValorInvalido);
    }
    assert.equal(ehCentavos(10.5), false);
    assert.equal(ehCentavos(1050), true);
  });

  test("legado inválido vira 0 e é reportado, nunca NaN", () => {
    const motivos: string[] = [];
    assert.equal(centavosDeLegado(undefined, (m) => motivos.push(m)), 0);
    assert.equal(centavosDeLegado(12.34), 1234);
    assert.equal(motivos.length, 1);
  });

  test("formata em BRL", () => {
    assert.equal(formatarCentavos(123456).replace(/\s/g, " "), "R$ 1.234,56");
  });
});

describe("saldo explicável: entradas e saídas depois da referência (C18–C20)", async () => {
  const { saldoConfirmado, extratoDoSaldo, recebimentosAvulsos } = await import("./finance/saldo");
  const ref = { valor: 1000, atualizadoEm: 1_000 };
  const gasto = (valor: number, criadoEm: number, extra: object = {}) =>
    ({ id: String(criadoEm), descricao: "g", valor, categoria: "Outros", mes: "2026-10", criadoEm, data: "1970-01-01", ...extra }) as never;

  test("recebimento marcado entra uma vez; pagamento sai; tudo depois da referência", () => {
    const pagamentos = [
      { valor: 2444, pagoEm: 2_000, origem: "ganho", afetaSaldo: true, nome: "Salário" },
      { valor: 100, pagoEm: 3_000, origem: "conta", afetaSaldo: true, nome: "Internet" },
    ];
    assert.equal(saldoConfirmado(ref, [], pagamentos), 3344);
    const extrato = extratoDoSaldo(ref, [], pagamentos);
    assert.deepEqual(extrato.map((l) => [l.tipo, l.centavos]), [["recebimento", 244400], ["pagamento", -10000]]);
  });

  test("recebimento antigo (sem afetaSaldo) nunca é reaplicado — corte legado", () => {
    const antigos = [{ valor: 2600, pagoEm: 2_000, origem: "ganho" }, { valor: 2600, pagoEm: 500, origem: "ganho", afetaSaldo: true }];
    assert.equal(saldoConfirmado(ref, [], antigos), 1000);
  });

  test("desfazer o recebimento (documento apagado) tira a entrada", () => {
    const com = [{ valor: 500, pagoEm: 2_000, origem: "ganho", afetaSaldo: true }];
    assert.equal(saldoConfirmado(ref, [], com), 1500);
    assert.equal(saldoConfirmado(ref, [], []), 1000);
  });

  test("ganho avulso recebido entra pelo líquido, uma vez", () => {
    const ganhos = [
      { id: "a", tipo: "pontual", descricao: "Freela", valor: 1000, recebido: true, recebidoEm: 2_000, entrouNoSaldo: true, valorRecebido: 940, criadoEm: 1 },
      { id: "b", tipo: "pontual", descricao: "Antigo", valor: 500, recebido: true, recebidoEm: 2_000, criadoEm: 1 },
    ] as never[];
    assert.equal(saldoConfirmado(ref, [], [], recebimentosAvulsos(ganhos)), 1940);
  });

  test("extrato soma exatamente o saldo, com crédito e caixinha explicados", () => {
    const gastos = [gasto(20, 2_000, { guardado: { c: 0.1 } }), gasto(260, 3_000, { pagoCom: "credito", guardado: { c: 0.1 } })];
    const extrato = extratoDoSaldo(ref, gastos);
    const soma = extrato.reduce((a, l) => a + l.centavos, 0);
    assert.equal(1000 + soma / 100, saldoConfirmado(ref, gastos));
    assert.match(extrato[1].detalhe ?? "", /crédito/);
  });
});

describe("caixinha é transferência, não receita nem despesa (C21–C22)", async () => {
  const { saldoConfirmado, extratoDoSaldo } = await import("./finance/saldo");
  const ref = { valor: 1000, atualizadoEm: 1_000 };
  const t = (direcao: "guardar" | "resgatar", valor: number, criadoEm: number) =>
    ({ id: String(criadoEm), caixinhaId: "c1", nome: "Viagem", direcao, valor, criadoEm });

  test("guardar R$ 10 e resgatar R$ 5: saldo −5, total (saldo + caixinha) conservado", () => {
    const transferencias = [t("guardar", 10, 2_000), t("resgatar", 5, 3_000)];
    const saldo = saldoConfirmado(ref, [], [], [], transferencias)!;
    assert.equal(saldo, 995);
    const caixinhaDepois = 100 + 10 - 5; // começou com 100 separados
    assert.equal(saldo + caixinhaDepois, 1000 + 100);
  });

  test("transferência antes da referência já estava dentro dela", () => {
    assert.equal(saldoConfirmado(ref, [], [], [], [t("guardar", 50, 500)]), 1000);
  });

  test("aparece no extrato como caixinha, com o nome", () => {
    const e = extratoDoSaldo(ref, [], [], [], [t("guardar", 10, 2_000)]);
    assert.deepEqual(e.map((l) => [l.tipo, l.descricao, l.centavos]), [["transferencia", "Guardado em Viagem", -1000]]);
  });
});

describe("confirmado separado do previsto (C24)", async () => {
  const { previsaoDoMes } = await import("./finance/previsao");

  test("fim do mês previsto usa o saldo; o confirmado não muda com previsão", () => {
    const p = previsaoDoMes(1000, 2444, 1391.61);
    assert.equal(p.confirmado, 1000);
    assert.equal(p.fimDoMesPrevisto, 2052.39);
    assert.equal(p.resultadoPrevisto, 1052.39);
    assert.match(p.formula, /na conta agora/);
  });

  test("sem saldo informado não inventa fim de mês", () => {
    const p = previsaoDoMes(null, 100, 300);
    assert.equal(p.fimDoMesPrevisto, null);
    assert.equal(p.resultadoPrevisto, -200);
  });
});
