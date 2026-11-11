import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { planejarSincronizacao, EstadoApp, DadosBanco, ehMovimentoInterno } from "./plano";
import { configPluggy, credenciaisPluggy, comConexoes } from "./cliente";
import type { ContaPluggy, TransacaoPluggy } from "./cliente";
import { saldoConfirmado, recebimentosAvulsos } from "../finance/saldo";
import type { Gasto, Ganho } from "../types";

const LIDO = Date.parse("2026-11-10T09:00:00-03:00");
const conta: ContaPluggy = { id: "acc", type: "BANK", name: "Conta Mercado Pago", balance: 4800.97, itemId: "it" };
const cartao: ContaPluggy = { id: "cc", type: "CREDIT", name: "Mercado Pago", balance: 0, itemId: "it" };

const vazio = (extra: Partial<EstadoApp> = {}): EstadoApp => ({
  inicioUso: "2026-11-05",
  saldo: { valor: 5000, atualizadoEm: Date.parse("2026-11-05T12:00:00-03:00") },
  gastos: [], ganhos: [], pagamentos: [], contas: [], assinaturas: [], parcelas: [], faturas: [], caixinhas: [],
  processados: new Set(),
  ...extra,
});
const tx = (id: string, amount: number, date: string, description: string, extra: Partial<TransacaoPluggy> = {}): TransacaoPluggy => ({
  id, amount, date: `${date}T15:00:00.000Z`, description, type: amount < 0 ? "DEBIT" : "CREDIT",
  accountId: "acc", status: "POSTED", ...extra,
});
const banco = (transacoes: TransacaoPluggy[], extra: Partial<DadosBanco> = {}): DadosBanco => ({
  lidoEm: LIDO, contas: [conta, cartao], transacoes, investimentos: [], ...extra,
});
const escrita = (p: ReturnType<typeof planejarSincronizacao>, prefixo: string) =>
  p.escritas.filter((e) => e.caminho.startsWith(prefixo));

