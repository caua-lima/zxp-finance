import { NextRequest, NextResponse } from "next/server";
import { verificarChamador } from "@/lib/verificarChamador";
import { listarDesejosEmAberto } from "@/lib/tasksBridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mensagemDeErro(e: unknown, padrao: string): string {
  if (e instanceof Error) return e.message;
  return padrao;
}

/**
 * Proxy autenticado pro ZXP Tasks: o navegador chama isto (com o próprio
 * login do Finance), e é este servidor — nunca o cliente — que carrega o
 * segredo compartilhado da ponte. Usado ao criar uma parcela, pra oferecer
 * "vincular a um desejo".
 */
export async function GET(req: NextRequest) {
  try {
    const chamador = await verificarChamador(req);
    if (!chamador) {
      return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
    }

    const itens = await listarDesejosEmAberto();
    return NextResponse.json({ itens });
  } catch (e) {
    return NextResponse.json(
      { erro: mensagemDeErro(e, "Erro ao buscar desejos no Tasks.") },
      { status: 502 }
    );
  }
}
