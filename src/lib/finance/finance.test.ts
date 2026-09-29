import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  FinancialEntry,
  parcelasRestantesEm,
  mesSeguinte,
  mesAnteriorDe,
  idadeEm,
  diasAteAniversario,
  MES_MINIMO,
  Parcela,
  Gasto,
  Caixinha,
  Comissao,
  Ganho,
  Assinatura,
} from "../types";
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
  calcularSaldoAtual,
  resumoCompromissos,
} from "./calculations";
import {
  parcelasParaEntries,
  assinaturasParaEntries,
  faturasParaEntries,
  faturasPrevistasParaEntries,
  ganhosParaEntries,
} from "./adapters";
import {
  comissaoPrevistaPara,
  comissaoPrevistaParaEntries,
  ehGanhoDeComissao,
} from "./comissaoPrevista";
import {
  composicaoFaturaPrevista,
  devePreverFatura,
  CARTAO_NAO_INFORMADO,
} from "./faturaPrevista";
import {
  parcelasAPagarDesde,
  mesDaUltimaParcela,
  resumoParcelasAtivas,
} from "./resumoParcelas";
import {
  calcularRendimento,
  cdiAnual,
  somarPorMes,
  converterSerieBcb,
} from "./rendimento";
import { sugerirCrescimentoCategorias, compararComBenchmarkIBGE } from "./sugestoes";
import { GrupoPorCategoria } from "./entries";
import { calcularComissaoDoDia } from "./comissoes";
import { compararRenda, MEDIA_NACIONAL } from "./benchmarkRenda";
import { diasAteVencimento, deveAvisar, montarAviso } from "./vencimentoFatura";
import {
  feriadosBancarios,
  ehDiaUtil,
  proximoDiaUtil,
  vencimentoEfetivo,
} from "./diasUteis";
import {
  caixinhasQueRecebem,
  totalPorGasto,
  totalGuardado,
  depositoDoGasto,
  faltaParaMeta,
  progressoDaMeta,
  gastosAteAMeta,
} from "./caixinhas";
import { simularNovoCompromisso, ContextoSimulacao } from "./simulador";
import { saldoEstaVelho } from "./alerts";
import {
  projetarRitmo,
  resumoDaSemana,
  ehSexta,
  ehDomingo,
  ehUltimoDiaDoMes,
  orcamentoDoFimDeSemana,
} from "./ritmo";
import {
  notificacaoDiaria,
  avisoRitmoPerigoso,
  avisoComissaoEsquecida,
  avisoChecklistParado,
} from "./notificacoes";
import { semUndefined } from "../semUndefined";
import { parseGastoTexto } from "../parseGastoTexto";
import { inferirCategoriaGasto } from "../categoriasGasto";
import {
  avaliarDiasFechados,
  sequenciaAtual,
  melhorSequencia,
  resumirConquistas,
  dinheiroLiberando,
  categoriasQueMelhoraram,
} from "./conquistas";

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

describe("idade e aniversário", () => {
  test("idade só vira no dia do aniversário, não antes", () => {
    assert.equal(idadeEm("2007-08-20", "2026-08-19"), 18); // véspera
    assert.equal(idadeEm("2007-08-20", "2026-08-20"), 19); // no dia
    assert.equal(idadeEm("2007-08-20", "2026-08-21"), 19);
  });

  test("mês anterior ao aniversário ainda não conta o ano", () => {
    assert.equal(idadeEm("2007-12-31", "2026-08-24"), 18);
  });

  test("diasAteAniversario: 0 no dia, e vira pro ano seguinte quando já passou", () => {
    assert.equal(diasAteAniversario("2007-08-24", "2026-08-24"), 0);
    assert.equal(diasAteAniversario("2007-08-26", "2026-08-24"), 2);
    // já passou em agosto → conta pro aniversário de 2027
    assert.equal(diasAteAniversario("2007-08-20", "2026-08-24"), 361);
  });
});

describe("renda vs. média nacional (PNAD)", () => {
  test("quem está cursando superior é comparado com a média de médio completo (último nível concluído)", () => {
    const cursando = compararRenda(2905, "superior_incompleto")!;
    const concluiuMedio = compararRenda(2905, "medio")!;
    assert.equal(cursando.mediaDoNivel, concluiuMedio.mediaDoNivel);
    assert.equal(cursando.diferenca, 0); // exatamente na média
    assert.equal(cursando.vezesAMedia, 1);
  });

  test("acima da média: diferença e percentual positivos", () => {
    const c = compararRenda(5810, "medio")!; // exatamente o dobro de 2905
    assert.ok(c.acimaDaMedia);
    assert.equal(c.diferenca, 2905);
    assert.equal(c.percentual, 100);
    assert.equal(c.vezesAMedia, 2);
  });

  test("abaixo da média: diferença e percentual negativos", () => {
    const c = compararRenda(1000, "superior")!;
    assert.equal(c.acimaDaMedia, false);
    assert.ok(c.diferenca < 0);
    assert.ok(c.percentual < 0);
  });

  test("compara também com a média nacional geral, independente da escolaridade", () => {
    const c = compararRenda(MEDIA_NACIONAL, "medio")!;
    assert.equal(c.percentualVsNacional, 0);
  });

  test("renda zero não gera comparação (evita divisão por zero na tela)", () => {
    assert.equal(compararRenda(0, "medio"), null);
  });
});

describe("vencimento de fatura", () => {
  // dia 20/08/2026 é uma quinta-feira comum: sem fim de semana nem
  // feriado no meio, a contagem é a distância pura em dias
  test("conta os dias certos até o vencimento", () => {
    assert.equal(diasAteVencimento(20, "2026-08", "2026-08-15"), 5);
    assert.equal(diasAteVencimento(20, "2026-08", "2026-08-19"), 1);
    assert.equal(diasAteVencimento(20, "2026-08", "2026-08-20"), 0);
    assert.equal(diasAteVencimento(20, "2026-08", "2026-08-21"), -1); // já venceu
  });

  test("conta até o dia útil, não até o dia cadastrado", () => {
    // vencimento dia 15/08/2026 é sábado — só é processado na segunda, 17
    assert.equal(diasAteVencimento(15, "2026-08", "2026-08-15"), 2);
    assert.equal(diasAteVencimento(15, "2026-08", "2026-08-17"), 0);
    assert.equal(diasAteVencimento(15, "2026-08", "2026-08-18"), -1);
  });

  test("no domingo 06/09/2026 a fatura de dia 6 ainda não venceu (7 é feriado)", () => {
    // o caso que motivou tudo isso: dia 6 é domingo, dia 7 é a
    // Independência, então o vencimento real é terça, dia 8
    assert.equal(diasAteVencimento(6, "2026-09", "2026-09-06"), 2);
    assert.equal(diasAteVencimento(6, "2026-09", "2026-09-07"), 1);
    assert.equal(diasAteVencimento(6, "2026-09", "2026-09-08"), 0);
    assert.equal(diasAteVencimento(6, "2026-09", "2026-09-09"), -1);
  });

  test("dia 31 em mês de 30 dias cai no último dia do mês, não vaza pro mês seguinte", () => {
    // setembro tem 30 dias — vencimento "dia 31" vira dia 30
    assert.equal(diasAteVencimento(31, "2026-09", "2026-09-30"), 0);
  });

  test("avisa só nos 3 marcos: 5 dias, 1 dia e no dia", () => {
    assert.equal(deveAvisar(5), true);
    assert.equal(deveAvisar(1), true);
    assert.equal(deveAvisar(0), true);
    assert.equal(deveAvisar(4), false);
    assert.equal(deveAvisar(2), false);
    assert.equal(deveAvisar(-1), false); // atrasada não repete aviso aqui
  });

  test("cada marco tem seu próprio texto", () => {
    assert.match(montarAviso("Nubank", "R$ 500,00", 5)!.titulo, /em 5 dias/);
    assert.match(montarAviso("Nubank", "R$ 500,00", 1)!.titulo, /amanhã/);
    assert.match(montarAviso("Nubank", "R$ 500,00", 0)!.titulo, /hoje/);
    assert.equal(montarAviso("Nubank", "R$ 500,00", 3), null);
  });
});