describe("sincronização com o banco", () => {
  test("saldo vira o do banco, na hora em que o banco foi lido", () => {
    const p = planejarSincronizacao(vazio(), banco([]));
    assert.deepEqual(escrita(p, "saldo/")[0].dados, { valor: 4800.97, atualizadoEm: LIDO });
  });

  test("reajuste seu feito depois da leitura do banco não é atropelado", () => {
    const p = planejarSincronizacao(vazio({ saldo: { valor: 4700, atualizadoEm: LIDO + 1000 } }), banco([]));
    assert.equal(escrita(p, "saldo/").length, 0);
    assert.equal(p.resumo.saldoAtualizado, false);
  });

  test("compra no débito vira gasto com categoria, antes da leitura; não desconta de novo do saldo", () => {
    const p = planejarSincronizacao(vazio(), banco([tx("t1", -32.5, "2026-11-08", "IFOOD *RESTAURANTE")]));
    const g = escrita(p, "gastos/")[0].dados as unknown as Gasto;
    assert.equal(g.valor, 32.5);
    assert.equal(g.categoria, "Alimentação");
    assert.equal(g.data, "2026-11-08");
    assert.ok(g.criadoEm < LIDO);
    // o saldo do banco já tem esse dinheiro fora: o app mostra exatamente o do banco
    assert.equal(saldoConfirmado({ valor: 4800.97, atualizadoEm: LIDO }, [{ ...g, id: "x" }]), 4800.97);
  });

  test("a mesma transação nunca entra duas vezes", () => {
    const p = planejarSincronizacao(vazio({ processados: new Set(["t1"]) }), banco([tx("t1", -10, "2026-11-08", "Padaria")]));
    assert.equal(escrita(p, "gastos/").length, 0);
  });

  test("débito que bate com conta do A pagar marca como pago (nome ou vencimento)", () => {
    const internet = { id: "net", nome: "Internet Vivo", valor: 100, categoria: "Internet", ativa: true, diaVencimento: 10, criadoEm: 1 };
    const p = planejarSincronizacao(vazio({ contas: [internet] }), banco([tx("t2", -100, "2026-11-09", "PIX VIVO FIBRA")]));
    const pag = escrita(p, "pagamentos/")[0];
    assert.equal(pag.caminho, "pagamentos/2026-11__conta__net");
    assert.equal((pag.dados as { pagoEm: number }).pagoEm < LIDO, true);
    assert.equal(escrita(p, "gastos/").length, 0);
  });

  test("conta já marcada à mão no A pagar: só liga, sem gasto duplicado", () => {
    const internet = { id: "net", nome: "Internet Vivo", valor: 100, categoria: "Internet", ativa: true, criadoEm: 1 };
    const p = planejarSincronizacao(
      vazio({ contas: [internet], pagamentos: [{ id: "2026-11__conta__net", pagoEm: LIDO + 5000 }] }),
      banco([tx("t2", -100, "2026-11-09", "Pagamento Vivo")])
    );
    assert.equal(escrita(p, "gastos/").length, 0);
    const pag = escrita(p, "pagamentos/")[0];
    assert.deepEqual(pag.campos, ["idExterno", "pagoEm"]);
    assert.ok((pag.dados as { pagoEm: number }).pagoEm < LIDO);
  });

  test("gasto que você já anotou (mesmo valor, até 3 dias) só é ligado", () => {
    const manual = { id: "m1", descricao: "almoço", valor: 32.5, categoria: "Alimentação", mes: "2026-11", data: "2026-11-09", criadoEm: LIDO + 10 } as Gasto;
    const p = planejarSincronizacao(vazio({ gastos: [manual] }), banco([tx("t1", -32.5, "2026-11-08", "RESTAURANTE X")]));
    const g = escrita(p, "gastos/");
    assert.equal(g.length, 1);
    assert.equal(g[0].caminho, "gastos/m1");
    assert.equal((g[0].dados as { data: string }).data, "2026-11-08");
  });

  test("compra no cartão vira gasto no crédito; pagamento da fatura no cartão é interno", () => {
    const p = planejarSincronizacao(
      vazio(),
      banco([
        tx("c1", 120, "2026-11-08", "MAGALU", { accountId: "cc", type: "DEBIT" }),
        tx("c2", -500, "2026-11-09", "Pagamento recebido", { accountId: "cc" }),
      ])
    );
    const g = escrita(p, "gastos/")[0].dados as unknown as Gasto;
    assert.equal(g.pagoCom, "credito");
    assert.equal(p.resumo.novos.interno, 1);
  });

  test("cofrinho e investimento não são gasto nem ganho", () => {
    assert.equal(ehMovimentoInterno(tx("i", -200, "2026-11-08", "Dinheiro reservado no Cofrinho")), true);
    assert.equal(ehMovimentoInterno(tx("i", -200, "2026-11-08", "Pix", { category: "Same person transfer" })), true);
    assert.equal(ehMovimentoInterno(tx("i", 3.1, "2026-11-08", "Rendimento do dinheiro")), false);
    const p = planejarSincronizacao(vazio(), banco([tx("i", -200, "2026-11-08", "Aplicação Cofrinho Viagem")]));
    assert.equal(escrita(p, "gastos/").length + escrita(p, "ganhos/").length, 0);
  });

  test("entrada vira ganho recebido líquido, sem somar de novo no saldo", () => {
    const p = planejarSincronizacao(vazio(), banco([tx("e1", 2444, "2026-11-08", "PIX RECEBIDO EMPRESA SALARIO")]));
    const g = escrita(p, "ganhos/")[0].dados as unknown as Ganho;
    assert.equal(g.semImposto, true);
    assert.equal(g.recebido, true);
    assert.equal(saldoConfirmado({ valor: 4800.97, atualizadoEm: LIDO }, [], [], recebimentosAvulsos([{ ...g, id: "x" }])), 4800.97);
  });

  test("antes do início da contagem só fica registrado", () => {
    const p = planejarSincronizacao(vazio(), banco([tx("v", -50, "2026-11-01", "Mercado")]));
    assert.equal(p.resumo.novos.antes_do_inicio, 1);
    assert.equal(escrita(p, "gastos/").length, 0);
  });

  test("pendente espera confirmar", () => {
    const p = planejarSincronizacao(vazio(), banco([tx("p", -50, "2026-11-08", "Mercado", { status: "PENDING" })]));
    assert.equal(p.resumo.pendentes, 1);
    assert.equal(escrita(p, "bancoTransacoes/").length, 0);
  });

  test("fatura paga pela conta marca a fatura e dá baixa nas parcelas dentro dela", () => {
    const parcela = { id: "p1", tipo: "cartao", nome: "Curso", valorParcela: 239.62, totalParcelas: 10, parcelasRestantes: 7, mesReferencia: "2026-11", naFatura: true, cartao: "Nubank CNPJ", criadoEm: 1 } as const;
    const p = planejarSincronizacao(
      vazio({ parcelas: [parcela], faturas: [{ id: "f1", nome: "Nubank CNPJ", valor: 900, mes: "2026-11", criadoEm: 1 }] }),
      banco([tx("f", -912.4, "2026-11-09", "PAGAMENTO NUBANK")])
    );
    assert.equal(escrita(p, "pagamentos/")[0].caminho, "pagamentos/2026-11__fatura__f1");
    assert.deepEqual(escrita(p, "parcelas/")[0].dados, { parcelasRestantes: 6, mesReferencia: "2026-12" });
  });

  test("cofrinho do banco vira caixinha com valor e rendimento reais", () => {
    const p = planejarSincronizacao(
      vazio(),
      banco([], { investimentos: [{ id: "inv", name: "Cofrinho Viagem", type: "FIXED_INCOME", balance: 1500.5, amountProfit: 12.3, rate: 100, rateType: "CDI" }] })
    );
    const c = escrita(p, "caixinhas/")[0].dados as Record<string, unknown>;
    assert.deepEqual([c.saldo, c.rendimento, c.porGasto, c.percentualCdi], [1500.5, 12.3, 0, 100]);
  });
});

