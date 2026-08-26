export const CATEGORIAS_GASTO = [
  "Alimentação",
  "Transporte",
  "Casa",
  "Saúde",
  "Lazer",
  "Compras",
  "Outros",
] as const;

export const ICONE_CATEGORIA_GASTO: Record<string, string> = {
  Alimentação: "🍽️",
  Transporte: "🚗",
  Casa: "🏠",
  Saúde: "🩺",
  Lazer: "🎮",
  Compras: "🛍️",
  Outros: "🗂️",
};

export function iconeCategoriaGasto(categoria: string): string {
  return ICONE_CATEGORIA_GASTO[categoria] ?? "🗂️";
}

// Ordem importa: a primeira regra que bater vence. Termos mais específicos
// vêm antes dos genéricos (ex: "posto de gasolina" antes de "posto").
const REGRAS_CATEGORIA: [RegExp, string][] = [
  [
    /gasolina|etanol|alcool|álcool|combust[ií]vel|posto|uber|\b99\b|indriver|t[aá]xi|taxi|[oô]nibus|onibus|metr[oô]|passagem|bilhete|estacionamento|ped[aá]gio|mec[aâ]nico|oficina|pneu|[oó]leo|lavagem|ipva|licenciamento|multa|revis[aã]o/i,
    "Transporte",
  ],
  [
    /mercado|supermercado|hortifruti|feira|a[cç]ougue|ifood|rappi|restaurante|lanche|lanchonete|rango|marmita|padaria|almo[cç]o|jantar?|caf[eé]|pizza|hamb[uú]rguer|hamburguer|burger|sushi|churrasco|espetinho|pastel|coxinha|salgado|a[cç]a[ií]|sorvete|doce|chocolate|refrigerante|suco|p[aã]o|leite/i,
    "Alimentação",
  ],
  [
    /farm[aá]cia|rem[eé]dio|m[eé]dico|consulta|dentista|exame|vacina|psic[oó]logo|terapia|fisioterapia|[oó]culos|lente|plano de sa[uú]de|academia|suplemento|whey/i,
    "Saúde",
  ],
  [
    /cinema|\bbar\b|boteco|balada|festa|rol[eê]|cerveja|bebida|ingresso|show|viagem|passeio|streaming|netflix|spotify|disney|prime|jogo|game|steam|livro/i,
    "Lazer",
  ],
  [
    /roupa|loja|shopping|t[eê]nis|sapato|presente|shopee|mercado livre|amazon|magalu|aliexpress|perfume|cosm[eé]tico|cabelo|barbeiro|sal[aã]o|manicure/i,
    "Compras",
  ],
  [
    /aluguel|condom[ií]nio|\bluz\b|energia|[aá]gua|agua|internet|wifi|g[aá]s|botij[aã]o|faxina|diarista|material|reforma|m[oó]vel|movel/i,
    "Casa",
  ],
];

export function inferirCategoriaGasto(descricao: string): string {
  for (const [regex, categoria] of REGRAS_CATEGORIA) {
    if (regex.test(descricao)) return categoria;
  }
  return "Outros";
}
