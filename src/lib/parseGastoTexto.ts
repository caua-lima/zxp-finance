/**
 * Interpreta uma frase solta ("acabei de gastar 3 reais em paieiro") e tira
 * dela o valor e a descrição do gasto. Serve tanto pro que é digitado quanto
 * pro que vem do reconhecimento de voz do navegador.
 *
 * É tudo regra fixa, sem IA e sem chamada paga: funciona offline, responde
 * na hora e não custa nada por lançamento.
 */

/** Palavras que só enfeitam a frase e nunca fazem parte da descrição. */
const RUIDO = new Set([
  // verbos e formas de dizer que gastou
  "acabei", "acabo", "acabamos", "gastei", "gastar", "gasto", "gastos",
  "paguei", "pagar", "pago", "comprei", "comprar", "compra", "torrei",
  "torrar", "custou", "custa", "saiu", "foi", "deu", "peguei", "mandei",
  "botei", "coloquei",
  // tempo
  "hoje", "agora", "ontem", "anteontem", "cedo", "mais",
  // conectores e artigos
  "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas", "num",
  "numa", "com", "pra", "para", "por", "o", "a", "os", "as", "um", "uma",
  "uns", "umas", "meu", "minha", "reais", "real", "conto", "contos",
  "pila", "paus", "mango", "mangos", "r$",
  // como a voz às vezes escreve "reais"
  "reias", "reals", "reas", "rs",
  // "e" sobra na frente quando o valor veio por extenso ("trinta E cinco
  // reais no ifood"): os números saem e o conector fica órfão no começo.
  "e",
]);

/** Conectores que não podem sobrar nas pontas da descrição. */
const CONECTORES_BORDA = new Set([
  "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas", "num",
  "numa", "com", "pra", "para", "por", "o", "a", "os", "as", "e",
]);

const UNIDADES: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16,
  dezessete: 17, dezoito: 18, dezenove: 19,
};
const DEZENAS: Record<string, number> = {
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60,
  setenta: 70, oitenta: 80, noventa: 90,
};
const CENTENAS: Record<string, number> = {
  cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400,
  quinhentos: 500, seiscentos: 600, setecentos: 700, oitocentos: 800,
  novecentos: 900,
};

