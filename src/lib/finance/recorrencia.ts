import { PeriodoPausa, VigenciaValor } from "@/lib/types";
import { diaISOde } from "./calculations";

/**
 * Recorrência com vigência (auditoria F11): conta fixa e assinatura
 * existem a partir de um mês, podem ser arquivadas a partir de outro, e
 * mudança de valor vale dali pra frente. Antes, o cadastro atual era
 * aplicado a TODOS os meses — mudar Spotify de R$ 20 pra R$ 25 em outubro
 * reescrevia setembro, e arquivar uma conta apagava ela do passado.
 */

interface Recorrencia {
  ativa: boolean;
  valor: number;
  criadoEm: number;
  inicioEm?: string;
  desativadaEm?: string | null;
  historicoValores?: VigenciaValor[];
  pausas?: PeriodoPausa[];
}

export function mesDeInicio(r: Pick<Recorrencia, "inicioEm" | "criadoEm">): string {
  return r.inicioEm ?? diaISOde(r.criadoEm).slice(0, 7);
}

/** A recorrência existe (e cobra) nesse mês? */
export function recorrenciaNoMes(r: Recorrencia, mes: string): boolean {
  if (mes < mesDeInicio(r)) return false;
  // arquivou e reativou depois: os meses do meio não contam
  if ((r.pausas ?? []).some((p) => mes >= p.de && mes < p.ate)) return false;
  if (r.ativa) return true;
  // arquivada: vale até o mês anterior ao arquivamento. Sem a data
  // (arquivada antes desta versão), não há como saber — fica de fora,
  // como sempre ficou.
  return !!r.desativadaEm && mes < r.desativadaEm;
}

/** Valor vigente no mês: a última mudança com `desde` ≤ mês, senão o valor do cadastro. */
export function valorNoMes(r: Pick<Recorrencia, "valor" | "historicoValores">, mes: string): number {
  const vigentes = (r.historicoValores ?? [])
    .filter((v) => v.desde <= mes)
    .sort((a, b) => a.desde.localeCompare(b.desde));
  return vigentes.length > 0 ? vigentes[vigentes.length - 1].valor : r.valor;
}

/**
 * Arquivar e reativar (auditoria 25/10 D28). Arquivar grava o mês;
 * reativar fecha esse intervalo como PAUSA em vez de apagar a data — senão
 * algo arquivado em novembro e reativado em janeiro voltaria a contar em
 * dezembro.
 */
export function mudancaDeAtivo(
  r: Pick<Recorrencia, "desativadaEm" | "pausas">,
  ativar: boolean,
  mesAtual: string
): { desativadaEm: string | null; pausas?: PeriodoPausa[] } {
  if (!ativar) return { desativadaEm: mesAtual };
  if (r.desativadaEm && r.desativadaEm < mesAtual) {
    return { desativadaEm: null, pausas: [...(r.pausas ?? []), { de: r.desativadaEm, ate: mesAtual }] };
  }
  // reativou no mesmo mês em que arquivou: não houve mês pausado
  return { desativadaEm: null };
}

/** Ganho recorrente no formato de recorrência (ganho usa `ativo`, conta usa `ativa`). */
export function recorrenciaDoGanho(g: {
  ativo?: boolean;
  valor: number;
  criadoEm: number;
  inicioEm?: string;
  desativadaEm?: string | null;
  historicoValores?: VigenciaValor[];
  pausas?: PeriodoPausa[];
}): Recorrencia {
  return {
    ativa: g.ativo !== false,
    valor: g.valor,
    criadoEm: g.criadoEm,
    inicioEm: g.inicioEm,
    desativadaEm: g.desativadaEm,
    historicoValores: g.historicoValores,
    pausas: g.pausas,
  };
}

/**
 * Histórico novo ao mudar o valor a partir de `mes`: preserva o valor
 * antigo desde o início (se ainda não havia histórico) e grava o novo.
 */
export function historicoAoMudarValor(
  r: Recorrencia,
  novoValor: number,
  mes: string
): VigenciaValor[] {
  const base: VigenciaValor[] =
    r.historicoValores && r.historicoValores.length > 0
      ? r.historicoValores.filter((v) => v.desde !== mes)
      : [{ desde: mesDeInicio(r), valor: r.valor }];
  return [...base.filter((v) => v.desde < mes), { desde: mes, valor: novoValor }];
}
