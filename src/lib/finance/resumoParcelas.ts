import {
  Parcela,
  arredondarCentavos,
  diferencaMeses,
  mesSeguinte,
  valorMinhaParte,
} from "@/lib/types";

/**
 * "Quanto de parcela eu tenho de fato?" — somando TODAS, inclusive as que
 * estão dentro da fatura do cartão. O total antigo da tela deixava as do
 * cartão de fora (pra não somar duas vezes com a fatura no "A pagar"), e
 * aí a tela de Parcelas mostrava só o carro, como se o resto não existisse.
 * Aqui é visão de dívida, não de caixa do mês: tudo entra.
 */

/**
 * Quantas parcelas ainda faltam pagar a partir de `mes` (inclusive).
 * Diferente de `parcelasRestantesEm`, uma parcela que só começa no mês que
 * vem continua contando — ela ainda é dívida assumida, só não vence agora.
 */
export function parcelasAPagarDesde(p: Parcela, mes: string): number {
  const referencia = p.mesReferencia ?? mes;
  const decorridos = diferencaMeses(referencia, mes);
  if (decorridos <= 0) return p.parcelasRestantes;
  return Math.max(0, p.parcelasRestantes - decorridos);
}

/** Último mês em que a parcela ainda cobra ("AAAA-MM"), ou null se já quitada. */
export function mesDaUltimaParcela(p: Parcela, mes: string): string | null {
  const faltam = parcelasAPagarDesde(p, mes);
  if (faltam <= 0) return null;
  const referencia = p.mesReferencia ?? mes;
  let ultimo = referencia > mes ? referencia : mes;
  for (let i = 1; i < faltam; i++) ultimo = mesSeguinte(ultimo);
  return ultimo;
}

export interface ResumoParcelas {
  quantidade: number;
  /** Quanto sai do seu bolso por mês (metade quando é dividida). */
  mensalSuaParte: number;
  /** Parte disso que está dentro de fatura de cartão. */
  mensalNoCartao: number;
  mensalForaDoCartao: number;
  /** Tudo que ainda falta pagar até quitar todas, na sua parte. */
  faltaPagar: number;
  /** Mês em que a última parcela termina — "livre de parcelas" a partir do seguinte. */
  ultimoMes: string | null;
}

export function resumoParcelasAtivas(parcelas: Parcela[], mes: string): ResumoParcelas {
  let quantidade = 0;
  let mensalNoCartao = 0;
  let mensalForaDoCartao = 0;
  let faltaPagar = 0;
  let ultimoMes: string | null = null;

  for (const p of parcelas) {
    const faltam = parcelasAPagarDesde(p, mes);
    if (faltam <= 0) continue;
    quantidade++;
    const parte = valorMinhaParte(p);
    if (p.naFatura) mensalNoCartao += parte;
    else mensalForaDoCartao += parte;
    faltaPagar += parte * faltam;
    const ultimo = mesDaUltimaParcela(p, mes);
    if (ultimo && (!ultimoMes || ultimo > ultimoMes)) ultimoMes = ultimo;
  }

  return {
    quantidade,
    mensalSuaParte: arredondarCentavos(mensalNoCartao + mensalForaDoCartao),
    mensalNoCartao: arredondarCentavos(mensalNoCartao),
    mensalForaDoCartao: arredondarCentavos(mensalForaDoCartao),
    faltaPagar: arredondarCentavos(faltaPagar),
    ultimoMes,
  };
}
