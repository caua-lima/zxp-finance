import { arredondarCentavos } from "@/lib/types";

/**
 * Simulação de viabilidade: "dá pra eu assumir uma parcela de X em Nx?"
 *
 * Puro de propósito — quem chama isso é uma ferramenta de IA (ver
 * anthropicClient.ts), e o modelo NUNCA pode "chutar" o número. Ele só lê o
 * resultado real deste cálculo e traduz pra português. Toda a matemática
 * que decide se algo é viável mora aqui, testável sem precisar de rede nem
 * de chave de API nenhuma.
 */

export interface ParcelaAtiva {
  /** Já considerando "minha parte", se a parcela for dividida com alguém. */
  valorMensal: number;
  /** Quantas cobranças ainda faltam a partir de hoje. */
  mesesRestantes: number;
}

export interface ContextoSimulacao {
  saldoAtual: number;
  /** Quanto a pessoa quer que sobre sempre — abaixo disso já é sinal de alerta, mesmo positivo. */
  reservaMeta: number;
  /** Renda recorrente esperada por mês, já líquida de imposto. */
  rendaMensalLiquida: number;
  /** Contas fixas + assinaturas já assumidas, fora do que está embutido em fatura. */
  despesasFixasMensais: number;
  /** Parcelas e financiamentos já em andamento, fora do que está embutido em fatura. */
  parcelasAtivas: ParcelaAtiva[];
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

/**
 * Projeta o saldo mês a mês assumindo o novo compromisso, com as parcelas
 * já em andamento saindo da conta no mês em que elas terminam — é o que
 * faz uma simulação de 12 meses não travar em "inviável" por causa de uma
 * parcela de outro financiamento que só existe até o mês 4.
 *
 * O horizonte é a duração do próprio compromisso novo: depois que ele
 * termina, ele só ajuda o saldo, nunca piora — não tem risco novo a
 * detectar depois disso.
 */
export function simularNovoCompromisso(
  contexto: ContextoSimulacao,
  valorMensalNovo: number,
  mesesNovo: number
): ResultadoSimulacao {
  const meses: MesSimulado[] = [];
  let saldo = contexto.saldoAtual;
  let primeiroMesRuim: number | null = null;
  let motivo: MotivoInviabilidade | null = null;

  for (let mes = 1; mes <= mesesNovo; mes++) {
    const parcelasDoMes = contexto.parcelasAtivas
      .filter((p) => p.mesesRestantes >= mes)
      .reduce((acc, p) => acc + p.valorMensal, 0);
    const compromissosDoMes = arredondarCentavos(
      contexto.despesasFixasMensais + parcelasDoMes + valorMensalNovo
    );

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
