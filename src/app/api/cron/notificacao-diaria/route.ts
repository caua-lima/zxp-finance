import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { listarUsuarios } from "@/lib/usuariosFirebase";
import { listarDocumentos, obterDocumento, deletarDocumento } from "@/lib/firestoreRest";
import {
  diasRestantesNoMes,
  calculateGastavelPorDia,
  hojeISO,
  diaISOde,
} from "@/lib/finance/calculations";
import { formatarMoeda } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SaldoDoc {
  valor: number;
  atualizadoEm: number;
  reservaMeta?: number;
}
interface GastoDoc {
  valor: number;
  criadoEm: number;
}
interface InscricaoDoc {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function mensagemDeErro(e: unknown, padrao: string): string {
  if (e instanceof Error) return e.message;
  return padrao;
}

/**
 * Roda 1x por dia (Vercel Cron, ver vercel.json). Pra cada usuário com
 * saldo definido e pelo menos uma inscrição de push: recalcula
 * "quanto pode gastar hoje" com os MESMOS cálculos puros usados no
 * client (src/lib/finance/calculations.ts) — nada duplicado, só lido
 * via Firestore REST em vez do SDK do client, porque aqui não existe
 * sessão de usuário autenticada.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  try {
    const chavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const chavePrivada = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!chavePublica || !chavePrivada || !subject) {
      return NextResponse.json({ erro: "VAPID não configurado no ambiente." }, { status: 500 });
    }
    webpush.setVapidDetails(subject, chavePublica, chavePrivada);

    const hoje = hojeISO();
    // dias-no-mês baseado no calendário de verdade (30/31/28/29), igual ao client
    const diasRestantes = diasRestantesNoMes(hoje);

    const usuarios = await listarUsuarios();
    let usuariosNotificados = 0;
    let usuariosPulados = 0;
    let pushEnviados = 0;
    let pushExpirados = 0;

    for (const usuario of usuarios) {
      const saldo = await obterDocumento<SaldoDoc>(`usuarios/${usuario.uid}/saldo/atual`);
      if (!saldo) {
        usuariosPulados++;
        continue;
      }

      const inscricoes = await listarDocumentos<InscricaoDoc>(
        `usuarios/${usuario.uid}/pushInscricoes`
      );
      if (inscricoes.length === 0) {
        usuariosPulados++;
        continue;
      }

      const gastos = await listarDocumentos<GastoDoc>(`usuarios/${usuario.uid}/gastos`);
      const gastosDesdeReferencia = gastos.filter(
        (g) => g.dados.criadoEm > saldo.atualizadoEm
      );
      const saldoAtual =
        saldo.valor - gastosDesdeReferencia.reduce((acc, g) => acc + g.dados.valor, 0);

      const gastavelPorDia = calculateGastavelPorDia(
        saldoAtual,
        saldo.reservaMeta ?? 0,
        diasRestantes
      );
      if (gastavelPorDia === null) {
        usuariosPulados++;
        continue;
      }

      const totalGastoHoje = gastos
        .filter((g) => diaISOde(g.dados.criadoEm) === hoje)
        .reduce((acc, g) => acc + g.dados.valor, 0);
      const aindaHoje = gastavelPorDia - totalGastoHoje;

      const titulo =
        aindaHoje >= 0
          ? `Hoje você pode gastar ${formatarMoeda(aindaHoje)}`
          : `Já passou ${formatarMoeda(Math.abs(aindaHoje))} do previsto pra hoje`;
      const corpo = `Orçamento diário: ${formatarMoeda(gastavelPorDia)} · Saldo atual: ${formatarMoeda(saldoAtual)}`;
      const payload = JSON.stringify({ title: titulo, body: corpo, url: "/saldo" });

      for (const inscricao of inscricoes) {
        try {
          await webpush.sendNotification(
            { endpoint: inscricao.dados.endpoint, keys: inscricao.dados.keys },
            payload
          );
          pushEnviados++;
        } catch (e) {
          const statusCode = (e as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await deletarDocumento(
              `usuarios/${usuario.uid}/pushInscricoes/${inscricao.id}`
            );
            pushExpirados++;
          }
        }
      }
      usuariosNotificados++;
    }

    return NextResponse.json({
      ok: true,
      usuariosNotificados,
      usuariosPulados,
      pushEnviados,
      pushExpirados,
    });
  } catch (e) {
    return NextResponse.json(
      { erro: mensagemDeErro(e, "Erro ao enviar notificações diárias.") },
      { status: 500 }
    );
  }
}