describe("configuração da Pluggy", () => {
  test("desligada sem todas as variáveis; lê vários itens", () => {
    assert.equal(configPluggy({}), null);
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const c = configPluggy({ PLUGGY_CLIENT_ID: "a", PLUGGY_CLIENT_SECRET: "b", PLUGGY_ITEM_IDS: `${id}, lixo`, PLUGGY_UID: "u" });
    assert.deepEqual(c?.itemIds, [id]);
  });

  test("conexão gravada pelo botão completa a configuração, sem repetir", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const cred = credenciaisPluggy({ PLUGGY_CLIENT_ID: "a", PLUGGY_CLIENT_SECRET: "b", PLUGGY_UID: "u" });
    assert.deepEqual(cred?.itemIds, []);
    assert.deepEqual(comConexoes(cred!, [id, id, "lixo", 3]).itemIds, [id]);
  });
});

describe("Mercado Pago de verdade: reservas, você mesmo, rendimentos, nomes", async () => {
  const { descricaoLimpa, reservaDaTransacao, idCaixinhaDaReserva } = await import("./plano");
  const comDono = { ...conta, owner: "Caua Araujo Vaz de Lima" } as ContaPluggy;
  const bancoDono = (transacoes: TransacaoPluggy[]) => banco(transacoes, { contas: [comDono, cartao] });

  test("reserva por gasto e dinheiro reservado/retirado viram movimento da caixinha, não gasto", () => {
    assert.deepEqual(reservaDaTransacao(tx("r", -0.1, "2026-11-08", "Reserva por gasto Money")), { nome: "Money", direcao: "guardar" });
    assert.deepEqual(reservaDaTransacao(tx("r", 118.89, "2026-11-08", "Dinheiro retirado Cartão - NUBANK")), {
      nome: "Cartão - NUBANK", direcao: "resgatar",
    });
    const id = idCaixinhaDaReserva("Money");
    const p = planejarSincronizacao(
      vazio({ caixinhas: [{ id, nome: "Money", saldo: 2000, porGasto: 0, ativa: true, depositos: 0, criadoEm: 1, atualizadoEm: 0 }] }),
      bancoDono([
        tx("a", -0.1, "2026-11-08", "Reserva por gastos Money"),
        tx("b", -50, "2026-11-08", "Dinheiro reservado Money"),
        tx("c", 20, "2026-11-08", "Dinheiro retirado Money"),
      ])
    );
    assert.equal(escrita(p, "gastos/").length + escrita(p, "ganhos/").length, 0);
    assert.deepEqual(escrita(p, `caixinhas/${id}`)[0].dados, { saldo: 2030.1, sincronizadoEm: LIDO, porGasto: 0, origem: "banco", reserva: "Money" });
  });

  test("depois de você corrigir o valor da caixinha, movimento anterior não soma de novo", () => {
    const id = idCaixinhaDaReserva("Money");
    const corrigida = Date.parse("2026-11-08T20:00:00-03:00");
    const p = planejarSincronizacao(
      vazio({ caixinhas: [{ id, nome: "Money", saldo: 2100, porGasto: 0, ativa: true, depositos: 0, criadoEm: 1, atualizadoEm: corrigida }] }),
      bancoDono([tx("a", -50, "2026-11-08", "Dinheiro reservado Money")]) // 12:00 do dia 8, antes da correção
    );
    assert.equal(escrita(p, "caixinhas/").length, 0);
  });

  test("reserva nova vira caixinha nova", () => {
    const p = planejarSincronizacao(vazio(), bancoDono([tx("a", -30, "2026-11-08", "Dinheiro reservado Viagens - LaCa")]));
    const c = escrita(p, "caixinhas/")[0];
    assert.equal(c.caminho, `caixinhas/${idCaixinhaDaReserva("Viagens - LaCa")}`);
    assert.equal((c.dados as { saldo: number }).saldo, 30);
  });

  test("Pix pra você mesmo (inclusive pro seu CNPJ) é interno, nos dois sentidos", () => {
    const p = planejarSincronizacao(
      vazio(),
      bancoDono([
        tx("a", -731.74, "2026-11-08", "Pix enviado 58.467.349 Caua Araujo Vaz de Lima", { category: "Education" }),
        tx("b", 200, "2026-11-08", "Pix recebido CAUA ARAUJO VAZ DE LIMA"),
      ])
    );
    assert.equal(escrita(p, "gastos/").length + escrita(p, "ganhos/").length, 0);
    assert.equal(p.resumo.novos.interno, 2);
  });

  test("rendimentos do mês viram um ganho só, somando com o que já havia", () => {
    const p = planejarSincronizacao(
      vazio({ ganhos: [{ id: "banco_rendimentos_2026-11", tipo: "pontual", mes: "2026-11", descricao: "Rendimentos da conta", valor: 0.6, criadoEm: 1 }] }),
      bancoDono([
        tx("a", 2.31, "2026-11-06", "Rendimentos", { category: "Proceeds interests and dividends" }),
        tx("b", 1.09, "2026-11-07", "Rendimentos", { category: "Proceeds interests and dividends" }),
      ])
    );
    const g = escrita(p, "ganhos/");
    assert.equal(g.length, 1);
    assert.equal((g[0].dados as { valor: number }).valor, 4);
  });

  test("nome de quem recebeu vira a descrição, e bebida cai na categoria certa", () => {
    assert.equal(descricaoLimpa(tx("a", -7, "2026-11-08", "Pix enviado 52.502.755 Igor Juan da Silva Lopes")), "Igor Juan da Silva Lopes");
    assert.equal(descricaoLimpa(tx("a", -3, "2026-11-08", "Pix enviado BEER HOUSE LTDA")), "Beer House");
    const p = planejarSincronizacao(vazio(), bancoDono([tx("a", -3, "2026-11-08", "Pix enviado BEER HOUSE LTDA")]));
    const g = escrita(p, "gastos/")[0].dados as unknown as Gasto;
    assert.equal(g.descricao, "Beer House");
    assert.equal(g.categoria, "Lazer");
  });

  test("categoria que você corrigiu ensina as próximas do mesmo lugar", () => {
    const antigo = { id: "x", descricao: "Jose Rogerio da Silva", valor: 2, categoria: "Alimentação", mes: "2026-11", criadoEm: 1 } as Gasto;
    const p = planejarSincronizacao(vazio({ gastos: [antigo] }), bancoDono([tx("a", -4, "2026-11-08", "Pix enviado Jose Rogerio da Silva")]));
    assert.equal((escrita(p, "gastos/")[0].dados as unknown as Gasto).categoria, "Alimentação");
  });
});

