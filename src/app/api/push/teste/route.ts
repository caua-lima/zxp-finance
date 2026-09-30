import { NextRequest, NextResponse } from "next/server";
import { verificarChamadorAtivo } from "@/lib/verificarChamador";
import { lerJson } from "@/lib/validacao";
import { consumirCota } from "@/lib/cota";
import { obterDocumento } from "@/lib/firestoreRest";
import { idNotificacao, preferenciasPadrao } from "@/lib/notificacoes/regras";
import {
  aparelhoVinculado,
  configurarVapid,
  contadoresZerados,
  materializar,
  processarEntregas,
} from "@/lib/notificacoes/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Testar este aparelho": cria um aviso de teste na central e tenta o push
 * só pra este aparelho, agora. Devolve o que aconteceu de verdade —
 * "aceita pelo provedor" não é "apareceu na tela", e a tela diz isso.
 */
export async function POST(req: NextRequest) {
  const acesso = await verificarChamadorAtivo(req);
  if (!acesso.ok) return acesso.resposta;
  const uid = acesso.identidade.uid;

  const corpo = await lerJson(req);
  const aparelho = typeof corpo?.aparelho === "string" ? corpo.aparelho : "";
  if (!/^[a-f0-9]{64}$/.test(aparelho)) {
    return NextResponse.json({ erro: "Aparelho inválido." }, { status: 400 });
  }
  if (!configurarVapid()) {
    return NextResponse.json({ erro: "Push não está configurado no servidor (VAPID)." }, { status: 503 });
  }
  if (!(await consumirCota(uid, "push_teste", 10))) {
    return NextResponse.json({ erro: "Limite de testes de hoje atingido." }, { status: 429 });
  }
  if (!(await aparelhoVinculado(uid, aparelho))) {
    return NextResponse.json({ erro: "Este aparelho não está ativado nesta conta." }, { status: 409 });
  }

  try {
    const c = contadoresZerados();
    const agora = Date.now();
    const id = idNotificacao("teste", aparelho.slice(0, 16), String(agora));
    await materializar(
      uid,
      [
        {
          id,
          tipo: "teste",
          conteudo: {
            titulo: "Teste de notificação",
            corpo: "Se você está vendo isto, este aparelho recebe os avisos do ZXP Finance.",
            url: "/notificacoes",
          },
          diaLocal: new Date(agora).toISOString().slice(0, 10),
          validoAte: agora + 10 * 60_000,
        },
      ],
      [aparelho],
      preferenciasPadrao(false),
      c
    );
    const prefsDoc = await obterDocumento<{ detalhesNoPush?: boolean }>(
      `usuarios/${uid}/preferencias/notificacoes`
    );
    await processarEntregas(
      uid,
      { ...preferenciasPadrao(false), detalhesNoPush: prefsDoc?.detalhesNoPush === true },
      Date.now(),
      c
    );
    return NextResponse.json({
      aceita: c.aceitas > 0,
      reagendada: c.reagendadas > 0,
      falhou: c.falhas > 0 || c.incidentesConfig > 0,
      inscricaoEncerrada: c.inscricoesEncerradas > 0,
    });
  } catch {
    return NextResponse.json({ erro: "Não consegui testar agora." }, { status: 500 });
  }
}
