import type { FinancialEntry } from "@/lib/types";
import { paraCentavos } from "@/lib/dinheiro";

/**
 * Fechamento de mês versionado (auditoria 25/10 F06/D30). Cada fechamento
 * grava uma VERSÃO imutável com os totais, as linhas que os compõem e um
 * hash do conjunto. Depois, o relatório do mês fechado mostra os números
 * do fechamento — e, se os números "vivos" divergirem (cadastro editado,
 * recorrência mudada), avisa a diferença em vez de reescrever o passado.
 */

export interface LinhaFechamento {
  id: string;
  tipo: "income" | "expense";
  centavos: number;
}

export interface ResumoFechamento {
  mes: string;
  receitaCentavos: number;
  despesasCentavos: number;
  resultadoCentavos: number;
  linhas: LinhaFechamento[];
}

/** Resumo canônico (ordenado, em centavos) — a mesma entrada dá sempre o mesmo hash. */
export function resumoParaFechamento(
  mes: string,
  entries: FinancialEntry[],
  totais: { receita: number; despesas: number; resultado: number }
): ResumoFechamento {
  const linhas = entries
    .filter(
      (e): e is FinancialEntry & { type: "income" | "expense" } =>
        e.competenceMonth === mes &&
        e.status !== "cancelled" &&
        e.status !== "archived" &&
        (e.type === "income" || e.type === "expense")
    )
    .map((e) => ({ id: e.id, tipo: e.type, centavos: paraCentavos(e.amount) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    mes,
    receitaCentavos: paraCentavos(totais.receita),
    despesasCentavos: paraCentavos(totais.despesas),
    resultadoCentavos: paraCentavos(totais.resultado),
    linhas,
  };
}

export async function hashDoResumo(r: ResumoFechamento): Promise<string> {
  const texto = JSON.stringify([r.mes, r.receitaCentavos, r.despesasCentavos, r.resultadoCentavos, r.linhas.map((l) => [l.id, l.tipo, l.centavos])]);
  const bytes = new TextEncoder().encode(texto);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface Divergencia {
  /** Resultado vivo − resultado fechado, em reais. */
  diferencaResultado: number;
  /** Lançamentos que existem num e não no outro, ou com valor diferente. */
  linhasDiferentes: number;
}

/** O que mudou nos números vivos desde o fechamento; null = nada. */
export function divergenciaDoFechamento(fechado: ResumoFechamento, vivo: ResumoFechamento): Divergencia | null {
  const porId = new Map(fechado.linhas.map((l) => [l.id, l.centavos]));
  let diferentes = 0;
  const vistos = new Set<string>();
  for (const l of vivo.linhas) {
    vistos.add(l.id);
    if (porId.get(l.id) !== l.centavos) diferentes++;
  }
  for (const l of fechado.linhas) if (!vistos.has(l.id)) diferentes++;
  const dif = vivo.resultadoCentavos - fechado.resultadoCentavos;
  if (diferentes === 0 && dif === 0) return null;
  return { diferencaResultado: dif / 100, linhasDiferentes: diferentes };
}
