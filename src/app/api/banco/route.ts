import { NextRequest, NextResponse } from "next/server";
import { verificarChamadorAtivo } from "@/lib/verificarChamador";
import { configPluggy } from "@/lib/pluggy/cliente";
import { sincronizarBanco, statusDoBanco } from "@/lib/pluggy/sincronizar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Banco conectado (Open Finance via Meu Pluggy). Plano pessoal gratuito:
 * só o dono das conexões (PLUGGY_UID) usa; pra qualquer outra conta a
 * integração simplesmente não existe.
 */
async function dono(req: NextRequest) {
  const cfg = configPluggy();
  const acesso = await verificarChamadorAtivo(req);
  if (!acesso.ok) return { resposta: acesso.resposta } as const;
  if (!cfg || acesso.identidade.uid !== cfg.uid) {
    return { resposta: NextResponse.json({ conectado: false }, { status: 200 }) } as const;
  }
  return { cfg } as const;
}

export async function GET(req: NextRequest) {
  const r = await dono(req);
  if ("resposta" in r) return r.resposta;
  const status = await statusDoBanco(r.cfg.uid).catch(() => null);
  return NextResponse.json({ conectado: true, status }, { headers: { "Cache-Control": "no-store" } });
}

/** "Sincronizar agora". No máximo uma vez por minuto. */
export async function POST(req: NextRequest) {
  const r = await dono(req);
  if ("resposta" in r) return r.resposta;
  const anterior = await statusDoBanco(r.cfg.uid).catch(() => null);
  if (anterior && Date.now() - anterior.ultimaSincronizacao < 60_000) {
    return NextResponse.json({ conectado: true, status: anterior, aguarde: true });
  }
  const status = await sincronizarBanco(r.cfg);
  return NextResponse.json({ conectado: true, status }, { status: status.erro ? 502 : 200 });
}
