/**
 * Plano de categorias estável (Fase 7). Não substitui as listas de
 * categoria já usadas em Contas fixas (categorias.ts) e Gastos
 * (categoriasGasto.ts) — essas continuam como estão, editáveis
 * livremente pelo usuário. Esta lista é usada especificamente pra
 * classificar a origem de cada Ganho, algo que antes só existia como
 * "recorrente" ou "pontual".
 */
export const CATEGORIAS_RECEITA = [
  "Salário",
  "Comissão",
  "Vendas",
  "Freelas",
  "Rendimentos",
  "Reembolsos",
  "Outros",
] as const;

export const ICONE_CATEGORIA_RECEITA: Record<string, string> = {
  Salário: "💼",
  Comissão: "🤝",
  Vendas: "🛒",
  Freelas: "🧑‍💻",
  Rendimentos: "📈",
  Reembolsos: "↩️",
  Outros: "🗂️",
};

export function iconeCategoriaReceita(categoria?: string): string {
  return ICONE_CATEGORIA_RECEITA[categoria ?? "Outros"] ?? "🗂️";
}
