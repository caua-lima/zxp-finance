import {
  Assinatura,
  Caixinha,
  ContaFixa,
  FaturaCartao,
  Ganho,
  Gasto,
  Parcela,
  diaVencimentoNoMes,
  parcelasRestantesEm,
  valorMinhaParte,
} from "@/lib/types";
import { diaISOde } from "@/lib/finance/calculations";
import { recorrenciaNoMes, valorNoMes } from "@/lib/finance/recorrencia";
import { sugerirCategoria, sugerirCategoriaReceita } from "@/lib/categorizacao";
import { normalizarTexto } from "@/lib/categoriasGasto";
import { baixaAte } from "@/lib/parcelasOperacoes";
import type { ContaPluggy, InvestimentoPluggy, TransacaoPluggy } from "./cliente";

/**
 * Sincronização com o banco (Open Finance via Pluggy), sem rede: recebe o
 * que o app tem e o que o banco mandou e devolve as escritas. Regras:
 *
 * - SALDO: o do banco vira a referência, com a hora em que o banco foi lido
 *   (`lastUpdatedAt`). Tudo que aconteceu antes já está dentro dele; o que
 *   você anotar depois continua descontando até a próxima leitura.
 * - Cada transação é tratada UMA vez (registro em `bancoTransacoes/{id}`).
 * - Saída da conta: se bate com algo do "A pagar" (mesmo valor e nome ou
 *   vencimento perto), marca como pago; se bate com um gasto que você já
 *   anotou (mesmo valor, até 3 dias), só liga os dois; senão vira gasto,
 *   com categoria automática.
 * - Compra no cartão: gasto no crédito (não sai do saldo agora).
 * - Entrada na conta: vira ganho recebido (já líquido).
 * - Movimento interno (cofrinho, investimento, pagamento de fatura, entre
 *   contas suas): não é gasto nem ganho — só fica registrado.
 * - Cofrinhos/investimentos viram caixinhas com o valor e o rendimento reais.
 */

export interface EstadoApp {
  inicioUso: string;
  saldo: { valor: number; atualizadoEm: number } | null;
  gastos: (Gasto & { idExterno?: string })[];
  ganhos: (Ganho & { idExterno?: string })[];
  pagamentos: { id: string; pagoEm?: number; idExterno?: string }[];
  contas: ContaFixa[];
  assinaturas: Assinatura[];
  parcelas: Parcela[];
  faturas: FaturaCartao[];
  caixinhas: (Caixinha & { idExterno?: string })[];
  /** Ids de transação do banco já tratados. */
  processados: Set<string>;
}

export interface DadosBanco {
  /** Quando o banco foi lido de fato (ms). */
  lidoEm: number;
  contas: ContaPluggy[];
  transacoes: TransacaoPluggy[];
  investimentos: InvestimentoPluggy[];
}

export interface EscritaRelativa {
  /** Caminho a partir de usuarios/{uid}. */
  caminho: string;
  dados: Record<string, unknown>;
  /** Merge só desses campos. */
  campos?: string[];
}

export type Destino = "gasto" | "gasto_credito" | "ganho" | "pago" | "vinculado" | "interno" | "antes_do_inicio";

export interface ResumoSincronizacao {
  saldoBanco: number | null;
  saldoAtualizado: boolean;
  novos: Record<Destino, number>;
  caixinhas: number;
  pendentes: number;
}

export interface Plano {
  escritas: EscritaRelativa[];
  resumo: ResumoSincronizacao;
}

const centavos = (v: number) => Math.round(Math.abs(v) * 100);

const PALAVRAS_VAZIAS = new Set([
  "de", "da", "do", "das", "dos", "para", "pra", "com", "por", "pix", "enviado", "enviada", "recebido",
  "recebida", "pagamento", "pagto", "pgto", "transferencia", "compra", "debito", "credito", "mercado",
  "pago", "ltda", "me", "sa", "eireli", "conta", "cartao", "online", "br", "com",
]);

function palavras(texto: string): Set<string> {
  return new Set(
    normalizarTexto(texto)
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p))
  );
}

function temPalavraEmComum(a: string, b: string): boolean {
  const pa = palavras(a);
  for (const p of palavras(b)) if (pa.has(p)) return true;
  return false;
}

const INTERNO_CATEGORIA =
  /same person|automatic investment|fixed income|mutual fund|variable income|^investments?$|credit card payment|transfer - internal/i;
const INTERNO_DESCRICAO =
  /cofrinho|reserva|aplica[cç][aã]o|resgate|investimento|pagamento (de )?fatura|fatura do cart|entre contas|mesma titularidade/i;
const RENDIMENTO = /rendimento|juros|proceeds interests|dividend/i;

