import { NextRequest, NextResponse } from "next/server";
import { verificarAdmin, auditarOperacaoAdmin } from "@/lib/verificarChamador";
import { lerJson, texto, numero } from "@/lib/validacao";
import { aplicarAcaoNoServidor } from "@/lib/acesso/acoesServidor";
import { AcaoConcessao } from "@/lib/acesso/concessao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Suspender, reativar, renovar ou encerrar o acesso de uma pessoa (só
 * admin; B14). Nada é apagado: os dados da pessoa ficam onde estão.
 *   PATCH { acao: "suspender"|"encerrar", motivo } | { acao: "reativar" } | { acao: "renovar", fimEm|null }
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ uid: string }> }) {
  const admin = await verificarAdmin(req);
  if (!admin.ok) return admin.resposta;
  const { uid } = await ctx.params;
  if (!/^[A-Za-z0-9]{10,128}$/.test(uid)) return NextResponse.json({ erro: "UID inválido." }, { status: 400 });
  if (uid === admin.identidade.uid) {
    return NextResponse.json({ erro: "Você não pode mudar o seu próprio acesso." }, { status: 400 });
  }

  const corpo = await lerJson(req);
  let acao: AcaoConcessao | null = null;
  if (corpo?.acao === "suspender" || corpo?.acao === "encerrar") {
    const motivo = texto(corpo.motivo, 3, 200);
    if (motivo) acao = { tipo: corpo.acao, motivo };
  } else if (corpo?.acao === "reativar") {
    acao = { tipo: "reativar" };
  } else if (corpo?.acao === "renovar") {
    const fimEm = corpo.fimEm === null ? null : numero(corpo.fimEm, Date.now(), Date.now() + 5 * 365 * 86_400_000);
    if (corpo.fimEm === null || fimEm !== null) acao = { tipo: "renovar", fimEm };
  }
  if (!acao) return NextResponse.json({ erro: "Ação inválida (motivo de 3+ letras pra suspender/encerrar)." }, { status: 400 });

  const r = await aplicarAcaoNoServidor(uid, acao);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 409 });
  await auditarOperacaoAdmin(req, admin.identidade, `acesso_${acao.tipo}`, uid, {
    estado: r.concessao.estado,
    fimEm: r.concessao.fimEm,
    entregasCanceladas: r.entregasCanceladas,
  });
  return NextResponse.json({ estado: r.concessao.estado, fimEm: r.concessao.fimEm, entregasCanceladas: r.entregasCanceladas });
}
