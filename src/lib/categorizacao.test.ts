import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { inferirCategoriaGasto, normalizarTexto } from "./categoriasGasto";

describe("categoria automática pelo dicionário", () => {
  const casos: [string, string][] = [
    ["mercado livre", "Compras"], // antes caía em Alimentação por causa de "mercado"
    ["mercado", "Alimentação"],
    ["posto shell", "Transporte"],
    ["99pop", "Transporte"],
    ["Zé Delivery", "Alimentação"],
    ["McDonald's", "Alimentação"],
    ["drogasil", "Saúde"],
    ["smart fit", "Saúde"],
    ["corte de cabelo", "Beleza"],
    ["perfume boticário", "Beleza"],
    ["camisetas", "Compras"],
    ["tênis nike", "Compras"],
    ["shein", "Compras"],
    ["netflix", "Lazer"],
    ["cerveja com os amigos", "Lazer"],
    ["curso na udemy", "Educação"],
    ["presente da minha mãe", "Presentes"],
    ["ração do cachorro", "Pets"],
    ["conta de luz", "Casa"],
    ["conta de água", "Casa"],
    ["água com gás", "Alimentação"],
    ["Pão de Açúcar", "Alimentação"],
    ["padoca", "Alimentação"],
    ["busão", "Transporte"],
    ["breja", "Lazer"],
    ["look novo", "Compras"],
    // tirados dos registros reais de outubro que caíam em Outros
    ["paieiro", "Lazer"],
    ["piteira e seda", "Lazer"],
    ["salgadinho no beer", "Alimentação"],
    ["coqueteleira", "Saúde"],
    ["mesa", "Casa"],
    ["frete pra buscar a mesa", "Transporte"],
    ["AkiTem", "Alimentação"],
    ["esfihas", "Alimentação"],
    ["bolsa de presente para laís", "Presentes"],
    ["buquê de flores pra Laís", "Presentes"],
    // busca aproximada: gênero, plural e erro de digitação
    ["psicóloga", "Saúde"],
    ["cabelereiro", "Beleza"],
    ["hamburgueres", "Alimentação"],
    ["farmacinha", "Saúde"], // diminutivo cai na mesma raiz
    ["gasolna", "Transporte"],
    ["netflx", "Lazer"],
    ["xyzwq", "Outros"], // longe de tudo: não chuta
    ["asdfgh", "Outros"],
    ["", "Outros"],
  ];
  for (const [descricao, categoria] of casos) {
    test(`"${descricao}" → ${categoria}`, () => {
      assert.equal(inferirCategoriaGasto(descricao), categoria);
    });
  }

  test("normaliza acento, caixa e pontuação", () => {
    assert.equal(normalizarTexto("  Açaí,  Pão!! "), "acai pao");
  });
});

describe("categoria que aprende com seus registros", async () => {
  const { sugerirCategoria } = await import("./categorizacao");
  let id = 0;
  const g = (descricao: string, categoria: string, extra: object = {}) =>
    ({ id: String(++id), descricao, valor: 10, categoria, mes: "2026-10", criadoEm: id, ...extra }) as never;

  test("mesma descrição: usa a categoria que você escolheu antes", () => {
    const s = sugerirCategoria("Seu Zé", [g("seu zé", "Alimentação")]);
    assert.equal(s.categoria, "Alimentação");
    assert.equal(s.origem, "seus registros");
  });

  test("sua correção vence o dicionário", () => {
    // o dicionário diria Transporte (uber), mas você sempre registrou como Lazer
    const s = sugerirCategoria("uber", [g("uber", "Lazer"), g("uber", "Lazer")]);
    assert.equal(s.categoria, "Lazer");
  });

  test("singular e plural contam como o mesmo registro", () => {
    const s = sugerirCategoria("Lanches do Seu Zé", [g("lanche do seu zé", "Lazer")]);
    assert.equal(s.categoria, "Lazer");
    assert.equal(s.origem, "seus registros");
  });

  test("empate: a mais recente vence", () => {
    const s = sugerirCategoria("loja x", [g("loja x", "Casa"), g("loja x", "Compras")]);
    assert.equal(s.categoria, "Compras");
  });

  test("palavra que você repete sempre na mesma categoria", () => {
    const hist = [g("almoço trampo", "Alimentação"), g("café trampo", "Alimentação"), g("janta trampo", "Alimentação")];
    const s = sugerirCategoria("coisa do trampo", hist);
    assert.equal(s.categoria, "Alimentação");
    assert.equal(s.origem, "palavra parecida");
  });

  test("uma ocorrência só não vira padrão", () => {
    const s = sugerirCategoria("coisa do trampo", [g("almoço trampo", "Alimentação")]);
    assert.equal(s.origem, "nenhuma");
  });

  test("ajuste, estorno e 'Outros' não ensinam nada", () => {
    const hist = [
      g("seu zé", "Ajuste", { ajusteConciliacaoId: "a" }),
      g("seu zé", "Lazer", { estornado: true }),
      g("seu zé", "Outros"),
    ];
    assert.equal(sugerirCategoria("seu zé", hist).origem, "nenhuma");
  });

  test("sem histórico, cai no dicionário", () => {
    const s = sugerirCategoria("ifood", []);
    assert.equal(s.categoria, "Alimentação");
    assert.equal(s.origem, "dicionário");
  });
});

