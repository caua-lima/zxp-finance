import { NextRequest, NextResponse } from "next/server";
import { configPluggy } from "@/lib/pluggy/cliente";
import { sincronizarBanco } from "@/lib/pluggy/sincronizar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sincronização automática do banco (workflow banco.yml). Só contadores na resposta. */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const cfg = configPluggy();
  if (!cfg) return NextResponse.json({ ok: true, conectado: false });
  const status = await sincronizarBanco(cfg);
  return NextResponse.json(
    { ok: !status.erro, novos: status.resumo?.novos ?? null, pendentes: status.resumo?.pendentes ?? null, erro: status.erro },
    { status: status.erro ? 502 : 200 }
  );
}
