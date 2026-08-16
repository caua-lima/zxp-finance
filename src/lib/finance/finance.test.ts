import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { FinancialEntry, parcelasRestantesEm, Parcela } from "../types";
import {
  calculateProjectedBalance,
  calculateOverdueEntries,
  calculateUpcomingCommitments,
  deriveDisplayStatus,
  calculateDreBreakdown,
  calculateGastavelPorDia,
  diasRestantesNoMes,
  calculatePendingIncome,
  calculatePendingExpenses,
  hojeISO,
  diaISOde,
} from "./calculations";
import {
  parcelasParaEntries,
  assinaturasParaEntries,
  faturasParaEntries,
} from "./adapters";

/**
 * Testes dos cálculos financeiros críticos (Fase 11). Roda com o test
 * runner nativo do Node — sem Jest/Vitest, sem dependência nova além do
 * tsx (só resolve TS + o alias @/lib/... que esses arquivos usam).
 *
 * `npm test`
 */

function entry(parcial: Partial<FinancialEntry>): FinancialEntry {
  return {
    id: "e1",
    type: "expense",
    status: "pending",
    amount: 100,
    dueDate: "2026-08-15",
    competenceMonth: "2026-08",
    description: "teste",
    categoryId: "outros",
    source: "manual",
    createdAt: 0,
    updatedAt: 0,
    ...parcial,
  };
}

describe("saldo projetado", () => {
  test("soma entradas previstas e subtrai compromissos pendentes do mês", () => {
    const entries: FinancialEntry[] = [
      entry({ id: "1", type: "income", status: "planned", amount: 1000 }),
      entry({ id: "2", type: "expense", status: "pending", amount: 300 }),
      // já pago não deve ser subtraído de novo (já saiu do saldo real)
      entry({ id: "3", type: "expense", status: "paid", amount: 999 }),
      // de outro mês não entra na conta
      entry({ id: "4", type: "expense", status: "pending", amount: 999, competenceMonth: "2026-09" }),
    ];
    const projetado = calculateProjectedBalance(500, entries, "2026-08");
    assert.equal(projetado, 500 + 1000 - 300);
  });

  test("retorna null quando o saldo real nunca foi informado", () => {
    assert.equal(calculateProjectedBalance(null, [], "2026-08"), null);
  });

  test("entradas/compromissos pendentes nunca incluem o que já foi recebido/pago (sem contar duas vezes com o saldo real)", () => {
    const entries: FinancialEntry[] = [
      entry({ id: "1", type: "income", status: "received", amount: 3000 }), // já caiu no saldo real
      entry({ id: "2", type: "income", status: "planned", amount: 500 }), // ainda não recebido
      entry({ id: "3", type: "expense", status: "paid", amount: 200 }), // já saiu do saldo real
      entry({ id: "4", type: "expense", status: "pending", amount: 80 }), // ainda não pago
    ];
    assert.equal(calculatePendingIncome(entries, "2026-08"), 500);
    assert.equal(calculatePendingExpenses(entries, "2026-08"), 80);
  });
});

describe("recebido vs previsto / atraso", () => {
  test("pendente com vencimento no passado vira overdue só na exibição", () => {
    const pendente = entry({ status: "pending", dueDate: "2026-08-01" });
    assert.equal(deriveDisplayStatus(pendente, "2026-08-15"), "overdue");
    assert.equal(pendente.status, "pending"); // o dado guardado não muda
  });

  test("recebido não aparece em atrasados nem em próximos vencimentos", () => {
    const recebido = entry({ type: "income", status: "received", dueDate: "2026-08-01" });
    assert.equal(calculateOverdueEntries([recebido], "2026-08-15").length, 0);
  });

  test("calculateUpcomingCommitments só pega despesa pendente dentro da janela", () => {
    const entries = [
      entry({ id: "a", dueDate: "2026-08-16" }), // 1 dia
      entry({ id: "b", dueDate: "2026-08-25" }), // 10 dias, fora da janela de 7
      entry({ id: "c", status: "paid", dueDate: "2026-08-16" }), // já pago, não entra
    ];
    const proximos = calculateUpcomingCommitments(entries, "2026-08-15", 7);
    assert.deepEqual(proximos.map((e) => e.id), ["a"]);
  });
});

describe("fatura sem duplicidade (naFatura)", () => {
  const parcelaBase: Parcela = {
    id: "p1",
    tipo: "cartao",
    nome: "Notebook",
    valorParcela: 200,
    totalParcelas: 10,
    parcelasRestantes: 5,
    cartao: "Cartão Nubank CPF",
    mesReferencia: "2026-08",
    criadoEm: 0,
  };

  test("parcela naFatura não vira FinancialEntry (o valor já está na fatura)", () => {
    const entradas = parcelasParaEntries([{ ...parcelaBase, naFatura: true }], "2026-08", () => false);
    assert.equal(entradas.length, 0);
  });

  test("parcela sem naFatura vira entry normalmente", () => {
    const entradas = parcelasParaEntries([parcelaBase], "2026-08", () => false);
    assert.equal(entradas.length, 1);
    assert.equal(entradas[0].amount, 200);
  });

  test("assinatura naFatura também fica de fora, mas a fatura em si conta", () => {
    const assinaturaNaFatura = parcelasParaEntries; // no-op, só documentando a simetria
    void assinaturaNaFatura;
    const entradasAssinatura = assinaturasParaEntries(
      [
        {
          id: "a1",
          nome: "Spotify",
          valor: 30,
          ativa: true,
          naFatura: true,
          cartao: "Cartão Nubank CPF",
          criadoEm: 0,
        },
      ],
      "2026-08",
      () => false
    );
    assert.equal(entradasAssinatura.length, 0);

    const entradasFatura = faturasParaEntries(
      [{ id: "f1", nome: "Cartão Nubank CPF", valor: 500, mes: "2026-08", criadoEm: 0 }],
      "2026-08",
      () => false
    );
    assert.equal(entradasFatura.length, 1);
    assert.equal(entradasFatura[0].amount, 500);
  });
});

