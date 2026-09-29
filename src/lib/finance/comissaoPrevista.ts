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

/** Ganho que representa o pagamento de comissão (lançado pela tela de Comissões ou à mão em Ganhos). */
export function ehGanhoDeComissao(g: Ganho): boolean {
  if (g.tipo !== "pontual" || g.arquivado) return false;
  if (g.categoriaReceita === "Comissão") return true;
  return /^comiss[aã]o/i.test(g.descricao.trim());
}

/** Já existe o pagamento real da comissão lançado em `mes`? Aí a previsão sai de cena. */
export function comissaoJaRecebidaEm(mes: string, ganhos: Ganho[]): boolean {
  return ganhos.some((g) => g.mes === mes && ehGanhoDeComissao(g));
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
 * Entrada prevista de comissão pro `mes`, ou nada quando o pagamento real
 * já foi lançado em Ganhos (senão o mesmo dinheiro contaria duas vezes).
 */
export function comissaoPrevistaParaEntries(
  comissoes: Comissao[],
  ganhos: Ganho[],
  mes: string
): FinancialEntry[] {
  const prevista = comissaoPrevistaPara(mes, comissoes);
  if (!prevista || comissaoJaRecebidaEm(mes, ganhos)) return [];
  return [
    {
      id: `comissao-prevista__${prevista.mesOrigem}`,
      type: "income",
      status: "planned",
      amount: prevista.liquido,
      dueDate: `${mes}-01`,
      competenceMonth: mes,
      description: "Comissão do mês passado (líquida)",
      categoryId: "Comissão",
      source: "income",
      createdAt: 0,
      updatedAt: 0,
      estimado: true,
    },
  ];
}
