import { Gasto, arredondarCentavos } from "@/lib/types";
import { diaISOde, diasRestantesNoMes } from "./calculations";

/**
 * Projeção de ritmo — a parte "GPS" do app.
 *
 * O orçamento diário responde "quanto posso gastar hoje". Isso sozinho não
 * avisa que você está indo rápido demais: dá pra estourar todo dia um
 * pouquinho e só descobrir no dia 25. Aqui a conta é a inversa — pega o
 * ritmo que você já teve neste mês e projeta onde ele te deixa no dia 30.
 */

/** Gastos do mês que contam como "consumo": ignora ajuste de conciliação. */
function gastosReais(gastos: Gasto[], mes: string): Gasto[] {
  return gastos.filter((g) => g.mes === mes && !g.ajusteConciliacaoId);
}

export interface ProjecaoRitmo {
  /** Média diária considerando os dias já decorridos do mês. */
  gastoMedioDiario: number;
  /** Quanto sobraria no fim do mês mantendo exatamente esse ritmo. */
  sobraProjetada: number;
  /** A sobra projetada alcança a meta de reserva? */
  batendoMeta: boolean;
  /** Dia em que o saldo zera, se isso acontece antes do fim do mês. */
  diaQueZera: string | null;
  /** Quantos dias o saldo ainda aguenta no ritmo atual. */
  diasQueAguenta: number | null;
}

/**
 * Projeta o fim do mês a partir do ritmo já praticado.
 *
 * `diasDecorridos` conta o dia de hoje — gastar R$100 hoje, dia 1, é um
 * ritmo de R$100/dia, não de infinito. Devolve null quando não há base pra
 * projetar (sem saldo informado, ou nenhum dia decorrido).
 */
export function projetarRitmo(
  saldoAtual: number | null,
  reservaMeta: number,
  gastos: Gasto[],
  mes: string,
  hojeISO: string
): ProjecaoRitmo | null {
  if (saldoAtual === null) return null;

  const diaDoMes = Number(hojeISO.split("-")[2]);
  if (!diaDoMes || diaDoMes < 1) return null;

  const totalGasto = gastosReais(gastos, mes).reduce((acc, g) => acc + g.valor, 0);
  const gastoMedioDiario = arredondarCentavos(totalGasto / diaDoMes);

  const diasRestantes = diasRestantesNoMes(hojeISO);
  // diasRestantes inclui hoje; a projeção olha pra frente a partir de amanhã,
  // porque o gasto de hoje já está dentro de saldoAtual.
  const diasAFrente = Math.max(0, diasRestantes - 1);
  const sobraProjetada = arredondarCentavos(saldoAtual - gastoMedioDiario * diasAFrente);

  let diaQueZera: string | null = null;
  let diasQueAguenta: number | null = null;
  if (gastoMedioDiario > 0) {
    const dias = Math.floor(saldoAtual / gastoMedioDiario);
    diasQueAguenta = Math.max(0, dias);
    if (dias < diasAFrente) {
      const [ano, m] = hojeISO.split("-").map(Number);
      const d = new Date(ano, m - 1, diaDoMes + dias);
      diaQueZera = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
    }
  }

  return {
    gastoMedioDiario,
    sobraProjetada,
    batendoMeta: sobraProjetada >= reservaMeta,
    diaQueZera,
    diasQueAguenta,
  };
}

// --- dias da semana e marcos do mês -----------------------------------------
// Sempre pelo construtor local de Date (nunca parse de string como UTC), pelo
// mesmo motivo do resto do app: "2026-09-04" vira meia-noite em UTC, que em
// Brasília ainda é dia 3.

function dataLocal(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

/** 0 = domingo, 5 = sexta, 6 = sábado. */
export function diaDaSemana(iso: string): number {
  return dataLocal(iso).getDay();
}

export function ehSexta(iso: string): boolean {
  return diaDaSemana(iso) === 5;
}

export function ehDomingo(iso: string): boolean {
  return diaDaSemana(iso) === 0;
}

export function ehUltimoDiaDoMes(iso: string): boolean {
  return diasRestantesNoMes(iso) === 1;
}

export function ehPrimeiroDiaUtilDoMes(iso: string): boolean {
  return Number(iso.split("-")[2]) === 1;
}

// --- resumo da semana --------------------------------------------------------

export interface ResumoSemana {
  total: number;
  categoriaTop: string | null;
  valorTop: number;
  dias: number;
}

/**
 * Soma os gastos dos últimos 7 dias (contando hoje) e aponta a categoria que
 * mais pesou. Base do resumo de domingo — o momento natural de olhar pra trás
 * antes de começar outra semana.
 */
export function resumoDaSemana(gastos: Gasto[], hojeISO: string): ResumoSemana {
  const hoje = dataLocal(hojeISO);
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - 6);

  const daSemana = gastos.filter((g) => {
    if (g.ajusteConciliacaoId) return false;
    const dia = dataLocal(diaISOde(g.criadoEm));
    return dia >= inicio && dia <= hoje;
  });

  const porCategoria = new Map<string, number>();
  for (const g of daSemana) {
    porCategoria.set(g.categoria, (porCategoria.get(g.categoria) ?? 0) + g.valor);
  }

  let categoriaTop: string | null = null;
  let valorTop = 0;
  for (const [categoria, valor] of porCategoria) {
    if (valor > valorTop) {
      categoriaTop = categoria;
      valorTop = valor;
    }
  }

  return {
    total: arredondarCentavos(daSemana.reduce((acc, g) => acc + g.valor, 0)),
    categoriaTop,
    valorTop: arredondarCentavos(valorTop),
    dias: 7,
  };
}

/**
 * Quanto sobra pra atravessar o fim de semana (sexta, sábado e domingo)
 * mantendo a meta de reserva. Usado no aviso de sexta — é onde orçamento
 * costuma morrer, e ver o valor dos 3 dias juntos evita gastar tudo na sexta.
 */
export function orcamentoDoFimDeSemana(gastavelPorDia: number | null): number | null {
  if (gastavelPorDia === null) return null;
  return arredondarCentavos(gastavelPorDia * 3);
}
