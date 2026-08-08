export type TipoGanho = "recorrente" | "pontual";

export interface Ganho {
  id: string;
  tipo: TipoGanho;
  mes?: string; // "2026-07" — só existe quando tipo === "pontual"
  ativo?: boolean; // só relevante quando tipo === "recorrente"
  arquivado?: boolean; // só relevante quando tipo === "pontual"
  descricao: string;
  valor: number;
  criadoEm: number;
}

export interface ContaFixa {
  id: string;
  nome: string;
  valor: number;
  categoria: string;
  ativa: boolean;
  criadoEm: number;
}

export type TipoParcela = "cartao" | "financiamento";

export interface Parcela {
  id: string;
  tipo: TipoParcela;
  nome: string;
  valorParcela: number;
  totalParcelas: number;
  parcelasRestantes: number;
  dividida?: boolean; // você paga só metade do valorParcela (ex: dividido com outra pessoa)
  cartao?: string; // qual dos CARTOES_PREDEFINIDOS ela é cobrada (só quando tipo === "cartao")
  naFatura?: boolean; // já contabilizada dentro do valor lançado em "Fatura do cartão" — não soma de novo
  mesReferencia?: string; // mês em que "parcelasRestantes" é válido
  criadoEm: number;
}

export function valorMinhaParte(parcela: Parcela): number {
  return parcela.dividida ? parcela.valorParcela / 2 : parcela.valorParcela;
}

export interface Assinatura {
  id: string;
  nome: string;
  valor: number;
  ativa: boolean;
  cartao?: string; // qual dos CARTOES_PREDEFINIDOS ela é cobrada
  naFatura?: boolean; // já contabilizada dentro do valor lançado em "Fatura do cartão" — não soma de novo
  criadoEm: number;
}

export interface FaturaCartao {
  id: string;
  nome: string;
  valor: number;
  mes: string;
  criadoEm: number;
}

export interface Gasto {
  id: string;
  descricao: string;
  valor: number;
  categoria: string;
  mes: string;
  criadoEm: number;
  estornado?: boolean; // true no lançamento original, depois que foi estornado
  estornadoEm?: number;
  estornoDeId?: string; // presente só na entrada de estorno — aponta pro gasto original
  ajusteConciliacaoId?: string; // presente só em gasto criado por ajuste de conciliação
}

export interface Conciliacao {
  id: string;
  dataISO: string;
  saldoInformado: number;
  saldoEsperado: number;
  diferenca: number;
  ajusteCriado: boolean;
  responsavelUid: string;
  responsavelEmail?: string;
  criadoEm: number;
}

export function mesAtual(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Nenhum mês antes deste fica visível no app, mesmo que o mês real seja anterior.
export const MES_MINIMO = "2026-08";

export function mesPadrao(): string {
  const atual = mesAtual();
  return atual > MES_MINIMO ? atual : MES_MINIMO;
}

export function diferencaMeses(de: string, para: string): number {
  const [anoDe, mesDe] = de.split("-").map(Number);
  const [anoPara, mesPara] = para.split("-").map(Number);
  return (anoPara - anoDe) * 12 + (mesPara - mesDe);
}

export function parcelasRestantesEm(parcela: Parcela, mes: string): number {
  const referencia = parcela.mesReferencia ?? mesPadrao();
  const decorridos = Math.max(0, diferencaMeses(referencia, mes));
  return Math.max(0, parcela.parcelasRestantes - decorridos);
}

export function formatarMes(mes: string): string {
  const [ano, m] = mes.split("-");
  const nomes = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${nomes[parseInt(m, 10) - 1]} de ${ano}`;
}

export function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Desconto padrão sobre tudo que é emitido (nota/recibo) — salário + comissões.
export const TAXA_IMPOSTO = 0.06;

export function calcularImposto(valorBruto: number): number {
  return valorBruto * TAXA_IMPOSTO;
}

// ---------------------------------------------------------------------------
// Modelo financeiro consolidado (FinancialEntry)
//
// As coleções antigas (ganhos, contasFixas, assinaturas, parcelas,
// faturasCartao, gastos) continuam sendo a fonte de dados real no Firestore.
// FinancialEntry é uma visão unificada, montada em memória por
// src/lib/finance/adapters.ts, usada pra alimentar a Home, a Agenda e os
// cálculos de saldo/fluxo de caixa sem precisar migrar nada.
// ---------------------------------------------------------------------------

export type FinancialEntryType = "income" | "expense" | "transfer";

export type FinancialEntryStatus =
  | "planned"
  | "pending"
  | "paid"
  | "received"
  | "cancelled"
  | "archived";

export type FinancialEntrySource =
  | "manual"
  | "income"
  | "fixed_cost"
  | "subscription"
  | "installment"
  | "card_bill"
  | "adjustment"
  | "transfer";

export interface AuditLog {
  id: string;
  action:
    | "created"
    | "updated"
    | "archived"
    | "cancelled"
    | "reversed"
    | "paid"
    | "received"
    | "reconciled"
    | "closed_month";
  entityType: string;
  entityId: string;
  summary: string;
  actorUid: string;
  actorEmail?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: number;
}

export interface FinancialEntry {
  id: string;
  type: FinancialEntryType;
  status: FinancialEntryStatus;
  amount: number;
  dueDate: string; // "YYYY-MM-DD"
  paidAt?: string; // ISO
  competenceMonth: string; // "YYYY-MM"
  description: string;
  categoryId: string;
  accountId?: string;
  cardId?: string;
  installmentId?: string;
  recurrenceId?: string;
  source: FinancialEntrySource;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
  cancelledAt?: number;
  cancelledReason?: string;
}
