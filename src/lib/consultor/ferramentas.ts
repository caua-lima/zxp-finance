import { listarDocumentos, obterDocumento } from "@/lib/firestoreRest";
import {
  Assinatura,
  Caixinha,
  ContaFixa,
  Ganho,
  Gasto,
  Parcela,
  arredondarCentavos,
  mesAnteriorDe,
  parcelasRestantesEm,
  valorMinhaParte,
} from "@/lib/types";
import { diaISOde } from "@/lib/finance/calculations";
import { recorrenciaNoMes, valorNoMes } from "@/lib/finance/recorrencia";
import { montarContextoSimulacao } from "@/lib/finance/contextoFinanceiro";
import { simularNovoCompromisso, validarEntradaSimulacao, ResultadoSimulacao } from "@/lib/finance/simulador";
import { comConexoes, credenciaisPluggy, listarContas, listarTransacoes, TransacaoPluggy, ContaPluggy } from "@/lib/pluggy/cliente";
import { conexoesGravadas } from "@/lib/pluggy/sincronizar";
import { LinhaExtrato, buscarGastos, classificarExtrato, resumoDoMes } from "@/lib/pluggy/extrato";

/**
 * As ferramentas do Consultor: o modelo nunca calcula número nenhum —
 * ele chama estas funções, que leem os dados reais (app + extrato do
 * banco quando conectado) e devolvem o resultado pronto pra ser explicado.
 */

const r2 = arredondarCentavos;
const MAX_MESES = 12;

/** Os últimos `n` meses ("AAAA-MM"), do mais antigo ao atual. */
export function ultimosMeses(hoje: string, n: number, incluirAtual: boolean): string[] {
  const meses: string[] = [];
  let m = incluirAtual ? hoje.slice(0, 7) : mesAnteriorDe(hoje.slice(0, 7));
  for (let i = 0; i < n; i++) {
    meses.unshift(m);
    m = mesAnteriorDe(m);
  }
  return meses;
}

type ComId<T> = T & { id: string };

interface DadosApp {
  saldo: { valor: number; atualizadoEm: number; reservaMeta?: number } | null;
  caixinhas: ComId<Caixinha>[];
  contas: ComId<ContaFixa>[];
  assinaturas: ComId<Assinatura>[];
  parcelas: ComId<Parcela>[];
  gastos: ComId<Gasto>[];
  ganhos: ComId<Ganho>[];
}

interface DadosBanco {
  linhas: LinhaExtrato[];
  /** Soma de tudo que entrou e saiu da conta em cada mês (= variação do saldo). */
  variacaoPorMes: Record<string, number>;
  desde: string;
}

/** Carrega sob demanda e guarda pro resto da pergunta (várias ferramentas, uma leitura). */
export class FonteDoConsultor {
  private app?: Promise<DadosApp>;
  private banco?: Promise<DadosBanco | null>;
  private mesesBanco = 0;
  readonly hoje: string;

  constructor(readonly uid: string, agora = Date.now()) {
    this.hoje = diaISOde(agora);
  }

  dadosApp(): Promise<DadosApp> {
    this.app ??= (async () => {
      const base = `usuarios/${this.uid}`;
      const ler = async <T,>(c: string) =>
        (await listarDocumentos<T>(`${base}/${c}`)).map((d) => ({ ...d.dados, id: d.id }) as ComId<T>);
      const [saldo, caixinhas, contas, assinaturas, parcelas, gastos, ganhos] = await Promise.all([
        obterDocumento<{ valor: number; atualizadoEm: number; reservaMeta?: number }>(`${base}/saldo/atual`),
        ler<Caixinha>("caixinhas"),
        ler<ContaFixa>("contasFixas"),
        ler<Assinatura>("assinaturas"),
        ler<Parcela>("parcelas"),
        ler<Gasto>("gastos"),
        ler<Ganho>("ganhos"),
      ]);
      return { saldo, caixinhas, contas, assinaturas, parcelas, gastos, ganhos };
    })();
    return this.app;
  }

  /** Extrato do banco dos últimos `meses` (só pra quem tem banco conectado). */
  async dadosBanco(meses: number): Promise<DadosBanco | null> {
    if (this.banco && meses <= this.mesesBanco) return this.banco;
    this.mesesBanco = meses;
    this.banco = (async () => {
      const cred = credenciaisPluggy();
      if (!cred || cred.uid !== this.uid) return null;
      const cfg = comConexoes(cred, await conexoesGravadas(cred.uid).catch(() => []));
      if (cfg.itemIds.length === 0) return null;
      const desde = `${ultimosMeses(this.hoje, meses, true)[0]}-01`;
      const contas: ContaPluggy[] = [];
      for (const id of cfg.itemIds) contas.push(...(await listarContas(cfg, id)));
      const transacoes: TransacaoPluggy[] = [];
      for (const c of contas) transacoes.push(...(await listarTransacoes(cfg, c.id, desde, this.hoje)));
      const app = await this.dadosApp();
      const variacaoPorMes: Record<string, number> = {};
      const tipo = new Map(contas.map((c) => [c.id, c.type]));
      for (const t of transacoes) {
        if (t.status === "PENDING" || tipo.get(t.accountId) !== "BANK") continue;
        const mes = diaISOde(Date.parse(t.date)).slice(0, 7);
        variacaoPorMes[mes] = r2((variacaoPorMes[mes] ?? 0) + t.amount);
      }
      return { linhas: classificarExtrato(transacoes, contas, app), variacaoPorMes, desde };
    })();
    return this.banco;
  }
}

