import { Gasto, formatarMoeda } from "@/lib/types";
import {
  ProjecaoRitmo,
  ehSexta,
  ehDomingo,
  ehUltimoDiaDoMes,
  resumoDaSemana,
  orcamentoDoFimDeSemana,
} from "./ritmo";

/**
 * Monta o texto das notificações do dia. Tudo puro: recebe o estado, devolve
 * a lista do que enviar — o cron só faz I/O.
 *
 * A regra que guia o conjunto: no máximo uma notificação "de rotina" por dia,
 * porque a partir da segunda a pessoa para de ler. Por isso a notificação
 * diária muda de cara conforme o dia (sexta fala de fim de semana, domingo
 * fecha a semana, dia 30 fecha o mês) em vez de somar avisos.
 */

export interface Notificacao {
  title: string;
  body: string;
  url: string;
}

export interface EstadoDiario {
  hojeISO: string;
  saldoAtual: number;
  reservaMeta: number;
  gastavelPorDia: number;
  gastoHoje: number;
  gastos: Gasto[];
  projecao: ProjecaoRitmo | null;
}

/** Frase curta de projeção, reaproveitada em várias notificações. */
function frasePrevisao(projecao: ProjecaoRitmo | null, reservaMeta: number): string {
  if (!projecao) return "";
  if (projecao.diaQueZera) {
    return ` No ritmo atual o dinheiro acaba dia ${projecao.diaQueZera.split("-")[2]}.`;
  }
  if (!projecao.batendoMeta) {
    return ` No ritmo atual sobra ${formatarMoeda(projecao.sobraProjetada)}, abaixo da meta de ${formatarMoeda(reservaMeta)}.`;
  }
  return ` No ritmo atual o mês fecha com ${formatarMoeda(projecao.sobraProjetada)}.`;
}

/**
 * A notificação diária — uma só, com a cara do dia.
 *
 * Sexta e domingo ganham tratamento próprio porque são os dois momentos em
 * que o comportamento muda: sexta é quando o orçamento costuma morrer (e ver
 * o valor dos três dias juntos evita gastar tudo no primeiro), e domingo é
 * o momento natural de olhar pra trás antes de recomeçar.
 */
export function notificacaoDiaria(estado: EstadoDiario): Notificacao {
  const {
    hojeISO,
    reservaMeta,
    gastavelPorDia,
    gastoHoje,
    gastos,
    projecao,
    saldoAtual,
  } = estado;
  const aindaHoje = gastavelPorDia - gastoHoje;

  if (ehUltimoDiaDoMes(hojeISO)) {
    const bateu = saldoAtual >= reservaMeta;
    return {
      title: bateu
        ? `Fim do mês: você guardou ${formatarMoeda(saldoAtual)}`
        : `Fim do mês: sobrou ${formatarMoeda(saldoAtual)}`,
      body: bateu
        ? `Sua meta era ${formatarMoeda(reservaMeta)} — bateu. Amanhã começa outro mês: pague as contas e informe o novo saldo.`
        : `A meta era ${formatarMoeda(reservaMeta)}. Amanhã começa outro mês: pague as contas e informe o novo saldo.`,
      url: "/saldo",
    };
  }

  if (ehDomingo(hojeISO)) {
    const semana = resumoDaSemana(gastos, hojeISO);
    const orcamentoDaSemana = gastavelPorDia * 7;
    const sobrouNaSemana = orcamentoDaSemana - semana.total;

    // Semana fechada abaixo do orçamento é o momento óbvio de reconhecer —
    // e o número é real: é exatamente o que sobrou do limite de 7 dias.
    if (sobrouNaSemana > 0 && semana.total > 0) {
      return {
        title: `Semana no controle: sobrou ${formatarMoeda(sobrouNaSemana)}`,
        body: `Gastou ${formatarMoeda(semana.total)} de ${formatarMoeda(orcamentoDaSemana)}.${frasePrevisao(projecao, reservaMeta)}`,
        url: "/saldo",
      };
    }

    const detalhe =
      semana.categoriaTop && semana.valorTop > 0
        ? ` O que mais pesou: ${semana.categoriaTop}, ${formatarMoeda(semana.valorTop)}.`
        : "";
    return {
      title: `Semana fechada: ${formatarMoeda(semana.total)} gastos`,
      body: `${detalhe}${frasePrevisao(projecao, reservaMeta)}`.trim() ||
        "Semana sem gasto lançado.",
      url: "/saldo",
    };
  }

  if (ehSexta(hojeISO)) {
    const fds = orcamentoDoFimDeSemana(gastavelPorDia) ?? 0;
    return {
      title: `Fim de semana: ${formatarMoeda(fds)} até domingo`,
      body: `É o seu limite de sexta, sábado e domingo somados — não é tudo pra hoje.${frasePrevisao(projecao, reservaMeta)}`,
      url: "/saldo",
    };
  }

  return {
    title:
      aindaHoje >= 0
        ? `Hoje você pode gastar ${formatarMoeda(aindaHoje)}`
        : `Já passou ${formatarMoeda(Math.abs(aindaHoje))} do previsto pra hoje`,
    body: `Saldo atual ${formatarMoeda(saldoAtual)}.${frasePrevisao(projecao, reservaMeta)}`,
    url: "/saldo",
  };
}

