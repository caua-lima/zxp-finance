import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { areaDaVida, fraseDoDia, notificacaoDoDia, FRASES } from "./abundancia";

describe("linguagem de abundância", () => {
  test("categoria vira área da vida; desconhecida mantém o nome", () => {
    assert.equal(areaDaVida("Compras").nome, "Estilo e autoestima");
    assert.equal(areaDaVida("Lazer").nome, "Experiências e alegria");
    assert.equal(areaDaVida("Pet").nome, "Pet");
  });

  test("frase do dia é estável no dia e muda no dia seguinte", () => {
    assert.equal(fraseDoDia("2026-10-18"), fraseDoDia("2026-10-18"));
    assert.notEqual(fraseDoDia("2026-10-18"), fraseDoDia("2026-10-19"));
    assert.ok(FRASES.includes(fraseDoDia("2027-01-01") as (typeof FRASES)[number]));
  });

  test("aviso do dia não fala em limite nem em 'pode gastar'", () => {
    const n = notificacaoDoDia({ hojeISO: "2026-10-18", saldoAtual: 1200, investidoNoMes: 350 });
    const texto = `${n.title} ${n.body}`;
    assert.doesNotMatch(texto, /pode gastar|limite|passou/i);
    assert.match(n.body, /1\.200,00/);
    assert.match(n.body, /350,00 em qualidade de vida/);
  });
});
