import { NextRequest, NextResponse } from "next/server";
import { lerJson } from "@/lib/validacao";
import { endpointPushValido } from "@/lib/notificacoes/regras";
import { idAparelho, revogarAparelho } from "@/lib/notificacoes/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Revoga o vínculo de um aparelho provando POSSE do endpoint — sem login.
 * É o caminho do logout (inclusive quando a sessão já expirou) e da troca
 * de conta no mesmo navegador: quem tem o endpoint na mão é o próprio
 * aparelho, e só ele consegue parar de receber avisos da conta anterior
 * (auditoria N01). O endpoint é segredo do navegador, não é adivinhável.
 * Não revela se havia vínculo nem de quem era.
 */
export async function POST(req: NextRequest) {
  const corpo = await lerJson(req);
  const endpoint = corpo?.endpoint;
  if (!endpointPushValido(endpoint)) {
    return NextResponse.json({ erro: "Endereço inválido." }, { status: 400 });
  }
  try {
    await revogarAparelho(idAparelho(endpoint as string));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ erro: "Não consegui revogar agora." }, { status: 500 });
  }
}