/** Movimento entre bolsos seus (cofrinho, investimento, fatura, mesma titularidade). */
export function ehMovimentoInterno(tx: TransacaoPluggy): boolean {
  if (tx.category && INTERNO_CATEGORIA.test(tx.category)) return true;
  const texto = `${tx.description} ${tx.descriptionRaw ?? ""}`;
  if (RENDIMENTO.test(texto) && tx.amount > 0) return false;
  return INTERNO_DESCRICAO.test(texto);
}

/** Descrição curta e legível (nome do estabelecimento quando vier). */
export function descricaoLimpa(tx: TransacaoPluggy): string {
  const nome = tx.merchant?.businessName || tx.merchant?.name;
  const base = (nome && nome.trim().length >= 3 ? nome : tx.description).replace(/\s+/g, " ").trim();
  return base.slice(0, 120) || "Movimento do banco";
}

/** Categoria do banco → categoria do app, quando a nossa não tem palpite. */
export function categoriaDoBanco(categoria: string | null | undefined): string | null {
  if (!categoria) return null;
  const c = categoria.toLowerCase();
  if (/food|eating|restaurant|grocer|supermarket|delivery|bakery/.test(c)) return "Alimentação";
  if (/transport|taxi|ride|gas station|fuel|parking|toll|uber|vehicle/.test(c)) return "Transporte";
  if (/housing|rent|utilities|electricity|water|internet|telecom|mobile|tv/.test(c)) return "Casa";
  if (/health|pharmac|drugstore|hospital|clinic|dentist|gym|fitness/.test(c)) return "Saúde";
  if (/education|course|school|book/.test(c)) return "Educação";
  if (/leisure|entertainment|travel|tickets|streaming|games|digital service/.test(c)) return "Lazer";
  if (/shopping|clothing|electronics|department|online shopping/.test(c)) return "Compras";
  if (/pet/.test(c)) return "Pets";
  if (/beauty|cosmetic|hair/.test(c)) return "Beleza";
  if (/gift|donation/.test(c)) return "Presentes";
  return null;
}

interface ItemAPagar {
  origem: "conta" | "assinatura" | "parcela" | "fatura";
  id: string;
  nome: string;
  valor: number;
  vencimento?: string;
  parcela?: Parcela;
}

function itensAPagar(e: EstadoApp, mes: string): ItemAPagar[] {
  const itens: ItemAPagar[] = [];
  for (const c of e.contas) {
    if (!recorrenciaNoMes(c, mes)) continue;
    itens.push({
      origem: "conta", id: c.id, nome: c.nome, valor: valorNoMes(c, mes),
      vencimento: c.diaVencimento ? diaVencimentoNoMes(mes, c.diaVencimento) : undefined,
    });
  }
  for (const a of e.assinaturas) {
    if (!recorrenciaNoMes(a, mes) || a.naFatura) continue;
    itens.push({
      origem: "assinatura", id: a.id, nome: a.nome, valor: valorNoMes(a, mes),
      vencimento: a.diaRenovacao ? diaVencimentoNoMes(mes, a.diaRenovacao) : undefined,
    });
  }
  for (const p of e.parcelas) {
    if (p.naFatura || parcelasRestantesEm(p, mes) <= 0) continue;
    itens.push({ origem: "parcela", id: p.id, nome: p.nome, valor: valorMinhaParte(p), parcela: p });
  }
  for (const f of e.faturas) {
    if (f.mes !== mes || !(f.valor > 0)) continue;
    itens.push({ origem: "fatura", id: f.id, nome: f.nome, valor: f.valor });
  }
  return itens;
}

const diasEntre = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000;

