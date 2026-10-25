import type { Gasto } from "./types";
import { normalizarTexto, palpitePorDicionario, PalpiteCategoria, raiz } from "./categoriasGasto";

/**
 * Categoria automática "inteligente": primeiro o que VOCÊ já fez, depois o
 * dicionário.
 *
 * 1. Mesma descrição já registrada → a categoria que você mais usou pra
 *    ela (a mais recente desempata). Se você corrigiu "padoca" pra
 *    Alimentação uma vez, da próxima já vem certo.
 * 2. Palavra que você costuma usar sempre na mesma categoria ("lanche do
 *    trampo" → onde foram seus outros "trampo").
 * 3. Dicionário de marcas e termos (categoriasGasto.ts).
 *
 * Nada sai do aparelho: aprende só com os seus próprios registros.
 */

export type OrigemPalpite = "seus registros" | "palavra parecida" | "dicionário" | "nenhuma";

export interface Sugestao extends PalpiteCategoria {
  origem: OrigemPalpite;
}

const PALAVRAS_VAZIAS = new Set([
  "de", "da", "do", "das", "dos", "no", "na", "nos", "nas", "com", "pra", "pro", "para",
  "em", "um", "uma", "o", "a", "os", "as", "e", "meu", "minha", "meus", "minhas", "novo",
  "nova", "hoje", "ontem", "reais", "real", "conta", "compra", "paguei", "gastei",
]);

/** Registros que servem de exemplo: nada de ajuste, estorno ou "não registrado". */
function exemplos(historico: Gasto[]): Gasto[] {
  return historico.filter(
    (g) =>
      !g.ajusteConciliacaoId &&
      !g.estornoDeId &&
      !g.estornado &&
      g.categoria !== "Não lançado" &&
      g.categoria !== "Ajuste" &&
      g.categoria !== "Outros"
  );
}

/** Chave de comparação: "Lanches do McDonald's" e "lanche do mcdonalds" são o mesmo registro. */
function chave(texto: string): string {
  return normalizarTexto(texto).split(" ").map(raiz).join(" ");
}

function palavras(texto: string): string[] {
  return normalizarTexto(texto)
    .split(" ")
    .filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p) && !/^\d+$/.test(p));
}

/** Categoria mais votada; empate fica com a usada mais recentemente. */
function maisVotada(itens: Gasto[]): { categoria: string; votos: number; total: number } | null {
  if (itens.length === 0) return null;
  const votos = new Map<string, { n: number; ultimo: number }>();
  for (const g of itens) {
    const v = votos.get(g.categoria) ?? { n: 0, ultimo: 0 };
    votos.set(g.categoria, { n: v.n + 1, ultimo: Math.max(v.ultimo, g.criadoEm) });
  }
  const [categoria, v] = [...votos.entries()].sort(
    (a, b) => b[1].n - a[1].n || b[1].ultimo - a[1].ultimo
  )[0];
  return { categoria, votos: v.n, total: itens.length };
}

export function sugerirCategoria(descricao: string, historico: Gasto[] = []): Sugestao {
  const alvo = chave(descricao);
  const base = exemplos(historico);

  if (alvo) {
    // 1. a mesma descrição
    const iguais = base.filter((g) => chave(g.descricao) === alvo);
    const exata = maisVotada(iguais);
    if (exata) {
      return {
        categoria: exata.categoria,
        motivo: descricao.trim(),
        confianca: Math.min(0.98, 0.8 + exata.votos * 0.05),
        origem: "seus registros",
      };
    }

    // 2. palavra que você sempre usa na mesma categoria
    let melhor: { categoria: string; palavra: string; votos: number } | null = null;
    for (const p of palavras(descricao)) {
      const comPalavra = base.filter((g) => ` ${normalizarTexto(g.descricao)} `.includes(` ${p} `));
      const voto = maisVotada(comPalavra);
      // precisa de padrão: 2+ registros e maioria clara (70%)
      if (voto && voto.votos >= 2 && voto.votos / voto.total >= 0.7) {
        if (!melhor || voto.votos > melhor.votos) {
          melhor = { categoria: voto.categoria, palavra: p, votos: voto.votos };
        }
      }
    }
    const dicionario = palpitePorDicionario(descricao);
    // termo do dicionário mais específico que a palavra aprendida ganha
    if (melhor && !(dicionario.motivo && dicionario.motivo.length > melhor.palavra.length + 3)) {
      return {
        categoria: melhor.categoria,
        motivo: melhor.palavra,
        confianca: Math.min(0.9, 0.6 + melhor.votos * 0.05),
        origem: "palavra parecida",
      };
    }
    if (dicionario.motivo) return { ...dicionario, origem: "dicionário" };
  }

  return { categoria: "Outros", motivo: null, confianca: 0, origem: "nenhuma" };
}

