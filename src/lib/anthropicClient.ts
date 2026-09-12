/**
 * Cliente mínimo da Messages API da Anthropic, feito à mão com `fetch` —
 * mesmo padrão de googleAuth.ts/firestoreRest.ts: nada de SDK nova só pra
 * uma chamada pontual. Usado só pelo consultor de viabilidade
 * (src/app/api/consultor/route.ts), com Haiku 4.5 e UMA ferramenta real.
 *
 * O modelo nunca decide o número — ele só pode responder depois de chamar
 * a ferramenta, que roda a simulação de verdade (ver simulador.ts) e
 * devolve o resultado real pro modelo só traduzir pra português.
 */

const URL_MENSAGENS = "https://api.anthropic.com/v1/messages";
const MODELO_HAIKU = "claude-haiku-4-5-20251001";
const VERSAO_API = "2023-06-01";

export interface FerramentaAnthropic {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface BlocoConteudo {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface RespostaAnthropic {
  content: BlocoConteudo[];
  stop_reason: string;
}

async function chamarMensagens(
  chave: string,
  corpo: Record<string, unknown>
): Promise<RespostaAnthropic> {
  const resposta = await fetch(URL_MENSAGENS, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": chave,
      "anthropic-version": VERSAO_API,
    },
    body: JSON.stringify(corpo),
  });
  if (!resposta.ok) {
    const texto = await resposta.text().catch(() => "");
    throw new Error(`Anthropic API respondeu ${resposta.status}: ${texto.slice(0, 300)}`);
  }
  return resposta.json();
}

export interface ResultadoPergunta<TResultadoFerramenta> {
  texto: string;
  ferramentaExecutada: boolean;
  entradaFerramenta: Record<string, unknown> | null;
  resultadoFerramenta: TResultadoFerramenta | null;
}

/**
 * Uma pergunta, uma ferramenta, no máximo uma execução dela — é o
 * suficiente pro caso de uso (uma simulação por pergunta) e mantém o loop
 * simples: manda a pergunta, se o modelo pedir a ferramenta a gente
 * executa de verdade e manda o resultado de volta, e devolve o texto
 * final. Sem histórico de conversa complexo, por decisão do usuário.
 */
export async function perguntarComFerramenta<TInput, TResultadoFerramenta>(opts: {
  systemPrompt: string;
  pergunta: string;
  ferramenta: FerramentaAnthropic;
  executarFerramenta: (input: TInput) => TResultadoFerramenta;
}): Promise<ResultadoPergunta<TResultadoFerramenta>> {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) {
    throw new Error("ANTHROPIC_API_KEY não configurada.");
  }

  const mensagens: Array<{ role: "user" | "assistant"; content: unknown }> = [
    { role: "user", content: opts.pergunta },
  ];

  const corpoBase = {
    model: MODELO_HAIKU,
    max_tokens: 700,
    system: opts.systemPrompt,
    tools: [opts.ferramenta],
  };

  let dados = await chamarMensagens(chave, { ...corpoBase, messages: mensagens });

  let ferramentaExecutada = false;
  let entradaFerramenta: Record<string, unknown> | null = null;
  let resultadoFerramenta: TResultadoFerramenta | null = null;

  if (dados.stop_reason === "tool_use") {
    const bloco = dados.content.find((b) => b.type === "tool_use");
    if (bloco?.id) {
      ferramentaExecutada = true;
      entradaFerramenta = (bloco.input as Record<string, unknown>) ?? {};
      resultadoFerramenta = opts.executarFerramenta(bloco.input as TInput);

      mensagens.push({ role: "assistant", content: dados.content });
      mensagens.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: bloco.id,
            content: JSON.stringify(resultadoFerramenta),
          },
        ],
      });
      dados = await chamarMensagens(chave, { ...corpoBase, messages: mensagens });
    }
  }

  const texto = dados.content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("\n")
    .trim();

  return { texto, ferramentaExecutada, entradaFerramenta, resultadoFerramenta };
}
