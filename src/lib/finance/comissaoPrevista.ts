import {
  Comissao,
  Ganho,
  FinancialEntry,
  arredondarCentavos,
  calcularImposto,
  mesAnteriorDe,
} from "@/lib/types";

/**
 * Comissão de um mês só cai no mês seguinte: o que você lança em setembro
 * é dinheiro de outubro. Por isso ela entra como "entrada prevista" do
 * mês seguinte — já líquida do imposto, que é o que de fato vai cair na
 * conta — e não do mês em que foi lançada.
 */

export interface ComissaoPrevista {
  /** Mês em que as comissões foram lançadas (o trabalho). */
  mesOrigem: string;
  /** Mês em que o dinheiro cai. */
  mesRecebimento: string;
  dias: number;
  bruto: number;
  imposto: number;
  liquido: number;
}

/**
 * Pagamentos de comissão VINCULADOS a um mês de origem (`origemComissao`).
 * Antes a previsão sumia com qualquer ganho que tivesse "Comissão" no nome
 * ou na categoria — um bico pequeno escondia uma previsão grande
 * (auditoria F13). Texto não é chave de conciliação; o vínculo é.
 */
export function pagamentosDaComissao(mesOrigem: string, ganhos: Ganho[]): Ganho[] {
  return ganhos.filter(
    (g) => g.tipo === "pontual" && !g.arquivado && g.origemComissao === mesOrigem
  );
}

/**
 * Quanto de comissão deve cair em `mes`, somando o que foi lançado no mês
 * anterior. `null` quando não há nada lançado no mês anterior.
 */
export function comissaoPrevistaPara(
  mes: string,
  comissoes: Comissao[]
): ComissaoPrevista | null {
  const mesOrigem = mesAnteriorDe(mes);
  const doMes = comissoes.filter((c) => c.mes === mesOrigem);
  if (doMes.length === 0) return null;
  const bruto = arredondarCentavos(doMes.reduce((acc, c) => acc + c.valorTotal, 0));
  if (bruto <= 0) return null;
  const imposto = arredondarCentavos(calcularImposto(bruto));
  return {
    mesOrigem,
    mesRecebimento: mes,
    dias: doMes.length,
    bruto,
    imposto,
    liquido: arredondarCentavos(bruto - imposto),
  };
}

/**
 * Entrada prevista de comissão pro `mes`, descontando o que já foi
 * recebido e vinculado a ela. Pagamento parcial deixa o RESTANTE previsto
 * — a diferença não some.
 */
export function comissaoPrevistaParaEntries(
  comissoes: Comissao[],
  ganhos: Ganho[],
  mes: string
): FinancialEntry[] {
  const prevista = comissaoPrevistaPara(mes, comissoes);
  if (!prevista) return [];
  const recebidoBruto = pagamentosDaComissao(prevista.mesOrigem, ganhos).reduce(
    (acc, g) => acc + g.valor,
    0
  );
  const restanteBruto = arredondarCentavos(prevista.bruto - recebidoBruto);
  if (restanteBruto <= 0) return [];
  const restanteLiquido = arredondarCentavos(restanteBruto - calcularImposto(restanteBruto));
  return [
    {
      id: `comissao-prevista__${prevista.mesOrigem}`,
      type: "income",
      status: "planned",
      amount: restanteLiquido,
      dueDate: `${mes}-01`,
      competenceMonth: mes,
      description:
        recebidoBruto > 0
          ? "Comissão do mês passado — restante (líquido)"
          : "Comissão do mês passado (líquida)",
      categoryId: "Comissão",
      source: "income",
      createdAt: 0,
      updatedAt: 0,
      estimado: true,
    },
  ];
}
