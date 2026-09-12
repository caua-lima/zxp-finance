import { NextRequest, NextResponse } from "next/server";
import { verificarChamador } from "@/lib/verificarChamador";
import { montarContextoSimulacao } from "@/lib/finance/contextoFinanceiro";
import { simularNovoCompromisso, ResultadoSimulacao } from "@/lib/finance/simulador";
import { perguntarComFerramenta, FerramentaAnthropic } from "@/lib/anthropicClient";
import { formatarMoeda } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mensagemDeErro(e: unknown, padrao: string): string {
  if (e instanceof Error) return e.message;
  return padrao;
}

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

export async function POST(req: NextRequest) {
  try {
    const chamador = await verificarChamador(req);
    if (!chamador) {
      return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
    }

    const { pergunta } = await req.json();
    if (!pergunta || typeof pergunta !== "string" || !pergunta.trim()) {
      return NextResponse.json({ erro: "Pergunta vazia." }, { status: 400 });
    }

    const contexto = await montarContextoSimulacao(chamador.uid);

    let simulacao: ResultadoSimulacao | null = null;

    const { texto, ferramentaExecutada, entradaFerramenta } = await perguntarComFerramenta<
      EntradaFerramenta,
      string
    >({
      systemPrompt: SYSTEM_PROMPT,
      pergunta: pergunta.trim(),
      ferramenta: FERRAMENTA_SIMULACAO,
      executarFerramenta: (input) => {
        simulacao = simularNovoCompromisso(contexto, input.valorMensal, input.meses);
        return resumoParaOModelo(simulacao);
      },
    });

    return NextResponse.json({
      resposta: texto || "Não consegui formular uma resposta agora.",
      ferramentaExecutada,
      simulacao,
      entradaSimulacao: entradaFerramenta as EntradaFerramenta | null,
    });
  } catch (e) {
    return NextResponse.json(
      { erro: mensagemDeErro(e, "Erro ao consultar viabilidade.") },
      { status: 500 }
    );
  }
}
