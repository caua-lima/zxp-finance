export const CATEGORIAS_GASTO = [
  "Alimentação",
  "Transporte",
  "Casa",
  "Saúde",
  "Beleza",
  "Lazer",
  "Compras",
  "Educação",
  "Presentes",
  "Pets",
  "Outros",
] as const;

export const ICONE_CATEGORIA_GASTO: Record<string, string> = {
  Alimentação: "🍽️",
  Transporte: "🚗",
  Casa: "🏠",
  Saúde: "🩺",
  Beleza: "💈",
  Lazer: "🎮",
  Compras: "🛍️",
  Educação: "📚",
  Presentes: "🎁",
  Pets: "🐾",
  Outros: "🗂️",
};

export function iconeCategoriaGasto(categoria: string): string {
  return ICONE_CATEGORIA_GASTO[categoria] ?? "🗂️";
}

/** Minúsculo, sem acento, só letras/números e espaço simples. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // apóstrofo some sem virar espaço: "McDonald's" → "mcdonalds"
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Dicionário por categoria, já sem acento. Marcas e lojas que aparecem em
 * extrato e na fala do dia a dia contam tanto quanto a palavra genérica.
 * Plural com "s" casa sozinho.
 */
const DICIONARIO: Record<string, string[]> = {
  Transporte: [
    "gasolina", "etanol", "alcool", "diesel", "combustivel", "posto", "posto de gasolina",
    "shell", "ipiranga", "petrobras", "br mania", "uber", "99", "99pop", "99 pop", "indriver",
    "cabify", "taxi", "onibus", "metro", "trem", "cptm", "brt", "passagem de onibus",
    "bilhete unico", "recarga do bilhete", "estacionamento", "zona azul", "pedagio",
    "sem parar", "conectcar", "veloe", "mecanico", "oficina", "pneu", "oleo", "troca de oleo",
    "lavagem", "lava jato", "lava rapido", "ipva", "licenciamento", "multa", "revisao",
    "seguro do carro", "guincho", "borracharia", "frete", "carreto", "mudanca", "bike", "patinete", "moto", "carro",
    "busao", "gasosa", "corrida", "mototaxi", "van",
  ],
  Alimentação: [
    "mercado", "supermercado", "atacadao", "assai", "carrefour", "pao de acucar",
    "sams club", "hortifruti", "sacolao", "feira", "acougue", "ifood", "rappi",
    "ze delivery", "aiqfome", "restaurante", "lanche", "lanchonete", "rango", "marmita",
    "marmitex", "padaria", "almoco", "janta", "jantar", "cafe", "cafe da manha", "cafeteria",
    "starbucks", "pizza", "pizzaria", "hamburguer", "burger", "burger king", "mcdonalds",
    "mc donalds", "mequi", "bk", "subway", "habibs", "giraffas", "outback", "madero",
    "coco bambu", "sushi", "temaki", "japones", "churrasco", "churrascaria", "espetinho",
    "pastel", "coxinha", "salgado", "salgadinho", "esfiha", "kibe", "akitem", "aki tem",
    "popeyes", "kfc", "bobs", "spoleto", "china in box", "casadinho", "brigadeiro", "acai", "sorvete", "sorveteria", "doce",
    "chocolate", "cacau show", "kopenhagen", "bolo", "refrigerante", "coca", "suco", "agua",
    "agua com gas", "pao", "pao de queijo", "leite", "energetico", "amendoim", "biscoito",
    "bolacha", "fruta", "verdura", "carne", "frango", "ovo", "arroz", "feijao", "comida",
    "delivery", "quentinha", "self service", "buffet", "lanche da tarde", "snack",
    "padoca", "lanchinho", "rangao", "podrao", "dogao", "cachorro quente", "x tudo", "xis",
    "pf", "prato feito",
  ],
  Saúde: [
    "farmacia", "drogaria", "drogasil", "droga raia", "raia", "pague menos", "panvel",
    "drogao", "remedio", "medicamento", "medico", "consulta", "dentista", "exame",
    "laboratorio", "vacina", "psicologo", "psiquiatra", "terapia", "fisioterapia",
    "nutricionista", "oculos", "lente", "lente de contato", "plano de saude", "hospital",
    "pronto socorro", "academia", "smart fit", "smartfit", "bluefit", "crossfit", "pilates",
    "personal", "suplemento", "coqueteleira", "garrafinha", "eno", "dorflex", "whey", "creatina", "vitamina", "growth",
  ],
  Beleza: [
    "cabelo", "corte", "corte de cabelo", "cabeleireiro", "cabeleireira", "barbeiro", "barbearia", "barba", "salao",
    "salao de beleza", "manicure", "pedicure", "unha", "sobrancelha", "depilacao",
    "maquiagem", "skincare", "creme", "hidratante", "protetor solar", "perfume",
    "perfumaria", "boticario", "o boticario", "natura", "avon", "sephora", "cosmetico",
    "shampoo", "condicionador", "desodorante", "estetica", "massagem", "spa",
  ],
  Lazer: [
    "cinema", "cinemark", "ingresso", "show", "teatro", "museu", "bar", "boteco", "balada",
    "festa", "role", "rolezinho", "breja", "gelada", "cerveja", "chopp", "bebida", "drink", "vinho", "whisky", "narguile",
    "tabacaria", "tabaco", "cigarro", "paieiro", "palheiro", "seda", "piteira", "isqueiro",
    "pod", "vape", "essencia", "maconha", "erva", "beck",
    "viagem", "passeio", "hotel", "pousada", "airbnb", "booking", "passagem aerea",
    "streaming", "netflix", "spotify", "disney", "disney plus", "prime video", "hbo", "hbo max",
    "globoplay", "youtube premium", "deezer", "jogo", "game", "games", "steam", "playstation",
    "psn", "xbox", "nintendo", "free fire", "valorant", "roblox", "boliche", "parque",
    "praia", "clube", "futebol", "pelada", "quadra", "kart", "paintball",
  ],
  Compras: [
    "roupa", "camisa", "camiseta", "blusa", "calca", "bermuda", "short", "vestido", "saia",
    "jaqueta", "casaco", "moletom", "bone", "meia", "cueca", "calcinha", "sutia", "pijama",
    "tenis", "sapato", "look", "roupinha", "chinelo", "sandalia", "bota", "bolsa", "mochila", "carteira",
    "relogio", "oculos de sol", "acessorio", "joia", "anel", "colar", "loja", "shopping",
    "shein", "shopee", "mercado livre", "amazon", "magalu", "magazine luiza", "aliexpress",
    "americanas", "casas bahia", "renner", "riachuelo", "c a", "zara", "hering",
    "centauro", "netshoes", "nike", "adidas", "puma", "decathlon", "kabum", "celular",
    "fone", "carregador", "capinha", "notebook", "eletronico",
  ],
  Casa: [
    "aluguel", "condominio", "luz", "energia", "conta de luz", "enel", "cemig", "copel",
    "agua", "conta de agua", "sabesp", "internet", "wifi", "vivo fibra", "claro internet",
    "gas", "botijao", "faxina", "diarista", "material", "material de construcao", "reforma",
    "movel", "moveis", "mesa", "cadeira", "sofa", "armario", "estante", "cama", "frete do movel",
    "colchao", "leroy merlin", "tok stok", "ikea", "utensilio",
    "panela", "limpeza", "produto de limpeza", "detergente", "sabao", "amaciante",
    "papel higienico", "lampada", "ferramenta", "decoracao",
  ],
  Educação: [
    "curso", "faculdade", "mensalidade da faculdade", "escola", "aula", "livro", "livraria",
    "apostila", "udemy", "alura", "hotmart", "kiwify", "mentoria", "treinamento", "ingles",
    "idioma", "material escolar", "caderno", "caneta", "workshop", "palestra", "certificacao",
  ],
  Presentes: [
    "presente", "presentes", "lembrancinha", "aniversario", "doacao", "dizimo", "oferta",
    "vaquinha", "amigo secreto", "flores", "floricultura", "cesta",
  ],
  Pets: [
    "pet", "pet shop", "petshop", "racao", "veterinario", "petz", "cobasi", "banho e tosa",
    "tosa", "areia de gato", "cachorro", "gato", "petisco",
  ],
};

