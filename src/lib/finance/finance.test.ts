import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { FinancialEntry, parcelasRestantesEm, mesSeguinte, mesAnteriorDe, Parcela, Gasto } from "../types";
import {
  calculateProjectedBalance,
  calculateOverdueEntries,
  calculateUpcomingCommitments,
  deriveDisplayStatus,
  calculateDreBreakdown,
  calculateGastavelPorDia,
  calculateGastoDoDia,
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
import { sugerirCrescimentoCategorias, compararComBenchmarkIBGE } from "./sugestoes";
import { GrupoPorCategoria } from "./entries";
import { calcularComissaoDoDia } from "./comissoes";

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

  test("ganho pendente nunca vira 'atrasado' na exibição, mesmo com dueDate no passado (dueDate de ganho é sempre dia 1 do mês, não é um vencimento real)", () => {
    const ganhoPendente = entry({ type: "income", status: "planned", dueDate: "2026-08-01" });
    assert.equal(deriveDisplayStatus(ganhoPendente, "2026-08-15"), "planned");
  });

  test("despesa pendente com dueDate no passado continua virando 'atrasado'", () => {
    const despesaPendente = entry({ type: "expense", status: "pending", dueDate: "2026-08-01" });
    assert.equal(deriveDisplayStatus(despesaPendente, "2026-08-15"), "overdue");
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

  test("mês antes da referência não conta como parcela ativa — ainda não começou", () => {
    // Bug real reportado: uma parcela com mesReferencia em setembro
    // aparecia como "parcela 1 de 10" já em agosto (e contava no
    // checklist/DRE de agosto), porque essa função devolvia a contagem
    // cheia pra qualquer mês antes da referência.
    assert.equal(parcelasRestantesEm(parcela, "2026-08"), 0);
    assert.equal(parcelasRestantesEm(parcela, "2026-09"), 6);
    assert.equal(parcelasRestantesEm(parcela, "2026-10"), 5);
  });

  test("nunca fica negativa", () => {
    assert.equal(parcelasRestantesEm(parcela, "2027-06"), 0);
  });

  test("mesSeguinte/mesAnteriorDe andam um mês, virando o ano quando preciso", () => {
    assert.equal(mesSeguinte("2026-08"), "2026-09");
    assert.equal(mesSeguinte("2026-12"), "2027-01");
    assert.equal(mesAnteriorDe("2026-09"), "2026-08");
    assert.equal(mesAnteriorDe("2027-01"), "2026-12");
  });

  test("dar baixa (simulado): avançar a referência a partir de si mesma, não do mês real de hoje, mantém a próxima parcela no mês certo mesmo pagando várias atrasadas de uma vez", () => {
    // Cenário do bug reportado: "Certificado Digital", 6 parcelas, já
    // pagas as 4 primeiras (mesReferencia = agosto, restam 2). Dar baixa
    // da parcela de agosto deve deixar a próxima (a 6ª) marcada pra
    // setembro, nunca "ainda em agosto".
    const referenciaAposBaixa = mesSeguinte("2026-08");
    const parcelaAposBaixa: Parcela = {
      ...parcela,
      totalParcelas: 6,
      parcelasRestantes: 1,
      mesReferencia: referenciaAposBaixa,
    };
    assert.equal(referenciaAposBaixa, "2026-09");
    assert.equal(parcelasRestantesEm(parcelaAposBaixa, "2026-08"), 0); // agosto já foi pago, nada resta nele
    assert.equal(parcelasRestantesEm(parcelaAposBaixa, "2026-09"), 1); // a 6ª cai em setembro
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
    assert.equal(depoisDeGastar500, Math.round(((3500 - 1000) / 30) * 100) / 100);
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

function gasto(parcial: Partial<Gasto>): Gasto {
  return {
    id: "g1",
    descricao: "teste",
    valor: 50,
    categoria: "Outros",
    mes: "2026-08",
    criadoEm: new Date("2026-08-17T12:00:00Z").getTime(), // meio-dia UTC = manhã em Brasília, mesmo dia
    ...parcial,
  };
}

describe("gasto do dia — não conta ajuste de conciliação duas vezes", () => {
  test("ajuste de conciliação de hoje não entra no total de hoje", () => {
    const gastos = [
      gasto({ id: "1", valor: 30 }),
      gasto({ id: "2", valor: 277.32, ajusteConciliacaoId: "conc1" }),
    ];
    // só o gasto normal conta — o ajuste já foi descontado do saldo real
    // na hora da conciliação, contar de novo aqui subtrairia duas vezes
    assert.equal(calculateGastoDoDia(gastos, "2026-08-17"), 30);
  });

  test("gasto de outro dia não entra", () => {
    const gastos = [
      gasto({ id: "1", valor: 30, criadoEm: new Date("2026-08-16T12:00:00Z").getTime() }),
    ];
    assert.equal(calculateGastoDoDia(gastos, "2026-08-17"), 0);
  });

  test("estorno (valor negativo) do dia entra normalmente — só ajuste é especial", () => {
    const gastos = [gasto({ id: "1", valor: -20 })];
    assert.equal(calculateGastoDoDia(gastos, "2026-08-17"), -20);
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

function grupo(categoryId: string, total: number): GrupoPorCategoria {
  return { categoryId, total, itens: [] };
}

describe("sugestões — categorias em crescimento", () => {
  test("ignora crescimento pequeno em dinheiro, mesmo que percentualmente grande", () => {
    const atual = [grupo("Lazer", 18)];
    const anterior = [grupo("Lazer", 10)]; // +80%, mas só R$8 — ruído
    assert.equal(sugerirCrescimentoCategorias(atual, anterior).length, 0);
  });

  test("categoria nova (sem histórico no mês anterior) aparece como crescimento", () => {
    const atual = [grupo("Viagem", 300)];
    const anterior: GrupoPorCategoria[] = [];
    const resultado = sugerirCrescimentoCategorias(atual, anterior);
    assert.equal(resultado.length, 1);
    assert.equal(resultado[0].deltaPercentual, Infinity);
  });

  test("crescimento relevante em dinheiro e percentual aparece, ordenado do maior pro menor", () => {
    const atual = [grupo("Alimentação", 800), grupo("Transporte", 400)];
    const anterior = [grupo("Alimentação", 500), grupo("Transporte", 200)];
    const resultado = sugerirCrescimentoCategorias(atual, anterior);
    assert.deepEqual(resultado.map((c) => c.categoryId), ["Alimentação", "Transporte"]);
  });
});

describe("sugestões — benchmark IBGE", () => {
  test("multiplica a média per capita pelas pessoas da casa informadas no perfil", () => {
    const despesas = [grupo("Moradia", 900)];
    const comparacao = compararComBenchmarkIBGE(despesas, 2);
    const habitacao = comparacao.find((c) => c.categoria === "Habitação")!;
    assert.equal(habitacao.benchmark, 466 * 2);
    assert.equal(habitacao.gastoUsuario, 900);
  });

  test("sem perfil informado, assume 1 pessoa", () => {
    const comparacao = compararComBenchmarkIBGE([], undefined);
    const habitacao = comparacao.find((c) => c.categoria === "Habitação")!;
    assert.equal(habitacao.benchmark, 466);
  });

  test("categoria sem mapeamento pro IBGE (ex: Lazer) não aparece na comparação", () => {
    const comparacao = compararComBenchmarkIBGE([grupo("Lazer", 100)], 1);
    assert.equal(comparacao.length, 3); // só Habitação, Transporte, Alimentação
    assert.ok(!comparacao.some((c) => c.categoria === "Lazer"));
  });
});

describe("comissão do dia", () => {
  const valores = { valorReuniao: 12, valorVendaPerformance: 30, valorVendaAcelera: 45 };

  test("multiplica cada contagem pelo valor unitário e soma", () => {
    const total = calcularComissaoDoDia(
      { reunioes: 3, vendasPerformance: 2, vendasAcelera: 1 },
      valores
    );
    assert.equal(total, 3 * 12 + 2 * 30 + 1 * 45); // 141
  });

  test("dia sem nenhum lançamento dá zero", () => {
    assert.equal(
      calcularComissaoDoDia({ reunioes: 0, vendasPerformance: 0, vendasAcelera: 0 }, valores),
      0
    );
  });
});
