/**
 * Remove chaves com valor `undefined`, em qualquer profundidade.
 *
 * O Firestore rejeita propriedade com valor undefined e derruba a escrita
 * inteira. Quando isso acontece dentro de um writeBatch, leva junto a
 * operação de verdade que estava no mesmo batch.
 *
 * Fica num módulo próprio, sem importar nada, pra poder ser testado: quem
 * mora junto do SDK do Firebase não roda nos testes, porque só de importar
 * o `firebase.ts` o Auth tenta inicializar e falha sem as chaves de ambiente.
 */
export function semUndefined<T>(valor: T): T {
  if (Array.isArray(valor)) {
    return valor.map((v) => semUndefined(v)) as T;
  }
  if (valor !== null && typeof valor === "object") {
    const saida: Record<string, unknown> = {};
    for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
      if (v === undefined) continue;
      saida[chave] = semUndefined(v);
    }
    return saida as T;
  }
  return valor;
}
