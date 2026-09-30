/**
 * Texto colado num campo de dinheiro → valor, com as regras brasileiras:
 * vírgula é decimal, ponto seguido de 3 dígitos é milhar, ponto com 1–2
 * dígitos (sem vírgula) é decimal. "100" → 100; "15,50" → 15,5;
 * "R$ 1.500,50" → 1500,5. null quando não é um valor reconhecível.
 */
export function valorColado(texto: string): number | null {
  const limpo = texto.replace(/r\$|\s/gi, "");
  if (!/^\d[\d.,]*$/.test(limpo)) return null;
  let n: number;
  if (limpo.includes(",")) n = parseFloat(limpo.replace(/\./g, "").replace(",", "."));
  else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) n = parseFloat(limpo.replace(/\./g, ""));
  else n = parseFloat(limpo);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
