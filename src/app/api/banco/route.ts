import { NextRequest, NextResponse } from "next/server";
import { donoDoBanco } from "@/lib/pluggy/acesso";
import { sincronizarBanco, statusDoBanco } from "@/lib/pluggy/sincronizar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const r = await donoDoBanco(req);
  if ("resposta" in r) return r.resposta;
  const conectado = r.cfg.itemIds.length > 0;
  const status = conectado ? await statusDoBanco(r.cfg.uid).catch(() => null) : null;
  return NextResponse.json({ disponivel: true, conectado, status }, { headers: { "Cache-Control": "no-store" } });
}

/** "Sincronizar agora". No máximo uma vez por minuto. */
export async function POST(req: NextRequest) {
  const r = await donoDoBanco(req);
  if ("resposta" in r) return r.resposta;
  if (r.cfg.itemIds.length === 0) {
    return NextResponse.json({ disponivel: true, conectado: false, status: null }, { status: 409 });
  }
  const anterior = await statusDoBanco(r.cfg.uid).catch(() => null);
  if (anterior && Date.now() - anterior.ultimaSincronizacao < 60_000) {
    return NextResponse.json({ disponivel: true, conectado: true, status: anterior, aguarde: true });
  }
  const status = await sincronizarBanco(r.cfg);
  return NextResponse.json({ disponivel: true, conectado: true, status }, { status: status.erro ? 502 : 200 });
}
