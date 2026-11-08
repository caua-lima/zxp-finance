import { NextRequest, NextResponse } from "next/server";
import { criarConnectToken, ehIdDeItem, obterItem } from "@/lib/pluggy/cliente";
import { gravarConexao } from "@/lib/pluggy/sincronizar";
import { donoDoBanco } from "@/lib/pluggy/acesso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Token de 30 min pro widget Pluggy Connect (só cria conexão, não lê dados). */
export async function GET(req: NextRequest) {
  const r = await donoDoBanco(req);
  if ("resposta" in r) return r.resposta;
  try {
    const accessToken = await criarConnectToken(r.cfg, r.cfg.uid);
    return NextResponse.json({ accessToken }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ erro: "A Pluggy não liberou a conexão agora. Tente de novo." }, { status: 502 });
  }
}

/** O widget terminou: confere a conexão na Pluggy e grava o id dela. */
export async function POST(req: NextRequest) {
  const r = await donoDoBanco(req);
  if ("resposta" in r) return r.resposta;
  const corpo = (await req.json().catch(() => null)) as { itemId?: unknown } | null;
  if (!ehIdDeItem(corpo?.itemId)) return NextResponse.json({ erro: "Conexão inválida." }, { status: 400 });
  try {
    const item = await obterItem(r.cfg, corpo.itemId);
    await gravarConexao(r.cfg.uid, item.id);
    return NextResponse.json({ ok: true, status: item.status, conector: item.connector?.name ?? null });
  } catch {
    return NextResponse.json({ erro: "Não encontrei essa conexão na Pluggy." }, { status: 404 });
  }
}
