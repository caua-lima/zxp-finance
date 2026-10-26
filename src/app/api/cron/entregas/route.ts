import { NextRequest, NextResponse } from "next/server";
import { atualizarCampos, obterDocumento } from "@/lib/firestoreRest";
import { hojeISO } from "@/lib/finance/calculations";
import { preferenciasPadrao, PreferenciasNotificacao } from "@/lib/notificacoes/regras";
import {
  configurarVapid,
  processarEntregas,
  usuariosComEntregaNaVez,
  contadoresZerados,
} from "@/lib/notificacoes/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Orçamento de tempo: para antes do limite da função e deixa o resto pra próxima. */
const ORCAMENTO_MS = 45_000;

/**
 * Executor de entregas (auditoria 25/10 E37): só envia o que está na vez
 * (retentativas e leases abandonados) — não gera aviso novo. Chamado a
 * cada poucos minutos pelo workflow `entregas.yml` do GitHub Actions
 * (repositório público: sem custo), além do cron diário. Grava uma batida
 * em `execucoesEntregas/{dia}` pro monitor de saúde.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const inicio = Date.now();
  const execucao = `entregas__${inicio}`;
  if (!configurarVapid()) {
    await atualizarCampos(`execucoesEntregas/${hojeISO()}`, { ultimaBatida: inicio, status: "sem_push_configurado" });
    return NextResponse.json({ ok: false, erro: "Push não configurado (VAPID)." }, { status: 500 });
  }

  const c = contadoresZerados();
  const uids = await usuariosComEntregaNaVez(inicio);
  let processados = 0;
  let incidente = false;
  for (const uid of uids) {
    if (Date.now() - inicio > ORCAMENTO_MS || incidente) break;
    const prefsDoc = await obterDocumento<Partial<PreferenciasNotificacao>>(`usuarios/${uid}/preferencias/notificacoes`);
    const prefs = { ...preferenciasPadrao(false), ...(prefsDoc ?? {}) } as PreferenciasNotificacao;
    try {
      const r = await processarEntregas(uid, prefs, Date.now(), c, execucao);
      if (r.incidenteConfig) incidente = true;
      processados++;
    } catch (e) {
      console.error(JSON.stringify({ evento: "entregas_usuario_falhou", execucao, uid, erro: String(e).slice(0, 200) }));
    }
  }

  const resultado = {
    ok: !incidente,
    execucao,
    usuariosNaVez: uids.length,
    processados,
    restantes: uids.length - processados,
    ...c,
    duracaoMs: Date.now() - inicio,
  };
  await atualizarCampos(`execucoesEntregas/${hojeISO()}`, {
    ultimaBatida: inicio,
    status: resultado.ok ? "ok" : "com_problemas",
    ultimoResultado: resultado,
  });
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 500 });
}
