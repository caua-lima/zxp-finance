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
