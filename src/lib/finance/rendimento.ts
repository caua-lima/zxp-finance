import { arredondarCentavos } from "@/lib/types";

/**
 * Rendimento pelo CDI como ESTIMATIVA — nunca como dinheiro.
 *
 * A versão anterior somava o CDI calculado direto no saldo e nas caixinhas
 * (auditoria F07–F10): estimativa virava "dinheiro disponível", o principal
 * de hoje era aplicado a dias passados, e o que o banco creditou de verdade
 * podia ser contado duas vezes quando você atualizasse o saldo. Agora o app
 * só MOSTRA quanto aquele saldo tende a render, com fonte, taxa e data. O
 * dinheiro só muda quando você digita o valor que o banco mostra.
 *
 * A taxa vem do Banco Central (série 12 do SGS: CDI em % ao dia, por dia
 * útil). Isso não é integração com o Mercado Pago: é o benchmark que a conta
 * diz seguir. Valor bruto (IR só no resgate).
 */

export interface TaxaDiaria {
  data: string; // "AAAA-MM-DD"
  taxa: number; // % ao dia, ex: 0.050788
}

/** Dias úteis num mês típico — base da estimativa mensal. */
export const DIAS_UTEIS_NO_MES = 21;

/** CDI anualizado (% a.a.) a partir da taxa diária, na base de 252 dias úteis. */
export function cdiAnual(taxaDiaria: number): number {
  return (Math.pow(1 + taxaDiaria / 100, 252) - 1) * 100;
}

/**
 * Quanto um saldo tende a render num mês, no percentual do CDI informado,
 * mantida a taxa de hoje e sem aportes ou retiradas. Estimativa bruta.
 * Zero pra saldo não positivo ou percentual zero (conta que não rende).
 */
export function estimarRendimentoMensal(
  saldo: number,
  taxaDiaria: number,
  percentualCdi: number,
  diasUteis: number = DIAS_UTEIS_NO_MES
): number {
  if (!(saldo > 0) || !(percentualCdi > 0) || !(taxaDiaria > 0)) return 0;
  const fatorDia = 1 + (taxaDiaria / 100) * (percentualCdi / 100);
  return arredondarCentavos(saldo * (Math.pow(fatorDia, diasUteis) - 1));
}

/** Converte a resposta do BCB ("dd/mm/aaaa", "0.050788") pro formato do app. */
export function converterSerieBcb(
  serie: Array<{ data: string; valor: string }>
): TaxaDiaria[] {
  return serie
    .map((item) => {
      const [dia, mes, ano] = item.data.split("/");
      return { data: `${ano}-${mes}-${dia}`, taxa: Number(item.valor) };
    })
    .filter((t) => Number.isFinite(t.taxa) && t.taxa > 0);
}
