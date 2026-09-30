import { Gasto, arredondarCentavos } from "@/lib/types";
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
  const guardado = Object.values(g.guardado ?? {}).reduce((acc, v) => acc + v, 0);
  return g.valor + guardado;
}

export function pagamentoContaNoSaldo(p: MovimentoPagamento, ref: ReferenciaSaldo): boolean {
  return !!p.afetaSaldo && p.origem !== "ganho" && p.pagoEm > ref.atualizadoEm;
}

/** Saldo confirmado agora = referência − movimentos posteriores a ela. */
export function saldoConfirmado(
  ref: ReferenciaSaldo | null,
  gastos: Gasto[],
  pagamentos: MovimentoPagamento[] = []
): number | null {
  if (!ref) return null;
  const saidasGastos = gastos
    .filter((g) => gastoContaNoSaldo(g, ref))
    .reduce((acc, g) => acc + saidaDoGasto(g), 0);
  const saidasPagamentos = pagamentos
    .filter((p) => pagamentoContaNoSaldo(p, ref))
    .reduce((acc, p) => acc + p.valor, 0);
  return arredondarCentavos(ref.valor - saidasGastos - saidasPagamentos);
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
    .filter((p) => pagamentoContaNoSaldo(p, ref) && diaISOde(p.pagoEm) === hojeISO)
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