describe("calendário bancário brasileiro", () => {
  test("pega os feriados nacionais fixos", () => {
    const f = feriadosBancarios(2026);
    for (const dia of [
      "2026-01-01",
      "2026-04-21",
      "2026-05-01",
      "2026-09-07",
      "2026-10-12",
      "2026-11-02",
      "2026-11-15",
      "2026-12-25",
    ]) {
      assert.ok(f.has(dia), `${dia} deveria ser feriado`);
    }
  });

  test("calcula os feriados que dependem da Páscoa", () => {
    // Páscoa de 2026 é 05/04
    const f = feriadosBancarios(2026);
    assert.ok(f.has("2026-02-16"), "segunda de carnaval");
    assert.ok(f.has("2026-02-17"), "terça de carnaval");
    assert.ok(f.has("2026-04-03"), "sexta-feira santa");
    assert.ok(f.has("2026-06-04"), "corpus christi");
    // e num ano com Páscoa bem diferente, pra provar que não é tabela fixa
    const f2025 = feriadosBancarios(2025);
    assert.ok(f2025.has("2025-03-03"), "carnaval 2025");
    assert.ok(f2025.has("2025-04-18"), "sexta-feira santa 2025");
  });

  test("Consciência Negra só vale como feriado nacional a partir de 2024", () => {
    assert.ok(feriadosBancarios(2026).has("2026-11-20"));
    assert.ok(feriadosBancarios(2024).has("2024-11-20"));
    assert.ok(!feriadosBancarios(2023).has("2023-11-20"));
  });

  test("fim de semana e feriado não são dia útil", () => {
    assert.equal(ehDiaUtil("2026-09-04"), true); // sexta comum
    assert.equal(ehDiaUtil("2026-09-05"), false); // sábado
    assert.equal(ehDiaUtil("2026-09-06"), false); // domingo
    assert.equal(ehDiaUtil("2026-09-07"), false); // Independência
    assert.equal(ehDiaUtil("2026-09-08"), true); // terça
  });

  test("dia útil não é empurrado pra frente", () => {
    assert.equal(proximoDiaUtil("2026-09-08"), "2026-09-08");
  });

  test("empurra pro próximo dia útil, pulando a emenda inteira", () => {
    assert.equal(proximoDiaUtil("2026-09-05"), "2026-09-08"); // sáb → ter
    assert.equal(proximoDiaUtil("2026-09-06"), "2026-09-08"); // dom → ter
    assert.equal(proximoDiaUtil("2026-09-07"), "2026-09-08"); // feriado → ter
  });

  test("atravessa a virada de mês quando precisa", () => {
    // 31/10/2026 é sábado, 1/11 domingo, 2/11 Finados → só dia 3
    assert.equal(proximoDiaUtil("2026-10-31"), "2026-11-03");
  });

  test("explica por que o vencimento foi adiado", () => {
    const feriado = vencimentoEfetivo(6, "2026-09");
    assert.equal(feriado.original, "2026-09-06");
    assert.equal(feriado.efetivo, "2026-09-08");
    assert.equal(feriado.adiado, true);
    assert.match(feriado.motivo!, /fim de semana/);

    const naSegunda = vencimentoEfetivo(7, "2026-09");
    assert.equal(naSegunda.efetivo, "2026-09-08");
    assert.match(naSegunda.motivo!, /Independência/);
  });

  test("vencimento em dia útil não vira adiamento", () => {
    const v = vencimentoEfetivo(8, "2026-09");
    assert.equal(v.original, "2026-09-08");
    assert.equal(v.efetivo, "2026-09-08");
    assert.equal(v.adiado, false);
    assert.equal(v.motivo, null);
  });

  test("dia maior que o mês continua caindo no último dia, e daí ajusta", () => {
    // fevereiro de 2026 termina no sábado 28 → segunda, 2 de março
    const v = vencimentoEfetivo(31, "2026-02");
    assert.equal(v.original, "2026-02-28");
    assert.equal(v.efetivo, "2026-03-02");
  });
});

