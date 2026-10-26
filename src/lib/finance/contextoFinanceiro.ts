import { listarDocumentos, obterDocumento } from "@/lib/firestoreRest";
import {
  calcularImposto,
  TAXA_IMPOSTO,
  arredondarCentavos,
  mesPadrao,
  Ganho,
  ContaFixa,
  Assinatura,
  Parcela,
  FaturaCartao,
  Gasto,
} from "@/lib/types";
import { hojeISO } from "./calculations";
import { recorrenciaDoGanho, recorrenciaNoMes, valorNoMes } from "./recorrencia";
import { recebimentosAvulsos, saldoConfirmado, MovimentoPagamento, Transferencia } from "./saldo";
import { compromissosPorMes } from "./compromissosFuturos";
import { ContextoSimulacao, MESES_MAXIMOS } from "./simulador";

/**
 * Monta o contexto real de um usuário pro simulador, lendo via Firestore
 * REST (mesmo caminho do cron — sem firebase-admin, ver firestoreRest.ts).
 * Só é chamado depois que `verificarChamadorAtivo` confirmou de quem é o
 * `uid` — nunca recebe um uid vindo do corpo da requisição.
 *
 * Usa o MESMO snapshot do painel (auditoria F15): saldo confirmado
 * (referência menos movimentos posteriores), e compromissos mês a mês
 * incluindo faturas e parcelas do cartão. Sem saldo informado, devolve
 * null — o Consultor responde que não dá pra avaliar, em vez de supor zero.
 */

type Doc<T> = { id: string; dados: T };
const comId = <T,>(docs: Doc<T>[]) => docs.map((d) => ({ ...d.dados, id: d.id }) as T & { id: string });

export async function montarContextoSimulacao(uid: string): Promise<ContextoSimulacao | null> {
  const base = `usuarios/${uid}`;
  const [saldoDoc, contas, assinaturas, parcelas, ganhos, faturas, gastos, pagamentos, cartoes, prefsApp, transferencias] =
    await Promise.all([
      obterDocumento<{ valor: number; atualizadoEm: number; reservaMeta?: number }>(`${base}/saldo/atual`),
      listarDocumentos<ContaFixa>(`${base}/contasFixas`),
      listarDocumentos<Assinatura>(`${base}/assinaturas`),
      listarDocumentos<Parcela>(`${base}/parcelas`),
      listarDocumentos<Ganho>(`${base}/ganhos`),
      listarDocumentos<FaturaCartao>(`${base}/faturasCartao`),
      listarDocumentos<Gasto>(`${base}/gastos`),
      listarDocumentos<MovimentoPagamento>(`${base}/pagamentos`),
      listarDocumentos<{ nome: string; diaVencimento?: number | null; diaFechamento?: number | null }>(`${base}/cartoesConfig`),
      obterDocumento<{ taxaImposto?: number }>(`${base}/preferencias/app`),
      listarDocumentos<Transferencia>(`${base}/transferencias`),
    ]);
  // taxa do CLIENTE, passada explicitamente — no servidor não existe
  // configuração global por usuário
  const taxa =
    typeof prefsApp?.taxaImposto === "number" && prefsApp.taxaImposto >= 0 && prefsApp.taxaImposto <= 0.5
      ? prefsApp.taxaImposto
      : TAXA_IMPOSTO;

  if (!saldoDoc || typeof saldoDoc.valor !== "number") return null;

  const saldoAtual = saldoConfirmado(
    { valor: saldoDoc.valor, atualizadoEm: saldoDoc.atualizadoEm ?? 0 },
    comId(gastos),
    pagamentos.map((p) => p.dados),
    recebimentosAvulsos(comId(ganhos)),
    comId(transferencias)
  );

  const diaVencimentoPorCartao: Record<string, number> = {};
  const diaFechamentoPorCartao: Record<string, number> = {};
  for (const c of cartoes) {
    if (c.dados.diaVencimento) diaVencimentoPorCartao[c.dados.nome] = c.dados.diaVencimento;
    if (c.dados.diaFechamento) diaFechamentoPorCartao[c.dados.nome] = c.dados.diaFechamento;
  }

  const listaGanhos = comId(ganhos);
  const compromissos = compromissosPorMes(
    {
      ganhos: listaGanhos,
      contas: comId(contas),
      assinaturas: comId(assinaturas),
      parcelas: comId(parcelas),
      faturas: comId(faturas),
      gastos: [],
      diaVencimentoPorCartao,
      diaFechamentoPorCartao,
      hojeISO: hojeISO(),
    },
    mesPadrao(),
    MESES_MAXIMOS
  );

  // renda conservadora: só o que é recorrente e ativo, líquido de imposto
  // valor vigente NESTE mês (vigência: o salário de hoje, não o de antes)
  const mesAtual = hojeISO().slice(0, 7);
  const rendaMensalLiquida = arredondarCentavos(
    listaGanhos
      .filter((g) => g.tipo === "recorrente" && recorrenciaNoMes(recorrenciaDoGanho(g), mesAtual))
      .reduce((acc, g) => {
        const v = valorNoMes(g, mesAtual);
        return acc + v - (g.semImposto ? 0 : calcularImposto(v, taxa));
      }, 0)
  );

  return {
    saldoAtual: saldoAtual ?? 0,
    reservaMeta: saldoDoc.reservaMeta ?? 0,
    rendaMensalLiquida,
    compromissosPorMes: compromissos,
  };
}
