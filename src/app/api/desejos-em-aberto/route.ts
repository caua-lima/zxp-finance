import { NextRequest, NextResponse } from "next/server";
import { verificarChamadorAtivo } from "@/lib/verificarChamador";
import { listarDesejosEmAberto } from "@/lib/tasksBridge";
import { recursoLiberado } from "@/lib/autorizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxy pro ZXP Tasks. A ponte usa UM segredo e UMA conta do Tasks — não
 * existe vínculo por cliente (auditoria S06). Então fica desligada pra
 * todo mundo, e só UIDs listados em TASKS_BRIDGE_UIDS (o dono daquele
 * quadro do Tasks) conseguem usar. Liberar pra outros clientes exige
 * vínculo individual antes.
 */
export async function GET(req: NextRequest) {
  const acesso = await verificarChamadorAtivo(req);
  if (!acesso.ok) return acesso.resposta;
  if (!recursoLiberado(acesso.identidade.uid, process.env.TASKS_BRIDGE_UIDS)) {
    return NextResponse.json(
      { erro: "A integração com o ZXP Tasks não está habilitada pra sua conta." },
      { status: 403 }
    );
  }
  try {
    return NextResponse.json({ itens: await listarDesejosEmAberto() });
  } catch {
    return NextResponse.json({ erro: "Não consegui falar com o ZXP Tasks agora." }, { status: 502 });
  }
}
