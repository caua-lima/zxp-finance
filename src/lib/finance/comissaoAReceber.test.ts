import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { comissaoAReceber, comissaoBrutaParaEntry } from "./comissaoPrevista";
import { configurarInicioUso, contaNoPeriodo, Comissao, Ganho } from "../types";

const dia = (data: string, valorTotal: number): Comissao =>
  ({ id: data, data, mes: data.slice(0, 7), reunioes: 0, vendasPerformance: 0, vendasAcelera: 0, valorTotal, criadoEm: 1, atualizadoEm: 1 }) as Comissao;

describe("comissão como ganho do mês seguinte", () => {
  const set = [dia("2026-09-01", 100), dia("2026-09-02", 50), dia("2026-10-01", 999)];

  test("soma só o mês anterior, com 6% de imposto", () => {
    const c = comissaoAReceber("2026-10", set, [])!;
    assert.equal(c.restanteBruto, 150);
    assert.equal(c.restanteImposto, 9);
    assert.equal(c.restanteLiquido, 141);
    assert.equal(c.dias, 2);
  });

  test("o que já foi recebido e vinculado sai do que falta", () => {
    const recebido = { id: "g", tipo: "pontual", mes: "2026-10", valor: 100, origemComissao: "2026-09" } as Ganho;
    const c = comissaoAReceber("2026-10", set, [recebido])!;
    assert.equal(c.recebidoBruto, 100);
    assert.equal(c.restanteBruto, 50);
  });

  test("recebido por inteiro: nada a receber", () => {
    const recebido = { id: "g", tipo: "pontual", mes: "2026-10", valor: 150, origemComissao: "2026-09" } as Ganho;
    assert.equal(comissaoAReceber("2026-10", set, [recebido]), null);
  });

  test("mês sem comissão no mês anterior: nada", () => {
    assert.equal(comissaoAReceber("2026-12", set, []), null);
  });

  test("no DRE entra bruta (o imposto é aplicado uma vez só)", () => {
    const e = comissaoBrutaParaEntry(comissaoAReceber("2026-10", set, [])!, "2026-10");
    assert.equal(e.amount, 150);
    assert.equal(e.type, "income");
  });
});

describe("começar a contar em (zerar sem apagar)", () => {
  test("antes do início não conta; no dia e depois conta; sem início tudo conta", () => {
    configurarInicioUso("2026-10-08");
    assert.equal(contaNoPeriodo("2026-10-07"), false);
    assert.equal(contaNoPeriodo("2026-10-08"), true);
    assert.equal(contaNoPeriodo("2026-11-01"), true);
    configurarInicioUso("");
    assert.equal(contaNoPeriodo("2026-01-01"), true);
  });
});