describe("frase com lixo e vários registros", async () => {
  const { parseGastoTexto, separarRegistros } = await import("./parseGastoTexto");

  test("'reias' (voz) sai da descrição", () => {
    const r = parseGastoTexto("4 reias em um pão de queijo");
    assert.equal(r.valor, 4);
    assert.equal(r.descricao, "pão de queijo");
  });

  test("número de lista e pontuação solta saem", () => {
    assert.equal(parseGastoTexto("33. lanche do McDonald's 41").descricao, "lanche do McDonald's");
  });

  test("quantidade inteira continua na descrição", () => {
    const r = parseGastoTexto("2 pizzas de 30");
    assert.equal(r.valor, 30);
    assert.equal(r.descricao, "2 pizzas");
  });

  test("dois registros numa frase viram dois", () => {
    const partes = separarRegistros("3 de paieiro e 22,89 de lanche");
    assert.deepEqual(partes, ["3 de paieiro", "22,89 de lanche"]);
    assert.deepEqual(partes.map((p) => parseGastoTexto(p).valor), [3, 22.89]);
  });

  test("lista com vírgula e linha", () => {
    assert.deepEqual(separarRegistros("20 açaí, 49 esfihas\n5,40 uber"), ["20 açaí", "49 esfihas", "5,40 uber"]);
  });

  test("não quebra o que é um registro só", () => {
    assert.deepEqual(separarRegistros("lanche, batata e refri 30"), ["lanche, batata e refri 30"]);
    assert.deepEqual(separarRegistros("trinta e cinco reais no ifood"), ["trinta e cinco reais no ifood"]);
    assert.deepEqual(separarRegistros("R$ 15,50 no uber"), ["R$ 15,50 no uber"]);
  });
});

describe("compra no cartão de crédito não sai do saldo na hora", async () => {
  const { saldoConfirmado } = await import("./finance/saldo");
  const ref = { valor: 1000, atualizadoEm: new Date("2026-10-20T12:00:00-03:00").getTime() };
  const depois = new Date("2026-10-20T15:00:00-03:00").getTime();
  const gasto = (extra: object) =>
    ({ id: "g", descricao: "perfume", valor: 260, categoria: "Beleza", mes: "2026-10", data: "2026-10-20", criadoEm: depois, ...extra }) as never;

  test("débito/Pix desconta o valor", () => {
    assert.equal(saldoConfirmado(ref, [gasto({})]), 740);
  });

  test("crédito não desconta o valor (sai na fatura)", () => {
    assert.equal(saldoConfirmado(ref, [gasto({ pagoCom: "credito", cartao: "Nubank CNPJ" })]), 1000);
  });

  test("crédito ainda desconta o que foi pros cofrinhos", () => {
    assert.equal(saldoConfirmado(ref, [gasto({ pagoCom: "credito", guardado: { c1: 0.1, c2: 0.1 } })]), 999.8);
  });
});
