import { gravarJuntas, listarDocumentos, obterDocumento, Escrita } from "@/lib/firestoreRest";
import { diaISOde } from "@/lib/finance/calculations";
import type { Assinatura, Caixinha, ContaFixa, FaturaCartao, Ganho, Gasto, Parcela } from "@/lib/types";
import {
  ConfigPluggy,
  ContaPluggy,
  InvestimentoPluggy,
  ItemPluggy,
  TransacaoPluggy,
  listarContas,
  listarInvestimentos,
  listarTransacoes,
  obterItem,
} from "./cliente";
import { planejarSincronizacao, ResumoSincronizacao } from "./plano";

/**
 * Lê o banco (Pluggy) e o app (Firestore), planeja e grava. Status fica em
 * usuarios/{uid}/integracoes/banco — sem valor de chave nem token.
 */

export interface StatusBanco {
  ultimaSincronizacao: number;
  bancoLidoEm: number | null;
  itens: { status: string; executionStatus: string | null; conector: string | null }[];
  contas: { nome: string; tipo: string; saldo: number; investidoAutomatico: number | null }[];
  resumo: ResumoSincronizacao | null;
  erro: string | null;
}

const DIA = 86_400_000;

export interface Previa {
  status: StatusBanco;
  /** Só no modo prévia: o que seria gravado (caminho relativo e dados). */
  escritas: { caminho: string; dados: Record<string, unknown> }[];
}

/** Sincroniza e grava. */
export async function sincronizarBanco(cfg: ConfigPluggy): Promise<StatusBanco> {
  return (await executar(cfg, false)).status;
}

/** Mesma conta, SEM gravar nada: pra conferir a classificação antes da primeira vez. */
export function previaDoBanco(cfg: ConfigPluggy): Promise<Previa> {
  return executar(cfg, true);
}

async function executar(cfg: ConfigPluggy, simular: boolean): Promise<Previa> {
  const base = `usuarios/${cfg.uid}`;
  const agora = Date.now();
  try {
    // ---- banco ----
    const itens: ItemPluggy[] = [];
    const contas: ContaPluggy[] = [];
    const investimentos: InvestimentoPluggy[] = [];
    for (const id of cfg.itemIds) {
      itens.push(await obterItem(cfg, id));
      contas.push(...(await listarContas(cfg, id)));
      investimentos.push(...(await listarInvestimentos(cfg, id)));
    }
    // a leitura mais antiga manda: o saldo de referência vale a partir dela
    const lidos = itens.map((i) => (i.lastUpdatedAt ? Date.parse(i.lastUpdatedAt) : NaN)).filter(Number.isFinite);
    const lidoEm = lidos.length ? Math.min(...lidos) : agora;

    // ---- app ----
    const ler = async <T,>(colecao: string) =>
      (await listarDocumentos<T>(`${base}/${colecao}`)).map((d) => ({ id: d.id, ...d.dados }) as T & { id: string });
    const [prefs, saldo, gastos, ganhos, pagamentos, contasFixas, assinaturas, parcelas, faturas, caixinhas, tratados] =
      await Promise.all([
        obterDocumento<{ inicioUso?: string }>(`${base}/preferencias/app`),
        obterDocumento<{ valor: number; atualizadoEm: number }>(`${base}/saldo/atual`),
        ler<Gasto & { idExterno?: string }>("gastos"),
        ler<Ganho & { idExterno?: string }>("ganhos"),
        ler<{ pagoEm?: number; idExterno?: string }>("pagamentos"),
        ler<ContaFixa>("contasFixas"),
        ler<Assinatura>("assinaturas"),
        ler<Parcela>("parcelas"),
        ler<FaturaCartao>("faturasCartao"),
        ler<Caixinha & { idExterno?: string }>("caixinhas"),
        ler<Record<string, unknown>>("bancoTransacoes"),
      ]);
    const inicioUso = typeof prefs?.inicioUso === "string" ? prefs.inicioUso : "";

    // janela: do início da contagem (ou 60 dias) até hoje
    const hoje = diaISOde(agora);
    const limite = diaISOde(agora - 60 * DIA);
    const de = inicioUso && inicioUso > limite ? inicioUso : limite;
    const transacoes: TransacaoPluggy[] = [];
    for (const c of contas) transacoes.push(...(await listarTransacoes(cfg, c.id, de, hoje)));

    const plano = planejarSincronizacao(
      {
        inicioUso,
        saldo: saldo && typeof saldo.atualizadoEm === "number" ? saldo : null,
        gastos, ganhos, pagamentos, contas: contasFixas, assinaturas, parcelas, faturas, caixinhas,
        processados: new Set(tratados.map((t) => t.id)),
      },
      { lidoEm, contas, transacoes, investimentos }
    );

    const escritas: Escrita[] = plano.escritas.map((e) => ({
      caminho: `${base}/${e.caminho}`,
      dados: e.dados,
      ...(e.campos ? { campos: e.campos } : {}),
    }));
    // em lotes (limite de escritas por commit do Firestore)
    for (let i = 0; !simular && i < escritas.length; i += 400) {
      const r = await gravarJuntas(escritas.slice(i, i + 400));
      if (r !== "ok") throw new Error("O Firestore recusou a gravação (conflito).");
    }

    const status: StatusBanco = {
      ultimaSincronizacao: agora,
      bancoLidoEm: lidos.length ? lidoEm : null,
      itens: itens.map((i) => ({
        status: i.status, executionStatus: i.executionStatus ?? null, conector: i.connector?.name ?? null,
      })),
      contas: contas.map((c) => ({
        nome: (c.marketingName || c.name).slice(0, 60), tipo: c.type, saldo: c.balance,
        investidoAutomatico: c.bankData?.automaticallyInvestedBalance ?? null,
      })),
      resumo: plano.resumo,
      erro: null,
    };
    if (!simular) {
      await gravarJuntas([{ caminho: `${base}/integracoes/banco`, dados: status as unknown as Record<string, unknown> }]);
    }
    return { status, escritas: simular ? plano.escritas : [] };
  } catch (e) {
    const erro = e instanceof Error ? e.message.slice(0, 200) : "Erro desconhecido.";
    const status: StatusBanco = {
      ultimaSincronizacao: agora, bancoLidoEm: null, itens: [], contas: [], resumo: null, erro,
    };
    if (!simular) {
      await gravarJuntas([
        { caminho: `${base}/integracoes/banco`, dados: { ultimaSincronizacao: agora, erro }, campos: ["ultimaSincronizacao", "erro"] },
      ]).catch(() => undefined);
    }
    return { status, escritas: [] };
  }
}

export async function statusDoBanco(uid: string): Promise<StatusBanco | null> {
  return obterDocumento<StatusBanco>(`usuarios/${uid}/integracoes/banco`);
}
