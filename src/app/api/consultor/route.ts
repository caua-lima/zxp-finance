import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { verificarChamadorAtivo } from "@/lib/verificarChamador";
import { lerJson, texto } from "@/lib/validacao";
import { consumirCota } from "@/lib/cota";
import {
  FonteDoConsultor,
  ferramentaBuscarGastos,
  ferramentaResumoFinanceiro,
  ferramentaSimularParcela,
} from "@/lib/consultor/ferramentas";
import type { ResultadoSimulacao } from "@/lib/finance/simulador";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODELO = "claude-opus-5-5";
/** Teto de idas e voltas com ferramentas por pergunta. */
const MAX_RODADAS = 6;
/** Limite de perguntas por dia por usuário — teto de custo. */
const PERGUNTAS_POR_DIA = 30;

const FERRAMENTAS: Anthropic.Beta.BetaTool[] = [
  {
    name: "buscar_gastos",
    description:
      "Soma o que a pessoa gastou, filtrando por nome do lugar/pessoa (termo, ex.: 'ifood', 'uber', 'posto') e/ou " +
      "categoria (Alimentação, Transporte, Casa, Saúde, Lazer, Compras, Educação, Beleza, Presentes, Pets, " +
      "Financiamento, 'Pix para pessoas', Outros), nos últimos N meses. Devolve total, média por mês, total de cada " +
      "mês e os maiores lançamentos. Use para qualquer pergunta de 'quanto gastei/estou gastando com X'.",
    input_schema: {
      type: "object",
      properties: {
        termo: { type: "string", description: "Texto a procurar no nome do gasto (sem acento, curto). Ex.: 'ifood'." },
        categoria: { type: "string", description: "Categoria exata, quando a pergunta é por categoria." },
        meses: { type: "integer", description: "Quantos meses olhar (1 a 12). Padrão 3." },
        incluirMesAtual: {
          type: "boolean",
          description: "true (padrão) inclui o mês atual até hoje; false olha só meses completos.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "resumo_financeiro",
    description:
      "Retrato financeiro atual: saldo na conta, caixinhas, contas fixas, assinaturas e parcelas ativas (com quantas " +
      "faltam), e, para cada um dos últimos meses completos, receita, gastos por categoria, dinheiro trazido/enviado " +
      "das outras contas da pessoa e quanto sobrou por mês. Use para perguntas gerais ('como estou?', 'pra onde vai " +
      "meu dinheiro?', 'quais parcelas eu tenho?').",
    input_schema: {
      type: "object",
      properties: { meses: { type: "integer", description: "Quantos meses completos resumir (1 a 12). Padrão 3." } },
      additionalProperties: false,
    },
  },
  {
    name: "simular_parcela",
    description:
      "Simula, com os números reais, assumir um compromisso mensal novo (parcela, financiamento, assinatura): mostra " +
      "se o saldo aguenta mês a mês, quanto sobra por mês antes e depois, e quais parcelas atuais terminam no período. " +
      "Use SEMPRE antes de responder se 'dá pra assumir/comprar/financiar' algo. Se a pessoa não disser em quantas " +
      "vezes, não pergunte: deixe 'meses' vazio (o app considera 12x) e diga que considerou 12x.",
    input_schema: {
      type: "object",
      properties: {
        valorMensal: { type: "number", description: "Valor de cada parcela, em reais (ex.: 600)." },
        meses: { type: "integer", description: "Número de parcelas. Omitir quando a pessoa não disse." },
      },
      required: ["valorMensal"],
      additionalProperties: false,
    },
  },
];

const SYSTEM = `Você é o Consultor do ZXP Finance, um app de finanças pessoais em português do Brasil. Quem fala com você é o dono das finanças: trate por "você", direto e caloroso, sem formalidade.

Responda perguntas sobre o dinheiro da pessoa usando SÓ os números que as ferramentas devolvem. Nunca estime, arredonde de cabeça ou invente um valor; se a ferramenta não trouxer o dado, diga que não tem. Pode chamar mais de uma ferramenta se precisar (por exemplo, resumo_financeiro e depois simular_parcela).

Como responder:
- Comece pela resposta em uma frase (o número ou o "dá / aperta / não dá").
- Depois, 2 a 5 frases ou uma lista curta com o que explica o número: meses, maiores lançamentos, o que pesa.
- Valores sempre em reais no formato R$ 1.234,56. Meses por nome (agosto, setembro).
- Se o mês atual entrou parcial na conta, diga que ele vai até hoje.
- Gasto é dinheiro investido na sua vida: fale de forma neutra e respeitosa, sem culpa e sem sermão. Nada de "limite diário pra gastar".
- Em viabilidade: diga claramente se cabe na sobra de hoje, o que acontece com o saldo, e se alguma parcela atual termina e alivia. Se não couber, diga em qual mês aperta e quanto faltaria por mês; uma sugestão curta é bem-vinda (ex.: menos parcelas, esperar uma parcela terminar).
- A fonte dos dados vem no resultado: se for só o que foi registrado no app, avise em meia frase que pode faltar coisa.
- Se a pergunta não for sobre as finanças da pessoa, diga em uma frase que aqui você só fala do dinheiro dela.`;

interface TrocaAnterior {
  pergunta: string;
  resposta: string;
}

function historicoValido(v: unknown): TrocaAnterior[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(-4)
    .filter((t): t is TrocaAnterior => !!t && typeof t.pergunta === "string" && typeof t.resposta === "string")
    .map((t) => ({ pergunta: t.pergunta.slice(0, 500), resposta: t.resposta.slice(0, 1500) }));
}

export async function POST(req: NextRequest) {
  const acesso = await verificarChamadorAtivo(req);
  if (!acesso.ok) return acesso.resposta;
  const uid = acesso.identidade.uid;

  if (!process.env.ANTHROPIC_API_KEY || process.env.CONSULTOR_DESLIGADO === "1") {
    return NextResponse.json({ erro: "O Consultor não está disponível neste ambiente." }, { status: 503 });
  }

  const corpo = await lerJson(req);
  const pergunta = texto(corpo?.pergunta, 3, 500);
  if (!pergunta) {
    return NextResponse.json({ erro: "Escreva uma pergunta de até 500 caracteres." }, { status: 400 });
  }

  try {
    if (!(await consumirCota(uid, "consultor", PERGUNTAS_POR_DIA))) {
      return NextResponse.json(
        { erro: `Você usou as ${PERGUNTAS_POR_DIA} perguntas de hoje. Amanhã libera de novo.` },
        { status: 429 }
      );
    }

    const client = new Anthropic();
    const fonte = new FonteDoConsultor(uid);
    const messages: Anthropic.Beta.BetaMessageParam[] = [];
    for (const t of historicoValido(corpo?.historico)) {
      messages.push({ role: "user", content: t.pergunta }, { role: "assistant", content: t.resposta });
    }
    messages.push({ role: "user", content: `Hoje é ${fonte.hoje}.\n\n${pergunta}` });

    let simulacao: ResultadoSimulacao | null = null;
    let entradaSimulacao: { valorMensal: number; meses: number } | null = null;
    const usadas: string[] = [];
    let resposta = "";

    for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
      const msg = await client.beta.messages.create({
        model: MODELO,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        // recusa por política: o servidor tenta o modelo de reserva padrão
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM,
        tools: FERRAMENTAS,
        messages,
      });

      if (msg.stop_reason === "refusal") {
        resposta = "Não consigo responder essa pergunta. Tente perguntar de outro jeito sobre os seus gastos ou parcelas.";
        break;
      }
      if (msg.stop_reason !== "tool_use") {
        resposta = msg.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        break;
      }

      messages.push({ role: "assistant", content: msg.content });
      const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const bloco of msg.content) {
        if (bloco.type !== "tool_use") continue;
        // a entrada vem do modelo: dado não confiável — cada ferramenta valida
        const input = (bloco.input ?? {}) as Record<string, unknown>;
        usadas.push(bloco.name);
        try {
          let saida: unknown;
          if (bloco.name === "buscar_gastos") saida = await ferramentaBuscarGastos(fonte, input);
          else if (bloco.name === "resumo_financeiro") saida = await ferramentaResumoFinanceiro(fonte, input);
          else if (bloco.name === "simular_parcela") {
            const r = await ferramentaSimularParcela(fonte, input);
            if (r.simulacao && r.entrada) {
              simulacao = r.simulacao;
              entradaSimulacao = r.entrada;
            }
            saida = r.erro ? { erro: r.erro } : r.resposta;
          } else saida = { erro: "Ferramenta desconhecida." };
          resultados.push({ type: "tool_result", tool_use_id: bloco.id, content: JSON.stringify(saida) });
        } catch (e) {
          console.error(JSON.stringify({ evento: "consultor_ferramenta_falhou", ferramenta: bloco.name, erro: String(e) }));
          resultados.push({
            type: "tool_result",
            tool_use_id: bloco.id,
            content: JSON.stringify({ erro: "Não consegui ler esses dados agora." }),
            is_error: true,
          });
        }
      }
      messages.push({ role: "user", content: resultados });
    }

    return NextResponse.json({
      resposta: resposta || "Não consegui formular uma resposta agora. Tente de novo.",
      ferramentaExecutada: simulacao !== null,
      ferramentas: [...new Set(usadas)],
      simulacao,
      entradaSimulacao,
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ erro: "Muita gente perguntando agora. Tente em um minuto." }, { status: 429 });
    }
    console.error(JSON.stringify({ evento: "consultor_falhou", erro: e instanceof Anthropic.APIError ? `API ${e.status}` : String(e) }));
    return NextResponse.json({ erro: "Não consegui consultar agora. Tente de novo em instantes." }, { status: 502 });
  }
}
