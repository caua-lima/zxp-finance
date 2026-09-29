import { arredondarCentavos } from "@/lib/types";

/**
 * Rendimento automático pelo CDI — o que a conta e os cofrinhos do
 * Mercado Pago pagam (100% do CDI por padrão, configurável).
 *
 * A taxa vem do Banco Central (série 12 do SGS: CDI em % ao dia, uma por
 * dia útil). Cada dia útil multiplica o saldo por (1 + taxa × percentual).
 * O rendimento de um dia só cai no dia seguinte, então o dia de hoje
 * nunca entra — é o mesmo que você vê no app do banco.
 *
 * Valor BRUTO: o imposto de renda sobre rendimento só é descontado no
 * resgate (tabela regressiva), e o Mercado Pago também mostra o bruto.
 */

export interface TaxaDiaria {
  data: string; // "AAAA-MM-DD"
  taxa: number; // % ao dia, ex: 0.050788
}

export interface ResultadoRendimento {
  rendimento: number;
  /** Rendimento separado pelo mês do dia que rendeu. */
  porMes: Record<string, number>;
  /** Último dia considerado — vira o novo "rendido até". null = nenhum dia novo. */
  ultimoDia: string | null;
  diasUteis: number;
}

/**
 * Aplica as taxas dos dias úteis depois de `rendidoAte` e antes de
 * `hojeISO`. Saldo zero ou negativo não rende, mas os dias ainda avançam
 * — senão, ao colocar dinheiro depois, o app renderia retroativamente
 * dias em que a conta estava vazia.
 */
export function calcularRendimento(
  saldo: number,
  taxas: TaxaDiaria[],
  rendidoAte: string,
  hojeISO: string,
  percentualCdi: number
): ResultadoRendimento {
  const dias = taxas
    .filter((t) => t.data > rendidoAte && t.data < hojeISO)
    .sort((a, b) => a.data.localeCompare(b.data));

  if (dias.length === 0) {
    return { rendimento: 0, porMes: {}, ultimoDia: null, diasUteis: 0 };
  }

  const ultimoDia = dias[dias.length - 1].data;
  if (saldo <= 0 || percentualCdi <= 0) {
    return { rendimento: 0, porMes: {}, ultimoDia, diasUteis: dias.length };
  }

  let atual = saldo;
  const porMesBruto: Record<string, number> = {};
  for (const d of dias) {
    const ganho = atual * (d.taxa / 100) * (percentualCdi / 100);
    atual += ganho;
    const mes = d.data.slice(0, 7);
    porMesBruto[mes] = (porMesBruto[mes] ?? 0) + ganho;
  }

  const porMes: Record<string, number> = {};
  for (const [mes, valor] of Object.entries(porMesBruto)) {
    porMes[mes] = arredondarCentavos(valor);
  }

  return {
    rendimento: arredondarCentavos(atual - saldo),
    porMes,
    ultimoDia,
    diasUteis: dias.length,
  };
}

/** CDI anualizado (% a.a.) a partir da taxa diária, na base de 252 dias úteis. */
export function cdiAnual(taxaDiaria: number): number {
  return (Math.pow(1 + taxaDiaria / 100, 252) - 1) * 100;
}

/** Soma dois mapas mês→valor (o que já rendeu + o que rendeu agora). */
export function somarPorMes(
  base: Record<string, number> | undefined,
  novo: Record<string, number>
): Record<string, number> {
  const resultado: Record<string, number> = { ...(base ?? {}) };
  for (const [mes, valor] of Object.entries(novo)) {
    resultado[mes] = arredondarCentavos((resultado[mes] ?? 0) + valor);
  }
  return resultado;
}

/** Converte a resposta do BCB ("dd/mm/aaaa", "0.050788") pro formato do app. */
export function converterSerieBcb(
  serie: Array<{ data: string; valor: string }>
): TaxaDiaria[] {
  return serie
    .map((item) => {
      const [dia, mes, ano] = item.data.split("/");
      return { data: `${ano}-${mes}-${dia}`, taxa: Number(item.valor) };
    })
    .filter((t) => Number.isFinite(t.taxa) && t.taxa > 0);
}

/**
 * Dia anterior, no calendário. Um valor informado hoje começa a render
 * pela taxa de hoje (que só cai amanhã), então o "rendido até" de um
 * saldo recém-informado é ontem.
 */
export function diaAnterior(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const d = new Date(ano, mes - 1, dia - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