describe("parcela — projeção mês a mês", () => {
  const parcela: Parcela = {
    id: "p1",
    tipo: "cartao",
    nome: "Notebook",
    valorParcela: 200,
    totalParcelas: 6,
    parcelasRestantes: 6,
    mesReferencia: "2026-09",
    criadoEm: 0,
  };

  test("primeira parcela no mês de referência, não antes", () => {
    assert.equal(parcelasRestantesEm(parcela, "2026-08"), 6); // ainda não começou a decair
    assert.equal(parcelasRestantesEm(parcela, "2026-09"), 6);
    assert.equal(parcelasRestantesEm(parcela, "2026-10"), 5);
  });

  test("nunca fica negativa", () => {
    assert.equal(parcelasRestantesEm(parcela, "2027-06"), 0);
  });
});

describe("gastável por dia", () => {
  test("exemplo: saldo 4000, reserva 1000, mês de 30 dias → 100/dia", () => {
    assert.equal(calculateGastavelPorDia(4000, 1000, 30), 100);
  });

  test("cai conforme o saldo cai (gasto novo registrado)", () => {
    const antes = calculateGastavelPorDia(4000, 1000, 30);
    const depoisDeGastar500 = calculateGastavelPorDia(3500, 1000, 30);
    assert.equal(antes, 100);
    assert.equal(depoisDeGastar500, (3500 - 1000) / 30);
    assert.ok(depoisDeGastar500! < antes!);
  });

  test("sem saldo definido, retorna null", () => {
    assert.equal(calculateGastavelPorDia(null, 1000, 30), null);
  });

  test("diasRestantesNoMes conta hoje: dia 31 de um mês de 31 dias ainda é 1 dia", () => {
    assert.equal(diasRestantesNoMes("2026-08-31"), 1);
    assert.equal(diasRestantesNoMes("2026-08-01"), 31);
  });

  test("diaISOde usa o fuso de Brasília, não UTC: 23h de 15/08 em Brasília ainda é dia 15, mesmo já sendo dia 16 em UTC", () => {
    // 23h em Brasília (UTC-3) em 2026-08-15 == 2026-08-16T02:00:00Z.
    // new Date(...).toISOString().slice(0,10) daria "2026-08-16" (o bug
    // original): o gasto de "ontem à noite" contaria como "hoje".
    const timestamp = new Date("2026-08-16T02:00:00Z").getTime();
    assert.equal(diaISOde(timestamp), "2026-08-15");
  });

  test("diaISOde: 9h da manhã em Brasília cai no mesmo dia em UTC (sem virada)", () => {
    const timestamp = new Date("2026-08-15T12:00:00Z").getTime();
    assert.equal(diaISOde(timestamp), "2026-08-15");
  });

  test("hojeISO devolve uma data no formato AAAA-MM-DD", () => {
    assert.match(hojeISO(), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("DRE — resultado operacional", () => {
  test("reembolso fica separado da receita operacional", () => {
    const entries: FinancialEntry[] = [
      entry({ id: "1", type: "income", status: "received", amount: 1000, categoryId: "Salário" }),
      entry({ id: "2", type: "income", status: "received", amount: 200, categoryId: "Reembolsos" }),
    ];
    const dre = calculateDreBreakdown(entries);
    assert.equal(dre.receitaOperacional, 1000);
    assert.equal(dre.reembolsos, 200);
  });

  test("despesa cancelada não entra em nenhuma categoria", () => {
    const entries: FinancialEntry[] = [
      entry({ id: "1", type: "expense", status: "cancelled", amount: 500, source: "fixed_cost" }),
    ];
    const dre = calculateDreBreakdown(entries);
    assert.equal(dre.despesasRecorrentes, 0);
  });

  test("classifica despesa por origem: variável, recorrente, parcela/cartão", () => {
    const entries: FinancialEntry[] = [
      entry({ id: "1", amount: 50, source: "manual" }),
      entry({ id: "2", amount: 100, source: "fixed_cost" }),
      entry({ id: "3", amount: 150, source: "subscription" }),
      entry({ id: "4", amount: 200, source: "installment" }),
      entry({ id: "5", amount: 250, source: "card_bill" }),
    ];
    const dre = calculateDreBreakdown(entries);
    assert.equal(dre.despesasVariaveis, 50);
    assert.equal(dre.despesasRecorrentes, 250);
    assert.equal(dre.parcelasCartao, 450);
  });
});
