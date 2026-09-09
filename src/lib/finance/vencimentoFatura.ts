import { vencimentoEfetivo } from "./diasUteis";

/**
 * Quantos dias faltam pro vencimento da fatura daquele mês. Positivo =
 * ainda vai vencer, 0 = vence hoje, negativo = já venceu. Usa o
 * construtor local de Date (nunca parse de string como UTC) pelo mesmo
 * motivo do resto do app: `new Date("2026-08-15")` é meia-noite em UTC,
 * que em Brasília ainda é dia 14.
 *
 * Conta até o vencimento EFETIVO, não até o dia cadastrado no cartão:
 * fatura que cai em fim de semana ou feriado só é processada no próximo
 * dia útil. Sem isso o app dizia "venceu há 1 dia" num domingo em que
 * ainda faltavam dois dias úteis pra pagar sem juros.
 */
export function diasAteVencimento(
  diaVencimento: number,
  mes: string,
  hojeISO: string
): number {
  const { efetivo } = vencimentoEfetivo(diaVencimento, mes);
  const [anoV, mesV, diaV] = efetivo.split("-").map(Number);
  const [anoH, mesH, diaH] = hojeISO.split("-").map(Number);
  const vencimento = new Date(anoV, mesV - 1, diaV);
  const hoje = new Date(anoH, mesH - 1, diaH);
  return Math.round((vencimento.getTime() - hoje.getTime()) / 86400000);
}

/** Só nesses marcos a notificação dispara — nada de lembrete todo santo dia. */
export const MARCOS_AVISO = [5, 1, 0] as const;

export function deveAvisar(dias: number): boolean {
  return (MARCOS_AVISO as readonly number[]).includes(dias);
}

export interface AvisoVencimento {
  titulo: string;
  corpo: string;
}

/**
 * Texto do aviso pra cada marco. Não é gerado pra dias fora dos marcos —
 * chame só depois de `deveAvisar`.
 */
export function montarAviso(
  cartao: string,
  valorFormatado: string,
  dias: number
): AvisoVencimento | null {
  if (!deveAvisar(dias)) return null;
  if (dias === 0) {
    return {
      titulo: `Fatura do ${cartao} vence hoje`,
      corpo: `${valorFormatado} — se ainda não pagou, hoje é o último dia.`,
    };
  }
  if (dias === 1) {
    return {
      titulo: `Fatura do ${cartao} vence amanhã`,
      corpo: `${valorFormatado} — deixa separado pra não passar batido.`,
    };
  }
  return {
    titulo: `Fatura do ${cartao} vence em ${dias} dias`,
    corpo: `${valorFormatado} — dá tempo de se organizar.`,
  };
}
