import { NextRequest, NextResponse } from "next/server";
import { verificarChamadorAtivo } from "@/lib/verificarChamador";
import { ConfigPluggy, comConexoes, credenciaisPluggy } from "./cliente";
import { conexoesGravadas } from "./sincronizar";

/**
 * Banco conectado (Open Finance via Meu Pluggy). Plano pessoal gratuito:
 * só o dono das credenciais (PLUGGY_UID) usa; pra qualquer outra conta a
 * integração simplesmente não existe.
 */
export async function donoDoBanco(
  req: NextRequest
): Promise<{ resposta: NextResponse } | { cfg: ConfigPluggy }> {
  const cred = credenciaisPluggy();
  const acesso = await verificarChamadorAtivo(req);
  if (!acesso.ok) return { resposta: acesso.resposta };
  if (!cred || acesso.identidade.uid !== cred.uid) {
    return { resposta: NextResponse.json({ disponivel: false, conectado: false }) };
  }
  return { cfg: comConexoes(cred, await conexoesGravadas(cred.uid).catch(() => [])) };
}

