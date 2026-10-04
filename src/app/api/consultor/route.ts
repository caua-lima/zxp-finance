import { NextRequest, NextResponse } from "next/server";
import { verificarChamadorAtivo } from "@/lib/verificarChamador";
import { lerJson, texto } from "@/lib/validacao";
import { consumirCota } from "@/lib/cota";
import { montarContextoSimulacao } from "@/lib/finance/contextoFinanceiro";
import {
  simularNovoCompromisso,
  validarEntradaSimulacao,
  ResultadoSimulacao,
} from "@/lib/finance/simulador";
import { perguntarComFerramenta, FerramentaAnthropic } from "@/lib/anthropicClient";
import { formatarMoeda } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FERRAMENTA_SIMULACAO: FerramentaAnthropic = {
  name: "simularNovoCompromisso",
  description:
    "Simula, com os dados financeiros REAIS do usuário, o efeito de assumir um novo " +
    "compromisso mensal (parcela, financiamento, assinatura nova) durante um número de " +
    "meses. Devolve se é viável e, quando não é, em qual mês o saldo fica negativo ou " +
    "abaixo da reserva de segurança. SEMPRE chame esta ferramenta antes de responder " +
    "qualquer pergunta sobre 'dá pra eu assumir/comprar/financiar isso' — nunca estime " +
    "o resultado de cabeça.",
  input_schema: {
    type: "object",
    properties: {
      valorMensal: {
        type: "number",
        description: "Valor de cada parcela mensal, em reais (ex: 200 para R$ 200,00).",
      },
      meses: {
        type: "integer",
        description: "Por quantos meses esse valor mensal vai se repetir (ex: 12 para 12x).",
      },
    },
    required: ["valorMensal", "meses"],
  },
};

interface EntradaFerramenta {
  valorMensal: number;
  meses: number;
}

function resumoParaOModelo(resultado: ResultadoSimulacao): string {
  if (resultado.viavel) {
    const ultimo = resultado.meses[resultado.meses.length - 1];
    return JSON.stringify({
      viavel: true,
      saldoFinalProjetado: formatarMoeda(ultimo?.saldoFinal ?? 0),
    });
  }
  const mesRuim = resultado.meses[(resultado.primeiroMesRuim ?? 1) - 1];
  return JSON.stringify({
    viavel: false,
    motivo:
      resultado.motivo === "saldo_negativo"
        ? "saldo ficaria negativo"
        : "saldo ficaria abaixo da reserva de segurança",
    numeroDoMes: resultado.primeiroMesRuim,
    saldoNesseMes: formatarMoeda(mesRuim?.saldoFinal ?? 0),
  });
}

const SYSTEM_PROMPT = `Você é o consultor de viabilidade financeira dentro do ZXP Finance,
um app pessoal em português do Brasil. A pessoa que fala com você é o próprio dono das
finanças — trate por "você", direto, sem formalidade excessiva.

Sua ÚNICA função é responder perguntas de viabilidade tipo "dá pra eu assumir uma parcela
de X em Nx pra comprar Y?". Pra isso, SEMPRE chame a ferramenta simularNovoCompromisso com
o valor mensal e o número de meses que a pessoa mencionou, ANTES de responder qualquer
coisa sobre se é viável ou não. Nunca invente ou estime o resultado — o número que importa
vem sempre do resultado real da ferramenta.

Depois de ver o resultado, responda em 2-4 frases, em português, direto ao ponto:
- Se for viável: diga que dá, sem rodeios. Pode mencionar o saldo final projetado.
- Se não for viável: diga claramente que NÃO dá do jeito que foi perguntado, em qual mês
  o problema começa e por quê (saldo negativo ou abaixo da reserva de segurança). Não
  ofereça alternativas elaboradas — só a resposta direta.

Se a pergunta não tiver valor mensal E número de meses claros, peça objetivamente os dois
números que faltam, sem chamar a ferramenta. Se a pergunta não for sobre viabilidade de um
novo compromisso financeiro, diga em uma frase que essa não é sua função aqui.`;

/** Limite de perguntas por dia por usuário — teto de custo na API da Anthropic. */
const PERGUNTAS_POR_DIA = 30;

export async function POST(req: NextRequest) {
  const acesso = await verificarChamadorAtivo(req);
  if (!acesso.ok) return acesso.resposta;
  const uid = acesso.identidade.uid;

  // recurso opcional: sem chave configurada, desligado de forma explícita
  if (!process.env.ANTHROPIC_API_KEY || process.env.CONSULTOR_DESLIGADO === "1") {
    return NextResponse.json(
      { erro: "O Consultor não está disponível neste ambiente." },
      { status: 503 }
    );
  }

  const corpo = await lerJson(req);
  const pergunta = texto(corpo?.pergunta, 3, 500);
  if (!pergunta) {
    return NextResponse.json(
      { erro: "Escreva uma pergunta de até 500 caracteres." },
      { status: 400 }
    );
  }

  try {
    if (!(await consumirCota(uid, "consultor", PERGUNTAS_POR_DIA))) {
      return NextResponse.json(
        { erro: `Você usou as ${PERGUNTAS_POR_DIA} perguntas de hoje. Amanhã libera de novo.` },
        { status: 429 }
      );
    }

    const contexto = await montarContextoSimulacao(uid);
    if (!contexto) {
      // sem saldo informado não dá pra avaliar — responder sem chamar o
      // modelo (não gasta nada e não inventa um saldo zero)
      return NextResponse.json({
        resposta:
          "Não consigo avaliar ainda: falta saber quanto você tem na conta. Informe o saldo na tela de Saldo e pergunte de novo.",
        ferramentaExecutada: false,
        simulacao: null,
        entradaSimulacao: null,
      });
    }

    let simulacao: ResultadoSimulacao | null = null;
    let entradaValida: EntradaFerramenta | null = null;

    const { texto: resposta, ferramentaExecutada } = await perguntarComFerramenta<
      Record<string, unknown>,
      string
    >({
      systemPrompt: SYSTEM_PROMPT,
      pergunta,
      ferramenta: FERRAMENTA_SIMULACAO,
      executarFerramenta: (input) => {
        // a entrada vem do modelo: é dado não confiável, valida antes de usar
        const erro = validarEntradaSimulacao(input?.valorMensal, input?.meses);
        if (erro) return JSON.stringify({ erro });
        entradaValida = { valorMensal: input.valorMensal as number, meses: input.meses as number };
        simulacao = simularNovoCompromisso(contexto, entradaValida.valorMensal, entradaValida.meses);
        return resumoParaOModelo(simulacao);
      },
    });

    return NextResponse.json({
      resposta: resposta || "Não consegui formular uma resposta agora.",
      // conclusão de viabilidade só existe com simulação estruturada; sem
      // ela, a tela mostra só o texto, sem selo de "dá" ou "não dá"
      ferramentaExecutada: ferramentaExecutada && simulacao !== null,
      simulacao,
      entradaSimulacao: entradaValida,
    });
  } catch (e) {
    console.error(JSON.stringify({ evento: "consultor_falhou", erro: String(e) }));
    return NextResponse.json(
      { erro: "Não consegui consultar agora. Tente de novo em instantes." },
      { status: 502 }
    );
  }
}
