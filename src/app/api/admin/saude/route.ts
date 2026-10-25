import { NextRequest, NextResponse } from "next/server";
import { verificarAdmin } from "@/lib/verificarChamador";
import { consultar } from "@/lib/firestoreRest";
import { diagnosticarAmbiente } from "@/lib/configAmbiente";
import { avaliarSaude, ResumoExecucao } from "@/lib/saudeOperacional";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Até quantas pendentes contar — acima disso, "1000+" já diz o que precisa. */
const LIMITE_PENDENTES = 1000;

/**
 * Saúde operacional pra administração (auditoria 25/10 A08). Só admin.
 * Responde estado e contagens; nunca chave, endpoint, e-mail ou dinheiro.
 */
export async function GET(req: NextRequest) {
  const admin = await verificarAdmin(req);
  if (!admin.ok) return admin.resposta;

  const agora = Date.now();
  const ambiente = diagnosticarAmbiente(process.env);
  try {
    const [execucoes, pendentes] = await Promise.all([
      consultar<ResumoExecucao>({ colecao: "execucoesNotificacao", ordenarPor: [["inicio", "desc"]], limite: 1 }),
      consultar<{ proximaTentativaEm?: number; criadaEm?: number }>({
        colecao: "entregas",
        todas: true,
        onde: [["status", "==", "pendente"]],
        limite: LIMITE_PENDENTES,
      }),
    ]);
    const vencidas = pendentes
      .map((p) => p.dados.proximaTentativaEm || p.dados.criadaEm || agora)
      .filter((t) => t <= agora);
    const saude = avaliarSaude({
      agora,
      ultimaExecucao: execucoes[0]?.dados ?? null,
      pendentes: pendentes.length,
      pendenteMaisAntigaEm: vencidas.length ? Math.min(...vencidas) : null,
      recursosAtivos: ambiente.recursosAtivos,
      bloqueiosDeAmbiente: ambiente.bloqueios,
    });
    return NextResponse.json({
      ...saude,
      versao: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      variaveis: ambiente.variaveis.map(({ nome, estado, recurso }) => ({ nome, estado, recurso })),
    });
  } catch {
    return NextResponse.json({ erro: "Não foi possível ler o estado operacional agora." }, { status: 503 });
  }
}
