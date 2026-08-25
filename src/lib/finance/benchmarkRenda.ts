import { NivelEscolaridade, arredondarCentavos } from "@/lib/types";

/**
 * Comparação da sua renda com a média nacional publicada pelo IBGE.
 *
 * IMPORTANTE — o que o IBGE publica e o que NÃO publica:
 * a PNAD Contínua publica rendimento médio por NÍVEL DE INSTRUÇÃO, pra
 * todo o país e todas as idades juntas. Ela NÃO publica um corte por
 * "escola pública vs particular", nem por ano de idade isolado (19, 20...).
 * Então a comparação daqui é sempre "você vs. média nacional de quem tem
 * a mesma escolaridade" — não "vs. jovens de 19 anos de escola pública",
 * que é um número que simplesmente não existe publicado. A tela deixa isso
 * explícito em vez de fingir uma precisão que o dado não tem.
 */

export const FONTE_RENDA = {
  nome: "IBGE, PNAD Contínua 2025 — rendimento médio mensal por nível de instrução",
  url: "https://agenciadenoticias.ibge.gov.br/agencia-noticias/2012-agencia-de-noticias/noticias/46579-rendimento-medio-da-populacao-brasileira-atinge-r-3-367-em-2025",
};

/** Média nacional de todas as fontes, todas as idades e escolaridades (PNAD Contínua 2025). */
export const MEDIA_NACIONAL = 3367;

/**
 * Rendimento médio mensal por nível de instrução CONCLUÍDO (PNAD Contínua
 * 2025). Só existem os níveis concluídos — quem está cursando algo é
 * comparado com o último nível que de fato concluiu (ver nivelDeReferencia).
 */
const MEDIA_POR_NIVEL_CONCLUIDO = {
  sem_instrucao: 1824,
  fundamental: 2535,
  medio: 2905,
  superior: 6632,
} as const;

type NivelConcluido = keyof typeof MEDIA_POR_NIVEL_CONCLUIDO;

const ROTULO_NIVEL: Record<NivelConcluido, string> = {
  sem_instrucao: "sem instrução formal",
  fundamental: "com ensino fundamental completo",
  medio: "com ensino médio completo",
  superior: "com ensino superior completo",
};

/**
 * Quem está cursando um nível é comparado com o último que concluiu — é a
 * leitura correta do dado: alguém com "superior incompleto" concluiu o
 * médio, então a média de referência dele é a de médio completo.
 */
function nivelDeReferencia(escolaridade: NivelEscolaridade): NivelConcluido {
  switch (escolaridade) {
    case "sem_instrucao":
      return "sem_instrucao";
    case "fundamental":
      return "fundamental";
    case "medio_incompleto":
      return "fundamental";
    case "medio":
      return "medio";
    case "superior_incompleto":
      return "medio";
    case "superior":
      return "superior";
  }
}

export interface ComparacaoRenda {
  rendaMensal: number;
  /** Média do nível de instrução concluído — a referência principal. */
  mediaDoNivel: number;
  rotuloNivel: string;
  /** Quanto acima (positivo) ou abaixo (negativo) da média do nível, em R$. */
  diferenca: number;
  /** Mesma diferença em %, relativa à média do nível. */
  percentual: number;
  acimaDaMedia: boolean;
  /** Quantas vezes a média do nível — 1 = exatamente na média, 2 = o dobro. */
  vezesAMedia: number;
  /** Contexto secundário: média nacional geral, todas as escolaridades. */
  mediaNacional: number;
  percentualVsNacional: number;
}

/**
 * Compara uma renda mensal com a média do nível de instrução informado.
 * Devolve null pra renda zero/negativa — não existe comparação útil aí, e
 * dividir por zero geraria Infinity na tela.
 */
export function compararRenda(
  rendaMensal: number,
  escolaridade: NivelEscolaridade
): ComparacaoRenda | null {
  if (rendaMensal <= 0) return null;

  const nivel = nivelDeReferencia(escolaridade);
  const mediaDoNivel = MEDIA_POR_NIVEL_CONCLUIDO[nivel];
  const diferenca = arredondarCentavos(rendaMensal - mediaDoNivel);

  return {
    rendaMensal,
    mediaDoNivel,
    rotuloNivel: ROTULO_NIVEL[nivel],
    diferenca,
    percentual: arredondarCentavos((diferenca / mediaDoNivel) * 100),
    acimaDaMedia: diferenca >= 0,
    vezesAMedia: arredondarCentavos(rendaMensal / mediaDoNivel),
    mediaNacional: MEDIA_NACIONAL,
    percentualVsNacional: arredondarCentavos(
      ((rendaMensal - MEDIA_NACIONAL) / MEDIA_NACIONAL) * 100
    ),
  };
}