describe("caixinhas", () => {
  function caixinha(over: Partial<Caixinha> = {}): Caixinha {
    return {
      id: "c1",
      nome: "Sair de casa",
      saldo: 0,
      porGasto: 0.1,
      ativa: true,
      depositos: 0,
      criadoEm: 0,
      atualizadoEm: 0,
      ...over,
    };
  }

  test("só caixinha ativa e com valor configurado recebe depósito", () => {
    const lista = [
      caixinha({ id: "a" }),
      caixinha({ id: "b", ativa: false }),
      caixinha({ id: "c", porGasto: 0 }),
    ];
    assert.deepEqual(
      caixinhasQueRecebem(lista).map((c) => c.id),
      ["a"]
    );
  });

  test("soma quanto sai por gasto sem erro de ponto flutuante", () => {
    // 0.1 + 0.2 dá 0.30000000000000004 em float puro
    const lista = [caixinha({ id: "a", porGasto: 0.1 }), caixinha({ id: "b", porGasto: 0.2 })];
    assert.equal(totalPorGasto(lista), 0.3);
  });

  test("caixinha pausada não entra no por-gasto, mas o que ela já tem continua contando", () => {
    const lista = [
      caixinha({ id: "a", porGasto: 0.1, saldo: 12.5 }),
      caixinha({ id: "b", porGasto: 0.5, saldo: 30, ativa: false }),
    ];
    assert.equal(totalPorGasto(lista), 0.1);
    assert.equal(totalGuardado(lista), 42.5);
  });

  test("o depósito sai como mapa de caixinha pra valor, pro estorno saber o que devolver", () => {
    const lista = [
      caixinha({ id: "a", porGasto: 0.1 }),
      caixinha({ id: "b", porGasto: 1 }),
      caixinha({ id: "c", porGasto: 5, ativa: false }),
    ];
    assert.deepEqual(depositoDoGasto(lista), { a: 0.1, b: 1 });
  });

  test("sem caixinha ativa o depósito é vazio, e não um objeto com zeros", () => {
    assert.deepEqual(depositoDoGasto([caixinha({ ativa: false })]), {});
    assert.deepEqual(depositoDoGasto([]), {});
  });

  test("sem meta não há progresso pra mostrar", () => {
    const c = caixinha({ saldo: 50 });
    assert.equal(progressoDaMeta(c), null);
    assert.equal(faltaParaMeta(c), null);
    assert.equal(gastosAteAMeta(c), null);
  });

  test("progresso e quanto falta pra meta", () => {
    const c = caixinha({ saldo: 25, meta: 100 });
    assert.equal(progressoDaMeta(c), 25);
    assert.equal(faltaParaMeta(c), 75);
  });

  test("meta batida trava em 100% e não vira falta negativa", () => {
    const c = caixinha({ saldo: 150, meta: 100 });
    assert.equal(progressoDaMeta(c), 100);
    assert.equal(faltaParaMeta(c), 0);
    assert.equal(gastosAteAMeta(c), null); // não há contagem regressiva
  });

  test("estima quantos gastos ainda faltam pra bater a meta", () => {
    // faltam R$ 75 guardando R$ 0,10 por gasto → 750 gastos
    assert.equal(gastosAteAMeta(caixinha({ saldo: 25, meta: 100, porGasto: 0.1 })), 750);
    // arredonda pra cima: 3 gastos de R$ 0,10 não fecham R$ 0,25
    assert.equal(gastosAteAMeta(caixinha({ saldo: 0, meta: 0.25, porGasto: 0.1 })), 3);
  });

  test("caixinha pausada não estima contagem regressiva", () => {
    const c = caixinha({ saldo: 0, meta: 100, ativa: false });
    assert.equal(gastosAteAMeta(c), null);
  });
});

describe("simulador de viabilidade", () => {
  function contexto(over: Partial<ContextoSimulacao> = {}): ContextoSimulacao {
    return {
      saldoAtual: 1000,
      reservaMeta: 100,
      rendaMensalLiquida: 2000,
      despesasFixasMensais: 1500,
      parcelasAtivas: [],
      ...over,
    };
  }

  test("sobra dinheiro todo mês: viável, sem mês ruim", () => {
    // renda 2000, despesas fixas 1500, sobra 500/mês — uma parcela de 200
    // ainda deixa 300 de sobra, bem acima da reserva de 100
    const r = simularNovoCompromisso(contexto(), 200, 12);
    assert.equal(r.viavel, true);
    assert.equal(r.primeiroMesRuim, null);
    assert.equal(r.motivo, null);
    assert.equal(r.meses.length, 12);
  });

  test("aponta o primeiro mês em que o saldo fica negativo", () => {
    // saldo 1000, sobra líquida 500/mês antes do novo peso; compromisso de
    // 600/mês come 100 do saldo por mês — no mês 3 fica -800+1500(reserva
    // não entra aqui, é so negativo mesmo)... calculado abaixo
    const r = simularNovoCompromisso(
      contexto({ saldoAtual: 200, reservaMeta: 0, rendaMensalLiquida: 1000, despesasFixasMensais: 1000 }),
      150,
      6
    );
    // cada mês: saldo += 1000 - 1000 - 150 = -150
    // mês1: 200-150=50 · mês2: 50-150=-100 → inviável no mês 2
    assert.equal(r.viavel, false);
    assert.equal(r.primeiroMesRuim, 2);
    assert.equal(r.motivo, "saldo_negativo");
    assert.equal(r.meses[0].saldoFinal, 50);
    assert.equal(r.meses[1].saldoFinal, -100);
  });

  test("saldo positivo mas abaixo da reserva também é inviável, com motivo diferente", () => {
    const r = simularNovoCompromisso(
      contexto({ saldoAtual: 500, reservaMeta: 300, rendaMensalLiquida: 1000, despesasFixasMensais: 1000 }),
      150,
      3
    );
    // mês1: 500-150=350 (>=300, ok) · mês2: 350-150=200 (<300 → ruim)
    assert.equal(r.viavel, false);
    assert.equal(r.primeiroMesRuim, 2);
    assert.equal(r.motivo, "abaixo_da_reserva");
  });

  test("só marca o PRIMEIRO mês ruim, não repete a cada mês seguinte", () => {
    const r = simularNovoCompromisso(
      contexto({ saldoAtual: 100, rendaMensalLiquida: 500, despesasFixasMensais: 700 }),
      0,
      5
    );
    assert.equal(r.primeiroMesRuim, 1);
    // mesmo com o saldo continuando negativo nos meses seguintes, o motivo
    // e o número do mês não mudam
    assert.equal(r.meses[4].saldoFinal < 0, true);
  });

  test("parcela já em andamento some da conta no mês em que ela termina", () => {
    // uma parcela de 300 que só tem 2 meses restantes: nos meses 3+ ela
    // não pesa mais, e o saldo passa a melhorar
    const r = simularNovoCompromisso(
      contexto({
        saldoAtual: 0,
        rendaMensalLiquida: 1000,
        despesasFixasMensais: 500,
        parcelasAtivas: [{ valorMensal: 300, mesesRestantes: 2 }],
      }),
      0,
      4
    );
    // mês1: 0+1000-500-300=200 · mês2: 200+1000-500-300=400
    // mês3 (parcela já não conta): 400+1000-500=900
    assert.equal(r.meses[0].saldoFinal, 200);
    assert.equal(r.meses[1].saldoFinal, 400);
    assert.equal(r.meses[2].saldoFinal, 900);
    assert.equal(r.meses[2].compromissosDoMes, 500);
  });

  test("compromisso de valor zero simula 'e se eu não assumisse nada'", () => {
    const r = simularNovoCompromisso(contexto(), 0, 1);
    assert.equal(r.meses[0].compromissosDoMes, 1500);
  });
});

