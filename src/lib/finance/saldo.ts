import { Gasto, Ganho, arredondarCentavos } from "@/lib/types";
import { Centavos, centavosDeLegado, deCentavos } from "@/lib/dinheiro";
import { diaISOde } from "./calculations";

/**
 * Implementação do contrato de docs/modelo-financeiro.md: o que entra no
 * saldo confirmado e quanto dá pra gastar hoje. Tela de Saldo, Resumo,
 * Anotar, notificação diária e Consultor usam SÓ estas funções.
 */

export interface ReferenciaSaldo {
  valor: number;
  atualizadoEm: number;
}

/** Pagamento marcado no checklist, como movimento de caixa. */
export interface MovimentoPagamento {
  valor: number;
  pagoEm: number;
  origem: string;
  /** Só pagamentos marcados a partir da versão que registra o movimento. */
  afetaSaldo?: boolean;
}

/** Dia em que o gasto aconteceu. Gasto antigo (sem `data`) usa o dia do registro. */
export function dataEfetivaDoGasto(g: Pick<Gasto, "data" | "criadoEm">): string {
  return g.data ?? diaISOde(g.criadoEm);
}

/** Regra de corte: esse gasto aconteceu depois do saldo digitado? */
export function gastoContaNoSaldo(g: Gasto, ref: ReferenciaSaldo): boolean {
  const diaRef = diaISOde(ref.atualizadoEm);
  const dia = dataEfetivaDoGasto(g);
  if (dia > diaRef) return true;
  if (dia < diaRef) return false;
  return g.criadoEm > ref.atualizadoEm;
}

/**
 * Quanto o gasto tirou da conta: o valor mais o que foi pros cofrinhos
 * junto (depósito automático é transferência — sai do disponível).
 */
export function saidaDoGasto(g: Gasto): number {
  return deCentavos(saidaDoGastoCentavos(g));
}

/** Mesma conta, em centavos inteiros (contrato do dinheiro, lib/dinheiro.ts). */
export function saidaDoGastoCentavos(g: Gasto): Centavos {
  const guardado = Object.values(g.guardado ?? {}).reduce((acc, v) => acc + centavosDeLegado(v), 0);
  // compra no crédito: o valor sai da conta quando a fatura for paga, não
  // agora. O que foi pros cofrinhos é transferência e sai na hora.
  if (g.pagoCom === "credito") return guardado;
  return centavosDeLegado(g.valor) + guardado;
}

/**
 * Pagamento marcado conta no saldo se foi registrado como movimento
 * (`afetaSaldo`) e depois da referência. Recebimento de ganho
 * (origem "ganho") também — só que como ENTRADA (ver sinalDoPagamento).
 * Recebimento antigo, sem `afetaSaldo`, nunca é reaplicado.
 */
export function pagamentoContaNoSaldo(p: MovimentoPagamento, ref: ReferenciaSaldo): boolean {
  return !!p.afetaSaldo && p.pagoEm > ref.atualizadoEm;
}

/** +1 = entrou dinheiro (ganho recebido); −1 = saiu (conta, fatura, parcela...). */
export function sinalDoPagamento(p: MovimentoPagamento): 1 | -1 {
  return p.origem === "ganho" ? 1 : -1;
}

/** Recebimentos avulsos que entraram no saldo (ganho "só este mês" marcado recebido). */
export function recebimentosAvulsos(ganhos: Ganho[]): RecebimentoAvulso[] {
  return ganhos
    .filter((g) => g.tipo === "pontual" && g.recebido && g.entrouNoSaldo && g.recebidoEm)
    .map((g) => ({
      id: g.id,
      descricao: g.descricao,
      valor: g.valorRecebido ?? g.valor,
      recebidoEm: g.recebidoEm as number,
    }));
}

/** Ganho avulso marcado como recebido, já líquido, que entrou no saldo. */
export interface RecebimentoAvulso {
  id: string;
  descricao: string;
  /** Líquido (o que caiu na conta). */
  valor: number;
  recebidoEm: number;
}

export type TipoLinhaExtrato = "registro" | "pagamento" | "recebimento";

export interface LinhaExtrato {
  tipo: TipoLinhaExtrato;
  descricao: string;
  /** Com sinal: negativo saiu, positivo entrou. */
  centavos: Centavos;
  quando: number;
  /** Caixinha/crédito explicados em texto curto. */
  detalhe?: string;
}

/**
 * O extrato que explica o saldo (auditoria 25/10 F01/C18): cada movimento
 * depois da referência, com sinal e data. saldoConfirmado é a SOMA disto —
 * a tela pode mostrar linha a linha de onde saiu o número.
 */