/**
 * Como você costuma pagar esse registro: a forma da última vez que lançou a
 * mesma coisa ("perfume" foi no crédito do Inter → vem crédito, Inter).
 * `null` quando nunca lançou.
 */
export function sugerirPagamento(
  descricao: string,
  historico: Gasto[] = []
): { pagoCom: "conta" | "credito"; cartao: string } | null {
  const alvo = chave(descricao);
  if (!alvo) return null;
  const ultimo = historico
    .filter((g) => !g.estornoDeId && !g.ajusteConciliacaoId && chave(g.descricao) === alvo)
    .sort((a, b) => b.criadoEm - a.criadoEm)[0];
  if (!ultimo) return null;
  return ultimo.pagoCom === "credito"
    ? { pagoCom: "credito", cartao: ultimo.cartao ?? "" }
    : { pagoCom: "conta", cartao: "" };
}

// ---------------------------------------------------------------------------
// Os outros cadastros também se categorizam sozinhos pelo nome.
// ---------------------------------------------------------------------------

const TERMOS_CONTAS: Record<string, string[]> = {
  Moradia: ["aluguel", "condominio", "iptu", "luz", "energia", "enel", "cemig", "copel", "agua", "sabesp", "gas", "comgas", "financiamento da casa"],
  Internet: ["internet", "wifi", "fibra", "vivo fibra", "claro internet", "net", "oi fibra"],
  Telefone: ["celular", "plano de celular", "telefone", "tim", "vivo", "claro", "oi", "chip"],
  Streaming: ["netflix", "spotify", "disney", "prime", "hbo", "max", "globoplay", "youtube", "deezer", "apple tv", "paramount"],
  "Cartão de crédito": ["cartao", "fatura", "anuidade"],
  Transporte: ["carro", "ipva", "seguro do carro", "estacionamento", "bilhete", "combustivel", "moto"],
  Educação: ["faculdade", "curso", "escola", "mensalidade", "ingles", "alura", "udemy"],
  Saúde: ["plano de saude", "unimed", "amil", "bradesco saude", "sulamerica", "psicologo", "psicologa", "terapia", "dentista", "remedio"],
  Academia: ["academia", "smart fit", "smartfit", "bluefit", "crossfit", "pilates"],
  Seguro: ["seguro", "seguro de vida", "seguro residencial"],
  Lazer: ["clube", "jogo", "game pass", "playstation plus", "psn"],
};

const TERMOS_RECEITA: Record<string, string[]> = {
  Salário: ["salario", "salario fixo", "pro labore", "prolabore", "holerite", "fixo", "adiantamento"],
  Comissão: ["comissao", "comissoes", "bonus", "premio", "premiacao", "plr", "meta batida"],
  Vendas: ["venda", "vendi", "vendas", "mercado livre", "olx", "enjoei"],
  Freelas: ["freela", "freelance", "bico", "job", "projeto", "servico", "trampo extra"],
  Rendimentos: ["rendimento", "rendimentos", "juros", "dividendo", "dividendos", "cdi", "cdb", "tesouro"],
  Reembolsos: ["reembolso", "estorno", "devolucao", "me pagou", "pagou de volta", "pix de volta"],
};

function porTermos(texto: string, termos: Record<string, string[]>, padrao: string): string {
  const alvo = ` ${normalizarTexto(texto)} `;
  let melhor: { categoria: string; peso: number } | null = null;
  for (const [categoria, lista] of Object.entries(termos)) {
    for (const t of lista) {
      if (alvo.includes(` ${t} `) && (!melhor || t.length > melhor.peso)) {
        melhor = { categoria, peso: t.length };
      }
    }
  }
  return melhor?.categoria ?? padrao;
}

/** Categoria de conta fixa pelo nome ("Plano de Celular" → Telefone). */
export function sugerirCategoriaConta(nome: string): string {
  return porTermos(nome, TERMOS_CONTAS, "Outros");
}

/** Categoria de ganho pela descrição ("Salário Fixo" → Salário). */
export function sugerirCategoriaReceita(descricao: string): string {
  return porTermos(descricao, TERMOS_RECEITA, "");
}
