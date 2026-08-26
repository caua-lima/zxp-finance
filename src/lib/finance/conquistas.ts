import { Gasto, Parcela, parcelasRestantesEm, valorMinhaParte, arredondarCentavos } from "@/lib/types";
import { diaISOde } from "./calculations";

/**
 * O lado positivo do app.
 *
 * Tudo aqui sai de número que já existe — dia em que você gastou menos que o
 * orçamento, parcela que termina, quanto você está à frente da meta. Nada de
 * medalha ou pontuação inventada: se o elogio não corresponder a um número
 * real, ele vira ruído e você para de acreditar nos avisos sérios também.
 */

export interface DiaAvaliado {
  dia: string;
  gasto: number;
  dentroDoOrcamento: boolean;
}

/**
 * Avalia cada dia JÁ FECHADO do mês (não inclui hoje, que ainda está
 * correndo) contra o orçamento diário.
 *
 * Ressalva honesta: compara com o orçamento de hoje, não com o que valia
 * naquele dia — o orçamento se recalcula conforme o saldo e os dias
 * restantes mudam, e o app não guarda histórico dele. É uma aproximação boa
 * o bastante pra "fiquei no controle nesse dia?", mas não é auditoria.
 */
export function avaliarDiasFechados(
  gastos: Gasto[],
  orcamentoDiario: number,
  mes: string,
  hojeISO: string
): DiaAvaliado[] {
  const diaDeHoje = Number(hojeISO.split("-")[2]);
  const porDia = new Map<string, number>();

  for (const g of gastos) {
    if (g.mes !== mes || g.ajusteConciliacaoId) continue;
    const dia = diaISOde(g.criadoEm);
    porDia.set(dia, (porDia.get(dia) ?? 0) + g.valor);
  }

  const dias: DiaAvaliado[] = [];
  for (let d = 1; d < diaDeHoje; d++) {
    const dia = `${mes}-${String(d).padStart(2, "0")}`;
    const gasto = arredondarCentavos(porDia.get(dia) ?? 0);
    dias.push({ dia, gasto, dentroDoOrcamento: gasto <= orcamentoDiario });
  }
  return dias;
}

/** Dias seguidos dentro do orçamento, contando de trás pra frente. */
export function sequenciaAtual(dias: DiaAvaliado[]): number {
  let sequencia = 0;
  for (let i = dias.length - 1; i >= 0; i--) {
    if (!dias[i].dentroDoOrcamento) break;
    sequencia++;
  }
  return sequencia;
}

/** Maior sequência do mês — serve de recorde a bater. */
export function melhorSequencia(dias: DiaAvaliado[]): number {
  let melhor = 0;
  let atual = 0;
  for (const d of dias) {
    atual = d.dentroDoOrcamento ? atual + 1 : 0;
    if (atual > melhor) melhor = atual;
  }
  return melhor;
}

export interface ResumoConquistas {
  diasFechados: number;
  diasNoControle: number;
  sequencia: number;
  melhorSequencia: number;
  /** Soma do que sobrou nos dias em que gastou menos que o orçamento. */
  economiaAcumulada: number;
}

export function resumirConquistas(
  dias: DiaAvaliado[],
  orcamentoDiario: number
): ResumoConquistas {
  const noControle = dias.filter((d) => d.dentroDoOrcamento);
  const economia = noControle.reduce(
    (acc, d) => acc + (orcamentoDiario - d.gasto),
    0
  );
  return {
    diasFechados: dias.length,
    diasNoControle: noControle.length,
    sequencia: sequenciaAtual(dias),
    melhorSequencia: melhorSequencia(dias),
    economiaAcumulada: arredondarCentavos(Math.max(0, economia)),
  };
}

// --- dinheiro que vai liberar ------------------------------------------------

export interface ParcelaTerminando {
  id: string;
  nome: string;
  valorMensal: number;
}

export interface DinheiroLiberando {
  parcelas: ParcelaTerminando[];
  totalMensal: number;
}

/**
 * Parcelas cuja última prestação cai neste mês — ou seja, dinheiro que volta
 * pro seu bolso todo mês a partir do mês que vem. O app já avisava "está na
 * última parcela", mas nunca dizia quanto isso libera, que é a parte boa.
 *
 * Parcela marcada `naFatura` fica de fora: o valor dela já está embutido no
 * lançamento da fatura, então não é uma linha própria que desaparece.
 */
export function dinheiroLiberando(parcelas: Parcela[], mes: string): DinheiroLiberando {
  const terminando = parcelas
    .filter((p) => !p.naFatura && parcelasRestantesEm(p, mes) === 1)
    .map((p) => ({ id: p.id, nome: p.nome, valorMensal: valorMinhaParte(p) }));

  return {
    parcelas: terminando,
    totalMensal: arredondarCentavos(
      terminando.reduce((acc, p) => acc + p.valorMensal, 0)
    ),
  };
}

// --- comparação com o mês anterior -------------------------------------------

export interface MelhoraCategoria {
  categoria: string;
  atual: number;
  anterior: number;
  economia: number;
}

/**
 * Categorias em que você gastou menos que no mês passado. É o espelho do
 * "categorias que mais cresceram" que já existe no DRE — sem isso o app só
 * apontava o que piorou, o que dá uma leitura injusta de um mês que no
 * conjunto foi melhor.
 */
export function categoriasQueMelhoraram(
  atual: { categoryId: string; total: number }[],
  anterior: { categoryId: string; total: number }[],
  limiarReais = 30,
  maximo = 3
): MelhoraCategoria[] {
  const anteriorPorCategoria = new Map(anterior.map((g) => [g.categoryId, g.total]));

  return atual
    .map((g) => {
      const valorAnterior = anteriorPorCategoria.get(g.categoryId) ?? 0;
      return {
        categoria: g.categoryId,
        atual: g.total,
        anterior: valorAnterior,
        economia: arredondarCentavos(valorAnterior - g.total),
      };
    })
    .filter((c) => c.economia >= limiarReais)
    .sort((a, b) => b.economia - a.economia)
    .slice(0, maximo);
}
