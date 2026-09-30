import { VigenciaValor } from "@/lib/types";
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
}

export function mesDeInicio(r: Pick<Recorrencia, "inicioEm" | "criadoEm">): string {
  return r.inicioEm ?? diaISOde(r.criadoEm).slice(0, 7);
}

/** A recorrência existe (e cobra) nesse mês? */
export function recorrenciaNoMes(r: Recorrencia, mes: string): boolean {
  if (mes < mesDeInicio(r)) return false;
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
