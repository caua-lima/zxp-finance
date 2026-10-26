/**
 * Contrato do dinheiro (auditoria 25/10 F08/C17).
 *
 * Versão 2 do modelo: todo CÁLCULO agregado é feito em centavos inteiros
 * (number inteiro, dentro de ±MAX_CENTAVOS), em BRL. O armazenamento ainda
 * guarda reais com até 2 casas — a conversão acontece UMA vez, na leitura,
 * por paraCentavos(). Migrar o banco pra centavos é a etapa do lote I
 * (com backup e ensaio); até lá, leitura legada e nova convivem.
 *
 * Por quê: somar 0,10 + 0,20 em ponto flutuante dá 0,30000000000000004 —
 * multiplicado por centenas de registros, o saldo "não fecha" por centavos
 * que ninguém consegue explicar.
 */

export type Centavos = number;
export const MOEDA = "BRL" as const;

/** R$ 100 bilhões em centavos — muito acima de qualquer conta pessoal, longe do limite seguro do JS. */
export const MAX_CENTAVOS = 10_000_000_000_000;

export class ValorInvalido extends Error {}

/** Reais (como estão gravados) → centavos inteiros. Recusa NaN, infinito e fora da faixa. */
export function paraCentavos(reais: number): Centavos {
  if (typeof reais !== "number" || !Number.isFinite(reais)) throw new ValorInvalido(`valor não numérico: ${reais}`);
  // toFixed(2) antes do round corrige 1.005 → 100.49999 (vira 101, como a pessoa espera)
  const c = Math.round(Number((reais * 100).toFixed(4)));
  if (Math.abs(c) > MAX_CENTAVOS) throw new ValorInvalido(`valor fora da faixa: ${reais}`);
  return c === 0 ? 0 : c; // sem -0
}

export function deCentavos(c: Centavos): number {
  return c / 100;
}

export function ehCentavos(c: unknown): c is Centavos {
  return typeof c === "number" && Number.isInteger(c) && Math.abs(c) <= MAX_CENTAVOS;
}

/** Soma valores em reais sem acumular resíduo: converte, soma inteiro, volta. */
export function somarReais(valores: number[]): number {
  return deCentavos(valores.reduce((acc, v) => acc + paraCentavos(v), 0));
}

/** Leitura tolerante de dado legado: valor ausente/inválido vira 0 e é reportado, nunca NaN no saldo. */
export function centavosDeLegado(valor: unknown, aoIgnorar?: (motivo: string) => void): Centavos {
  try {
    return paraCentavos(valor as number);
  } catch (e) {
    aoIgnorar?.(e instanceof Error ? e.message : "valor inválido");
    return 0;
  }
}

export function formatarCentavos(c: Centavos): string {
  return deCentavos(c).toLocaleString("pt-BR", { style: "currency", currency: MOEDA });
}
