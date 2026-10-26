import {
  Ganho,
  ContaFixa,
  Assinatura,
  Parcela,
  FaturaCartao,
  Gasto,
  Comissao,
  FinancialEntry,
  parcelasRestantesEm,
  valorMinhaParte,
  diaVencimentoNoMes,
  contaNoPeriodo,
} from "@/lib/types";
import { dataEfetivaDoGasto } from "./saldo";
import { ultimoDiaMes, diaISOde, hojeISO as hojeNoBrasil } from "./calculations";
import { vencimentoEfetivo } from "./diasUteis";
import {
  composicaoFaturaPrevista,
  devePreverFatura,
  previsaoAConfirmar,
  mesDaFaturaDaCompra,
  CompraNoCredito,
  CARTAO_NAO_INFORMADO,
} from "./faturaPrevista";
import { comissaoPrevistaParaEntries } from "./comissaoPrevista";
import { recorrenciaNoMes, valorNoMes, recorrenciaDoGanho } from "./recorrencia";
import { CARTOES_PREDEFINIDOS } from "@/lib/cartoes";

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

export type OrigemPagamento = "conta" | "assinatura" | "parcela" | "fatura" | "ganho";

export type EstaPago = (origem: OrigemPagamento, itemId: string) => boolean;

/**
 * Quando foi pago de verdade (timestamp), se o checklist sabe. Sem isso o
 * fluxo de caixa usava o vencimento como se fosse a data do pagamento
 * (auditoria F12).
 */
export type DataPagamento = (origem: OrigemPagamento, itemId: string) => number | undefined;

function paidAtDe(
  pago: boolean,
  dataPagamento: DataPagamento | undefined,
  origem: OrigemPagamento,
  itemId: string
): string | undefined {
  if (!pago || !dataPagamento) return undefined;
  const quando = dataPagamento(origem, itemId);
  return quando ? new Date(quando).toISOString() : undefined;
}

