import { NextRequest, NextResponse } from "next/server";
import { atualizarUsuario, excluirUsuario } from "@/lib/usuariosFirebase";
import { verificarChamador } from "@/lib/verificarChamador";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mensagemDeErro(e: unknown, padrao: string): string {
  if (e instanceof Error) return e.message;
  return padrao;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const chamador = await verificarChamador(req);
    if (!chamador) {
      return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
    }

    const { uid } = await params;
    const { email, senha, disabled } = await req.json();

    await atualizarUsuario(uid, { email, senha, disabled });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { erro: mensagemDeErro(e, "Erro ao editar usuário.") },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    const chamador = await verificarChamador(req);
    if (!chamador) {
      return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
    }

    const { uid } = await params;
    if (uid === chamador.uid) {
      return NextResponse.json(
        { erro: "Você não pode excluir sua própria conta." },
        { status: 400 }
      );
    }
    await excluirUsuario(uid);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { erro: mensagemDeErro(e, "Erro ao excluir usuário.") },
      { status: 500 }
    );
  }
}
