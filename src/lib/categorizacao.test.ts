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
    const s = sugerirCategoria("Padoca", [g("padoca", "Alimentação")]);
    assert.equal(s.categoria, "Alimentação");
    assert.equal(s.origem, "seus registros");
  });

  test("sua correção vence o dicionário", () => {
    // o dicionário diria Transporte (uber), mas você sempre registrou como Lazer
    const s = sugerirCategoria("uber", [g("uber", "Lazer"), g("uber", "Lazer")]);
    assert.equal(s.categoria, "Lazer");
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
      g("padoca", "Ajuste", { ajusteConciliacaoId: "a" }),
      g("padoca", "Lazer", { estornado: true }),
      g("padoca", "Outros"),
    ];
    assert.equal(sugerirCategoria("padoca", hist).origem, "nenhuma");
  });

  test("sem histórico, cai no dicionário", () => {
    const s = sugerirCategoria("ifood", []);
    assert.equal(s.categoria, "Alimentação");
    assert.equal(s.origem, "dicionário");
  });
});