export function ganhosParaEntries(
  ganhos: Ganho[],
  mes: string,
  estaPago: EstaPago,
  dataPagamento?: DataPagamento
): FinancialEntry[] {
  const entries: FinancialEntry[] = [];
  for (const g of ganhos) {
    // ganho sem tipo (sobra de edição manual no Firestore) passava pelos
    // dois filtros abaixo e entrava como "a receber" em TODO mês
    if (g.tipo !== "recorrente" && g.tipo !== "pontual") continue;
    // recorrente: existe no mês (início/arquivamento) e com o valor vigente nele
    if (g.tipo === "recorrente" && !recorrenciaNoMes(recorrenciaDoGanho(g), mes)) continue;
    if (g.tipo === "pontual" && (g.mes !== mes || g.arquivado)) continue;
    const recebido =
      g.tipo === "recorrente" ? estaPago("ganho", g.id) : !!g.recebido;
    entries.push({
      id: `ganho__${g.id}__${mes}`,
      type: "income",
      status: recebido ? "received" : "planned",
      amount: g.tipo === "recorrente" ? valorNoMes(g, mes) : g.valor,
      dueDate: `${mes}-01`,
      paidAt:
        g.tipo === "pontual"
          ? g.recebido && g.recebidoEm
            ? new Date(g.recebidoEm).toISOString()
            : undefined
          : paidAtDe(recebido, dataPagamento, "ganho", g.id),
      competenceMonth: mes,
      description: g.descricao,
      categoryId:
        g.categoriaReceita ??
        (g.tipo === "recorrente" ? "renda-recorrente" : "renda-pontual"),
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
  estaPago: EstaPago,
  dataPagamento?: DataPagamento
): FinancialEntry[] {
  return contas
    // vigência: não existe antes do início, e arquivada continua nos
    // meses em que estava ativa (auditoria F11)
    .filter((c) => recorrenciaNoMes(c, mes))
    .map((c) => {
      const pago = estaPago("conta", c.id);
      return {
        id: `conta__${c.id}__${mes}`,
        type: "expense" as const,
        status: pago ? ("paid" as const) : ("pending" as const),
        amount: valorNoMes(c, mes),
        paidAt: paidAtDe(pago, dataPagamento, "conta", c.id),
        // boleto que cai em fim de semana ou feriado é pago no próximo
        // dia útil sem juros — usar o dia cadastrado marcaria como
        // atrasado algo que ainda está no prazo
        dueDate: c.diaVencimento
          ? vencimentoEfetivo(c.diaVencimento, mes).efetivo
          : ultimoDiaMes(mes),
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
  estaPago: EstaPago,
  dataPagamento?: DataPagamento
): FinancialEntry[] {
  return assinaturas
    .filter((a) => recorrenciaNoMes(a, mes) && !a.naFatura)
    .map((a) => {
      const pago = estaPago("assinatura", a.id);
      return {
        id: `assinatura__${a.id}__${mes}`,
        type: "expense" as const,
        status: pago ? ("paid" as const) : ("pending" as const),
        amount: valorNoMes(a, mes),
        paidAt: paidAtDe(pago, dataPagamento, "assinatura", a.id),
        // assinatura não pula pro dia útil: a cobrança é automática no
        // cartão e acontece no domingo igual, não espera o banco abrir
        dueDate: a.diaRenovacao
          ? diaVencimentoNoMes(mes, a.diaRenovacao)
          : ultimoDiaMes(mes),
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
  estaPago: EstaPago,
  dataPagamento?: DataPagamento
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
        paidAt: paidAtDe(pago, dataPagamento, "parcela", p.id),
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
  estaPago: EstaPago,
  diaVencimentoPorCartao: Record<string, number> = {},
  dataPagamento?: DataPagamento
): FinancialEntry[] {
  return faturas
    .filter((f) => f.valor > 0)
    .map((f) => {
      const pago = estaPago("fatura", f.id);
      const dia = diaVencimentoPorCartao[f.nome];
      return {
        id: `fatura__${f.id}__${mes}`,
        type: "expense" as const,
        status: pago ? ("paid" as const) : ("pending" as const),
        amount: f.valor,
        paidAt: paidAtDe(pago, dataPagamento, "fatura", f.id),
        dueDate: dia ? vencimentoEfetivo(dia, mes).efetivo : ultimoDiaMes(mes),
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

/**
 * Fatura prevista pra cada cartão sem fatura lançada no mês (ver
 * faturaPrevista.ts). Mesmo id de pagamento da fatura real
 * (`<mes>__<cartão>`), então marcar como paga no checklist vale pras duas.
 */
export function faturasPrevistasParaEntries(
  faturas: FaturaCartao[],
  parcelas: Parcela[],
  assinaturas: Assinatura[],
  mes: string,
  estaPago: EstaPago,
  diaVencimentoPorCartao: Record<string, number> = {},
  hojeISO: string = hojeNoBrasil(),
  compras: CompraNoCredito[] = []
): FinancialEntry[] {
  const lancadas = new Set(
    faturas.filter((f) => f.mes === mes && f.valor > 0).map((f) => f.nome)
  );

  if (!devePreverFatura(mes, hojeISO)) return [];

  const cartoes = new Set<string>(CARTOES_PREDEFINIDOS);
  for (const p of parcelas) if (p.naFatura && p.cartao) cartoes.add(p.cartao);
  for (const a of assinaturas) if (a.naFatura && a.cartao) cartoes.add(a.cartao);
  for (const c of compras) if (c.mesFatura === mes) cartoes.add(c.cartao);
  // parcela "na fatura" sem cartão informado: não some só porque alguma
  // fatura real foi lançada — fica pendente até você dizer qual cartão
  cartoes.add(CARTAO_NAO_INFORMADO);

  const entries: FinancialEntry[] = [];
  for (const cartao of cartoes) {
    if (lancadas.has(cartao)) continue;
    const dia = diaVencimentoPorCartao[cartao];
    const prevista = composicaoFaturaPrevista(cartao, mes, parcelas, assinaturas, compras);
    if (prevista.total <= 0) continue;

    const semCartao = cartao === CARTAO_NAO_INFORMADO;
    const idPagamento = `${mes}__${cartao}`;
    entries.push({
      id: `fatura-prevista__${idPagamento}`,
      type: "expense",
      status: estaPago("fatura", idPagamento) ? "paid" : "pending",
      amount: prevista.total,
      dueDate: dia ? vencimentoEfetivo(dia, mes).efetivo : ultimoDiaMes(mes),
      competenceMonth: mes,
      description: semCartao
        ? "Parcelas sem cartão definido (a confirmar)"
        : previsaoAConfirmar(mes, hojeISO, dia)
        ? `Fatura ${cartao} (valor a confirmar)`
        : `Fatura ${cartao} (prevista)`,
      aConfirmar: semCartao || previsaoAConfirmar(mes, hojeISO, dia),
      categoryId: "cartao",
      cardId: cartao,
      source: "card_bill",
      createdAt: 0,
      updatedAt: 0,
      estimado: true,
    });
  }
  return entries;
}

export function gastosParaEntries(gastos: Gasto[], mes: string): FinancialEntry[] {
  return gastos
    // compra no crédito já está dentro da fatura do cartão: contar aqui
    // também seria a mesma despesa duas vezes no resultado do mês
    .filter((g) => g.mes === mes && g.pagoCom !== "credito" && contaNoPeriodo(dataEfetivaDoGasto(g)))
    .map((g) => ({
      id: `gasto__${g.id}`,
      type: "expense" as const,
      status: "paid" as const,
      amount: g.valor,
      dueDate: diaISOde(g.criadoEm),
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
  diaVencimentoPorCartao?: Record<string, number>;
  /** Comissões diárias lançadas — viram entrada prevista do mês seguinte. */
  comissoes?: Comissao[];
  hojeISO?: string;
  /** Data real de cada pagamento marcado no checklist (auditoria F12). */
  dataPagamento?: DataPagamento;
  /** Dia de fechamento por cartão — põe a compra no crédito na fatura certa. */
  diaFechamentoPorCartao?: Record<string, number>;
}

/** Compras registradas no crédito (com cartão), com o mês da fatura de cada uma. */
export function comprasNoCredito(
  gastos: Gasto[],
  diaFechamentoPorCartao: Record<string, number> = {},
  diaVencimentoPorCartao: Record<string, number> = {}
): CompraNoCredito[] {
  return gastos
    .filter((g) => g.pagoCom === "credito" && g.cartao)
    .map((g) => ({
      nome: g.descricao,
      valor: g.valor,
      cartao: g.cartao as string,
      mesFatura: mesDaFaturaDaCompra(
        dataEfetivaDoGasto(g),
        diaFechamentoPorCartao[g.cartao as string],
        diaVencimentoPorCartao[g.cartao as string]
      ),
    }));
}

export function construirFinancialEntries(dados: DadosFinanceiros): FinancialEntry[] {
  return [
    ...ganhosParaEntries(dados.ganhos, dados.mes, dados.estaPago, dados.dataPagamento),
    ...contasFixasParaEntries(dados.contas, dados.mes, dados.estaPago, dados.dataPagamento),
    ...assinaturasParaEntries(dados.assinaturas, dados.mes, dados.estaPago, dados.dataPagamento),
    ...parcelasParaEntries(dados.parcelas, dados.mes, dados.estaPago, dados.dataPagamento),
    ...faturasParaEntries(
      dados.faturas,
      dados.mes,
      dados.estaPago,
      dados.diaVencimentoPorCartao,
      dados.dataPagamento
    ),
    ...faturasPrevistasParaEntries(
      dados.faturas,
      dados.parcelas,
      dados.assinaturas,
      dados.mes,
      dados.estaPago,
      dados.diaVencimentoPorCartao,
      dados.hojeISO,
      comprasNoCredito(dados.gastos, dados.diaFechamentoPorCartao, dados.diaVencimentoPorCartao)
    ),
    ...(dados.comissoes
      ? comissaoPrevistaParaEntries(dados.comissoes, dados.ganhos, dados.mes)
      : []),
    ...gastosParaEntries(dados.gastos, dados.mes),
  ];
}