describe("iFood no cartão", async () => {
  const { descricaoLimpa } = await import("./plano");
  test("IFD*NOME vira iFood · Nome e cai em Alimentação", () => {
    const t = tx("i", 33.41, "2026-11-08", "IFD*ARCOS DOURADOS COMERC", { accountId: "cc", category: "Food delivery" });
    assert.equal(descricaoLimpa(t), "iFood · Arcos Dourados Comerc");
    const p = planejarSincronizacao(vazio(), banco([t]));
    assert.equal((escrita(p, "gastos/")[0].dados as unknown as Gasto).categoria, "Alimentação");
  });
});

describe("compra no cartão ainda pendente", () => {
  test("entra já, marcada; quando confirma com outro id, só liga (sem duplicar)", () => {
    const pendente = tx("p1", 24.89, "2026-11-08", "IFD*ZAMP S.A.", { accountId: "cc", status: "PENDING" });
    const p1 = planejarSincronizacao(vazio(), banco([pendente]));
    const g = escrita(p1, "gastos/")[0];
    assert.equal((g.dados as { pendente?: boolean }).pendente, true);
    const importado = { id: g.caminho.split("/")[1], ...(g.dados as object) } as Gasto & { idExterno: string; pendente: boolean };
    const confirmada = tx("p2", 24.89, "2026-11-09", "IFD*ZAMP S.A.", { accountId: "cc" });
    const p2 = planejarSincronizacao(vazio({ gastos: [importado], processados: new Set(["p1"]) }), banco([confirmada]));
    const ligado = escrita(p2, "gastos/");
    assert.equal(ligado.length, 1);
    assert.equal(ligado[0].caminho, g.caminho);
    assert.deepEqual([(ligado[0].dados as { idExterno: string }).idExterno, (ligado[0].dados as { pendente: boolean }).pendente], ["p2", false]);
  });

  test("Pix pendente na conta continua esperando confirmar", () => {
    const p = planejarSincronizacao(vazio(), banco([tx("x", -50, "2026-11-08", "Pix enviado Fulano", { status: "PENDING" })]));
    assert.equal(p.resumo.pendentes, 1);
    assert.equal(escrita(p, "gastos/").length, 0);
  });
});

