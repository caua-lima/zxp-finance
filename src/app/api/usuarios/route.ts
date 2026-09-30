import { NextRequest, NextResponse } from "next/server";
import { listarUsuarios, criarUsuario } from "@/lib/usuariosFirebase";
import { verificarAdmin, auditarOperacaoAdmin } from "@/lib/verificarChamador";
import { lerJson, texto } from "@/lib/validacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Administração de logins. Antes bastava estar logado pra listar, criar,
 * editar e apagar QUALQUER login (auditoria S01) — agora só admin global,
 * com conta ativa e sessão não revogada.
 */
export async function GET(req: NextRequest) {
  const acesso = await verificarAdmin(req);
  if (!acesso.ok) return acesso.resposta;
  try {
    return NextResponse.json({ usuarios: await listarUsuarios() });
  } catch {
    return NextResponse.json({ erro: "Erro ao listar usuários." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const acesso = await verificarAdmin(req);
  if (!acesso.ok) return acesso.resposta;

  const corpo = await lerJson(req);
  const email = texto(corpo?.email, 3, 254);
  const senha = texto(corpo?.senha, 6, 128);
  if (!email || !senha || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ erro: "E-mail válido e senha de 6+ caracteres são obrigatórios." }, { status: 400 });
  }

  try {
    const uid = await criarUsuario(email, senha);
    await auditarOperacaoAdmin(req, acesso.identidade, "criar_login", uid, { email });
    return NextResponse.json({ uid });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    // mensagens traduzidas da API (e-mail já existe etc.) são seguras de mostrar
    const segura = /já existe|inválido|senha/i.test(msg) ? msg : "Erro ao criar usuário.";
    return NextResponse.json({ erro: segura }, { status: 400 });
  }
}
