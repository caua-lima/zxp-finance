import { listarDocumentos, obterDocumento } from "@/lib/firestoreRest";
import { calcularImposto, arredondarCentavos } from "@/lib/types";
import { ContextoSimulacao } from "./simulador";

/**
 * Monta o contexto real de um usuário pro simulador de viabilidade, lendo
 * via Firestore REST (mesmo caminho do cron — não existe sessão de
 * usuário no servidor, e este código deliberadamente NÃO usa
 * firebase-admin, ver googleAuth.ts/firestoreRest.ts). Só é chamado depois
 * que `verificarChamador` já confirmou de quem é o `uid` — nunca recebe um
 * uid vindo direto do corpo da requisição.
 */

interface SaldoDoc {
  valor: number;
  reservaMeta?: number;
}
interface ContaFixaDoc {
  valor: number;
  ativa: boolean;
}
interface AssinaturaDoc {
  valor: number;
  ativa: boolean;
  naFatura?: boolean;
}
interface ParcelaDoc {
  valorParcela: number;
  parcelasRestantes: number;
  dividida?: boolean;
  naFatura?: boolean;
}
interface GanhoDoc {
  tipo: "recorrente" | "pontual";
  ativo?: boolean;
  valor: number;
  semImposto?: boolean;
}

export async function montarContextoSimulacao(uid: string): Promise<ContextoSimulacao> {
  const [saldoDoc, contasFixas, assinaturas, parcelas, ganhos] = await Promise.all([
    obterDocumento<SaldoDoc>(`usuarios/${uid}/saldo/atual`),
    listarDocumentos<ContaFixaDoc>(`usuarios/${uid}/contasFixas`),
    listarDocumentos<AssinaturaDoc>(`usuarios/${uid}/assinaturas`),
    listarDocumentos<ParcelaDoc>(`usuarios/${uid}/parcelas`),
    listarDocumentos<GanhoDoc>(`usuarios/${uid}/ganhos`),
  ]);

  const saldoAtual = saldoDoc?.valor ?? 0;
  const reservaMeta = saldoDoc?.reservaMeta ?? 0;

  // assinatura "naFatura" já está contada dentro do lançamento de fatura
  // do cartão — não existe aqui como despesa fixa própria, senão contaria
  // o mesmo gasto duas vezes (mesma regra do adapters.ts)
  const despesasFixasMensais = arredondarCentavos(
    contasFixas
      .filter((c) => c.dados.ativa)
      .reduce((acc, c) => acc + c.dados.valor, 0) +
      assinaturas
        .filter((a) => a.dados.ativa && !a.dados.naFatura)
        .reduce((acc, a) => acc + a.dados.valor, 0)
  );

  const parcelasAtivas = parcelas
    .filter((p) => p.dados.parcelasRestantes > 0 && !p.dados.naFatura)
    .map((p) => ({
      // mesma regra de valorMinhaParte() em types.ts, sem precisar montar
      // um Parcela completo só pra chamar a função
      valorMensal: p.dados.dividida ? p.dados.valorParcela / 2 : p.dados.valorParcela,
      mesesRestantes: p.dados.parcelasRestantes,
    }));

  const rendaMensalLiquida = arredondarCentavos(
    ganhos
      .filter((g) => g.dados.tipo === "recorrente" && g.dados.ativo !== false)
      .reduce((acc, g) => {
        const bruto = g.dados.valor;
        const imposto = g.dados.semImposto ? 0 : calcularImposto(bruto);
        return acc + (bruto - imposto);
      }, 0)
  );

  return {
    saldoAtual,
    reservaMeta,
    rendaMensalLiquida,
    despesasFixasMensais,
    parcelasAtivas,
  };
}