describe("comissão prevista pro mês seguinte", () => {
  function comissao(data: string, valorTotal: number): Comissao {
    return {
      id: data,
      data,
      mes: data.slice(0, 7),
      reunioes: 0,
      vendasPerformance: 0,
      vendasAcelera: 0,
      valorTotal,
      criadoEm: 0,
      atualizadoEm: 0,
    };
  }
  function ganho(over: Partial<Ganho>): Ganho {
    return { id: "g", tipo: "pontual", descricao: "x", valor: 0, criadoEm: 0, ...over };
  }

  test("o que foi lançado em setembro cai em outubro, já sem o imposto", () => {
    const p = comissaoPrevistaPara("2026-10", [
      comissao("2026-09-01", 100),
      comissao("2026-09-02", 150),
      comissao("2026-10-01", 999), // outubro não entra na previsão de outubro
    ]);
    assert.equal(p?.mesOrigem, "2026-09");
    assert.equal(p?.bruto, 250);
    assert.equal(p?.imposto, 15); // 6%
    assert.equal(p?.liquido, 235);
    assert.equal(p?.dias, 2);
  });

  test("sem comissão lançada no mês anterior, não há previsão", () => {
    assert.equal(comissaoPrevistaPara("2026-10", [comissao("2026-08-10", 100)]), null);
  });

  test("vira entrada prevista (não recebida) no mês seguinte", () => {
    const entries = comissaoPrevistaParaEntries([comissao("2026-09-01", 100)], [], "2026-10");
    assert.equal(entries.length, 1);
    assert.equal(entries[0].type, "income");
    assert.equal(entries[0].status, "planned");
    assert.equal(entries[0].amount, 94);
    assert.equal(entries[0].competenceMonth, "2026-10");
    assert.equal(entries[0].estimado, true);
  });

  test("some quando o pagamento real da comissão é lançado em Ganhos", () => {
    const recebida = ganho({ mes: "2026-10", categoriaReceita: "Comissão", valor: 2500 });
    assert.deepEqual(
      comissaoPrevistaParaEntries([comissao("2026-09-01", 100)], [recebida], "2026-10"),
      []
    );
  });

  test("reconhece pagamento de comissão pela categoria ou pela descrição", () => {
    assert.equal(ehGanhoDeComissao(ganho({ categoriaReceita: "Comissão" })), true);
    assert.equal(ehGanhoDeComissao(ganho({ descricao: "Comissão de setembro" })), true);
    assert.equal(ehGanhoDeComissao(ganho({ descricao: "comissao" })), true);
    assert.equal(ehGanhoDeComissao(ganho({ descricao: "Salário" })), false);
    // recorrente não é pagamento de comissão, e arquivado não conta
    assert.equal(
      ehGanhoDeComissao(ganho({ tipo: "recorrente", categoriaReceita: "Comissão" })),
      false
    );
    assert.equal(ehGanhoDeComissao(ganho({ categoriaReceita: "Comissão", arquivado: true })), false);
  });
});

describe("fatura prevista", () => {
  function parcela(over: Partial<Parcela>): Parcela {
    return {
      id: "p",
      tipo: "cartao",
      nome: "Parcela",
      valorParcela: 100,
      totalParcelas: 10,
      parcelasRestantes: 5,
      naFatura: true,
      cartao: "Nubank CNPJ",
      mesReferencia: "2026-09",
      criadoEm: 0,
      ...over,
    };
  }
  function assinatura(over: Partial<Assinatura>): Assinatura {
    return {
      id: "a",
      nome: "Spotify",
      valor: 20,
      ativa: true,
      naFatura: true,
      cartao: "Nubank CNPJ",
      criadoEm: 0,
      ...over,
    } as Assinatura;
  }

  test("soma parcelas e assinaturas daquele cartão, com o valor cheio da parcela", () => {
    const prevista = composicaoFaturaPrevista(
      "Nubank CNPJ",
      "2026-10",
      [
        parcela({ id: "1", valorParcela: 134.26, dividida: true }), // cartão cobra cheio
        parcela({ id: "2", cartao: "Inter" }), // outro cartão
        parcela({ id: "3", naFatura: false }), // fora da fatura
        parcela({ id: "4", parcelasRestantes: 1 }), // acabou em setembro
      ],
      [assinatura({}), assinatura({ id: "b", ativa: false })]
    );
    assert.equal(prevista.total, 154.26);
    assert.equal(prevista.itens.length, 2);
  });

  test("parcela na fatura sem cartão informado fica num grupo próprio", () => {
    const prevista = composicaoFaturaPrevista(
      CARTAO_NAO_INFORMADO,
      "2026-10",
      [parcela({ cartao: undefined, valorParcela: 34.39 }), parcela({ id: "2" })],
      [assinatura({})]
    );
    assert.equal(prevista.total, 34.39);
  });

  test("mês passado nunca é previsto; mês que vem sempre é", () => {
    assert.equal(devePreverFatura("2026-08", "2026-09-29", 5), false);
    assert.equal(devePreverFatura("2026-10", "2026-09-29", 5), true);
  });

  test("no mês atual, só prevê cartão cujo vencimento ainda não passou", () => {
    assert.equal(devePreverFatura("2026-09", "2026-09-29", 10), false);
    assert.equal(devePreverFatura("2026-09", "2026-09-05", 10), true);
    assert.equal(devePreverFatura("2026-09", "2026-09-29"), true); // sem dia: fim do mês
  });

  test("vira compromisso de outubro quando a fatura real ainda não foi lançada", () => {
    const entries = faturasPrevistasParaEntries(
      [],
      [parcela({ valorParcela: 239.62 })],
      [],
      "2026-10",
      () => false,
      { "Nubank CNPJ": 5 },
      "2026-09-29"
    );
    assert.equal(entries.length, 1);
    assert.equal(entries[0].amount, 239.62);
    assert.equal(entries[0].status, "pending");
    assert.equal(entries[0].estimado, true);
    assert.equal(entries[0].dueDate, "2026-10-05"); // segunda-feira, dia útil
  });

  test("fatura real lançada substitui a prevista daquele cartão", () => {
    const entries = faturasPrevistasParaEntries(
      [{ id: "2026-10__Nubank CNPJ", nome: "Nubank CNPJ", valor: 700, mes: "2026-10", criadoEm: 1 }],
      [parcela({})],
      [],
      "2026-10",
      () => false,
      {},
      "2026-09-29"
    );
    assert.equal(entries.length, 0);
  });

  test("marcada como paga no checklist, a prevista também aparece paga", () => {
    const entries = faturasPrevistasParaEntries(
      [],
      [parcela({})],
      [],
      "2026-10",
      (origem, id) => origem === "fatura" && id === "2026-10__Nubank CNPJ",
      {},
      "2026-09-29"
    );
    assert.equal(entries[0].status, "paid");
  });
});

