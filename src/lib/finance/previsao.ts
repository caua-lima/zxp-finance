import { deCentavos, paraCentavos } from "@/lib/dinheiro";

/**
 * Confirmado × previsto (auditoria 25/10 F09/C24). O "Sobra" antigo era
 * a receber − a pagar, sem o saldo — parecia dinheiro disponível e não
 * era. Aqui cada número diz o que é:
 *  - confirmado: o que está na conta agora (nada previsto dentro);
 *  - fimDoMesPrevisto: confirmado + a receber − a pagar (estimativa);
 *  - resultadoPrevisto: a receber − a pagar (sem o saldo), quando o saldo
 *    ainda não foi informado.
 */
export interface PrevisaoDoMes {
  confirmado: number | null;
  fimDoMesPrevisto: number | null;
  resultadoPrevisto: number;
  formula: string;
}

export function previsaoDoMes(confirmado: number | null, aReceber: number, aPagar: number): PrevisaoDoMes {
  const resultado = paraCentavos(aReceber) - paraCentavos(aPagar);
  return {
    confirmado,
    fimDoMesPrevisto: confirmado === null ? null : deCentavos(paraCentavos(confirmado) + resultado),
    resultadoPrevisto: deCentavos(resultado),
    formula:
      confirmado === null
        ? "vai entrar − falta pagar (sem o saldo, que ainda não foi informado)"
        : "na conta agora + vai entrar − falta pagar",
  };
}
