export type TipoGanho = "recorrente" | "pontual";

export interface Ganho {
  id: string;
  tipo: TipoGanho;
  mes?: string; // "2026-07" — só existe quando tipo === "pontual"
  ativo?: boolean; // só relevante quando tipo === "recorrente"
  arquivado?: boolean; // só relevante quando tipo === "pontual"
  recebido?: boolean; // só relevante quando tipo === "pontual" (já é mês-específico)
  recebidoEm?: number;
  categoriaReceita?: string; // ver CATEGORIAS_RECEITA em categoriasFinanceiras.ts
  descricao: string;
  valor: number;
  semImposto?: boolean; // true pra renda que já chega líquida (ex: bico, trabalho por fora) — não desconta o imposto padrão dela
  criadoEm: number;
}

export interface ContaFixa {
  id: string;
  nome: string;
  valor: number;
  categoria: string;
  ativa: boolean;
  diaVencimento?: number; // 1-31, opcional — sem isso o app assume fim do mês
  criadoEm: number;
}

export function diaVencimentoNoMes(mes: string, diaVencimento: number): string {
  const [ano, m] = mes.split("-").map(Number);
  const ultimoDia = new Date(ano, m, 0).getDate();
  const dia = Math.min(Math.max(1, diaVencimento), ultimoDia);
  return `${mes}-${String(dia).padStart(2, "0")}`;
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

export type UsoPercebidoAssinatura = "essencial" | "util" | "revisar";

export interface Assinatura {
  id: string;
  nome: string;
  valor: number;
  ativa: boolean;
  cartao?: string; // qual dos CARTOES_PREDEFINIDOS ela é cobrada
  naFatura?: boolean; // já contabilizada dentro do valor lançado em "Fatura do cartão" — não soma de novo
  diaRenovacao?: number; // 1-31, opcional — sem isso o app assume fim do mês
  usoPercebido?: UsoPercebidoAssinatura;
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

export interface PerfilUsuario {
  idade?: number;
  pessoasNaCasa?: number; // quantas pessoas moram na casa, contando você — base pra dividir benchmark per capita
  moraSozinho?: boolean;
  contasProprias?: string; // texto livre: o que é responsabilidade sua vs. dividida/de outra pessoa
  rendaAproximada?: number;
  atualizadoEm: number;
}

export interface MonthClose {
  month: string;
  status: "open" | "closed";
  closedAt?: number;
  closedBy?: string;
  notes?: string;
  snapshot?: {
    income: number;
    expenses: number;
    result: number;
  };
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

// hojeISO()/diaISOde() (fuso de Brasília, pra "hoje"/"que dia é esse
// timestamp") moraram em src/lib/finance/calculations.ts — não duplicar
// aqui.

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

export function mesSeguinte(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(ano, m, 1); // m já é o índice do mês seguinte (m é 1-indexado)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function mesAnteriorDe(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(ano, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Quantas parcelas faltam pra `parcela`, no mês `mes`. Devolve 0 quando
 * `mes` é anterior ao `mesReferencia` da parcela — ela ainda não começou
 * (ou já foi dada baixa até esse ponto) e não deve contar como compromisso
 * ativo desse mês em nenhum lugar (checklist, DRE, Agenda/Home). Antes,
 * meses antes da referência devolviam a contagem cheia, o que fazia uma
 * parcela cujo início era só no mês seguinte aparecer como "parcela 1"
 * já no mês atual, em toda tela que usa essa função.
 */
export function parcelasRestantesEm(parcela: Parcela, mes: string): number {
  const referencia = parcela.mesReferencia ?? mesPadrao();
  const decorridos = diferencaMeses(referencia, mes);
  if (decorridos < 0) return 0;
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

// Soma/subtração de dinheiro em ponto flutuante acumula resíduo binário
// (ex: 277.32000000000016, visto de verdade em produção numa conciliação).
// Arredondar pra centavo no ponto de saída de qualquer cálculo evita esse
// resíduo se propagar/compostar por saldo, conciliação, gastável-por-dia etc.
export function arredondarCentavos(valor: number): number {
  return Math.round(valor * 100) / 100;
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