describe("resumo de parcelas ativas", () => {
  function parcela(over: Partial<Parcela>): Parcela {
    return {
      id: "p",
      tipo: "cartao",
      nome: "Parcela",
      valorParcela: 100,
      totalParcelas: 10,
      parcelasRestantes: 5,
      mesReferencia: "2026-09",
      criadoEm: 0,
      ...over,
    };
  }

  test("conta quantas faltam a partir do mês, e parcela futura continua contando", () => {
    assert.equal(parcelasAPagarDesde(parcela({}), "2026-09"), 5);
    assert.equal(parcelasAPagarDesde(parcela({}), "2026-11"), 3);
    assert.equal(parcelasAPagarDesde(parcela({ mesReferencia: "2026-12" }), "2026-09"), 5);
    assert.equal(parcelasAPagarDesde(parcela({}), "2027-06"), 0);
  });

  test("último mês de cobrança", () => {
    assert.equal(mesDaUltimaParcela(parcela({}), "2026-09"), "2027-01");
    assert.equal(mesDaUltimaParcela(parcela({ parcelasRestantes: 1 }), "2026-09"), "2026-09");
    assert.equal(mesDaUltimaParcela(parcela({ parcelasRestantes: 0 }), "2026-09"), null);
  });

  test("soma TODAS as ativas, inclusive as que estão dentro da fatura", () => {
    const r = resumoParcelasAtivas(
      [
        parcela({
          id: "carro",
          tipo: "financiamento",
          valorParcela: 997,
          parcelasRestantes: 27,
          mesReferencia: "2026-08",
        }),
        parcela({
          id: "viagem",
          valorParcela: 134.26,
          dividida: true,
          naFatura: true,
          parcelasRestantes: 9,
        }),
        parcela({ id: "quitada", parcelasRestantes: 0 }),
      ],
      "2026-10"
    );
    assert.equal(r.quantidade, 2);
    assert.equal(r.mensalForaDoCartao, 997);
    assert.equal(r.mensalNoCartao, 67.13);
    assert.equal(r.mensalSuaParte, 1064.13);
    // carro: 25 restantes em outubro · viagem: 8 restantes, metade de 134,26
    assert.equal(r.faltaPagar, Math.round((997 * 25 + 67.13 * 8) * 100) / 100);
    assert.equal(r.ultimoMes, "2028-10");
  });

  test("sem parcela ativa, tudo zerado", () => {
    const r = resumoParcelasAtivas([parcela({ parcelasRestantes: 0 })], "2026-10");
    assert.equal(r.quantidade, 0);
    assert.equal(r.faltaPagar, 0);
    assert.equal(r.ultimoMes, null);
  });
});

describe("rendimento pelo CDI", () => {
  const taxas = [
    { data: "2026-09-24", taxa: 0.05 },
    { data: "2026-09-25", taxa: 0.05 },
    { data: "2026-09-28", taxa: 0.05 },
    { data: "2026-09-29", taxa: 0.05 },
  ];

  test("rende só os dias úteis entre o último dia rendido e ontem", () => {
    const r = calcularRendimento(1000, taxas, "2026-09-24", "2026-09-29", 100);
    // 25 e 28 (24 já rendeu; 29 é hoje, ainda não caiu)
    assert.equal(r.diasUteis, 2);
    assert.equal(r.ultimoDia, "2026-09-28");
    assert.equal(r.rendimento, Math.round((1000 * 1.0005 * 1.0005 - 1000) * 100) / 100);
  });

  test("percentual do CDI escala o rendimento", () => {
    const cheio = calcularRendimento(10000, taxas, "2026-09-01", "2026-09-30", 100);
    const metade = calcularRendimento(10000, taxas, "2026-09-01", "2026-09-30", 50);
    assert.ok(metade.rendimento < cheio.rendimento);
    assert.ok(Math.abs(metade.rendimento * 2 - cheio.rendimento) < 0.05);
  });

  test("saldo zerado não rende, mas os dias avançam (nada retroativo depois)", () => {
    const r = calcularRendimento(0, taxas, "2026-09-01", "2026-09-30", 100);
    assert.equal(r.rendimento, 0);
    assert.equal(r.ultimoDia, "2026-09-29");
  });

  test("sem dia novo, nada muda", () => {
    const r = calcularRendimento(1000, taxas, "2026-09-29", "2026-09-30", 100);
    assert.equal(r.ultimoDia, null);
    assert.equal(r.rendimento, 0);
  });

  test("separa o rendimento pelo mês em que rendeu", () => {
    const r = calcularRendimento(
      1000,
      [
        { data: "2026-09-30", taxa: 0.05 },
        { data: "2026-10-01", taxa: 0.05 },
      ],
      "2026-09-29",
      "2026-10-02",
      100
    );
    assert.deepEqual(Object.keys(r.porMes).sort(), ["2026-09", "2026-10"]);
    assert.deepEqual(somarPorMes({ "2026-09": 1 }, { "2026-09": 0.5, "2026-10": 2 }), {
      "2026-09": 1.5,
      "2026-10": 2,
    });
  });

  test("CDI de 0,050788% ao dia é ~13,65% ao ano", () => {
    const anual = cdiAnual(0.050788);
    assert.ok(anual > 13.6 && anual < 13.7, `veio ${anual}`);
  });

  test("converte a série do Banco Central", () => {
    assert.deepEqual(
      converterSerieBcb([
        { data: "28/09/2026", valor: "0.050788" },
        { data: "29/09/2026", valor: "lixo" },
      ]),
      [{ data: "2026-09-28", taxa: 0.050788 }]
    );
  });
});

describe("saldo de agora e compromissos do mês", () => {
  test("saldo de agora desconta só o que foi gasto depois de informar o saldo", () => {
    const gastos = [
      { id: "1", descricao: "a", valor: 30, categoria: "x", mes: "2026-10", criadoEm: 100 },
      { id: "2", descricao: "b", valor: 50, categoria: "x", mes: "2026-10", criadoEm: 300 },
    ] as Gasto[];
    assert.equal(calcularSaldoAtual({ valor: 1000, atualizadoEm: 200 }, gastos), 950);
    assert.equal(calcularSaldoAtual(null, gastos), null);
  });

  test("saldo abaixo da reserva não vira limite diário negativo", () => {
    assert.equal(calculateGastavelPorDia(0, 100, 2), 0);
    assert.equal(calculateGastavelPorDia(50, 100, 10), 0);
  });

  test("separa o que tem pra pagar por tipo, com pago e o que falta", () => {
    const entries = [
      entry({ id: "1", source: "fixed_cost", amount: 100, status: "paid", competenceMonth: "2026-10" }),
      entry({ id: "2", source: "fixed_cost", amount: 54.99, competenceMonth: "2026-10" }),
      entry({ id: "3", source: "installment", amount: 997, competenceMonth: "2026-10" }),
      entry({
        id: "4",
        source: "card_bill",
        amount: 588.81,
        competenceMonth: "2026-10",
        estimado: true,
      }),
      // gasto do dia a dia não é compromisso
      entry({ id: "5", source: "manual", amount: 20, status: "paid", competenceMonth: "2026-10" }),
      entry({ id: "6", type: "income", source: "income", amount: 2600, competenceMonth: "2026-10" }),
    ];
    const r = resumoCompromissos(entries, "2026-10");
    assert.deepEqual(
      r.linhas.map((l) => l.chave),
      ["contas", "parcelas", "faturas"]
    );
    assert.equal(r.total, 1740.8);
    assert.equal(r.pago, 100);
    assert.equal(r.falta, 1640.8);
    assert.equal(r.linhas.find((l) => l.chave === "faturas")?.estimado, 588.81);
  });
});

