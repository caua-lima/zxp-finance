import { NextRequest, NextResponse } from "next/server";
import { verificarChamadorAtivo } from "@/lib/verificarChamador";
import { lerJson, texto } from "@/lib/validacao";
import { aceitarConvite } from "@/lib/acesso/convitesServidor";
import { MENSAGEM_CONVITE, avaliarConvite, hashDoToken, tokenBemFormado, Convite } from "@/lib/acesso/convite";
import { obterDocumento } from "@/lib/firestoreRest";
import { criarUsuario } from "@/lib/usuariosFirebase";
import { consumirCota } from "@/lib/cota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Aceitar convite (auditoria 25/10 B12). Dois jeitos:
 *  - logado (Authorization): o convite vale pra essa conta;
 *  - sem conta: { token, email, senha } — o servidor confere o convite
 *    ANTES de criar o login, então ninguém cria conta sem convite válido.
 * Mensagens não revelam se um e-mail tem conta.
 */
export async function POST(req: NextRequest) {
  const corpo = await lerJson(req);
  const token = corpo?.token;
  if (!tokenBemFormado(token)) {
    return NextResponse.json({ erro: MENSAGEM_CONVITE.inexistente }, { status: 400 });
  }
  // limite por convite: força bruta num link não adianta
  if (!(await consumirCota(hashDoToken(token).slice(0, 24), "aceite_convite", 20))) {
    return NextResponse.json({ erro: "Muitas tentativas com esse convite hoje. Tente amanhã." }, { status: 429 });
  }

  const comLogin = req.headers.get("authorization");
  let uid: string;
  if (comLogin) {
    const ativo = await verificarChamadorAtivo(req, { exigirConcessao: false });
    if (!ativo.ok) return ativo.resposta;
    uid = ativo.identidade.uid;
  } else {
    const email = texto(corpo?.email, 3, 254);
    const senha = texto(corpo?.senha, 8, 128);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !senha) {
      return NextResponse.json({ erro: "Informe um e-mail válido e uma senha de 8+ caracteres." }, { status: 400 });
    }
    const problema = avaliarConvite(await obterDocumento<Convite>(`convites/${hashDoToken(token)}`), Date.now());
    if (problema) return NextResponse.json({ erro: MENSAGEM_CONVITE[problema] }, { status: 400 });
    try {
      uid = await criarUsuario(email, senha);
    } catch {
      return NextResponse.json(
        { erro: "Não deu pra criar a conta com esse e-mail. Se você já tem conta, use “Já tenho conta”." },
        { status: 400 }
      );
    }
  }

  const resultado = await aceitarConvite(token, uid);
  if (!resultado.ok) return NextResponse.json({ erro: MENSAGEM_CONVITE[resultado.problema] }, { status: 400 });
  return NextResponse.json({ ok: true, criouConta: !comLogin });
}
