import {
  Ganho,
  ContaFixa,
  Assinatura,
  Parcela,
  FaturaCartao,
  Gasto,
  FinancialEntry,
  parcelasRestantesEm,
  valorMinhaParte,
} from "@/lib/types";
import { ultimoDiaMes } from "./calculations";

/**
 * Traduz as coleções antigas (ganhos, contasFixas, assinaturas, parcelas,
 * faturasCartao, gastos) pra FinancialEntry[], em memória, sem escrever
 * nada no Firestore e sem migrar/apagar nada.
 *
 * Assinaturas e parcelas marcadas `naFatura` são deixadas de fora: o valor
 * delas já está representado pelo lançamento de "Fatura do cartão" daquele
 * cartão, então incluir as duas contaria a mesma despesa duas vezes — a
 * mesma regra que Checklist/DRE/Dashboard já seguem hoje.
 *
 * Nenhuma das coleções antigas guarda dia exato de vencimento ainda (isso é
 * Fase 6 do briefing). Enquanto isso, todo compromisso recorrente do mês
 * usa o último dia do mês de competência como dueDate — é a estimativa mais
 * segura pra não marcar nada como "atrasado" antes da hora.
 */

export type EstaPago = (
  origem: "conta" | "assinatura" | "parcela" | "fatura" | "ganho",
  itemId: string
) => boolean;

export function ganhosParaEntries(
  ganhos: Ganho[],
  mes: string,
  estaPago: EstaPago
): FinancialEntry[] {
  const entries: FinancialEntry[] = [];
  for (const g of ganhos) {
    if (g.tipo === "recorrente" && g.ativo === false) continue;
    if (g.tipo === "pontual" && (g.mes !== mes || g.arquivado)) continue;
    const recebido =
      g.tipo === "recorrente" ? estaPago("ganho", g.id) : !!g.recebido;
    entries.push({
      id: `ganho__${g.id}__${mes}`,
      type: "income",
      status: recebido ? "received" : "planned",
      amount: g.valor,
      dueDate: `${mes}-01`,
      paidAt:
        g.tipo === "pontual" && g.recebido && g.recebidoEm
          ? new Date(g.recebidoEm).toISOString()
          : undefined,
      competenceMonth: mes,
      description: g.descricao,
      categoryId: g.tipo === "recorrente" ? "renda-recorrente" : "renda-pontual",
      recurrenceId: g.tipo === "recorrente" ? g.id : undefined,
      source: "income",
      createdAt: g.criadoEm,
      updatedAt: g.criadoEm,
    });
  }
  return entries;
}

export function contasFixasParaEntries(
  contas: ContaFixa[],
  mes: string,
  estaPago: EstaPago
): FinancialEntry[] {
  return contas
    .filter((c) => c.ativa)
    .map((c) => {
      const pago = estaPago("conta", c.id);
      return {
        id: `conta__${c.id}__${mes}`,
        type: "expense" as const,
        status: pago ? ("paid" as const) : ("pending" as const),
        amount: c.valor,
        dueDate: ultimoDiaMes(mes),
        competenceMonth: mes,
        description: c.nome,
        categoryId: c.categoria,
        recurrenceId: c.id,
        source: "fixed_cost" as const,
        createdAt: c.criadoEm,
        updatedAt: c.criadoEm,
      };
    });
}

export function assinaturasParaEntries(
  assinaturas: Assinatura[],
  mes: string,
  estaPago: EstaPago
): FinancialEntry[] {
  return assinaturas
    .filter((a) => a.ativa && !a.naFatura)
    .map((a) => {
      const pago = estaPago("assinatura", a.id);
      return {
        id: `assinatura__${a.id}__${mes}`,
        type: "expense" as const,
        status: pago ? ("paid" as const) : ("pending" as const),
        amount: a.valor,
        dueDate: ultimoDiaMes(mes),
        competenceMonth: mes,
        description: a.nome,
        categoryId: "assinaturas",
        cardId: a.cartao,
        recurrenceId: a.id,
        source: "subscription" as const,
        createdAt: a.criadoEm,
        updatedAt: a.criadoEm,
      };
    });
}

export function parcelasParaEntries(
  parcelas: Parcela[],
  mes: string,
  estaPago: EstaPago
): FinancialEntry[] {
  return parcelas
    .filter((p) => parcelasRestantesEm(p, mes) > 0 && !p.naFatura)
    .map((p) => {
      const pago = estaPago("parcela", p.id);
      const restantes = parcelasRestantesEm(p, mes);
      const numeroAtual = p.totalParcelas - restantes + 1;
      return {
        id: `parcela__${p.id}__${mes}`,
        type: "expense" as const,
        status: pago ? ("paid" as const) : ("pending" as const),
        amount: valorMinhaParte(p),
        dueDate: ultimoDiaMes(mes),
        competenceMonth: mes,
        description: `${p.nome} (${numeroAtual}/${p.totalParcelas})`,
        categoryId: p.tipo === "cartao" ? "cartao" : "financiamento",
        cardId: p.cartao,
        installmentId: p.id,
        source: "installment" as const,
        createdAt: p.criadoEm,
        updatedAt: p.criadoEm,
      };
    });
}

export function faturasParaEntries(
  faturas: FaturaCartao[],
  mes: string,
  estaPago: EstaPago
): FinancialEntry[] {
  return faturas
    .filter((f) => f.valor > 0)
    .map((f) => {
      const pago = estaPago("fatura", f.id);
      return {
        id: `fatura__${f.id}__${mes}`,
        type: "expense" as const,
        status: pago ? ("paid" as const) : ("pending" as const),
        amount: f.valor,
        dueDate: ultimoDiaMes(mes),
        competenceMonth: mes,
        description: `Fatura ${f.nome}`,
        categoryId: "cartao",
        cardId: f.nome,
        source: "card_bill" as const,
        createdAt: f.criadoEm,
        updatedAt: f.criadoEm,
      };
    });
}

export function gastosParaEntries(gastos: Gasto[], mes: string): FinancialEntry[] {
  return gastos
    .filter((g) => g.mes === mes)
    .map((g) => ({
      id: `gasto__${g.id}`,
      type: "expense" as const,
      status: "paid" as const,
      amount: g.valor,
      dueDate: new Date(g.criadoEm).toISOString().slice(0, 10),
      paidAt: new Date(g.criadoEm).toISOString(),
      competenceMonth: mes,
      description: g.descricao,
      categoryId: g.categoria,
      source: g.ajusteConciliacaoId
        ? ("adjustment" as const)
        : ("manual" as const),
      createdAt: g.criadoEm,
      updatedAt: g.criadoEm,
    }));
}

export interface DadosFinanceiros {
  ganhos: Ganho[];
  contas: ContaFixa[];
  assinaturas: Assinatura[];
  parcelas: Parcela[];
  faturas: FaturaCartao[];
  gastos: Gasto[];
  estaPago: EstaPago;
  mes: string;
}

export function construirFinancialEntries(dados: DadosFinanceiros): FinancialEntry[] {
  return [
    ...ganhosParaEntries(dados.ganhos, dados.mes, dados.estaPago),
    ...contasFixasParaEntries(dados.contas, dados.mes, dados.estaPago),
    ...assinaturasParaEntries(dados.assinaturas, dados.mes, dados.estaPago),
    ...parcelasParaEntries(dados.parcelas, dados.mes, dados.estaPago),
    ...faturasParaEntries(dados.faturas, dados.mes, dados.estaPago),
    ...gastosParaEntries(dados.gastos, dados.mes),
  ];
}
