import { NextRequest, NextResponse } from "next/server";
import { verificarAdmin, auditarOperacaoAdmin } from "@/lib/verificarChamador";
import { lerJson, texto, inteiro, numero } from "@/lib/validacao";
import { criarConvite } from "@/lib/acesso/convitesServidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cria um convite de uso único (só admin). Devolve o CAMINHO do link com o
 * token depois do "#": o navegador não manda o fragmento pro servidor, então
 * o token não aparece em log de acesso. O token só é mostrado aqui, uma vez.
 */
export async function POST(req: NextRequest) {
  const admin = await verificarAdmin(req);
  if (!admin.ok) return admin.resposta;

  const corpo = await lerJson(req);
  const turmaId = corpo?.turmaId == null ? null : texto(corpo.turmaId, 1, 80);
  const validadeLinkDias = inteiro(corpo?.validadeLinkDias ?? 7, 1, 60);
  const fimAcessoEm = corpo?.fimAcessoEm == null ? null : numero(corpo.fimAcessoEm, Date.now(), Date.now() + 5 * 365 * 86_400_000);
  if (validadeLinkDias === null || (corpo?.turmaId != null && !turmaId) || (corpo?.fimAcessoEm != null && fimAcessoEm === null)) {
    return NextResponse.json({ erro: "Dados do convite inválidos." }, { status: 400 });
  }

  const { token, expiraEm } = await criarConvite({
    criadoPor: admin.identidade.uid,
    turmaId,
    validadeLinkDias,
    fimAcessoEm,
  });
  // a trilha registra o convite, nunca o token
  await auditarOperacaoAdmin(req, admin.identidade, "criar_convite", null, { turmaId, validadeLinkDias, fimAcessoEm });
  return NextResponse.json({ caminho: `/convite#t=${token}`, expiraEm });
}