describe("ganho sem tipo", () => {
  test("não entra como 'a receber' em todo mês", () => {
    const orfao = { id: "x", descricao: "Salário", valor: 2600, mes: "2026-08", criadoEm: 0 } as unknown as Ganho;
    assert.deepEqual(ganhosParaEntries([orfao], "2026-10", () => false), []);
  });
});

describe("saldo de outro mês", () => {
  // meio-dia em Brasília, pra o teste não depender da virada de fuso
  const meioDia = (iso: string) => new Date(`${iso}T15:00:00Z`).getTime();

  test("saldo conferido no mês passado é considerado velho", () => {
    assert.equal(saldoEstaVelho(meioDia("2026-08-28"), "2026-09-01"), true);
  });

  test("saldo conferido no mesmo mês não é velho, mesmo com dias de diferença", () => {
    assert.equal(saldoEstaVelho(meioDia("2026-09-01"), "2026-09-28"), false);
  });

  test("compara mês, não 30 dias: dia 31/08 vs 01/09 já é velho", () => {
    assert.equal(saldoEstaVelho(meioDia("2026-08-31"), "2026-09-01"), true);
  });

  test("navegar pra um mês futuro na tela não torna o saldo velho (compara com hoje)", () => {
    // hojeISO é sempre o dia real; o mês visualizado não entra na conta
    assert.equal(saldoEstaVelho(meioDia("2026-09-10"), "2026-09-10"), false);
  });
});

describe("projeção de ritmo", () => {
  // gasto num dia específico de setembro/2026, meio-dia em Brasília
  const gastoEm = (dia: number, valor: number, categoria = "Alimentação"): Gasto => ({
    id: `g${dia}-${valor}`,
    descricao: "teste",
    valor,
    categoria,
    mes: "2026-09",
    criadoEm: new Date(`2026-09-${String(dia).padStart(2, "0")}T15:00:00Z`).getTime(),
  });

  test("no ritmo tranquilo, projeta sobra acima da meta", () => {
    // dia 10, gastou 500 em 10 dias = 50/dia. Restam 20 dias à frente.
    // 3000 - 50*20 = 2000, acima da meta de 800.
    const gastos = [gastoEm(10, 500)];
    const p = projetarRitmo(3000, 800, gastos, "2026-09", "2026-09-10")!;
    assert.equal(p.gastoMedioDiario, 50);
    assert.equal(p.sobraProjetada, 2000);
    assert.equal(p.batendoMeta, true);
    assert.equal(p.diaQueZera, null);
  });

  test("no ritmo apertado, avisa que não bate a meta mesmo sem zerar", () => {
    // dia 10, gastou 1500 = 150/dia. 1500 - 150*20 = -1500 → zera antes.
    const gastos = [gastoEm(10, 1500)];
    const p = projetarRitmo(1500, 800, gastos, "2026-09", "2026-09-10")!;
    assert.equal(p.batendoMeta, false);
  });

  test("aponta o dia exato em que o dinheiro zera", () => {
    // dia 10, gastou 1000 = 100/dia. Saldo 500 aguenta 5 dias → zera dia 15.
    const gastos = [gastoEm(10, 1000)];
    const p = projetarRitmo(500, 0, gastos, "2026-09", "2026-09-10")!;
    assert.equal(p.gastoMedioDiario, 100);
    assert.equal(p.diasQueAguenta, 5);
    assert.equal(p.diaQueZera, "2026-09-15");
  });

  test("sem gasto nenhum não inventa dia de zerar", () => {
    const p = projetarRitmo(1000, 0, [], "2026-09", "2026-09-10")!;
    assert.equal(p.gastoMedioDiario, 0);
    assert.equal(p.diaQueZera, null);
    assert.equal(p.sobraProjetada, 1000);
  });

  test("ajuste de conciliação não entra no ritmo (senão um ajuste grande vira 'ritmo')", () => {
    const gastos = [gastoEm(10, 100), { ...gastoEm(10, 900), ajusteConciliacaoId: "c1" }];
    const p = projetarRitmo(3000, 0, gastos, "2026-09", "2026-09-10")!;
    assert.equal(p.gastoMedioDiario, 10); // só os 100, não os 1000
  });

  test("sem saldo informado não há projeção", () => {
    assert.equal(projetarRitmo(null, 800, [], "2026-09", "2026-09-10"), null);
  });

  test("no último dia do mês não projeta nada pra frente", () => {
    const gastos = [gastoEm(30, 3000)];
    const p = projetarRitmo(1000, 800, gastos, "2026-09", "2026-09-30")!;
    assert.equal(p.sobraProjetada, 1000); // 0 dias à frente
    assert.equal(p.batendoMeta, true);
  });
});

describe("marcos da semana e do mês", () => {
  test("identifica sexta, domingo e último dia", () => {
    assert.equal(ehSexta("2026-09-04"), true); // sexta
    assert.equal(ehSexta("2026-09-05"), false); // sábado
    assert.equal(ehDomingo("2026-09-06"), true);
    assert.equal(ehUltimoDiaDoMes("2026-09-30"), true);
    assert.equal(ehUltimoDiaDoMes("2026-09-29"), false);
    assert.equal(ehUltimoDiaDoMes("2026-02-28"), true); // fevereiro sem bissexto
  });

  test("orçamento do fim de semana é o diário vezes 3", () => {
    assert.equal(orcamentoDoFimDeSemana(60), 180);
    assert.equal(orcamentoDoFimDeSemana(null), null);
  });
});

describe("resumo da semana", () => {
  const gastoEm = (iso: string, valor: number, categoria: string): Gasto => ({
    id: `${iso}-${valor}`,
    descricao: "teste",
    valor,
    categoria,
    mes: iso.slice(0, 7),
    criadoEm: new Date(`${iso}T15:00:00Z`).getTime(),
  });

  test("soma os últimos 7 dias e aponta a categoria que mais pesou", () => {
    const gastos = [
      gastoEm("2026-09-10", 200, "Alimentação"),
      gastoEm("2026-09-12", 80, "Transporte"),
      gastoEm("2026-09-13", 150, "Alimentação"),
    ];
    const r = resumoDaSemana(gastos, "2026-09-13");
    assert.equal(r.total, 430);
    assert.equal(r.categoriaTop, "Alimentação");
    assert.equal(r.valorTop, 350);
  });

  test("gasto de 8 dias atrás fica de fora da janela", () => {
    const gastos = [
      gastoEm("2026-09-05", 999, "Lazer"), // 8 dias antes de 13/09
      gastoEm("2026-09-07", 100, "Lazer"), // 6 dias antes, entra
    ];
    const r = resumoDaSemana(gastos, "2026-09-13");
    assert.equal(r.total, 100);
  });

  test("semana sem gasto devolve zero, sem categoria", () => {
    const r = resumoDaSemana([], "2026-09-13");
    assert.equal(r.total, 0);
    assert.equal(r.categoriaTop, null);
  });
});

