import { arredondarCentavos } from "@/lib/types";

/**
 * Simulação de viabilidade: "dá pra eu assumir uma parcela de X em Nx?"
 *
 * Puro de propósito — quem chama isso é uma ferramenta de IA (ver
 * anthropicClient.ts), e o modelo NUNCA pode "chutar" o número. Ele só lê o
 * resultado real deste cálculo e traduz pra português. Toda a matemática
 * que decide se algo é viável mora aqui, testável sem rede nem chave.
 */

export interface ContextoSimulacao {
  /** Saldo confirmado de agora (docs/modelo-financeiro.md). */
  saldoAtual: number;
  /** Quanto você quer que sobre sempre — abaixo disso já é sinal de alerta. */
  reservaMeta: number;
  /** Renda recorrente esperada por mês, já líquida de imposto. */
  rendaMensalLiquida: number;
  /**
   * O que já está comprometido em cada mês à frente (índice 0 = mês que
   * vem): contas, assinaturas, parcelas e faturas, reais ou previstas.
   * Ver compromissosFuturos.ts.
   */
  compromissosPorMes: number[];
}

export interface MesSimulado {
  /** 1-indexed: 1 é o próximo mês, não o mês atual (que já está decidido). */
  mes: number;
  compromissosDoMes: number;
  saldoFinal: number;
}

export type MotivoInviabilidade = "saldo_negativo" | "abaixo_da_reserva";

export interface ResultadoSimulacao {
  viavel: boolean;
  /** null quando viável — não existe "primeiro mês ruim" pra apontar. */
  primeiroMesRuim: number | null;
  motivo: MotivoInviabilidade | null;
  meses: MesSimulado[];
}

/** Horizonte máximo aceito — mais que 10 anos não é simulação, é chute. */
export const MESES_MAXIMOS = 120;
export const VALOR_MENSAL_MAXIMO = 1_000_000;

/**
 * Valida a entrada da simulação. Antes, `meses = 0` devolvia "viável" com
 * uma lista vazia, e NaN/negativo passavam direto (auditoria F15).
 * Devolve a mensagem de erro, ou null se está tudo certo.
 */
export function validarEntradaSimulacao(valorMensal: unknown, meses: unknown): string | null {
  if (typeof valorMensal !== "number" || !Number.isFinite(valorMensal) || valorMensal <= 0) {
    return "O valor mensal precisa ser um número maior que zero.";
  }
  if (valorMensal > VALOR_MENSAL_MAXIMO) return "Valor mensal alto demais pra simular.";
  if (typeof meses !== "number" || !Number.isInteger(meses) || meses < 1) {
    return "O número de meses precisa ser um inteiro de 1 em diante.";
  }
  if (meses > MESES_MAXIMOS) return `Simulo até ${MESES_MAXIMOS} meses.`;
  return null;
}

/**
 * Projeta o saldo mês a mês assumindo o novo compromisso, somado ao que já
 * está comprometido em cada mês. O horizonte é a duração do compromisso
 * novo: depois que ele termina, ele só ajuda o saldo.
 *
 * Lança erro com entrada inválida — quem chama valida antes com
 * `validarEntradaSimulacao` pra poder responder de forma amigável.
 */
export function simularNovoCompromisso(
  contexto: ContextoSimulacao,
  valorMensalNovo: number,
  mesesNovo: number
): ResultadoSimulacao {
  const erro = validarEntradaSimulacao(valorMensalNovo, mesesNovo);
  if (erro) throw new Error(erro);

  const meses: MesSimulado[] = [];
  let saldo = contexto.saldoAtual;
  let primeiroMesRuim: number | null = null;
  let motivo: MotivoInviabilidade | null = null;

  for (let mes = 1; mes <= mesesNovo; mes++) {
    // além do horizonte conhecido, repete o último mês conhecido
    const jaComprometido =
      contexto.compromissosPorMes[mes - 1] ??
      contexto.compromissosPorMes[contexto.compromissosPorMes.length - 1] ??
      0;
    const compromissosDoMes = arredondarCentavos(jaComprometido + valorMensalNovo);

    saldo = arredondarCentavos(saldo + contexto.rendaMensalLiquida - compromissosDoMes);
    meses.push({ mes, compromissosDoMes, saldoFinal: saldo });

    if (primeiroMesRuim === null) {
      if (saldo < 0) {
        primeiroMesRuim = mes;
        motivo = "saldo_negativo";
      } else if (saldo < contexto.reservaMeta) {
        primeiroMesRuim = mes;
        motivo = "abaixo_da_reserva";
      }
    }
  }

  return { viavel: primeiroMesRuim === null, primeiroMesRuim, motivo, meses };
}
