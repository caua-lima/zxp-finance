import { NextRequest, NextResponse } from "next/server";
import { verificarChamadorAtivo } from "@/lib/verificarChamador";
import { listarDocumentos } from "@/lib/firestoreRest";
import { aparelhoVinculado } from "@/lib/notificacoes/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Este aparelho está vinculado À CONTA LOGADA? (auditoria N02) A
 * inscrição existir no navegador não prova isso — ela pode ser de outra
 * conta ou ter sido apagada no servidor. Também devolve a última
 * tentativa de entrega pra este aparelho, pro diagnóstico.
 */
export async function GET(req: NextRequest) {
  const acesso = await verificarChamadorAtivo(req);
  if (!acesso.ok) return acesso.resposta;
  const uid = acesso.identidade.uid;
  const aparelho = req.nextUrl.searchParams.get("aparelho") ?? "";
  if (!/^[a-f0-9]{64}$/.test(aparelho)) {
    return NextResponse.json({ erro: "Aparelho inválido." }, { status: 400 });
  }
  try {
    const vinculado = await aparelhoVinculado(uid, aparelho);
    const entregas = vinculado
      ? (await listarDocumentos<{ aparelho: string; status: string; atualizadaEm?: number; tipo: string }>(
          `usuarios/${uid}/entregas`
        ))
          .map((e) => e.dados)
          .filter((e) => e.aparelho === aparelho && e.atualizadaEm)
          .sort((a, b) => (b.atualizadaEm ?? 0) - (a.atualizadaEm ?? 0))
      : [];
    const ultima = entregas[0];
    return NextResponse.json({
      vinculado,
      ultimaEntrega: ultima ? { status: ultima.status, em: ultima.atualizadaEm, tipo: ultima.tipo } : null,
    });
  } catch {
    return NextResponse.json({ erro: "Não consegui consultar agora." }, { status: 500 });
  }
}
