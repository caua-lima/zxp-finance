import { Caixinha, arredondarCentavos } from "@/lib/types";

/**
 * Regras das caixinhas, separadas do Firestore pra poderem ser testadas.
 *
 * A ideia toda é: sempre que você registra um gasto, cada caixinha ativa
 * separa o valor configurado nela. Não existe gasto pequeno demais — um
 * café de R$ 0,01 guarda igual a uma compra de R$ 800, porque o que conta
 * aqui é a frequência, não o tamanho.
 */

/** Só caixinha ativa e com valor configurado participa do depósito automático. */
export function caixinhasQueRecebem(caixinhas: Caixinha[]): Caixinha[] {
  return caixinhas.filter((c) => c.ativa && c.porGasto > 0);
}

/** Quanto sai do bolso pras caixinhas a cada gasto registrado. */
export function totalPorGasto(caixinhas: Caixinha[]): number {
  return arredondarCentavos(
    caixinhasQueRecebem(caixinhas).reduce((acc, c) => acc + c.porGasto, 0)
  );
}

/** Soma do que já está guardado — inclusive nas caixinhas pausadas. */
export function totalGuardado(caixinhas: Caixinha[]): number {
  return arredondarCentavos(caixinhas.reduce((acc, c) => acc + c.saldo, 0));
}

/**
 * O depósito que este gasto gera, no formato que vai gravado no próprio
 * lançamento ({caixinhaId: valor}). Fica no gasto pra que o estorno saiba
 * devolver exatamente o que tirou, mesmo que a caixinha tenha mudado de
 * valor ou sido pausada no meio do caminho.
 */
export function depositoDoGasto(caixinhas: Caixinha[]): Record<string, number> {
  const deposito: Record<string, number> = {};
  for (const c of caixinhasQueRecebem(caixinhas)) {
    deposito[c.id] = c.porGasto;
  }
  return deposito;
}

/** Quanto falta pra bater a meta. `null` quando não há meta definida. */
export function faltaParaMeta(caixinha: Caixinha): number | null {
  if (!caixinha.meta || caixinha.meta <= 0) return null;
  return arredondarCentavos(Math.max(0, caixinha.meta - caixinha.saldo));
}

/** Progresso da meta em 0–100. `null` quando não há meta definida. */
export function progressoDaMeta(caixinha: Caixinha): number | null {
  if (!caixinha.meta || caixinha.meta <= 0) return null;
  return Math.min(100, Math.round((caixinha.saldo / caixinha.meta) * 100));
}

/**
 * Quantos gastos ainda faltam pra caixinha bater a meta, no ritmo atual.
 * `null` quando não há meta, quando a caixinha não guarda nada por gasto,
 * ou quando a meta já foi batida — nos três casos não existe contagem
 * regressiva pra mostrar.
 */
export function gastosAteAMeta(caixinha: Caixinha): number | null {
  const falta = faltaParaMeta(caixinha);
  if (falta === null || falta === 0) return null;
  if (!caixinha.ativa || caixinha.porGasto <= 0) return null;
  return Math.ceil(falta / caixinha.porGasto);
}