function semAcento(txt: string): string {
  return txt.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * Número por extenso ("trinta e cinco", "cento e vinte"). O reconhecimento
 * de voz normalmente já devolve dígito, mas nem sempre — e sem isso a frase
 * inteira seria descartada por "não entendi o valor".
 */
function numeroPorExtenso(tokens: string[]): number | null {
  let total = 0;
  let encontrou = false;
  for (const bruto of tokens) {
    const t = semAcento(bruto);
    if (t === "e") continue;
    if (t === "mil") {
      total = (total || 1) * 1000;
      encontrou = true;
      continue;
    }
    const valor = CENTENAS[t] ?? DEZENAS[t] ?? UNIDADES[t];
    if (valor === undefined) {
      if (encontrou) break;
      continue;
    }
    total += valor;
    encontrou = true;
  }
  return encontrou ? total : null;
}

/**
 * Converte o número achado na frase, com as regras do jeito brasileiro:
 * vírgula é decimal ("15,50"), ponto seguido de 3 dígitos é milhar
 * ("1.500", "1.500,50"). Ponto seguido de 1–2 dígitos sem vírgula é
 * decimal ("15.50") — é assim que o teclado do celular e a voz escrevem.
 */
function paraNumero(bruto: string): number {
  if (bruto.includes(",")) return parseFloat(bruto.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(?:\.\d{3})+$/.test(bruto)) return parseFloat(bruto.replace(/\./g, ""));
  return parseFloat(bruto);
}

export interface GastoTextoInterpretado {
  valor: number | null;
  descricao: string;
  /** "credito" quando a frase diz cartão/crédito; "conta" quando diz Pix/débito; null = não disse. */
  pagoCom: "conta" | "credito" | null;
  /** Banco/cartão citado ("nubank cnpj"), pra casar com os seus cartões. */
  cartaoDito: string | null;
  /** 0 = hoje, 1 = ontem, 2 = anteontem. A data dita na frase não é descartada. */
  diasAtras: number;
}

// Ordem importa: milhar com ponto, decimal com vírgula, decimal com ponto
// e só então inteiro. A versão antiga casava "15" antes de ".50" e lia
// "café 15.50" como R$ 50 (auditoria F06).
const NUMERO =
  /\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?(?!\d)|\d+,\d{1,2}(?!\d)|\d+\.\d{1,2}(?!\d)|\d+/;

const BANCOS =
  "nubank|nu|inter|santander|mercado pago|mp|c6|itau|bradesco|caixa|bb|banco do brasil|picpay|neon|next|will|xp|btg|pan|original|sicredi|sicoob";

/**
 * Forma de pagamento dita na frase. "no cartão", "no crédito", "no nubank",
 * "cartão do inter cnpj" → crédito (com o banco, se disse). "no pix",
 * "no débito", "em dinheiro" → conta. O trecho sai da descrição.
 */
function formaDePagamento(texto: string): {
  pagoCom: "conta" | "credito" | null;
  cartaoDito: string | null;
  resto: string;
} {
  const credito = new RegExp(
    `\\b(?:n[oa]s?\\s+|pel[oa]\\s+|com\\s+o\\s+)?(?:(?:cart[aã]o|cr[eé]dito)(?:\\s+de\\s+cr[eé]dito)?(?:\\s+(?:d[oa]\\s+)?(${BANCOS})(?:\\s+(cnpj|cpf|pj|pf))?)?|(${BANCOS})(?:\\s+(cnpj|cpf|pj|pf))?\\s+cr[eé]dito)\\b`,
    "i"
  );
  const c = texto.match(credito);
  if (c) {
    const banco = c[1] ?? c[3];
    const tipo = c[2] ?? c[4];
    return {
      pagoCom: "credito",
      cartaoDito: banco ? `${banco}${tipo ? " " + tipo : ""}`.toLowerCase() : null,
      resto: texto.replace(c[0], " "),
    };
  }
  // "no nubank" sozinho: o Nubank é cartão pra quase todo mundo, mas também
  // conta — sem "crédito" ou "cartão" na frase, fica sem decidir
  const conta = texto.match(/\b(?:n[oa]\s+|em\s+|via\s+|pelo\s+)?(?:pix|d[eé]bito|dinheiro|esp[eé]cie)\b/i);
  if (conta) return { pagoCom: "conta", cartaoDito: null, resto: texto.replace(conta[0], " ") };
  return { pagoCom: null, cartaoDito: null, resto: texto };
}

const LETRA = /[a-zà-ÿ]/i;

function coladoEmLetra(texto: string, inicio: number, tamanho: number): boolean {
  return LETRA.test(texto[inicio - 1] ?? "") || LETRA.test(texto[inicio + tamanho] ?? "");
}

/** Tem um valor em dígitos "de verdade" (não colado em palavra)? */
function temValorEmDigito(texto: string): boolean {
  return [...texto.matchAll(new RegExp(NUMERO.source, "g"))].some(
    (m) => !coladoEmLetra(texto, m.index ?? 0, m[0].length)
  );
}

function diasAtrasDaFrase(texto: string): number {
  const t = semAcento(texto);
  if (/\banteontem\b/.test(t)) return 2;
  if (/\bontem\b/.test(t)) return 1;
  return 0;
}

export function parseGastoTexto(textoOriginal: string): GastoTextoInterpretado {
  const forma = formaDePagamento(textoOriginal.trim());
  const texto = forma.resto.replace(/\s+/g, " ").trim();
  if (!texto) return { valor: null, descricao: "", diasAtras: 0, pagoCom: forma.pagoCom, cartaoDito: forma.cartaoDito };
  const diasAtras = diasAtrasDaFrase(texto);

  let valor: number | null = null;
  let resto = texto;

  // 1. valor com marcador explícito — "R$ 30", "30 reais", "50 conto".
  //    Tem prioridade sobre número solto: em "2 pizzas de 30 reais" o preço
  //    é o que está marcado, não a quantidade.
  const comMarcador =
    texto.match(new RegExp(`r\\$\\s*(${NUMERO.source})`, "i")) ??
    texto.match(
      new RegExp(`(${NUMERO.source})\\s*(?:reais?|reias|contos?|pila|paus|mangos?)\\b`, "i")
    );

  if (comMarcador) {
    valor = paraNumero(comMarcador[1]);
    resto = texto.replace(comMarcador[0], " ");
  } else {
    // 2. sem marcador: pega o ÚLTIMO número da frase — em "almoço 42" e em
    //    "2 pizzas de 30" o preço é sempre o que vem por último.
    //    Número colado em letra é parte de um nome ("99pop", "galaxy s23",
    //    "e2e"), não preço — antes "12,34 loja s23" virava R$ 23.
    const todos = [...texto.matchAll(new RegExp(NUMERO.source, "g"))].filter(
      (m) => !coladoEmLetra(texto, m.index ?? 0, m[0].length)
    );
    const ultimo = todos[todos.length - 1];
    if (ultimo) {
      valor = paraNumero(ultimo[0]);
      resto =
        texto.slice(0, ultimo.index) + " " + texto.slice(ultimo.index + ultimo[0].length);
    }
  }

  let tokens = resto
    .split(/\s+/)
    // número que sobrou e não é o valor ("3,00", "33." de lista) não é descrição;
    // quantidade inteira ("2 pizzas") continua
    .filter((t) => !/^\d+[.,]\d*$/.test(t) && !/^\d+[.)]$/.test(t))
    // pontuação solta ("e," "-") sai
    .map((t) => t.replace(/^[,;:\-]+|[,;:]+$/g, ""))
    .filter(Boolean);

  // 3. sem dígito nenhum, tenta número por extenso
  if (valor === null) {
    const porExtenso = numeroPorExtenso(tokens);
    if (porExtenso !== null) {
      valor = porExtenso;
      const usados = new Set([
        ...Object.keys(UNIDADES), ...Object.keys(DEZENAS),
        ...Object.keys(CENTENAS), "mil",
      ]);
      tokens = tokens.filter((t) => !usados.has(semAcento(t)));
    }
  }

  // 4. tira o ruído da frente ("acabei de gastar em ...") até chegar no que
  //    interessa, e limpa conector solto nas duas pontas
  while (tokens.length && RUIDO.has(semAcento(tokens[0]).replace(/[.,!?]/g, ""))) {
    tokens.shift();
  }
  while (
    tokens.length &&
    CONECTORES_BORDA.has(semAcento(tokens[tokens.length - 1]).replace(/[.,!?]/g, ""))
  ) {
    tokens.pop();
  }

  const descricao = tokens.join(" ").replace(/[.,!?]+$/, "").trim();
  return { valor, descricao, diasAtras, pagoCom: forma.pagoCom, cartaoDito: forma.cartaoDito };
}

