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
import { diasAteVencimento, deveAvisar, montarAviso } from "@/lib/finance/vencimentoFatura";
import { formatarMoeda, mesPadrao } from "@/lib/types";

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
interface CartaoConfigDoc {
  nome: string;
  diaVencimento?: number | null;
}
interface FaturaDoc {
  nome: string;
  valor: number;
  mes: string;
}

function mensagemDeErro(e: unknown, padrao: string): string {
  if (e instanceof Error) return e.message;
  return padrao;
}

/**
 * Roda 1x por dia (Vercel Cron, ver vercel.json). Pra cada usuário com
 * pelo menos uma inscrição de push, envia:
 *
 * 1. "quanto pode gastar hoje" — recalculado com os MESMOS cálculos puros
 *    usados no client (src/lib/finance/calculations.ts), só lido via
 *    Firestore REST em vez do SDK, porque aqui não existe sessão de
 *    usuário autenticada. Precisa de saldo definido.
 * 2. aviso de vencimento de fatura — faltando 5 dias, 1 dia e no próprio
 *    dia. Só pra fatura com valor lançado, cartão com dia de vencimento
 *    configurado e que ainda não foi marcada como paga no checklist.
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
    const mes = mesPadrao();
    // dias-no-mês baseado no calendário de verdade (30/31/28/29), igual ao client
    const diasRestantes = diasRestantesNoMes(hoje);

    const usuarios = await listarUsuarios();
    let usuariosNotificados = 0;
    let usuariosPulados = 0;
    let pushEnviados = 0;
    let pushExpirados = 0;
    let avisosVencimento = 0;

    for (const usuario of usuarios) {
      const inscricoes = await listarDocumentos<InscricaoDoc>(
        `usuarios/${usuario.uid}/pushInscricoes`
      );
      if (inscricoes.length === 0) {
        usuariosPulados++;
        continue;
      }

      /** Dispara um payload pra todos os aparelhos do usuário, limpando os expirados. */
      async function enviar(payload: string) {
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
      }

      let notificouAlgo = false;

      // 1. quanto pode gastar hoje
      const saldo = await obterDocumento<SaldoDoc>(`usuarios/${usuario.uid}/saldo/atual`);
      const gastos = saldo
        ? await listarDocumentos<GastoDoc>(`usuarios/${usuario.uid}/gastos`)
        : [];

      if (saldo) {
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

        if (gastavelPorDia !== null) {
          const totalGastoHoje = gastos
            .filter((g) => diaISOde(g.dados.criadoEm) === hoje)
            .reduce((acc, g) => acc + g.dados.valor, 0);
          const aindaHoje = gastavelPorDia - totalGastoHoje;

          const titulo =
            aindaHoje >= 0
              ? `Hoje você pode gastar ${formatarMoeda(aindaHoje)}`
              : `Já passou ${formatarMoeda(Math.abs(aindaHoje))} do previsto pra hoje`;
          const corpo = `Orçamento diário: ${formatarMoeda(gastavelPorDia)} · Saldo atual: ${formatarMoeda(saldoAtual)}`;
          await enviar(JSON.stringify({ title: titulo, body: corpo, url: "/saldo" }));
          notificouAlgo = true;
        }
      }

      // 2. vencimento de fatura (5 dias antes, 1 dia antes, no dia)
      const configs = await listarDocumentos<CartaoConfigDoc>(
        `usuarios/${usuario.uid}/cartoesConfig`
      );
      const comVencimento = configs.filter((c) => !!c.dados.diaVencimento);

      if (comVencimento.length > 0) {
        const faturas = await listarDocumentos<FaturaDoc>(
          `usuarios/${usuario.uid}/faturasCartao`
        );
        const pagamentos = await listarDocumentos(`usuarios/${usuario.uid}/pagamentos`);
        const idsPagos = new Set(pagamentos.map((p) => p.id));

        for (const config of comVencimento) {
          const cartao = config.dados.nome;
          const fatura = faturas.find(
            (f) => f.dados.mes === mes && f.dados.nome === cartao
          );
          // sem valor lançado não há o que cobrar
          if (!fatura || fatura.dados.valor <= 0) continue;
          // já marcada como paga no checklist — ver chave() em usePagamentos
          if (idsPagos.has(`${mes}__fatura__${fatura.id}`)) continue;

          const dias = diasAteVencimento(config.dados.diaVencimento!, mes, hoje);
          if (!deveAvisar(dias)) continue;

          const aviso = montarAviso(cartao, formatarMoeda(fatura.dados.valor), dias);
          if (!aviso) continue;

          await enviar(
            JSON.stringify({ title: aviso.titulo, body: aviso.corpo, url: "/fatura" })
          );
          avisosVencimento++;
          notificouAlgo = true;
        }
      }

      if (notificouAlgo) usuariosNotificados++;
      else usuariosPulados++;
    }

    return NextResponse.json({
      ok: true,
      usuariosNotificados,
      usuariosPulados,
      pushEnviados,
      pushExpirados,
      avisosVencimento,
    });
  } catch (e) {
    return NextResponse.json(
      { erro: mensagemDeErro(e, "Erro ao enviar notificações diárias.") },
      { status: 500 }
    );
  }
}
