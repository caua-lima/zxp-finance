import { formatarMoeda, mesSeguinte, mesAnteriorDe, Gasto, FinancialEntry } from "@/lib/types";
import { construirFinancialEntries, DadosFinanceiros } from "@/lib/finance/adapters";
import { saldoConfirmado, recebimentosAvulsos, MovimentoPagamento, Transferencia } from "@/lib/finance/saldo";
import { resumoGastosDiarios } from "@/lib/finance/gastosDiarios";
import { notificacaoDoDia } from "@/lib/abundancia";
import { saldoEstaVelho } from "@/lib/finance/alerts";
import {
  avisoComissaoEsquecida,
  avisoChecklistParado,
} from "@/lib/finance/notificacoes";
import {
  TipoNotificacao,
  ConteudoNotificacao,
  idNotificacao,
  marcoDeVencimento,
  fimDoDia,
  rotaSegura,
} from "./regras";

/**
 * Transforma o estado financeiro de um usuário na lista de avisos do dia.
 * Puro: o cron carrega os dados, isto decide, o worker entrega.
 *
 * Cada evento tem id determinístico (ver `idNotificacao`) e prazo de
 * validade: rodar de novo no mesmo dia gera os mesmos ids (nada duplica) e
 * aviso vencido não é mais entregue.
 */

export interface Evento {
  id: string;
  tipo: TipoNotificacao;
  conteudo: ConteudoNotificacao;
  /** Dia a que o aviso se refere ("AAAA-MM-DD"). */
  diaLocal: string;
  /** Depois disso o aviso não é mais útil e não é entregue. */
  validoAte: number;
  /** Valor estimado (fatura prevista), não confirmado. */
  estimado?: boolean;
}

export interface DadosDoUsuario extends Omit<DadosFinanceiros, "mes" | "estaPago"> {
  saldo: { valor: number; atualizadoEm: number; reservaMeta?: number } | null;
  pagamentos: Array<MovimentoPagamento & { id: string }>;
  /** Guardar/resgatar caixinha (podem faltar em dados antigos de teste). */
  transferencias?: Transferencia[];
  diasComComissao: Set<string>;
}

function diasEntre(deISO: string, ateISO: string): number {
  const [a1, m1, d1] = deISO.split("-").map(Number);
  const [a2, m2, d2] = ateISO.split("-").map(Number);
  return Math.round((new Date(a2, m2 - 1, d2).getTime() - new Date(a1, m1 - 1, d1).getTime()) / 86400000);
}

function textoVencimento(e: FinancialEntry, dias: number): ConteudoNotificacao {
  const quando = dias === 0 ? "vence hoje" : dias === 1 ? "vence amanhã" : `vence em ${dias} dias`;
  const nome = e.description.replace(/ \((prevista|valor a confirmar)\)$/, "");
  return {
    titulo: `${nome} ${quando}`,
    corpo: e.estimado
      ? `Valor estimado ${formatarMoeda(e.amount)} (parcelas e assinaturas já conhecidas). Lance o valor real da fatura.`
      : `${formatarMoeda(e.amount)}${dias === 0 ? " — hoje é o último dia." : "."}`,
    url: e.source === "card_bill" ? "/fatura" : "/checklist",
  };
}

/**
 * Vencimentos dos próximos 5 dias por DATA EFETIVA, olhando o mês atual, o
 * seguinte e o anterior (auditoria N05): a fatura que vence dia 2 do mês
 * que vem é avisada no fim deste mês, e a de setembro adiada pra 1º de
 * outubro continua acompanhada em outubro.
 */
