import { FinancialEntry, formatarMoeda } from "@/lib/types";
import { calculateOverdueEntries, calculateUpcomingCommitments } from "./calculations";

/**
 * Central de atenção — gera alertas a partir de dados que o app já tem hoje.
 * Itens do briefing que dependem de dado que ainda não existe (receita
 * prevista com data esperada, "uso percebido" de assinatura, duplicidade
 * heurística) ficam de fora até a Fase 6 trazer esses campos — gerar um
 * alerta com dado incompleto seria pior que não gerar nada.
 */

export type Severidade = "critical" | "warning" | "opportunity" | "info";

export interface FinanceAlert {
  key: string; // estável, pra permitir dispensar sem repetir
  severidade: Severidade;
  titulo: string;
  contexto: string;
  impacto: string;
  cta: string;
  href?: string;
}

export interface DadosAlertas {
  entries: FinancialEntry[];
  saldoProjetado: number | null;
  hojeISO: string;
  mes: string;
  saldoAtualizadoEm: number | null; // timestamp da última conferência de saldo, ou null se nunca foi definido
  reservaMinima?: number;
  parcelasTerminando: { id: string; nome: string }[]; // parcelasRestantesEm(p, mes) === 1
  assinaturasParaRevisar: { id: string; nome: string }[]; // usoPercebido === "revisar"
  totalFatura: number;
  rendaLiquidaMensal: number;
  limitePercentualFatura?: number; // padrão 60% se não informado
  entradasPendentes: number; // soma de ganhos do mês ainda não marcados como recebidos
}

const LIMITE_PADRAO_PERCENTUAL_FATURA = 60;

export function gerarAlertas(dados: DadosAlertas): FinanceAlert[] {
  const alertas: FinanceAlert[] = [];

  const atrasados = calculateOverdueEntries(dados.entries, dados.hojeISO);
  for (const e of atrasados) {
    alertas.push({
      key: `atrasado__${e.id}`,
      severidade: "critical",
      titulo: `${e.description} está atrasada`,
      contexto: `Venceu em ${formatarDataCurta(e.dueDate)} e ainda não foi paga.`,
      impacto: formatarMoeda(e.amount),
      cta: "Marcar como paga",
      href: "/checklist",
    });
  }

  const proximos3Dias = calculateUpcomingCommitments(dados.entries, dados.hojeISO, 3);
  for (const e of proximos3Dias) {
    alertas.push({
      key: `vence-em-breve__${e.id}`,
      severidade: "warning",
      titulo: `${e.description} vence em breve`,
      contexto: `Vencimento em ${formatarDataCurta(e.dueDate)}.`,
      impacto: formatarMoeda(e.amount),
      cta: e.source === "card_bill" ? "Ver fatura" : "Ver checklist",
      href: e.source === "card_bill" ? "/fatura" : "/checklist",
    });
  }

  if (dados.saldoProjetado !== null && dados.saldoProjetado < 0) {
    alertas.push({
      key: `saldo-negativo__${dados.mes}`,
      severidade: "critical",
      titulo: "Saldo projetado fica negativo este mês",
      contexto: "Somando o que falta pagar e receber, o mês fecha no vermelho.",
      impacto: formatarMoeda(dados.saldoProjetado),
      cta: "Ver detalhamento",
      href: "/",
    });
  } else if (
    dados.saldoProjetado !== null &&
    dados.reservaMinima !== undefined &&
    dados.saldoProjetado < dados.reservaMinima
  ) {
    alertas.push({
      key: `abaixo-da-reserva__${dados.mes}`,
      severidade: "warning",
      titulo: "Saldo projetado abaixo da sua reserva mínima",
      contexto: `Reserva configurada: ${formatarMoeda(dados.reservaMinima)}.`,
      impacto: formatarMoeda(dados.saldoProjetado),
      cta: "Rever compromissos do mês",
      href: "/agenda",
    });
  }

  if (dados.saldoAtualizadoEm === null) {
    alertas.push({
      key: `saldo-nunca-conferido`,
      severidade: "info",
      titulo: "Você ainda não conferiu o saldo real",
      contexto: "Sem isso, o saldo disponível e o projetado ficam imprecisos.",
      impacto: "—",
      cta: "Conferir saldo",
      href: "/saldo",
    });
  }

  // Passado o começo do mês, ganho ainda "não recebido" é bem mais provável
  // de ser esquecimento (dinheiro já caiu, ninguém marcou o toggle) do que
  // uma previsão real — nudge leve, não é crítico, só pra não inflar o
  // saldo projetado silenciosamente por semanas.
  const diaDoMes = Number(dados.hojeISO.split("-")[2]);
  if (dados.entradasPendentes > 0 && diaDoMes >= 5) {
    alertas.push({
      key: `entradas-pendentes__${dados.mes}`,
      severidade: "info",
      titulo: "Tem entrada prevista ainda não marcada como recebida",
      contexto:
        "Se esse dinheiro já caiu na conta, marca como recebido em Ganhos — senão o saldo projetado conta ele a mais.",
      impacto: formatarMoeda(dados.entradasPendentes),
      cta: "Ver ganhos",
      href: "/ganhos",
    });
  }

  for (const p of dados.parcelasTerminando) {
    alertas.push({
      key: `parcela-terminando__${p.id}`,
      severidade: "opportunity",
      titulo: `${p.nome} está na última parcela`,
      contexto: "Depois deste pagamento, o compromisso mensal desaparece do seu fluxo.",
      impacto: "",
      cta: "Ver parcela",
      href: "/parcelas",
    });
  }

  for (const a of dados.assinaturasParaRevisar) {
    alertas.push({
      key: `revisar-assinatura__${a.id}`,
      severidade: "opportunity",
      titulo: `Revisar assinatura "${a.nome}"`,
      contexto: "Você marcou essa assinatura como pouco usada — vale reavaliar se compensa manter.",
      impacto: "",
      cta: "Ver assinatura",
      href: "/assinaturas",
    });
  }

  if (dados.rendaLiquidaMensal > 0 && dados.totalFatura > 0) {
    const percentual = (dados.totalFatura / dados.rendaLiquidaMensal) * 100;
    const limite = dados.limitePercentualFatura ?? LIMITE_PADRAO_PERCENTUAL_FATURA;
    if (percentual >= limite) {
      alertas.push({
        key: `fatura-alta__${dados.mes}`,
        severidade: "warning",
        titulo: "Fatura do cartão está pesada em relação à renda",
        contexto: `${percentual.toFixed(0)}% da renda líquida do mês está comprometida com fatura de cartão (limite configurado: ${limite}%).`,
        impacto: formatarMoeda(dados.totalFatura),
        cta: "Ver fatura",
        href: "/fatura",
      });
    }
  }

  const ordemSeveridade: Record<Severidade, number> = {
    critical: 0,
    warning: 1,
    opportunity: 2,
    info: 3,
  };
  return alertas.sort(
    (a, b) => ordemSeveridade[a.severidade] - ordemSeveridade[b.severidade]
  );
}

function formatarDataCurta(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}