const mesesValidos = (v: unknown, padrao: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 ? Math.min(v, MAX_MESES) : padrao;

// ---------------------------------------------------------------- buscar_gastos

export async function ferramentaBuscarGastos(fonte: FonteDoConsultor, input: Record<string, unknown>) {
  const meses = mesesValidos(input.meses, 3);
  const incluirAtual = input.incluirMesAtual !== false;
  const lista = ultimosMeses(fonte.hoje, meses, incluirAtual);
  const termo = typeof input.termo === "string" ? input.termo.slice(0, 60) : undefined;
  const categoria = typeof input.categoria === "string" ? input.categoria.slice(0, 40) : undefined;
  const banco = await fonte.dadosBanco(meses + (incluirAtual ? 0 : 1));
  let linhas: LinhaExtrato[];
  let fonteDados: string;
  if (banco) {
    linhas = banco.linhas;
    fonteDados = "extrato do Mercado Pago (conta e cartão), via Open Finance";
  } else {
    const app = await fonte.dadosApp();
    linhas = app.gastos
      .filter((g) => !g.estornoDeId && !g.estornado && !g.ajusteConciliacaoId)
      .map((g) => ({
        tipo: "saida" as const, mes: g.mes, dia: g.data ?? diaISOde(g.criadoEm), valor: g.valor,
        descricao: g.descricao, original: g.descricao, categoria: g.categoria, categoriaBanco: null,
        meio: g.pagoCom === "credito" ? ("cartao" as const) : ("conta" as const),
      }));
    fonteDados = "registros feitos no app";
  }
  return {
    fonte: fonteDados,
    filtro: { termo: termo ?? null, categoria: categoria ?? null },
    meses: lista,
    mesAtualParcial: incluirAtual ? lista[lista.length - 1] : null,
    ...buscarGastos(linhas, { termo, categoria, meses: lista }),
  };
}

// ---------------------------------------------------------------- resumo_financeiro

function compromissosFixos(app: DadosApp, mes: string) {
  const contas = app.contas
    .filter((c) => recorrenciaNoMes(c, mes))
    .map((c) => ({ nome: c.nome, valor: valorNoMes(c, mes), tipo: c.mesUnico ? "avulsa" : "fixa" }));
  const assinaturas = app.assinaturas
    .filter((a) => recorrenciaNoMes(a, mes))
    .map((a) => ({ nome: a.nome, valor: valorNoMes(a, mes), noCartao: !!a.naFatura }));
  const parcelas = app.parcelas
    .filter((p) => parcelasRestantesEm(p, mes) > 0)
    .map((p) => ({
      nome: p.nome,
      valorMensal: r2(valorMinhaParte(p)),
      faltam: parcelasRestantesEm(p, mes),
      de: p.totalParcelas,
      cartao: p.cartao ?? null,
    }));
  const total = r2(
    contas.reduce((a, c) => a + c.valor, 0) +
      assinaturas.reduce((a, c) => a + c.valor, 0) +
      parcelas.reduce((a, p) => a + p.valorMensal, 0)
  );
  return { contas, assinaturas, parcelas, totalMensal: total };
}

/** Sobra média por mês na conta: variação do saldo + o que foi pras caixinhas, nos meses completos. */
async function sobraMedia(fonte: FonteDoConsultor, meses: number) {
  const banco = await fonte.dadosBanco(meses + 1);
  if (!banco) return null;
  const lista = ultimosMeses(fonte.hoje, meses, false);
  const porMes = lista.map((mes) => {
    const r = resumoDoMes(banco.linhas, mes);
    const variacao = banco.variacaoPorMes[mes] ?? 0;
    return { mes, variacaoSaldo: variacao, guardadoNasCaixinhas: r.guardadoNasCaixinhas, sobra: r2(variacao + r.guardadoNasCaixinhas) };
  });
  return { meses: porMes, media: r2(porMes.reduce((a, m) => a + m.sobra, 0) / Math.max(1, porMes.length)) };
}

export async function ferramentaResumoFinanceiro(fonte: FonteDoConsultor, input: Record<string, unknown>) {
  const meses = mesesValidos(input.meses, 3);
  const app = await fonte.dadosApp();
  const banco = await fonte.dadosBanco(meses + 1);
  const mesAtual = fonte.hoje.slice(0, 7);
  const lista = ultimosMeses(fonte.hoje, meses, false);
  return {
    hoje: fonte.hoje,
    saldoNaConta: app.saldo?.valor ?? null,
    reservaDeSegurancaDesejada: app.saldo?.reservaMeta ?? 0,
    caixinhas: app.caixinhas.map((c) => ({ nome: c.nome, saldo: c.saldo })),
    totalNasCaixinhas: r2(app.caixinhas.reduce((a, c) => a + (c.saldo ?? 0), 0)),
    compromissosDoMesAtual: compromissosFixos(app, mesAtual),
    mesesAnteriores: banco
      ? lista.map((mes) => ({ ...resumoDoMes(banco.linhas, mes), variacaoDoSaldo: banco.variacaoPorMes[mes] ?? 0 }))
      : null,
    mesAtualAteHoje: banco ? resumoDoMes(banco.linhas, mesAtual) : null,
    sobraMensal: await sobraMedia(fonte, meses),
    fonte: banco ? "app + extrato do Mercado Pago" : "só o que foi registrado no app (banco não conectado)",
  };
}

// ---------------------------------------------------------------- simular_parcela

export interface ResultadoFerramentaSimulacao {
  erro?: string;
  simulacao?: ResultadoSimulacao;
  entrada?: { valorMensal: number; meses: number };
  resposta?: Record<string, unknown>;
}

export async function ferramentaSimularParcela(
  fonte: FonteDoConsultor,
  input: Record<string, unknown>
): Promise<ResultadoFerramentaSimulacao> {
  const valorMensal = typeof input.valorMensal === "number" ? r2(input.valorMensal) : NaN;
  const meses = input.meses === undefined || input.meses === null ? 12 : input.meses;
  const mesesAssumidos = input.meses === undefined || input.meses === null;
  const erro = validarEntradaSimulacao(valorMensal, meses);
  if (erro) return { erro };
  const n = meses as number;

  const contexto = await montarContextoSimulacao(fonte.uid);
  if (!contexto) return { erro: "Falta o saldo da conta: informe na tela de Saldo." };

  const sobra = await sobraMedia(fonte, 3);
  const app = await fonte.dadosApp();
  const comprometidoHoje = contexto.compromissosPorMes[0] ?? 0;
  // Com banco: a "renda" é o que de fato sobra por mês (já descontados gastos
  // e compromissos de hoje) + os compromissos de hoje. Assim, quando uma
  // parcela atual termina, a sobra sobe sozinha na simulação.
  const ctx = sobra ? { ...contexto, rendaMensalLiquida: r2(sobra.media + comprometidoHoje) } : contexto;
  const simulacao = simularNovoCompromisso(ctx, valorMensal, n);
  const ultimo = simulacao.meses[simulacao.meses.length - 1];
  const sobraDepois = sobra ? r2(sobra.media - valorMensal) : null;
  const terminando = app.parcelas
    .filter((p) => p.parcelasRestantes > 0)
    .map((p) => ({ nome: p.nome, valorMensal: r2(valorMinhaParte(p)), faltam: p.parcelasRestantes }))
    .filter((p) => p.faltam <= n)
    .sort((a, b) => a.faltam - b.faltam);

  return {
    simulacao,
    entrada: { valorMensal, meses: n },
    resposta: {
      parcelaNova: { valorMensal, meses: n, mesesAssumidosPeloApp: mesesAssumidos },
      viavel: simulacao.viavel,
      problema: simulacao.viavel
        ? null
        : {
            noMes: simulacao.primeiroMesRuim,
            motivo: simulacao.motivo === "saldo_negativo" ? "saldo da conta ficaria negativo" : "saldo abaixo da reserva de segurança",
            saldoNesseMes: simulacao.meses[(simulacao.primeiroMesRuim ?? 1) - 1]?.saldoFinal ?? null,
          },
      saldoHoje: contexto.saldoAtual,
      saldoProjetadoNoFim: ultimo?.saldoFinal ?? null,
      reservaDeSeguranca: contexto.reservaMeta,
      sobraMediaPorMesHoje: sobra?.media ?? null,
      sobraMediaPorMesComAParcela: sobraDepois,
      mesesAteZerarOSaldoSeASobraFicarNegativa:
        sobraDepois !== null && sobraDepois < 0 ? Math.floor(contexto.saldoAtual / -sobraDepois) : null,
      compromissosMensaisJaAssumidosHoje: comprometidoHoje,
      parcelasQueTerminamNesseHorizonte: terminando,
      totalNasCaixinhas: r2(app.caixinhas.reduce((a, c) => a + (c.saldo ?? 0), 0)),
      comoFoiCalculado: sobra
        ? "Sobra média dos últimos 3 meses completos na conta (variação do saldo + o que foi guardado nas caixinhas), já descontados gastos e parcelas atuais; quando uma parcela atual termina, a sobra aumenta."
        : "Renda recorrente cadastrada no app menos os compromissos cadastrados (sem banco conectado, os gastos do dia a dia não entram).",
    },
  };
}