export function eventosDeVencimento(dados: DadosDoUsuario, hojeISO: string): Evento[] {
  const mesHoje = hojeISO.slice(0, 7);
  const idsPagos = new Set(dados.pagamentos.map((p) => p.id));
  const eventos: Evento[] = [];

  for (const mes of [mesAnteriorDe(mesHoje), mesHoje, mesSeguinte(mesHoje)]) {
    const entries = construirFinancialEntries({
      ...dados,
      mes,
      estaPago: (origem, id) => idsPagos.has(`${mes}__${origem}__${id}`),
      hojeISO,
    });
    for (const e of entries) {
      if (e.type !== "expense" || e.status !== "pending") continue;
      if (e.source !== "card_bill" && e.source !== "fixed_cost") continue;
      const dias = diasEntre(hojeISO, e.dueDate);
      const marco = marcoDeVencimento(dias);
      if (!marco) continue;
      eventos.push({
        id: idNotificacao("vencimento", e.id, e.dueDate, marco),
        tipo: "vencimento",
        conteudo: textoVencimento(e, dias),
        diaLocal: hojeISO,
        validoAte: fimDoDia(e.dueDate),
        estimado: e.estimado,
      });
    }
  }
  return eventos;
}

/** Todos os avisos do dia pra um usuário. */
export function eventosDoDia(dados: DadosDoUsuario, hojeISO: string): Evento[] {
  const eventos: Evento[] = [];
  const mes = hojeISO.slice(0, 7);
  const validoHoje = fimDoDia(hojeISO);

  const doTexto = (tipo: TipoNotificacao, origem: string, n: { title: string; body: string; url: string }): Evento => ({
    id: idNotificacao(tipo, origem, hojeISO),
    tipo,
    conteudo: { titulo: n.title, corpo: n.body, url: rotaSegura(n.url) },
    diaLocal: hojeISO,
    validoAte: validoHoje,
  });

  if (dados.saldo && saldoEstaVelho(dados.saldo.atualizadoEm, hojeISO)) {
    // saldo de outro mês: mandar orçamento seria mandar número errado com cara de certo
    eventos.push(
      doTexto("saldo_desatualizado", "saldo", {
        title: "Atualize seu saldo",
        body: "Um mês novo começou. Informe quanto tem na conta hoje e siga construindo.",
        url: "/saldo",
      })
    );
  } else if (dados.saldo) {
    // MESMO contrato da tela (docs/modelo-financeiro.md) — tela e push iguais.
    // Linguagem de abundância (lib/abundancia.ts): sem limite diário e sem
    // alerta de ritmo — a pedido do dono.
    const gastos: Gasto[] = dados.gastos;
    const saldoAtual = saldoConfirmado(
      dados.saldo,
      gastos,
      dados.pagamentos,
      recebimentosAvulsos(dados.ganhos),
      dados.transferencias ?? []
    );
    if (saldoAtual !== null) {
      eventos.push(
        doTexto(
          "saldo_diario",
          "saldo",
          notificacaoDoDia({
            hojeISO,
            saldoAtual,
            investidoNoMes: resumoGastosDiarios(gastos, mes, hojeISO).total,
          })
        )
      );
    }
  }

  const comissao = avisoComissaoEsquecida(dados.diasComComissao, hojeISO);
  if (comissao) eventos.push(doTexto("comissao", "comissao", comissao));

  // checklist parado: pensado pro dia 8; se o cron falhou no dia 8, ainda
  // vale até o dia 12 — com id por mês, sai uma vez só
  const diaDoMes = Number(hojeISO.split("-")[2]);
  if (diaDoMes >= 8 && diaDoMes <= 12) {
    const contasAtivas = dados.contas.filter((c) => c.ativa).length;
    const pagosNoMes = dados.pagamentos.filter((p) => p.id.startsWith(`${mes}__`)).length;
    const aviso = avisoChecklistParado(contasAtivas, pagosNoMes, `${mes}-08`);
    if (aviso) {
      eventos.push({
        ...doTexto("checklist", "checklist", aviso),
        id: idNotificacao("checklist", "checklist", mes),
      });
    }
  }

  eventos.push(...eventosDeVencimento(dados, hojeISO));
  return eventos;
}
