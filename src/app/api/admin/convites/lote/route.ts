import { NextRequest, NextResponse } from "next/server";
import { verificarAdmin, auditarOperacaoAdmin } from "@/lib/verificarChamador";
import { lerJson, texto } from "@/lib/validacao";
import { consultar } from "@/lib/firestoreRest";
import { listarUsuarios } from "@/lib/usuariosFirebase";
import { Concessao } from "@/lib/acesso/concessao";
import { criarConvite } from "@/lib/acesso/convitesServidor";
import { prepararLote } from "@/lib/acesso/lote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Convite em lote (só admin; B15). { turmaId, emails, gerar: false } devolve
 * a prévia; com gerar: true, cria um convite AMARRADO a cada e-mail novo e
 * devolve os links. Nada é enviado a ninguém daqui.
 */
export async function POST(req: NextRequest) {
  const admin = await verificarAdmin(req);
  if (!admin.ok) return admin.resposta;
  const corpo = await lerJson(req);
  const turmaId = texto(corpo?.turmaId, 1, 80);
  const emails = typeof corpo?.emails === "string" ? corpo.emails.slice(0, 20_000) : null;
  if (!turmaId || !emails) return NextResponse.json({ erro: "Informe a turma e os e-mails." }, { status: 400 });

  // quem já tem acesso ativo nesta turma (por e-mail do login)
  const [concessoes, logins] = await Promise.all([
    consultar<Concessao>({ colecao: "acessos", onde: [["turmaId", "==", turmaId]], limite: 1000 }),
    listarUsuarios(),
  ]);
  const emailDe = new Map(logins.map((u) => [u.uid, (u.email ?? "").toLowerCase()]));
  const comAcesso = new Set(concessoes.filter((c) => c.dados.estado === "ativo").map((c) => emailDe.get(c.id) ?? ""));
  const linhas = prepararLote(emails, comAcesso);

  if (corpo?.gerar !== true) return NextResponse.json({ linhas });

  const links: { email: string; caminho: string }[] = [];
  for (const l of linhas.filter((x) => x.situacao === "novo")) {
    const { token } = await criarConvite({
      criadoPor: admin.identidade.uid,
      turmaId,
      validadeLinkDias: 7,
      fimAcessoEm: null,
      paraEmail: l.email,
    });
    links.push({ email: l.email, caminho: `/convite#t=${token}` });
  }
  await auditarOperacaoAdmin(req, admin.identidade, "criar_convites_lote", null, { turmaId, quantidade: links.length });
  return NextResponse.json({ linhas, links });
}
