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
