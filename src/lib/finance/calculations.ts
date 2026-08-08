import {
  FinancialEntry,
  FinancialEntryStatus,
  formatarMoeda,
} from "@/lib/types";

/**
 * Helpers puros de cálculo financeiro. Nada aqui toca Firestore/React —
 * tudo recebe FinancialEntry[] já montado (ver src/lib/finance/adapters.ts)
 * e devolve números/listas simples, fáceis de testar.
 */

export function getCompetenceMonth(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const STATUS_PENDENTE: FinancialEntryStatus[] = ["planned", "pending"];
const STATUS_LIQUIDADO: FinancialEntryStatus[] = ["paid", "received"];

export function isEntryPending(entry: FinancialEntry): boolean {
  return STATUS_PENDENTE.includes(entry.status);
}

export function isEntryPaid(entry: FinancialEntry): boolean {
  return STATUS_LIQUIDADO.includes(entry.status);
}

export function isEntryActive(entry: FinancialEntry): boolean {
  return entry.status !== "cancelled" && entry.status !== "archived";
}

export function ultimoDiaMes(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  const ultimoDia = new Date(ano, m, 0).getDate();
  return `${mes}-${String(ultimoDia).padStart(2, "0")}`;
}

/**
 * Saldo disponível hoje: só o que está realmente conciliado (ex: saldo
 * do Mercado Pago informado pelo usuário). Nunca soma previsto — regra
 * crítica #4 do briefing.
 */
export function calculateAvailableBalance(
  saldoReal: number | null
): number | null {
  return saldoReal;
}

/**
 * Saldo disponível + entradas previstas ainda não recebidas − compromissos
 * pendentes ainda não pagos, todos dentro da competência informada.
 */
export function calculateProjectedBalance(
  saldoReal: number | null,
  entries: FinancialEntry[],
  competenceMonth: string
): number | null {
  if (saldoReal === null) return null;
  const doMes = entries.filter(
    (e) => e.competenceMonth === competenceMonth && isEntryActive(e)
  );
  const entradasPrevistas = doMes
    .filter((e) => e.type === "income" && isEntryPending(e))
    .reduce((acc, e) => acc + e.amount, 0);
  const compromissosPendentes = doMes
    .filter((e) => e.type === "expense" && isEntryPending(e))
    .reduce((acc, e) => acc + e.amount, 0);
  return saldoReal + entradasPrevistas - compromissosPendentes;
}

export interface MonthlyCashFlow {
  income: number;
  expenses: number;
  result: number;
}

export function calculateMonthlyCashFlow(
  entries: FinancialEntry[],
  competenceMonth: string
): MonthlyCashFlow {
  const doMes = entries.filter(
    (e) => e.competenceMonth === competenceMonth && isEntryActive(e)
  );
  const income = doMes
    .filter((e) => e.type === "income")
    .reduce((acc, e) => acc + e.amount, 0);
  const expenses = doMes
    .filter((e) => e.type === "expense")
    .reduce((acc, e) => acc + e.amount, 0);
  return { income, expenses, result: income - expenses };
}

/**
 * Compromissos (despesas pendentes) com vencimento entre `deISO` e
 * `deISO + dias`, ordenados por data. Usado pra "próximos 7/15/30 dias".
 */
export function calculateUpcomingCommitments(
  entries: FinancialEntry[],
  deISO: string,
  dias: number
): FinancialEntry[] {
  const inicio = new Date(deISO);
  const fim = new Date(deISO);
  fim.setDate(fim.getDate() + dias);
  return entries
    .filter(
      (e) =>
        e.type === "expense" &&
        isEntryPending(e) &&
        isEntryActive(e) &&
        new Date(e.dueDate) >= inicio &&
        new Date(e.dueDate) <= fim
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/**
 * Compromissos pendentes com vencimento já passado em relação a `hojeISO`.
 */
export function calculateOverdueEntries(
  entries: FinancialEntry[],
  hojeISO: string
): FinancialEntry[] {
  const hoje = new Date(hojeISO);
  return entries
    .filter(
      (e) =>
        e.type === "expense" &&
        isEntryPending(e) &&
        isEntryActive(e) &&
        new Date(e.dueDate) < hoje
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/**
 * Receita prevista cuja data esperada já passou e ainda não foi marcada
 * como recebida — só existe pra ganhos, porque é o único tipo de entry
 * com rastreamento real de recebido/previsto (ver Ganho.recebido).
 */
export function calculateOverdueIncome(
  entries: FinancialEntry[],
  hojeISO: string
): FinancialEntry[] {
  const hoje = new Date(hojeISO);
  return entries
    .filter(
      (e) =>
        e.type === "income" &&
        isEntryPending(e) &&
        isEntryActive(e) &&
        new Date(e.dueDate) < hoje
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export interface PontoFluxoDiario {
  data: string; // "YYYY-MM-DD"
  entradas: number;
  saidas: number;
  saldoAcumulado: number;
}

/**
 * Fluxo diário entre `deISO` e `ateISO` (inclusive). Cada entry contribui no
 * dia em que o dinheiro efetivamente muda de mão: `paidAt`/`dueDate` quando
 * já liquidado, ou `dueDate` quando ainda previsto — é a melhor
 * granularidade possível até as contas fixas terem dia de vencimento real
 * (Fase 6).
 */
export function calculateDailyCashFlow(
  entries: FinancialEntry[],
  deISO: string,
  ateISO: string,
  saldoInicial: number
): PontoFluxoDiario[] {
  const dias: PontoFluxoDiario[] = [];
  const cursor = new Date(deISO);
  const fim = new Date(ateISO);
  while (cursor <= fim) {
    const data = cursor.toISOString().slice(0, 10);
    dias.push({ data, entradas: 0, saidas: 0, saldoAcumulado: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  const porDia = new Map(dias.map((d) => [d.data, d]));

  for (const e of entries) {
    if (!isEntryActive(e)) continue;
    const dia = (e.paidAt ?? e.dueDate).slice(0, 10);
    const ponto = porDia.get(dia);
    if (!ponto) continue;
    if (e.type === "income") ponto.entradas += e.amount;
    else if (e.type === "expense") ponto.saidas += e.amount;
  }

  let acumulado = saldoInicial;
  for (const d of dias) {
    acumulado += d.entradas - d.saidas;
    d.saldoAcumulado = acumulado;
  }
  return dias;
}

/**
 * Status "de vitrine": igual ao status real, exceto que pendente com
 * vencimento no passado vira "overdue" só pra exibição (o dado guardado
 * continua "pending" — atraso é derivado da data, não é um estado próprio).
 */
export function deriveDisplayStatus(
  entry: FinancialEntry,
  hojeISO: string
): FinancialEntryStatus | "overdue" {
  if (isEntryPending(entry) && new Date(entry.dueDate) < new Date(hojeISO)) {
    return "overdue";
  }
  return entry.status;
}

const LABEL_ORIGEM: Record<FinancialEntry["source"], string> = {
  manual: "Manual",
  income: "Ganho",
  fixed_cost: "Conta fixa",
  subscription: "Assinatura",
  installment: "Parcela",
  card_bill: "Fatura",
  adjustment: "Ajuste",
  transfer: "Transferência",
};

export function labelOrigem(source: FinancialEntry["source"]): string {
  return LABEL_ORIGEM[source];
}

export function formatMoney(valor: number): string {
  return formatarMoeda(valor);
}

export function formatPercent(valor: number, casas = 0): string {
  return `${valor.toFixed(casas)}%`;
}
