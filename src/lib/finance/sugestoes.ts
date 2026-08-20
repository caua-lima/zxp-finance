import { GrupoPorCategoria } from "./entries";

/**
 * Sugestões que comparam categorias entre si — mês contra mês, e contra
 * uma referência externa (IBGE) — em vez de só olhar regra fixa sobre o
 * próprio histórico do usuário (isso já existe em alerts.ts). Tudo aqui é
 * cálculo puro, alimentado pela mesma quebra por categoria que a DRE já
 * carrega — não abre nenhuma assinatura de Firestore nova.
 */

export interface CategoriaEmCrescimento {
  categoryId: string;
  atual: number;
  anterior: number;
  deltaAbsoluto: number;
  deltaPercentual: number;
}

const LIMIAR_ABSOLUTO = 50; // ignora crescimento pequeno em R$, mesmo que percentualmente grande
const LIMIAR_PERCENTUAL = 20; // ignora ruído mês a mês abaixo disso

/**
 * Categorias de despesa que cresceram de forma relevante em relação ao mês
 * anterior — os dois limiares juntos evitam alertar sobre uma categoria que
 * foi de R$10 pra R$18 (80% de crescimento, mas irrelevante em dinheiro).
 */
export function sugerirCrescimentoCategorias(
  atual: GrupoPorCategoria[],
  anterior: GrupoPorCategoria[],
  maximo = 3
): CategoriaEmCrescimento[] {
  const anteriorPorCategoria = new Map(anterior.map((g) => [g.categoryId, g.total]));

  const crescimentos: CategoriaEmCrescimento[] = atual
    .map((g) => {
      const valorAnterior = anteriorPorCategoria.get(g.categoryId) ?? 0;
      const deltaAbsoluto = g.total - valorAnterior;
      const deltaPercentual =
        valorAnterior > 0 ? (deltaAbsoluto / valorAnterior) * 100 : deltaAbsoluto > 0 ? Infinity : 0;
      return { categoryId: g.categoryId, atual: g.total, anterior: valorAnterior, deltaAbsoluto, deltaPercentual };
    })
    .filter((c) => c.deltaAbsoluto >= LIMIAR_ABSOLUTO && c.deltaPercentual >= LIMIAR_PERCENTUAL)
    .sort((a, b) => b.deltaAbsoluto - a.deltaAbsoluto);

  return crescimentos.slice(0, maximo);
}

/**
 * Médias per capita mensais, Brasil, POF 2017-2018 (a mais recente
 * publicada) — fonte: IBGE, "Despesas médias mensais familiares, por tipos
 * de despesa" (agenciadenoticias.ibge.gov.br, release POF 2017-2018).
 * São só 3 categorias porque são as únicas que mapeiam de forma direta
 * pras categorias que o app já usa — o IBGE não separa "iFood" de
 * "alimentação fora do domicílio" em geral, então a comparação é sempre
 * no nível da categoria ampla, nunca por app/serviço específico.
 */
export const BENCHMARK_IBGE_POF = {
  fonte: "IBGE, Pesquisa de Orçamentos Familiares (POF) 2017-2018 — última edição publicada",
  url: "https://agenciadenoticias.ibge.gov.br/agencia-sala-de-imprensa/2013-agencia-de-noticias/releases/25598-pof-2017-2018-familias-com-ate-r-1-9-mil-destinam-61-2-de-seus-gastos-a-alimentacao-e-habitacao",
  categorias: {
    Habitação: 466,
    Transporte: 234,
    Alimentação: 194.5,
  } as Record<string, number>,
};

// categoryId usado no app -> bucket do IBGE. Fora daqui não tem
// comparação, porque a POF não separa essas categorias no nível
// nacional (streaming, seguro, academia etc. entram em "outras
// despesas", que não é uma categoria com peso próprio publicado).
const MAPA_CATEGORIA_IBGE: Record<string, keyof typeof BENCHMARK_IBGE_POF.categorias> = {
  Moradia: "Habitação",
  Internet: "Habitação",
  Telefone: "Habitação",
  Casa: "Habitação",
  Transporte: "Transporte",
  Alimentação: "Alimentação",
};

export interface ComparacaoBenchmark {
  categoria: string;
  gastoUsuario: number;
  benchmark: number;
  diferenca: number; // positivo = gastando acima da média
}

/**
 * Compara o gasto do usuário nas 3 categorias mapeáveis contra a média
 * nacional per capita × pessoas na casa (1, se o perfil não informar).
 * Isso é sempre uma média nacional agregada — nunca segmentada por idade,
 * cidade ou renda, porque a POF não publica corte fino o bastante pra
 * isso sem virar estimativa inventada.
 */
export function compararComBenchmarkIBGE(
  despesasPorCategoria: GrupoPorCategoria[],
  pessoasNaCasa?: number
): ComparacaoBenchmark[] {
  const multiplicador = pessoasNaCasa && pessoasNaCasa > 0 ? pessoasNaCasa : 1;

  const gastoPorBucket = new Map<string, number>();
  for (const g of despesasPorCategoria) {
    const bucket = MAPA_CATEGORIA_IBGE[g.categoryId];
    if (!bucket) continue;
    gastoPorBucket.set(bucket, (gastoPorBucket.get(bucket) ?? 0) + g.total);
  }

  return Object.entries(BENCHMARK_IBGE_POF.categorias).map(([categoria, perCapita]) => {
    const benchmark = perCapita * multiplicador;
    const gastoUsuario = gastoPorBucket.get(categoria) ?? 0;
    return { categoria, gastoUsuario, benchmark, diferenca: gastoUsuario - benchmark };
  });
}
