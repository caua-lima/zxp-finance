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
import { saldoEstaVelho } from "@/lib/finance/alerts";
import { projetarRitmo } from "@/lib/finance/ritmo";
import {
  notificacaoDiaria,
  avisoRitmoPerigoso,
  avisoComissaoEsquecida,
  avisoChecklistParado,
} from "@/lib/finance/notificacoes";
import type { Gasto } from "@/lib/types";
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
  descricao?: string;
  valor: number;
  categoria?: string;
  mes?: string;
  criadoEm: number;
  ajusteConciliacaoId?: string;
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
    let avisosRitmo = 0;
    let avisosComissao = 0;

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

      if (saldo && saldoEstaVelho(saldo.atualizadoEm, hoje)) {
        // Saldo de outro mês: mandar o orçamento diário daqui seria mandar um
        // número errado com cara de certo. Avisa pra atualizar, em vez disso.
        await enviar(
          JSON.stringify({
            title: "Atualize seu saldo",
            body: "O valor guardado é do mês passado — o quanto você pode gastar por dia não vale mais.",
            url: "/saldo",
          })
        );
        notificouAlgo = true;
      } else if (saldo) {
        const listaGastos: Gasto[] = gastos.map((g) => ({
          id: g.id,
          descricao: g.dados.descricao ?? "",
          valor: g.dados.valor,
          categoria: g.dados.categoria ?? "Outros",
          mes: g.dados.mes ?? "",
          criadoEm: g.dados.criadoEm,
          ajusteConciliacaoId: g.dados.ajusteConciliacaoId,
        }));

        const gastosDesdeReferencia = gastos.filter(
          (g) => g.dados.criadoEm > saldo.atualizadoEm
        );
        const saldoAtual =
          saldo.valor - gastosDesdeReferencia.reduce((acc, g) => acc + g.dados.valor, 0);
        const reservaMeta = saldo.reservaMeta ?? 0;

        const gastavelPorDia = calculateGastavelPorDia(
          saldoAtual,
          reservaMeta,
          diasRestantes
        );

        if (gastavelPorDia !== null) {
          const totalGastoHoje = gastos
            .filter((g) => diaISOde(g.dados.criadoEm) === hoje && !g.dados.ajusteConciliacaoId)
            .reduce((acc, g) => acc + g.dados.valor, 0);

          const projecao = projetarRitmo(saldoAtual, reservaMeta, listaGastos, mes, hoje);

          // Uma notificação de rotina por dia, com a cara do dia (sexta fala
          // de fim de semana, domingo fecha a semana, dia 30 fecha o mês).
          await enviar(
            JSON.stringify(
              notificacaoDiaria({
                hojeISO: hoje,
                saldoAtual,
                reservaMeta,
                gastavelPorDia,
                gastoHoje: totalGastoHoje,
                gastos: listaGastos,
                projecao,
              })
            )
          );
          notificouAlgo = true;

          // Alerta separado, só na segunda, e só se o ritmo zera o dinheiro
          // antes do fim do mês — o tipo de coisa que merece interromper.
          const perigo = avisoRitmoPerigoso(projecao, hoje);
          if (perigo) {
            await enviar(JSON.stringify(perigo));
            avisosRitmo++;
          }
        }
      }

      // Comissão não lançada ontem (ele lança todo dia de trabalho)
      const comissoes = await listarDocumentos<{ data: string }>(
        `usuarios/${usuario.uid}/comissoes`
      );
      const aviso = avisoComissaoEsquecida(
        new Set(comissoes.map((c) => c.dados.data)),
        hoje
      );
      if (aviso) {
        await enviar(JSON.stringify(aviso));
        avisosComissao++;
        notificouAlgo = true;
      }

      // Checklist do mês nem começado. As leituras ficam dentro do if porque
      // este aviso só existe no dia 8 — não vale pagar 2 leituras por usuário
      // nos outros 29 dias do mês.
      if (Number(hoje.split("-")[2]) === 8) {
        const [contas, pagamentosDoMes] = await Promise.all([
          listarDocumentos<{ ativa?: boolean }>(`usuarios/${usuario.uid}/contasFixas`),
          listarDocumentos(`usuarios/${usuario.uid}/pagamentos`),
        ]);
        const contasAtivas = contas.filter((c) => c.dados.ativa).length;
        const marcadosNoMes = pagamentosDoMes.filter((p) =>
          p.id.startsWith(`${mes}__`)
        ).length;
        const avisoChecklist = avisoChecklistParado(contasAtivas, marcadosNoMes, hoje);
        if (avisoChecklist) {
          await enviar(JSON.stringify(avisoChecklist));
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
      avisosRitmo,
      avisosComissao,
    });
  } catch (e) {
    return NextResponse.json(
      { erro: mensagemDeErro(e, "Erro ao enviar notificações diárias.") },
      { status: 500 }
    );
  }
}
