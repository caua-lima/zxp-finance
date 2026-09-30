import { NextRequest, NextResponse } from "next/server";
import { verificarChamador } from "@/lib/verificarChamador";
import { ehAdminGlobal } from "@/lib/autorizacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Só pra interface decidir se mostra o menu de Acesso. Esconder o menu não
 * é a proteção — as rotas de /api/usuarios checam de novo, no servidor.
 */
export async function GET(req: NextRequest) {
  const identidade = await verificarChamador(req);
  if (!identidade) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  return NextResponse.json({
    admin: ehAdminGlobal(identidade.uid, identidade.claims, process.env.ADMIN_UIDS),
  });
}
