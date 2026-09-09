import { diaVencimentoNoMes } from "@/lib/types";

/**
 * Calendário bancário brasileiro.
 *
 * Fatura que cai em sábado, domingo ou feriado não vence naquele dia — o
 * banco só processa no próximo dia útil, e é nesse dia que ela realmente
 * vence. Sem isso o app marcava como atrasada uma fatura que ainda estava
 * no prazo: no dia 6/9/2026 (domingo), com 7/9 (Independência) na segunda,
 * a fatura de vencimento 6 só vence mesmo na terça, dia 8.
 */

/** Domingo de Páscoa pelo algoritmo de Meeus/Jones/Butcher. */
function domingoDePascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function paraISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function somarDias(base: Date, dias: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + dias);
}

const cache = new Map<number, Set<string>>();

/**
 * Dias em que o banco não processa, no ano informado.
 *
 * São os feriados nacionais fixos mais os móveis que dependem da Páscoa.
 * Carnaval (segunda e terça) entra mesmo não sendo feriado nacional por
 * lei — é ponto facultativo — porque banco não abre, e o que importa aqui
 * é quando a fatura é processada, não o que diz o papel.
 *
 * Feriado estadual e municipal fica de fora de propósito: são centenas,
 * mudam por cidade, e errar pra mais adiaria um vencimento que na verdade
 * não adiou. Ficar no calendário nacional erra sempre pro lado seguro.
 *
 * Consciência Negra (20/11) entrou como feriado nacional pela Lei
 * 14.759/2023, valendo a partir de 2024.
 */
export function feriadosBancarios(ano: number): Set<string> {
  const cacheado = cache.get(ano);
  if (cacheado) return cacheado;

  const fixos = [
    `${ano}-01-01`, // Confraternização Universal
    `${ano}-04-21`, // Tiradentes
    `${ano}-05-01`, // Dia do Trabalho
    `${ano}-09-07`, // Independência
    `${ano}-10-12`, // Nossa Senhora Aparecida
    `${ano}-11-02`, // Finados
    `${ano}-11-15`, // Proclamação da República
    `${ano}-12-25`, // Natal
  ];
  if (ano >= 2024) fixos.push(`${ano}-11-20`); // Consciência Negra

  const pascoa = domingoDePascoa(ano);
  const moveis = [
    paraISO(somarDias(pascoa, -48)), // segunda de Carnaval
    paraISO(somarDias(pascoa, -47)), // terça de Carnaval
    paraISO(somarDias(pascoa, -2)), // Sexta-feira Santa
    paraISO(somarDias(pascoa, 60)), // Corpus Christi
  ];

  const conjunto = new Set([...fixos, ...moveis]);
  cache.set(ano, conjunto);
  return conjunto;
}

/** Nome do feriado, quando a data for um. Só pra explicar o adiamento na tela. */
export function nomeDoFeriado(iso: string): string | null {
  const [ano] = iso.split("-").map(Number);
  const pascoa = domingoDePascoa(ano);
  const nomes: Record<string, string> = {
    [`${ano}-01-01`]: "Confraternização Universal",
    [`${ano}-04-21`]: "Tiradentes",
    [`${ano}-05-01`]: "Dia do Trabalho",
    [`${ano}-09-07`]: "Independência",
    [`${ano}-10-12`]: "Nossa Senhora Aparecida",
    [`${ano}-11-02`]: "Finados",
    [`${ano}-11-15`]: "Proclamação da República",
    [`${ano}-12-25`]: "Natal",
    [paraISO(somarDias(pascoa, -48))]: "Carnaval",
    [paraISO(somarDias(pascoa, -47))]: "Carnaval",
    [paraISO(somarDias(pascoa, -2))]: "Sexta-feira Santa",
    [paraISO(somarDias(pascoa, 60))]: "Corpus Christi",
  };
  if (ano >= 2024) nomes[`${ano}-11-20`] = "Consciência Negra";
  return nomes[iso] ?? null;
}

function dataLocal(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

export function ehFimDeSemana(iso: string): boolean {
  const d = dataLocal(iso).getDay();
  return d === 0 || d === 6;
}

export function ehDiaUtil(iso: string): boolean {
  const [ano] = iso.split("-").map(Number);
  return !ehFimDeSemana(iso) && !feriadosBancarios(ano).has(iso);
}

/** O próprio dia, se for útil; senão o primeiro dia útil depois dele. */
export function proximoDiaUtil(iso: string): string {
  let atual = dataLocal(iso);
  // 10 é folga suficiente: a maior emenda possível no Brasil não chega perto
  for (let i = 0; i < 10; i++) {
    const candidato = paraISO(atual);
    if (ehDiaUtil(candidato)) return candidato;
    atual = somarDias(atual, 1);
  }
  return paraISO(atual);
}

export interface VencimentoEfetivo {
  /** Dia que o usuário cadastrou, já ajustado ao tamanho do mês. */
  original: string;
  /** Dia em que a fatura realmente vence, depois de pular fim de semana e feriado. */
  efetivo: string;
  adiado: boolean;
  /** Por que adiou — "fim de semana", "feriado da Independência", etc. */
  motivo: string | null;
}

/**
 * Data em que a fatura de `mes` realmente vence, dado o dia cadastrado no
 * cartão. Adia pro próximo dia útil quando o dia cai em fim de semana ou
 * feriado bancário.
 */
export function vencimentoEfetivo(
  diaVencimento: number,
  mes: string
): VencimentoEfetivo {
  const original = diaVencimentoNoMes(mes, diaVencimento);
  const efetivo = proximoDiaUtil(original);

  if (efetivo === original) {
    return { original, efetivo, adiado: false, motivo: null };
  }

  const feriado = nomeDoFeriado(original);
  const motivo = feriado
    ? `${original.split("-")[2]}/${original.split("-")[1]} é feriado (${feriado})`
    : `${original.split("-")[2]}/${original.split("-")[1]} cai em fim de semana`;

  return { original, efetivo, adiado: true, motivo };
}