/**
 * Aviso separado, e só quando é grave: o ritmo vai zerar o dinheiro antes do
 * fim do mês. Sai fora da notificação de rotina porque é o tipo de coisa que
 * merece interromper — mas só dispara uma vez por semana pra não virar ruído
 * diário quando a pessoa já sabe e está se ajustando.
 */
export function avisoRitmoPerigoso(
  projecao: ProjecaoRitmo | null,
  hojeISO: string
): Notificacao | null {
  if (!projecao?.diaQueZera) return null;
  // Só na segunda: um lembrete por semana, no dia em que ainda dá pra
  // corrigir a rota. Diário viraria ruído pra quem já sabe e está ajustando.
  if (!ehSegunda(hojeISO)) return null;
  return {
    title: `Seu dinheiro acaba dia ${projecao.diaQueZera.split("-")[2]}`,
    body: `Você está gastando ${formatarMoeda(projecao.gastoMedioDiario)} por dia. Nesse ritmo não chega ao fim do mês.`,
    url: "/saldo",
  };
}

function ehSegunda(iso: string): boolean {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia).getDay() === 1;
}

/**
 * Comissão não lançada ontem, em dia útil. Ele lança todo dia de trabalho —
 * um dia útil em branco quase sempre é esquecimento, não um dia sem reunião.
 * Não dispara em segunda (o "ontem" seria domingo).
 */
export function avisoComissaoEsquecida(
  diasComComissao: Set<string>,
  hojeISO: string
): Notificacao | null {
  const [ano, mes, dia] = hojeISO.split("-").map(Number);
  const hoje = new Date(ano, mes - 1, dia);
  const diaSemanaHoje = hoje.getDay();
  // terça a sábado: o "ontem" é um dia útil
  if (diaSemanaHoje < 2 && diaSemanaHoje !== 6) return null;

  const ontem = new Date(ano, mes - 1, dia - 1);
  const ontemISO = `${ontem.getFullYear()}-${String(ontem.getMonth() + 1).padStart(2, "0")}-${String(ontem.getDate()).padStart(2, "0")}`;
  if (diasComComissao.has(ontemISO)) return null;

  return {
    title: "Não lançou comissão ontem",
    body: "Teve reunião ou venda? Lançar no mesmo dia evita perder o número no fim do mês.",
    url: "/comissoes",
  };
}

/**
 * Contas do mês ainda não marcadas como pagas, passada a primeira semana.
 * Só dispara uma vez (dia 8) — o objetivo é lembrar de começar o checklist,
 * não cobrar todo dia.
 */
export function avisoChecklistParado(
  totalItens: number,
  itensPagos: number,
  hojeISO: string
): Notificacao | null {
  const diaDoMes = Number(hojeISO.split("-")[2]);
  if (diaDoMes !== 8) return null;
  if (totalItens === 0 || itensPagos > 0) return null;
  return {
    title: `${totalItens} contas ainda não marcadas como pagas`,
    body: "Se já pagou, marque no checklist — é o que mantém o saldo e os alertas certos.",
    url: "/checklist",
  };
}
