import { arredondarCentavos } from "@/lib/types";

export interface ContagemComissao {
  reunioes: number;
  vendasPerformance: number;
  vendasAcelera: number;
}

export interface ValoresComissao {
  valorReuniao: number;
  valorVendaPerformance: number;
  valorVendaAcelera: number;
}

/** Comissão do dia = soma de cada contagem × seu valor unitário. */
export function calcularComissaoDoDia(
  contagem: ContagemComissao,
  valores: ValoresComissao
): number {
  return arredondarCentavos(
    contagem.reunioes * valores.valorReuniao +
      contagem.vendasPerformance * valores.valorVendaPerformance +
      contagem.vendasAcelera * valores.valorVendaAcelera
  );
}
