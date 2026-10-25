import { NextRequest, NextResponse } from "next/server";
import { verificarAdmin, auditarOperacaoAdmin } from "@/lib/verificarChamador";
import { lerJson, texto, numero } from "@/lib/validacao";
import { consultar, criarSeNaoExiste } from "@/lib/firestoreRest";
import { Turma, idDeTurma } from "@/lib/acesso/turmas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Turmas (só admin). Nada de dado financeiro aqui. */
export async function GET(req: NextRequest) {
  const admin = await verificarAdmin(req);
  if (!admin.ok) return admin.resposta;
  const turmas = await consultar<Turma>({ colecao: "turmas", ordenarPor: [["criadoEm", "desc"]], limite: 200 });
  return NextResponse.json({ turmas: turmas.map((t) => ({ id: t.id, ...t.dados })) });
}

export async function POST(req: NextRequest) {
  const admin = await verificarAdmin(req);
  if (!admin.ok) return admin.resposta;
  const corpo = await lerJson(req);
  const nome = texto(corpo?.nome, 2, 80);
  const agora = Date.now();
  const fimEm = corpo?.fimEm == null ? null : numero(corpo.fimEm, agora, agora + 5 * 365 * 86_400_000);
  if (!nome || (corpo?.fimEm != null && fimEm === null)) {
    return NextResponse.json({ erro: "Dê um nome (2 a 80 letras) e, se quiser, uma data de fim no futuro." }, { status: 400 });
  }
  const id = `${idDeTurma(nome)}-${agora.toString(36)}`;
  const turma: Turma = { nome, inicioEm: agora, fimEm, criadoEm: agora, criadoPor: admin.identidade.uid };
  await criarSeNaoExiste(`turmas/${id}`, { ...turma });
  await auditarOperacaoAdmin(req, admin.identidade, "criar_turma", null, { turmaId: id });
  return NextResponse.json({ id, ...turma });
}
