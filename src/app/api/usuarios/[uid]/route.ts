import { NextRequest, NextResponse } from "next/server";
import { atualizarUsuario } from "@/lib/usuariosFirebase";
import { verificarAdmin, auditarOperacaoAdmin } from "@/lib/verificarChamador";
import { excluirCliente } from "@/lib/contaCliente";
import { lerJson, texto } from "@/lib/validacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UID_VALIDO = /^[A-Za-z0-9]{10,128}$/;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const acesso = await verificarAdmin(req);
  if (!acesso.ok) return acesso.resposta;

  const { uid } = await params;
  if (!UID_VALIDO.test(uid)) return NextResponse.json({ erro: "Login inválido." }, { status: 400 });

  const corpo = await lerJson(req);
  const email = corpo?.email === undefined ? undefined : texto(corpo.email, 3, 254);
  const senha = corpo?.senha === undefined || corpo.senha === "" ? undefined : texto(corpo.senha, 6, 128);
  const disabled = typeof corpo?.disabled === "boolean" ? corpo.disabled : undefined;
  if (email === null || senha === null) {
    return NextResponse.json({ erro: "E-mail ou senha inválidos." }, { status: 400 });
  }
  if (uid === acesso.identidade.uid && disabled === true) {
    return NextResponse.json({ erro: "Você não pode suspender a própria conta." }, { status: 400 });
  }

  try {
    await atualizarUsuario(uid, { email, senha, disabled });
    await auditarOperacaoAdmin(req, acesso.identidade, "editar_login", uid, {
      trocouEmail: email !== undefined,
      trocouSenha: senha !== undefined, // nunca a senha em si
      disabled,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ erro: "Erro ao editar usuário." }, { status: 500 });
  }
}

/**
 * Excluir cliente = suspender, apagar dados e aparelhos, e só então o
 * login (ver contaCliente.ts). Idempotente: se parar no meio, rodar de novo
 * termina o serviço.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const acesso = await verificarAdmin(req);
  if (!acesso.ok) return acesso.resposta;

  const { uid } = await params;
  if (!UID_VALIDO.test(uid)) return NextResponse.json({ erro: "Login inválido." }, { status: 400 });
  if (uid === acesso.identidade.uid) {
    return NextResponse.json({ erro: "Você não pode excluir sua própria conta." }, { status: 400 });
  }

  try {
    const relatorio = await excluirCliente(uid);
    await auditarOperacaoAdmin(req, acesso.identidade, "excluir_cliente", uid, {
      documentosApagados: relatorio.documentosApagados,
      dispositivosRemovidos: relatorio.dispositivosRemovidos,
      loginApagado: relatorio.loginApagado,
    });
    return NextResponse.json({ ok: true, relatorio });
  } catch {
    return NextResponse.json(
      { erro: "A exclusão parou no meio. Tente de novo — ela continua de onde parou." },
      { status: 500 }
    );
  }
}
