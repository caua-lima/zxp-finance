import { NextRequest, NextResponse } from "next/server";
import { verificarChamadorAtivo } from "@/lib/verificarChamador";
import { lerJson } from "@/lib/validacao";
import { cadastrarAparelho, revogarAparelho } from "@/lib/notificacoes/servidor";
import { consumirCota } from "@/lib/cota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cadastro do aparelho pra push — só pelo servidor (auditoria S08/N01).
 * Antes o navegador gravava endpoint e chaves direto no banco, em
 * qualquer formato, e o cron fazia requisição pra esse endereço.
 */
export async function POST(req: NextRequest) {
  const acesso = await verificarChamadorAtivo(req);
  if (!acesso.ok) return acesso.resposta;
  const uid = acesso.identidade.uid;

  if (!(await consumirCota(uid, "push_cadastro", 20))) {
    return NextResponse.json({ erro: "Muitas tentativas hoje. Tente amanhã." }, { status: 429 });
  }
  const corpo = await lerJson(req);
  try {
    const r = await cadastrarAparelho(uid, corpo?.endpoint, corpo?.keys);
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status });
    return NextResponse.json({ aparelho: r.aparelho });
  } catch {
    return NextResponse.json({ erro: "Não consegui cadastrar o aparelho agora." }, { status: 500 });
  }
}

/** Desliga o push deste aparelho pra conta logada. */
export async function DELETE(req: NextRequest) {
  const acesso = await verificarChamadorAtivo(req);
  if (!acesso.ok) return acesso.resposta;
  const aparelho = req.nextUrl.searchParams.get("aparelho") ?? "";
  if (!/^[a-f0-9]{64}$/.test(aparelho)) {
    return NextResponse.json({ erro: "Aparelho inválido." }, { status: 400 });
  }
  try {
    const ok = await revogarAparelho(aparelho, acesso.identidade.uid);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ erro: "Esse aparelho não é seu." }, { status: 403 });
  } catch {
    return NextResponse.json({ erro: "Não consegui desativar agora." }, { status: 500 });
  }
}
