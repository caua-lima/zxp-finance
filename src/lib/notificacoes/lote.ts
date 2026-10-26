/**
 * Retomada do cron diário com checkpoint (auditoria 25/10 E38/N07). A
 * execução do dia tem UM documento (`execucoesNotificacao/{dia}`) com o
 * cursor — o último usuário (em ordem de uid) já processado. Acabou o
 * orçamento de tempo? Grava o cursor e marca "parcial"; a próxima chamada
 * continua dali, sem repetir o começo nem abandonar o fim.
 */
export type StatusExecucao = "rodando" | "parcial" | "ok" | "com_problemas";

export interface EstadoExecucaoDia {
  status: StatusExecucao;
  cursor?: string;
  /** Última vez que esta execução gravou progresso (ms). */
  atualizadaEm?: number;
}

/** "rodando" sem progresso há mais que isso = a função morreu no meio. */
export const EXECUCAO_TRAVADA_MS = 5 * 60_000;

export type ModoExecucao = "agendado" | "retomar" | "forcar";

/**
 * Quem processar agora. `agendado` (cron das 8h) começa o dia; `retomar`
 * (executor frequente) só continua o que ficou parcial/travado — nunca
 * começa o dia antes da hora; `forcar` refaz tudo (seguro: idempotente).
 */
export function planejarLote(
  uidsOrdenados: string[],
  estado: EstadoExecucaoDia | null,
  modo: ModoExecucao,
  agora: number
): { rodar: boolean; pendentes: string[]; motivo: string } {
  if (modo === "forcar") return { rodar: true, pendentes: uidsOrdenados, motivo: "forçado" };
  const travada = estado?.status === "rodando" && agora - (estado.atualizadaEm ?? 0) > EXECUCAO_TRAVADA_MS;
  if (!estado) {
    return modo === "agendado"
      ? { rodar: true, pendentes: uidsOrdenados, motivo: "primeira execução do dia" }
      : { rodar: false, pendentes: [], motivo: "o dia ainda não começou" };
  }
  if (estado.status === "parcial" || travada) {
    const pendentes = estado.cursor ? uidsOrdenados.filter((u) => u > estado.cursor!) : uidsOrdenados;
    return { rodar: pendentes.length > 0, pendentes, motivo: travada ? "retomando execução travada" : "retomando do cursor" };
  }
  if (estado.status === "rodando") return { rodar: false, pendentes: [], motivo: "outra execução está rodando" };
  return { rodar: false, pendentes: [], motivo: "o dia já foi concluído" };
}