/** Ordem de desempate quando duas categorias pontuam igual. */
const PRIORIDADE = [
  "Transporte", "Saúde", "Beleza", "Educação", "Pets", "Presentes", "Lazer", "Compras",
  "Alimentação", "Casa",
];

const TERMOS: { categoria: string; termo: string; regex: RegExp }[] = Object.entries(
  DICIONARIO
).flatMap(([categoria, termos]) =>
  termos.map((termo) => ({
    categoria,
    termo,
    regex: new RegExp(`(^| )${termo.replace(/ /g, " ")}s?( |$)`),
  }))
);

export interface PalpiteCategoria {
  categoria: string;
  /** Termo que decidiu (pra mostrar "por causa de …" se precisar). */
  motivo: string | null;
  /** 0 a 1 — 0 quando caiu em Outros sem nenhum termo. */
  confianca: number;
}

/** Raiz simples: tira plural e gênero ("psicologas" → "psicolog"). */
export function raiz(palavra: string): string {
  return palavra.replace(/(oes|aes|es|s)$/, "").replace(/[aoe]$/, "");
}

/** Distância de edição (com troca de letras vizinhas), parando cedo acima de `limite`. */
export function distancia(a: string, b: string, limite: number): number {
  if (Math.abs(a.length - b.length) > limite) return limite + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    let menorDaLinha = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
      menorDaLinha = Math.min(menorDaLinha, d[i][j]);
    }
    if (menorDaLinha > limite) return limite + 1;
  }
  return d[a.length][b.length];
}