export function planejarSincronizacao(e: EstadoApp, banco: DadosBanco): Plano {
  const escritas: EscritaRelativa[] = [];
  const novos: Record<Destino, number> = {
    gasto: 0, gasto_credito: 0, ganho: 0, pago: 0, vinculado: 0, interno: 0, antes_do_inicio: 0,
  };
  // a referência fica um instante antes da leitura: o que foi lançado com
  // "agora" depois disso continua contando
  const ref = banco.lidoEm;
  const antesDaLeitura = (ms: number) => Math.min(ms, ref - 1);

  // ---- saldo: soma das contas correntes/poupança ----
  const contasBanco = banco.contas.filter((c) => c.type === "BANK");
  const saldoBanco = contasBanco.length
    ? Math.round(contasBanco.reduce((a, c) => a + (c.balance ?? 0), 0) * 100) / 100
    : null;
  // só avança: um reajuste seu feito depois da última leitura do banco vale mais
  const saldoAtualizado = saldoBanco !== null && (!e.saldo || ref > e.saldo.atualizadoEm);
  if (saldoAtualizado) {
    escritas.push({
      caminho: "saldo/atual",
      dados: { valor: saldoBanco, atualizadoEm: ref },
      campos: ["valor", "atualizadoEm"],
    });
  }

  // ---- transações ----
  const tipoDaConta = new Map(banco.contas.map((c) => [c.id, c]));
  const pagosAgora = new Set(e.pagamentos.map((p) => p.id));
  const gastosLivres = e.gastos.filter((g) => !g.idExterno && !g.estornoDeId && !g.ajusteConciliacaoId);
  const ganhosLivres = e.ganhos.filter((g) => g.tipo === "pontual" && !g.idExterno && !g.arquivado);
  const usados = new Set<string>();
  const parcelasAtualizadas = new Map<string, Parcela>();
  let pendentes = 0;

  const ordenadas = [...banco.transacoes].sort((a, b) => a.date.localeCompare(b.date));
  for (const tx of ordenadas) {
    if (e.processados.has(tx.id)) continue;
    if (tx.status === "PENDING") {
      pendentes++;
      continue; // volta quando for confirmada
    }
    const conta = tipoDaConta.get(tx.accountId);
    if (!conta) continue;
    const ms = Date.parse(tx.date);
    const dia = diaISOde(ms);
    const mes = dia.slice(0, 7);
    const valor = Math.abs(tx.amount);
    const quando = antesDaLeitura(ms);
    const registro = (destino: Destino, refId?: string) => {
      novos[destino]++;
      escritas.push({
        caminho: `bancoTransacoes/${tx.id}`,
        dados: {
          data: dia, descricao: tx.description.slice(0, 200), valor: tx.amount, conta: conta.name.slice(0, 80),
          tipoConta: conta.type, categoriaBanco: tx.category ?? null, destino, refId: refId ?? null,
          tratadoEm: ref,
        },
      });
    };

    if (e.inicioUso && dia < e.inicioUso) {
      registro("antes_do_inicio");
      continue;
    }
    if (valor === 0 || ehMovimentoInterno(tx)) {
      registro("interno");
      continue;
    }

    const cartao = conta.type === "CREDIT";
    // cartão: positivo = compra; conta: negativo = saída
    const saida = cartao ? tx.amount > 0 : tx.amount < 0;
    const descricao = descricaoLimpa(tx);

    if (cartao && !saida) {
      registro("interno"); // pagamento da fatura / estorno no cartão
      continue;
    }

    if (!saida) {
      // ---- entrada: liga a um ganho que você já anotou ou cria um recebido ----
      const manual = ganhosLivres.find(
        (g) => !usados.has(g.id) && g.mes === mes && centavos(g.valorRecebido ?? g.valor) === centavos(valor)
      );
      if (manual) {
        usados.add(manual.id);
        escritas.push({
          caminho: `ganhos/${manual.id}`,
          dados: {
            idExterno: tx.id, recebido: true, recebidoEm: quando, entrouNoSaldo: true, valorRecebido: valor,
          },
          campos: ["idExterno", "recebido", "recebidoEm", "entrouNoSaldo", "valorRecebido"],
        });
        registro("vinculado", `ganhos/${manual.id}`);
        continue;
      }
      const id = `banco_${tx.id}`;
      const texto = `${tx.description} ${tx.category ?? ""}`;
      escritas.push({
        caminho: `ganhos/${id}`,
        dados: {
          tipo: "pontual", mes, descricao, valor,
          categoriaReceita: RENDIMENTO.test(texto) ? "Rendimentos" : sugerirCategoriaReceita(descricao) || "Outros",
          // já caiu líquido na conta
          semImposto: true, recebido: true, recebidoEm: quando, entrouNoSaldo: true, valorRecebido: valor,
          idExterno: tx.id, origem: "banco", criadoEm: quando,
        },
      });
      registro("ganho", `ganhos/${id}`);
      continue;
    }

    // ---- saída da conta: primeiro o "A pagar" ----
    if (!cartao) {
      const jaLigados = new Set(e.pagamentos.filter((p) => p.idExterno).map((p) => p.id));
      const candidato = itensAPagar(e, mes).find((it) => {
        const idPag = `${mes}__${it.origem}__${it.id}`;
        if (jaLigados.has(idPag) || usados.has(idPag)) return false;
        if (it.origem === "fatura") return temPalavraEmComum(it.nome, `${tx.description} ${tx.descriptionRaw ?? ""}`);
        if (centavos(it.valor) !== centavos(valor)) return false;
        return (
          temPalavraEmComum(it.nome, `${tx.description} ${tx.descriptionRaw ?? ""}`) ||
          (!!it.vencimento && diasEntre(it.vencimento, dia) <= 5)
        );
      });
      if (candidato) {
        const idPag = `${mes}__${candidato.origem}__${candidato.id}`;
        usados.add(idPag);
        const marcado = e.pagamentos.find((p) => p.id === idPag);
        if (marcado || pagosAgora.has(idPag)) {
          // você já marcou no "A pagar": só liga e põe o pagamento antes da
          // leitura do banco (o saldo do banco já tem esse dinheiro fora)
          escritas.push({
            caminho: `pagamentos/${idPag}`,
            dados: { idExterno: tx.id, pagoEm: Math.min(marcado?.pagoEm ?? quando, quando) },
            campos: ["idExterno", "pagoEm"],
          });
          registro("vinculado", `pagamentos/${idPag}`);
          continue;
        }
        pagosAgora.add(idPag);
        escritas.push({
          caminho: `pagamentos/${idPag}`,
          dados: {
            mes, origem: candidato.origem, itemId: candidato.id, nome: candidato.nome, valor,
            pagoEm: quando, afetaSaldo: true, idExterno: tx.id,
          },
        });
        if (candidato.parcela) {
          const atual = parcelasAtualizadas.get(candidato.id) ?? candidato.parcela;
          const nova = baixaAte(atual, mes);
          if (nova) {
            parcelasAtualizadas.set(candidato.id, { ...atual, ...nova });
            escritas.push({ caminho: `parcelas/${candidato.id}`, dados: nova, campos: ["parcelasRestantes", "mesReferencia"] });
          }
        }
        if (candidato.origem === "fatura") {
          // pagar a fatura dá baixa nas parcelas que estão dentro dela
          for (const p of e.parcelas) {
            if (!p.naFatura || p.cartao !== candidato.nome || parcelasRestantesEm(p, mes) <= 0) continue;
            const atual = parcelasAtualizadas.get(p.id) ?? p;
            const nova = baixaAte(atual, mes);
            if (!nova) continue;
            parcelasAtualizadas.set(p.id, { ...atual, ...nova });
            escritas.push({ caminho: `parcelas/${p.id}`, dados: nova, campos: ["parcelasRestantes", "mesReferencia"] });
          }
        }
        registro("pago", `pagamentos/${idPag}`);
        continue;
      }
    }

    // ---- gasto que você já anotou: só liga ----
    const manual = gastosLivres.find(
      (g) =>
        !usados.has(g.id) &&
        (g.pagoCom === "credito") === cartao &&
        centavos(g.valor) === centavos(valor) &&
        diasEntre(g.data ?? diaISOde(g.criadoEm), dia) <= 3
    );
    if (manual) {
      usados.add(manual.id);
      escritas.push({
        caminho: `gastos/${manual.id}`,
        // vai pra antes da leitura: o saldo do banco já tem esse dinheiro fora
        dados: { idExterno: tx.id, criadoEm: Math.min(manual.criadoEm, quando), data: dia, mes },
        campos: ["idExterno", "criadoEm", "data", "mes"],
      });
      registro("vinculado", `gastos/${manual.id}`);
      continue;
    }

    // ---- gasto novo ----
    const sugestao = sugerirCategoria(descricao, e.gastos);
    const categoria =
      sugestao.categoria !== "Outros" ? sugestao.categoria : categoriaDoBanco(tx.category) ?? "Outros";
    const id = `banco_${tx.id}`;
    escritas.push({
      caminho: `gastos/${id}`,
      dados: {
        descricao, valor, categoria, mes, data: dia, criadoEm: quando,
        ...(cartao ? { pagoCom: "credito", cartao: (conta.marketingName || conta.name).slice(0, 60) } : {}),
        idExterno: tx.id, origem: "banco",
      },
    });
    registro(cartao ? "gasto_credito" : "gasto", `gastos/${id}`);
  }

  // ---- cofrinhos e investimentos → caixinhas com valor e rendimento reais ----
  let caixinhas = 0;
  for (const inv of banco.investimentos) {
    const id = `banco_${inv.id}`;
    const existe = e.caixinhas.some((c) => c.id === id);
    const saldo = Math.round((inv.balance ?? 0) * 100) / 100;
    const rendimento = Math.round((inv.amountProfit ?? 0) * 100) / 100;
    const cdi = inv.rateType && /cdi/i.test(inv.rateType) && inv.rate ? Math.round(inv.rate) : undefined;
    caixinhas++;
    if (existe) {
      escritas.push({
        caminho: `caixinhas/${id}`,
        dados: { saldo, rendimento, atualizadoEm: ref, ...(cdi ? { percentualCdi: cdi } : {}) },
        campos: ["saldo", "rendimento", "atualizadoEm", ...(cdi ? ["percentualCdi"] : [])],
      });
    } else {
      escritas.push({
        caminho: `caixinhas/${id}`,
        dados: {
          nome: inv.name.slice(0, 60), saldo, rendimento, porGasto: 0, meta: null, ativa: true, depositos: 0,
          criadoEm: ref, atualizadoEm: ref, idExterno: inv.id, origem: "banco",
          ...(cdi ? { percentualCdi: cdi } : {}),
        },
      });
    }
  }

  return { escritas, resumo: { saldoBanco, saldoAtualizado, novos, caixinhas, pendentes } };
}
