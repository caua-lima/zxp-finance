import {
  FinancialEntry,
  FinancialEntryStatus,
  formatarMoeda,
  Gasto,
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
 * Soma só o que ainda está pendente (planned/pending) de um tipo, na
 * competência informada. Base de "entradas previstas" e "compromissos
 * pendentes" — nunca inclui o que já foi recebido/pago, porque isso já
 * está refletido no saldo real e somar de novo seria contar duas vezes.
 */
function somaPendentePorTipo(
  entries: FinancialEntry[],
  competenceMonth: string,
  type: FinancialEntry["type"]
): number {
  return entries
    .filter(
      (e) =>
        e.competenceMonth === competenceMonth &&
        e.type === type &&
        isEntryPending(e) &&
        isEntryActive(e)
    )
    .reduce((acc, e) => acc + e.amount, 0);
}

/** Ganhos do mês ainda não recebidos — não inclui o que já está no saldo real. */
export function calculatePendingIncome(
  entries: FinancialEntry[],
  competenceMonth: string
): number {
  return somaPendentePorTipo(entries, competenceMonth, "income");
}

/** Despesas do mês ainda não pagas — não inclui o que já saiu do saldo real. */
export function calculatePendingExpenses(
  entries: FinancialEntry[],
  competenceMonth: string
): number {
  return somaPendentePorTipo(entries, competenceMonth, "expense");
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
  return (
    saldoReal +
    calculatePendingIncome(entries, competenceMonth) -
    calculatePendingExpenses(entries, competenceMonth)
  );
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
function proximoDiaISO(diaISO: string): string {
  const [ano, mes, dia] = diaISO.split("-").map(Number);
  // Construtor local (ano, mês, dia) — nunca faz parse de string como UTC,
  // diferente de `new Date(diaISO)`. Sem isso o loop abaixo herdava o
  // mesmo bug de fuso horário do resto do app.
  const d = new Date(ano, mes - 1, dia + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function calculateDailyCashFlow(
  entries: FinancialEntry[],
  deISO: string,
  ateISO: string,
  saldoInicial: number
): PontoFluxoDiario[] {
  const dias: PontoFluxoDiario[] = [];
  let cursor = deISO;
  while (cursor <= ateISO) {
    dias.push({ data: cursor, entradas: 0, saidas: 0, saldoAcumulado: 0 });
    cursor = proximoDiaISO(cursor);
  }
  const porDia = new Map(dias.map((d) => [d.data, d]));

  for (const e of entries) {
    if (!isEntryActive(e)) continue;
    // paidAt é timestamp completo (com hora) — precisa converter pro dia
    // certo no fuso de Brasília, não cortar a string UTC direto.
    const dia = e.paidAt ? diaISOde(new Date(e.paidAt).getTime()) : e.dueDate.slice(0, 10);
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

export interface DreBreakdown {
  receitaOperacional: number;
  reembolsos: number; // separado da receita operacional, regra da Fase 7
  despesasVariaveis: number; // gastos do dia a dia + ajustes de conciliação
  despesasRecorrentes: number; // contas fixas + assinaturas
  parcelasCartao: number; // parcelas + fatura do cartão, já sem duplicidade (naFatura fica de fora no adapter)
  resultadoOperacional: number;
}

/**
 * Quebra do DRE a partir do FinancialEntry[] já filtrado por competência.
 * "Resultado operacional pessoal" = receita operacional (sem reembolso)
 * menos as três categorias de despesa. O app não modela transações de
 * investimento/retirada separadamente, então não existe uma linha de
 * "variação financeira" abaixo disso — seria inventar dado que não existe.
 */
export function calculateDreBreakdown(entries: FinancialEntry[]): DreBreakdown {
  const ativos = entries.filter(isEntryActive);
  const receitas = ativos.filter((e) => e.type === "income");
  const despesas = ativos.filter((e) => e.type === "expense");

  const reembolsos = receitas
    .filter((e) => e.categoryId === "Reembolsos")
    .reduce((acc, e) => acc + e.amount, 0);
  const receitaOperacional =
    receitas.reduce((acc, e) => acc + e.amount, 0) - reembolsos;

  const despesasVariaveis = despesas
    .filter((e) => e.source === "manual" || e.source === "adjustment")
    .reduce((acc, e) => acc + e.amount, 0);
  const despesasRecorrentes = despesas
    .filter((e) => e.source === "fixed_cost" || e.source === "subscription")
    .reduce((acc, e) => acc + e.amount, 0);
  const parcelasCartao = despesas
    .filter((e) => e.source === "installment" || e.source === "card_bill")
    .reduce((acc, e) => acc + e.amount, 0);

  const resultadoOperacional =
    receitaOperacional - despesasVariaveis - despesasRecorrentes - parcelasCartao;

  return {
    receitaOperacional,
    reembolsos,
    despesasVariaveis,
    despesasRecorrentes,
    parcelasCartao,
    resultadoOperacional,
  };
}

const FUSO_PADRAO = "America/Sao_Paulo";

/**
 * Data de hoje no fuso do Brasil, como "AAAA-MM-DD". Existe porque
 * `Date.toISOString()` é sempre UTC — entre ~21h e meia-noite (horário de
 * Brasília) o UTC já virou o dia seguinte, então usar `toISOString()` pra
 * "hoje" faz o app achar que já é amanhã enquanto ainda é hoje pra quem
 * está usando. Com `Intl.DateTimeFormat` + timeZone explícito isso não
 * depende do fuso da máquina (funciona igual no browser do usuário e no
 * servidor da Vercel, que roda em UTC).
 */
export function hojeISO(fuso: string = FUSO_PADRAO): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Mesma conversão de `hojeISO`, mas pra um timestamp já existente (ex: `criadoEm` de um gasto). */
export function diaISOde(timestamp: number, fuso: string = FUSO_PADRAO): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

/**
 * Dias restantes no mês de `hojeISO`, contando hoje. Dia 31 de um mês de
 * 31 dias devolve 1, não 0 — hoje ainda é um dia pra gastar.
 */
export function diasRestantesNoMes(hojeISO: string): number {
  const [ano, mes, dia] = hojeISO.split("-").map(Number);
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return ultimoDia - dia + 1;
}

/**
 * Quanto dá pra gastar por dia até o fim do mês, mantendo a reserva
 * desejada. Recalcula sozinho a cada gasto novo: o saldo atual desce (já
 * descontando o gasto) e os dias restantes também encolhem dia a dia —
 * as duas coisas puxam o número pra baixo com o tempo, do jeito que a
 * pessoa realmente vai gastando o mês.
 */
export function calculateGastavelPorDia(
  saldoAtual: number | null,
  reservaMeta: number,
  diasRestantes: number
): number | null {
  if (saldoAtual === null || diasRestantes <= 0) return null;
  return (saldoAtual - reservaMeta) / diasRestantes;
}

/**
 * Total de gastos de um dia específico, pra calcular "ainda pode gastar
 * hoje". Deliberadamente ignora ajuste de conciliação (`ajusteConciliacaoId`):
 * esse valor já foi descontado do saldo real no momento da conferência
 * (é por isso que `saldoAtual`/`calculateGastavelPorDia` já ficam mais
 * baixos dali pra frente) — contar ele de novo aqui subtrairia a mesma
 * correção duas vezes, e um ajuste normalmente cobre semanas de gasto
 * não lançado, não "gasto de hoje" especificamente.
 */
export function calculateGastoDoDia(gastos: Gasto[], diaISO: string): number {
  return gastos
    .filter((g) => diaISOde(g.criadoEm) === diaISO && !g.ajusteConciliacaoId)
    .reduce((acc, g) => acc + g.valor, 0);
}

export function formatMoney(valor: number): string {
  return formatarMoeda(valor);
}

export function formatPercent(valor: number, casas = 0): string {
  return `${valor.toFixed(casas)}%`;
}