/** Termos de uma palavra só, com a raiz já calculada — base da busca aproximada. */
const PALAVRAS_DO_DICIONARIO = TERMOS.filter((t) => !t.termo.includes(" ") && t.termo.length >= 4).map(
  (t) => ({ ...t, raiz: raiz(t.termo) })
);

/**
 * Busca aproximada pra palavra que o dicionário exato não pegou: mesma raiz
 * ("psicologa" ~ "psicologo") ou erro de digitação pequeno ("cabelereiro"
 * ~ "cabeleireiro": 1 letra; até 2 em palavra longa). Pesa menos que o
 * exato, então só decide quando nada exato bateu.
 */
function palpiteAproximado(texto: string): { categoria: string; termo: string; peso: number } | null {
  let melhor: { categoria: string; termo: string; peso: number } | null = null;
  for (const palavra of texto.split(" ")) {
    if (palavra.length < 4 || /^\d+$/.test(palavra)) continue;
    const r = raiz(palavra);
    const limite = palavra.length >= 8 ? 2 : palavra.length >= 5 ? 1 : 0;
    for (const t of PALAVRAS_DO_DICIONARIO) {
      const mesmaRaiz = r.length >= 4 && r === t.raiz;
      const perto = !mesmaRaiz && limite > 0 && distancia(palavra, t.termo, limite) <= limite;
      if (!mesmaRaiz && !perto) continue;
      const peso = t.termo.length * (mesmaRaiz ? 0.9 : 0.75);
      if (!melhor || peso > melhor.peso) melhor = { categoria: t.categoria, termo: t.termo, peso };
    }
  }
  return melhor;
}

/**
 * Categoria pelo dicionário. O termo mais específico vence: "mercado
 * livre" (13 letras) ganha de "mercado" (7), "posto de gasolina" ganha de
 * "posto". Empate: ordem de PRIORIDADE. Sem termo exato, tenta a busca
 * aproximada (gênero, plural e erro de digitação).
 */
export function palpitePorDicionario(descricao: string): PalpiteCategoria {
  const texto = normalizarTexto(descricao);
  if (!texto) return { categoria: "Outros", motivo: null, confianca: 0 };
  let melhor: { categoria: string; termo: string; peso: number } | null = null;
  for (const t of TERMOS) {
    if (!t.regex.test(texto)) continue;
    const peso = t.termo.length;
    if (
      !melhor ||
      peso > melhor.peso ||
      (peso === melhor.peso && PRIORIDADE.indexOf(t.categoria) < PRIORIDADE.indexOf(melhor.categoria))
    ) {
      melhor = { categoria: t.categoria, termo: t.termo, peso };
    }
  }
  if (melhor) {
    return {
      categoria: melhor.categoria,
      motivo: melhor.termo,
      confianca: Math.min(0.9, 0.5 + melhor.peso / 30),
    };
  }
  const aproximado = palpiteAproximado(texto);
  if (aproximado) {
    return {
      categoria: aproximado.categoria,
      motivo: aproximado.termo,
      confianca: Math.min(0.75, 0.4 + aproximado.peso / 30),
    };
  }
  return { categoria: "Outros", motivo: null, confianca: 0 };
}

export function inferirCategoriaGasto(descricao: string): string {
  return palpitePorDicionario(descricao).categoria;
}