describe("notificações do dia", () => {
  // setembro/2026: dia 4 = sexta, 6 = domingo, 7 = segunda, 30 = último dia
  const base = {
    saldoAtual: 2000,
    reservaMeta: 800,
    gastavelPorDia: 80,
    gastoHoje: 20,
    gastos: [] as Gasto[],
    projecao: null,
  };

  test("dia comum fala de quanto ainda dá pra gastar hoje", () => {
    const n = notificacaoDiaria({ ...base, hojeISO: "2026-09-09" });
    assert.match(n.title, /pode gastar/);
    assert.equal(n.url, "/saldo");
  });

  test("estourou o dia: o título muda de tom", () => {
    const n = notificacaoDiaria({ ...base, hojeISO: "2026-09-09", gastoHoje: 200 });
    assert.match(n.title, /passou/);
  });

  test("sexta fala do fim de semana inteiro, não só do dia", () => {
    const n = notificacaoDiaria({ ...base, hojeISO: "2026-09-04" });
    assert.match(n.title, /Fim de semana/);
    assert.match(n.title, /240,00/); // 80 × 3 dias
  });

  const gastoSemana = (valor: number): Gasto[] => [
    {
      id: "g1", descricao: "ifood", valor, categoria: "Alimentação",
      mes: "2026-09", criadoEm: new Date("2026-09-05T15:00:00Z").getTime(),
    },
  ];

  test("domingo reconhece quando a semana fechou abaixo do orçamento", () => {
    // orçamento da semana = 80 × 7 = 560; gastou 300 → sobrou 260
    const n = notificacaoDiaria({ ...base, hojeISO: "2026-09-06", gastos: gastoSemana(300) });
    assert.match(n.title, /Semana no controle/);
    assert.match(n.title, /260,00/);
  });

  test("domingo com semana estourada aponta a categoria que mais pesou", () => {
    const n = notificacaoDiaria({ ...base, hojeISO: "2026-09-06", gastos: gastoSemana(900) });
    assert.match(n.title, /Semana fechada/);
    assert.match(n.body, /Alimentação/);
  });

  test("último dia do mês fecha o mês e diz se bateu a meta", () => {
    const bateu = notificacaoDiaria({ ...base, hojeISO: "2026-09-30", saldoAtual: 900 });
    assert.match(bateu.body, /bateu/);
    const naoBateu = notificacaoDiaria({ ...base, hojeISO: "2026-09-30", saldoAtual: 300 });
    assert.ok(!naoBateu.body.includes("bateu"));
  });
});

describe("avisos fora da rotina", () => {
  const projecaoQueZera = {
    gastoMedioDiario: 100, sobraProjetada: -500, batendoMeta: false,
    diaQueZera: "2026-09-22", diasQueAguenta: 5,
  };

  test("ritmo perigoso só avisa na segunda, pra não virar ruído diário", () => {
    assert.ok(avisoRitmoPerigoso(projecaoQueZera, "2026-09-07")); // segunda
    assert.equal(avisoRitmoPerigoso(projecaoQueZera, "2026-09-08"), null); // terça
  });

  test("ritmo saudável nunca vira aviso, nem na segunda", () => {
    const ok = { ...projecaoQueZera, diaQueZera: null, batendoMeta: true };
    assert.equal(avisoRitmoPerigoso(ok, "2026-09-07"), null);
  });

  test("comissão: avisa se ontem foi dia útil sem lançamento", () => {
    // quarta 09, ontem foi terça 08 — sem lançamento
    assert.ok(avisoComissaoEsquecida(new Set(), "2026-09-09"));
    // com lançamento em 08, não avisa
    assert.equal(avisoComissaoEsquecida(new Set(["2026-09-08"]), "2026-09-09"), null);
  });

  test("comissão: não cobra na segunda (ontem era domingo) nem no domingo", () => {
    assert.equal(avisoComissaoEsquecida(new Set(), "2026-09-07"), null); // segunda
    assert.equal(avisoComissaoEsquecida(new Set(), "2026-09-06"), null); // domingo
  });

  test("checklist parado avisa uma vez, no dia 8, e só se nada foi pago", () => {
    assert.ok(avisoChecklistParado(6, 0, "2026-09-08"));
    assert.equal(avisoChecklistParado(6, 2, "2026-09-08"), null); // já começou
    assert.equal(avisoChecklistParado(6, 0, "2026-09-09"), null); // outro dia
    assert.equal(avisoChecklistParado(0, 0, "2026-09-08"), null); // nada cadastrado
  });
});

describe("conquistas", () => {
  const gastoEm = (dia: number, valor: number, categoria = "Alimentação"): Gasto => ({
    id: `g${dia}-${valor}`,
    descricao: "teste",
    valor,
    categoria,
    mes: "2026-09",
    criadoEm: new Date(`2026-09-${String(dia).padStart(2, "0")}T15:00:00Z`).getTime(),
  });

  test("hoje não entra na avaliação — o dia ainda está correndo", () => {
    const dias = avaliarDiasFechados([gastoEm(5, 10)], 80, "2026-09", "2026-09-05");
    assert.equal(dias.length, 4); // dias 1 a 4
    assert.ok(!dias.some((d) => d.dia === "2026-09-05"));
  });

  test("dia sem gasto nenhum conta como dentro do orçamento", () => {
    const dias = avaliarDiasFechados([], 80, "2026-09", "2026-09-04");
    assert.equal(dias.length, 3);
    assert.ok(dias.every((d) => d.dentroDoOrcamento));
  });

  test("sequência quebra no dia que estourou e recomeça depois", () => {
    const gastos = [gastoEm(1, 10), gastoEm(2, 500), gastoEm(3, 10), gastoEm(4, 10)];
    const dias = avaliarDiasFechados(gastos, 80, "2026-09", "2026-09-05");
    assert.equal(sequenciaAtual(dias), 2); // dias 3 e 4
    assert.equal(melhorSequencia(dias), 2);
  });

  test("resumo soma o que sobrou nos dias no controle", () => {
    // orçamento 80: dia 1 gastou 30 (sobra 50), dia 2 gastou 60 (sobra 20)
    const gastos = [gastoEm(1, 30), gastoEm(2, 60)];
    const dias = avaliarDiasFechados(gastos, 80, "2026-09", "2026-09-03");
    const r = resumirConquistas(dias, 80);
    assert.equal(r.diasNoControle, 2);
    assert.equal(r.economiaAcumulada, 70);
  });

  test("ajuste de conciliação não estraga a sequência", () => {
    const gastos = [gastoEm(1, 10), { ...gastoEm(2, 900), ajusteConciliacaoId: "c1" }];
    const dias = avaliarDiasFechados(gastos, 80, "2026-09", "2026-09-03");
    assert.equal(sequenciaAtual(dias), 2);
  });

  test("dinheiro liberando: soma a última parcela de cada compromisso", () => {
    const parcela = (nome: string, valor: number, restantes: number): Parcela => ({
      id: nome, tipo: "cartao", nome, valorParcela: valor,
      totalParcelas: 10, parcelasRestantes: restantes,
      mesReferencia: "2026-09", criadoEm: 0,
    });
    const r = dinheiroLiberando(
      [parcela("Notebook", 239, 1), parcela("Curso", 100, 5)],
      "2026-09"
    );
    assert.equal(r.parcelas.length, 1);
    assert.equal(r.totalMensal, 239);
  });

  test("parcela já na fatura não conta como dinheiro liberando", () => {
    const naFatura: Parcela = {
      id: "p1", tipo: "cartao", nome: "Curso", valorParcela: 200,
      totalParcelas: 6, parcelasRestantes: 1, naFatura: true,
      mesReferencia: "2026-09", criadoEm: 0,
    };
    assert.equal(dinheiroLiberando([naFatura], "2026-09").totalMensal, 0);
  });

  test("categorias que melhoraram ignoram queda pequena", () => {
    const melhoras = categoriasQueMelhoraram(
      [{ categoryId: "Alimentação", total: 300 }, { categoryId: "Lazer", total: 95 }],
      [{ categoryId: "Alimentação", total: 500 }, { categoryId: "Lazer", total: 100 }]
    );
    assert.equal(melhoras.length, 1); // Lazer caiu só 5
    assert.equal(melhoras[0].categoria, "Alimentação");
    assert.equal(melhoras[0].economia, 200);
  });
});