describe("caixinha que você já tinha com o mesmo nome", () => {
  test("vira o espelho da reserva do banco e para de guardar por registro", () => {
    const sua = { id: "abc", nome: "Money", saldo: 349.15, porGasto: 0.1, ativa: true, depositos: 3, criadoEm: 1, atualizadoEm: 1 };
    const p = planejarSincronizacao(vazio({ caixinhas: [sua] }), banco([tx("r", -0.1, "2026-11-08", "Reserva por gasto Money")]));
    const c = escrita(p, "caixinhas/");
    assert.equal(c.length, 1);
    assert.equal(c[0].caminho, "caixinhas/abc");
    assert.deepEqual([(c[0].dados as { saldo: number }).saldo, (c[0].dados as { porGasto: number }).porGasto], [349.25, 0]);
  });
});

describe("nome que você deu vale pras próximas vezes (apelido)", async () => {
  const { contraparteDa } = await import("./plano");
  const pix = (id: string, valor: number, dia: string, cnpj: string) =>
    tx(id, -valor, dia, "Pix enviado 52.502.755 Igor Juan da Silva Lopes", {
      paymentData: { receiver: { documentNumber: { type: "CNPJ", value: cnpj } } },
    } as Partial<TransacaoPluggy>);

  test("a chave é um resumo do CNPJ, nunca o número", () => {
    const c = contraparteDa(pix("a", 3, "2026-11-08", "52.502.755/0001-10"), "Igor");
    assert.match(c, /^[0-9a-f]{24}$/);
    assert.ok(!c.includes("52502755"));
  });

  test("renomeou um Pix pra BEER IGOR: o próximo pro mesmo CNPJ já vem assim, na mesma categoria", () => {
    const primeiro = pix("a", 3, "2026-11-08", "52.502.755/0001-10");
    const p1 = planejarSincronizacao(vazio(), banco([primeiro]));
    const criado = escrita(p1, "gastos/")[0].dados as unknown as Gasto;
    assert.equal(criado.descricao, "Igor Juan da Silva Lopes");
    assert.equal(criado.nomeBanco, "Igor Juan da Silva Lopes");
    // você renomeou no app
    const renomeado = { ...criado, id: "banco_a", descricao: "BEER IGOR", categoria: "Lazer" } as Gasto;
    const p2 = planejarSincronizacao(
      vazio({ gastos: [renomeado], processados: new Set(["a"]) }),
      banco([pix("b", 5, "2026-11-09", "52.502.755/0001-10")])
    );
    const novo = escrita(p2, "gastos/")[0].dados as unknown as Gasto;
    assert.deepEqual([novo.descricao, novo.categoria], ["BEER IGOR", "Lazer"]);
  });

  test("outro CNPJ não pega o apelido", () => {
    const renomeado = {
      id: "banco_a", descricao: "BEER IGOR", categoria: "Lazer", valor: 3, mes: "2026-11", criadoEm: 1, origem: "banco",
      nomeBanco: "Igor Juan da Silva Lopes", contraparte: contraparteDa(pix("a", 3, "2026-11-08", "52.502.755/0001-10"), "x"),
    } as Gasto;
    const p = planejarSincronizacao(vazio({ gastos: [renomeado] }), banco([pix("c", 5, "2026-11-09", "11.111.111/0001-11")]));
    assert.equal((escrita(p, "gastos/")[0].dados as unknown as Gasto).descricao, "Igor Juan da Silva Lopes");
  });
});
