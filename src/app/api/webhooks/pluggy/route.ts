import { NextRequest, NextResponse, after } from "next/server";
import { comConexoes, credenciaisPluggy } from "@/lib/pluggy/cliente";
import { conexoesGravadas, sincronizarBanco, statusDoBanco } from "@/lib/pluggy/sincronizar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Eventos da Pluggy que querem dizer "o banco tem coisa nova". */
const EVENTOS = new Set(["item/created", "item/updated", "transactions/created", "transactions/updated"]);

/**
 * Webhook da Pluggy: o banco atualizou → sincroniza na hora, sem esperar o
 * ciclo de 3 horas. Responde 200 rápido e trabalha depois (`after`). O
 * aviso em si não carrega dado nenhum: só serve de gatilho, e só pra uma
 * conexão que é sua — os dados vêm da API, nunca do corpo do aviso. Aviso
 * de teste, de outra conexão ou repetido em menos de 1 minuto é ignorado.
 */
export async function POST(req: NextRequest) {
  const corpo = (await req.json().catch(() => null)) as { event?: unknown; itemId?: unknown } | null;
  const evento = typeof corpo?.event === "string" ? corpo.event : "";
  const itemId = typeof corpo?.itemId === "string" ? corpo.itemId : "";

  if (EVENTOS.has(evento) && itemId) {
    after(async () => {
      const cred = credenciaisPluggy();
      if (!cred) return;
      const cfg = comConexoes(cred, await conexoesGravadas(cred.uid).catch(() => []));
      if (!cfg.itemIds.includes(itemId)) return;
      const anterior = await statusDoBanco(cfg.uid).catch(() => null);
      if (anterior && Date.now() - anterior.ultimaSincronizacao < 60_000) return;
      await sincronizarBanco(cfg);
    });
  }
  return NextResponse.json({ recebido: true });
}
