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

describe("relatório dos gastos do dia a dia", () => {
  const g = (id: string, data: string, valor: number, categoria: string, extra: object = {}) =>
    ({ id, descricao: id, valor, categoria, mes: data.slice(0, 7), data, criadoEm: 1, ...extra }) as never;

  test("soma por categoria e por dia, média pelos dias decorridos", async () => {
    const { resumoGastosDiarios } = await import("./gastosDiarios");
    const r = resumoGastosDiarios(
      [
        g("a", "2026-10-09", 30, "Alimentação"),
        g("b", "2026-10-09", 20, "Transporte"),
        g("c", "2026-10-10", 60, "Alimentação"),
        g("ajuste", "2026-10-10", 500, "Ajuste", { ajusteConciliacaoId: "x" }),
        g("estornado", "2026-10-10", 40, "Outros", { estornado: true }),
        g("setembro", "2026-09-30", 99, "Outros"),
      ],
      "2026-10",
      "2026-10-10"
    );
    assert.equal(r.total, 110);
    assert.equal(r.quantidade, 3);
    assert.equal(r.mediaPorDia, 11);
    assert.deepEqual(r.porCategoria[0], { categoria: "Alimentação", total: 90, quantidade: 2 });
    assert.deepEqual(r.porDia.map((d) => d.dia), ["2026-10-10", "2026-10-09"]);
    assert.deepEqual(r.maiorDia, { dia: "2026-10-10", total: 60 });
  });

  test("gasto anterior ao início da contagem fica fora", async () => {
    const { resumoGastosDiarios } = await import("./gastosDiarios");
    configurarInicioUso("2026-10-09");
    const r = resumoGastosDiarios(
      [g("antes", "2026-10-05", 70, "Outros"), g("depois", "2026-10-09", 10, "Outros")],
      "2026-10",
      "2026-10-10"
    );
    configurarInicioUso("");
    assert.equal(r.total, 10);
  });
});