export function extratoDoSaldo(
  ref: ReferenciaSaldo,
  gastos: Gasto[],
  pagamentos: MovimentoPagamento[] = [],
  recebimentos: RecebimentoAvulso[] = []
): LinhaExtrato[] {
  const linhas: LinhaExtrato[] = [];
  for (const g of gastos) {
    if (!gastoContaNoSaldo(g, ref)) continue;
    const c = saidaDoGastoCentavos(g);
    if (c === 0) continue;
    const guardado = Object.values(g.guardado ?? {}).reduce((acc, v) => acc + centavosDeLegado(v), 0);
    linhas.push({
      tipo: "registro",
      descricao: g.descricao,
      centavos: -c,
      quando: g.criadoEm,
      ...(g.pagoCom === "credito"
        ? { detalhe: "no crédito: só o que foi pras caixinhas saiu agora" }
        : guardado > 0
          ? { detalhe: "inclui o que foi pras caixinhas" }
          : {}),
    });
  }
  for (const p of pagamentos) {
    if (!pagamentoContaNoSaldo(p, ref)) continue;
    linhas.push({
      tipo: p.origem === "ganho" ? "recebimento" : "pagamento",
      descricao: (p as MovimentoPagamento & { nome?: string }).nome ?? p.origem,
      centavos: sinalDoPagamento(p) * centavosDeLegado(p.valor),
      quando: p.pagoEm,
    });
  }
  for (const r of recebimentos) {
    if (r.recebidoEm <= ref.atualizadoEm) continue;
    linhas.push({ tipo: "recebimento", descricao: r.descricao, centavos: centavosDeLegado(r.valor), quando: r.recebidoEm });
  }
  return linhas.sort((a, b) => a.quando - b.quando);
}

/**
 * Saldo confirmado agora = referência + entradas − saídas posteriores a
 * ela (a soma do extrato), em centavos inteiros.
 */
export function saldoConfirmado(
  ref: ReferenciaSaldo | null,
  gastos: Gasto[],
  pagamentos: MovimentoPagamento[] = [],
  recebimentos: RecebimentoAvulso[] = []
): number | null {
  if (!ref) return null;
  const movimento = extratoDoSaldo(ref, gastos, pagamentos, recebimentos).reduce((acc, l) => acc + l.centavos, 0);
  return deCentavos(centavosDeLegado(ref.valor) + movimento);
}

/**
 * Saídas de hoje que já estão descontadas do saldo confirmado. Ajuste de
 * conciliação antigo não é "gasto de hoje" (é correção acumulada).
 */
export function saidasDeHoje(
  ref: ReferenciaSaldo | null,
  gastos: Gasto[],
  pagamentos: MovimentoPagamento[],
  hojeISO: string
): number {
  if (!ref) return 0;
  const deGastos = gastos
    .filter(
      (g) =>
        !g.ajusteConciliacaoId &&
        dataEfetivaDoGasto(g) === hojeISO &&
        gastoContaNoSaldo(g, ref)
    )
    .reduce((acc, g) => acc + saidaDoGasto(g), 0);
  const dePagamentos = pagamentos
    .filter((p) => pagamentoContaNoSaldo(p, ref) && p.origem !== "ganho" && diaISOde(p.pagoEm) === hojeISO)
    .reduce((acc, p) => acc + p.valor, 0);
  return arredondarCentavos(deGastos + dePagamentos);
}

export interface OrcamentoDoDia {
  /** Quanto dava pra gastar hoje, calculado com o saldo do começo do dia. */
  orcamento: number;
  gastoHoje: number;
  /** Negativo = passou do limite. */
  restante: number;
}

/**
 * "Pode gastar hoje", com o gasto de hoje descontado UMA vez (auditoria
 * F01). Antes: saldo já líquido do gasto de hoje dividido pelos dias, e o
 * gasto de hoje subtraído de novo do resultado.
 */
export function orcamentoDoDia(
  saldoAtual: number | null,
  saidasHoje: number,
  reserva: number,
  diasRestantes: number
): OrcamentoDoDia | null {
  if (saldoAtual === null || diasRestantes <= 0) return null;
  const inicioDoDia = saldoAtual + saidasHoje;
  const orcamento = Math.max(0, arredondarCentavos((inicioDoDia - reserva) / diasRestantes));
  return {
    orcamento,
    gastoHoje: saidasHoje,
    restante: arredondarCentavos(orcamento - saidasHoje),
  };
}

/**
 * Apagar um gasto (ou um par gasto/estorno) muda o saldo? Um par com os
 * dois lados do MESMO lado da referência se cancela; com lados diferentes,
 * apagar mudaria o saldo sem explicação (auditoria F05) — o app recusa.
 */
export function exclusaoDoParMudaSaldo(
  original: Gasto,
  estorno: Gasto,
  ref: ReferenciaSaldo | null
): boolean {
  if (!ref) return false;
  return gastoContaNoSaldo(original, ref) !== gastoContaNoSaldo(estorno, ref);
}
