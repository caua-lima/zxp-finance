import { NextRequest, NextResponse } from "next/server";
import { verificarAdmin } from "@/lib/verificarChamador";
import { consultar } from "@/lib/firestoreRest";
import { listarUsuarios } from "@/lib/usuariosFirebase";
import { Concessao } from "@/lib/acesso/concessao";
import { pessoaDaTurma, resumoDaTurma } from "@/lib/acesso/turmas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Quem tem acesso (só admin): concessão + e-mail e último login. Não lê
 * nenhuma coleção financeira — a turma vê acesso, não extrato.
 *   GET /api/admin/acessos?turma=<id>   (sem turma = todos)
 */
export async function GET(req: NextRequest) {
  const admin = await verificarAdmin(req);
  if (!admin.ok) return admin.resposta;
  const turma = req.nextUrl.searchParams.get("turma");
  const [concessoes, logins] = await Promise.all([
    consultar<Concessao>({ colecao: "acessos", ...(turma ? { onde: [["turmaId", "==", turma]] } : {}), limite: 1000 }),
    listarUsuarios(),
  ]);
  const porUid = new Map(logins.map((u) => [u.uid, { email: u.email, ultimoLogin: u.ultimoLogin || null }]));
  const agora = Date.now();
  const pessoas = concessoes
    .map((c) => pessoaDaTurma(c.id, c.dados, porUid.get(c.id), agora))
    .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
  return NextResponse.json({ pessoas, resumo: resumoDaTurma(pessoas) });
}