/**
 * Separa uma frase com vários registros: "3 de paieiro e 22,89 de lanche"
 * → ["3 de paieiro", "22,89 de lanche"]. Quebra em linha, ";", ",", " e " e
 * " + ", mas só onde os DOIS lados têm valor em dígito — "lanche, batata e
 * refri 30" continua um registro só, e valor por extenso ("trinta e cinco")
 * nunca é quebrado.
 */
export function separarRegistros(texto: string): string[] {
  const temDigito = temValorEmDigito;
  const saida: string[] = [];
  for (const linha of texto.split(/\n|;/)) {
    const pedacos = linha
      .split(/\s*,\s+|\s+e\s+|\s+\+\s+/i)
      .map((p) => p.trim())
      .filter(Boolean);
    const grupos: string[][] = [];
    let atual: string[] = [];
    for (const p of pedacos) {
      if (atual.length && atual.some(temDigito) && temDigito(p)) {
        grupos.push(atual);
        atual = [p];
      } else {
        atual.push(p);
      }
    }
    if (atual.length) grupos.push(atual);
    // um registro só: devolve a linha como foi escrita (vírgula continua vírgula)
    if (grupos.length === 1) saida.push(linha.trim());
    else saida.push(...grupos.map((g) => g.join(" e ")));
  }
  const limpos = saida.filter(Boolean);
  return limpos.length ? limpos : [texto];
}

/**
 * Casa o banco dito ("nubank cnpj", "inter") com um dos seus cartões
 * ("Nubank CNPJ", "Inter"). Sem CPF/CNPJ dito e dois cartões do mesmo banco,
 * fica com o primeiro.
 */
export function casarCartao(dito: string | null, cartoes: string[]): string | null {
  if (!dito) return null;
  const norm = (t: string) =>
    t.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\bpj\b/, "cnpj").replace(/\bpf\b/, "cpf");
  const apelidos: Record<string, string> = { nu: "nubank", mp: "mercado pago", bb: "banco do brasil" };
  const partes = norm(dito).split(" ");
  partes[0] = apelidos[partes[0]] ?? partes[0];
  const alvo = partes.join(" ");
  return (
    cartoes.find((c) => norm(c) === alvo) ??
    cartoes.find((c) => norm(c).startsWith(partes[0]) && (!partes[1] || norm(c).includes(partes[1]))) ??
    cartoes.find((c) => norm(c).startsWith(partes[0])) ??
    null
  );
}