describe("interpretar frase de gasto", () => {
  // Cada caso aqui é uma forma real de falar. O reconhecimento de voz
  // devolve a frase inteira, incluindo "acabei de gastar" — se o parser não
  // limpar isso, a descrição vira a frase toda.
  const casos: [frase: string, valor: number, descricao: string, categoria: string][] = [
    ["Acabei de gastar 3 reais em paieiro", 3, "paieiro", "Outros"],
    ["gastei 100 reais de gasolina", 100, "gasolina", "Transporte"],
    ["paguei 50 no mercado", 50, "mercado", "Alimentação"],
    ["torrei 200 no rolê", 200, "rolê", "Lazer"],
    ["almoço 42", 42, "almoço", "Alimentação"],
    // é o exemplo que a tela de Saldo mostra no campo — tem que funcionar
    ["25 almoço", 25, "almoço", "Alimentação"],
    ["comprei um lanche de 25", 25, "lanche", "Alimentação"],
    ["R$ 15,50 no uber", 15.5, "uber", "Transporte"],
    ["foi 12 no café", 12, "café", "Alimentação"],
    ["acabei de pagar a farmácia, 87,90", 87.9, "farmácia", "Saúde"],
  ];

  for (const [frase, valor, descricao, categoria] of casos) {
    test(`"${frase}"`, () => {
      const r = parseGastoTexto(frase);
      assert.equal(r.valor, valor);
      assert.equal(r.descricao, descricao);
      assert.equal(inferirCategoriaGasto(r.descricao), categoria);
    });
  }

  test("número por extenso, quando a voz não converte pra dígito", () => {
    const a = parseGastoTexto("gastei trinta e cinco reais no ifood");
    assert.equal(a.valor, 35);
    assert.equal(a.descricao, "ifood");

    const b = parseGastoTexto("paguei cento e vinte de internet");
    assert.equal(b.valor, 120);
    assert.equal(b.descricao, "internet");
  });

  test("marcador de moeda vence número solto — em '2 pizzas de 30 reais' o preço é 30", () => {
    assert.equal(parseGastoTexto("2 pizzas de 30 reais").valor, 30);
  });

  test("frase sem valor não inventa número", () => {
    const r = parseGastoTexto("comprei pão");
    assert.equal(r.valor, null);
    assert.equal(r.descricao, "pão");
  });

  test("frase vazia não quebra", () => {
    assert.deepEqual(parseGastoTexto("   "), { valor: null, descricao: "" });
  });
});

describe("audit log não pode conter undefined", () => {
  // O Firestore rejeita propriedade undefined e derruba o batch inteiro.
  // Como o log vai no mesmo batch da alteração, isso fazia a edição falhar.
  const temUndefined = (o: unknown, cam = ""): string[] => {
    if (o === undefined) return [cam || "(raiz)"];
    if (o === null || typeof o !== "object") return [];
    return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
      temUndefined(v, cam ? `${cam}.${k}` : k)
    );
  };

  test("limpa campo opcional vazio de before/after, em qualquer profundidade", () => {
    const log = {
      action: "updated",
      summary: "editado",
      before: { descricao: "Comissão", categoriaReceita: undefined, semImposto: undefined },
      after: { descricao: "Comissão", valor: 600, categoriaReceita: undefined },
    };
    const limpo = semUndefined(log);
    assert.deepEqual(temUndefined(limpo), []);
    // e não inventa nem perde o que estava preenchido
    assert.equal(limpo.before.descricao, "Comissão");
    assert.equal(limpo.after.valor, 600);
    assert.ok(!("categoriaReceita" in limpo.before));
  });

  test("preserva null — é valor válido e significa 'foi apagado'", () => {
    const limpo = semUndefined({ before: { cartao: null, valor: 0 } });
    assert.equal(limpo.before.cartao, null);
    assert.equal(limpo.before.valor, 0);
  });

  test("before ausente no topo não vira chave undefined", () => {
    const limpo = semUndefined({ action: "created", before: undefined });
    assert.deepEqual(temUndefined(limpo), []);
    assert.ok(!("before" in limpo));
  });

  test("limpa dentro de array também", () => {
    const limpo = semUndefined({ itens: [{ a: 1, b: undefined }] });
    assert.deepEqual(temUndefined(limpo), []);
  });
});

describe("navegação de meses", () => {
  // O piso do MonthSelector precisa ser a constante fixa MES_MINIMO, não o
  // mês corrente — com o mês corrente o piso andava junto com o calendário e
  // a seta de voltar ficava sempre desabilitada.
  const podeVoltar = (mesNaTela: string) => mesNaTela > MES_MINIMO;

  test("do mês inicial não dá pra voltar", () => {
    assert.equal(podeVoltar(MES_MINIMO), false);
  });

  test("de qualquer mês depois do inicial dá pra voltar", () => {
    assert.equal(podeVoltar("2026-09"), true);
    assert.equal(podeVoltar("2026-12"), true);
    assert.equal(podeVoltar("2027-03"), true);
  });
});
