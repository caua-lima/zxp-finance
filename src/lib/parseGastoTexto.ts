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
  "hoje", "agora", "ontem", "cedo", "mais",
  // conectores e artigos
  "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas", "num",
  "numa", "com", "pra", "para", "por", "o", "a", "os", "as", "um", "uma",
  "uns", "umas", "meu", "minha", "reais", "real", "conto", "contos",
  "pila", "paus", "mango", "mangos", "r$",
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

function paraNumero(bruto: string): number {
  // "1.500,50" -> 1500.50 · "15,50" -> 15.50 · "15.50" -> 15.50
  const limpo = bruto.replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  return parseFloat(limpo);
}

export interface GastoTextoInterpretado {
  valor: number | null;
  descricao: string;
}

const NUMERO = /\d+(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:\.\d{1,2})?/;

export function parseGastoTexto(textoOriginal: string): GastoTextoInterpretado {
  const texto = textoOriginal.trim();
  if (!texto) return { valor: null, descricao: "" };

  let valor: number | null = null;
  let resto = texto;

  // 1. valor com marcador explícito — "R$ 30", "30 reais", "50 conto".
  //    Tem prioridade sobre número solto: em "2 pizzas de 30 reais" o preço
  //    é o que está marcado, não a quantidade.
  const comMarcador =
    texto.match(new RegExp(`r\\$\\s*(${NUMERO.source})`, "i")) ??
    texto.match(
      new RegExp(`(${NUMERO.source})\\s*(?:reais?|contos?|pila|paus|mangos?)\\b`, "i")
    );

  if (comMarcador) {
    valor = paraNumero(comMarcador[1]);
    resto = texto.replace(comMarcador[0], " ");
  } else {
    // 2. sem marcador: pega o ÚLTIMO número da frase — em "almoço 42" e em
    //    "2 pizzas de 30" o preço é sempre o que vem por último.
    const todos = [...texto.matchAll(new RegExp(NUMERO.source, "g"))];
    const ultimo = todos[todos.length - 1];
    if (ultimo) {
      valor = paraNumero(ultimo[0]);
      resto =
        texto.slice(0, ultimo.index) + " " + texto.slice(ultimo.index + ultimo[0].length);
    }
  }

  let tokens = resto.split(/\s+/).filter(Boolean);

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
  return { valor, descricao };
}
