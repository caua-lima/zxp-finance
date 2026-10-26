"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { Ganho, calcularImposto, mesPadrao } from "./types";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";
import { anexarAuditLog } from "./auditoria";
import { useComissoes } from "./useComissoes";
import { comissaoAReceber } from "./finance/comissaoPrevista";
import { recebimentosAvulsos } from "./finance/saldo";
import { historicoAoMudarValor, mudancaDeAtivo, recorrenciaDoGanho, recorrenciaNoMes, valorNoMes } from "./finance/recorrencia";

export function useGanhos(mes: string) {
  const { user } = useAuth();
  const [todos, setTodos] = useState<Ganho[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const comissoes = useComissoes(mes);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      collection(db, "usuarios", user.uid, "ganhos"),
      (snap) => {
        setTodos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Ganho)));
        setLoading(false);
        setErro(null);
      },
      (e) => {
        setErro(mensagemErro(e));
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user]);

  const recorrentes = useMemo(
    () =>
      todos
        .filter((g) => g.tipo === "recorrente")
        .sort((a, b) => b.criadoEm - a.criadoEm),
    [todos]
  );

  const pontuais = useMemo(
    () =>
      todos
        .filter((g) => g.tipo === "pontual" && g.mes === mes)
        .sort((a, b) => b.criadoEm - a.criadoEm),
    [todos, mes]
  );

  // Documento sem `tipo` reconhecido não bate em nenhum filtro acima —
  // fica invisível em qualquer tela do app pra sempre, mas continua
  // ocupando espaço na coleção. Normalmente sobra de edição manual direto
  // no Firestore. Exposto à parte pra dar um jeito de ver/limpar isso.
  const orfaos = useMemo(
    () => todos.filter((g) => g.tipo !== "recorrente" && g.tipo !== "pontual"),
    [todos]
  );

  async function adicionarRecorrente(
    descricao: string,
    valor: number,
    categoriaReceita?: string,
    semImposto: boolean = false
  ) {
    if (!user) return false;
    try {
      await addDoc(collection(db, "usuarios", user.uid, "ganhos"), {
        tipo: "recorrente",
        ativo: true,
        descricao,
        valor,
        ...(categoriaReceita ? { categoriaReceita } : {}),
        ...(semImposto ? { semImposto } : {}),
        criadoEm: Date.now(),
      });
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  async function adicionarPontual(
    descricao: string,
    valor: number,
    categoriaReceita?: string,
    recebido: boolean = true,
    semImposto: boolean = false,
    origemComissao?: string
  ) {
    if (!user) return false;
    try {
      await addDoc(collection(db, "usuarios", user.uid, "ganhos"), {
        tipo: "pontual",
        mes,
        descricao,
        valor,
        ...(categoriaReceita ? { categoriaReceita } : {}),
        ...(semImposto ? { semImposto } : {}),
        ...(origemComissao ? { origemComissao } : {}),
        // ganho pontual normalmente é lançado depois que o dinheiro já
        // caiu (igual gasto) — recebido:true por padrão evita "Entradas
        // previstas" inflado com dinheiro que já entrou. Quem lança algo
        // que ainda vai receber desmarca o "Recebido" na lista depois.
        recebido,
        recebidoEm: recebido ? Date.now() : null,
        criadoEm: Date.now(),
      });
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  async function editar(
    id: string,
    dados: { descricao: string; valor: number; categoriaReceita?: string; semImposto?: boolean }
  ) {
    if (!user) return false;
    const ganho = todos.find((g) => g.id === id);
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "ganhos", id);
      // recorrente: valor novo vale do mês atual em diante; meses passados
      // continuam com o valor que tinham (auditoria 25/10 D27)
      const mudouValorRecorrente = ganho?.tipo === "recorrente" && ganho.valor !== dados.valor;
      batch.update(ref, {
        descricao: dados.descricao,
        valor: dados.valor,
        categoriaReceita: dados.categoriaReceita ?? null,
        semImposto: !!dados.semImposto,
        ...(mudouValorRecorrente
          ? { historicoValores: historicoAoMudarValor(recorrenciaDoGanho(ganho!), dados.valor, mesPadrao()) }
          : {}),
      });
      if (ganho) {
        anexarAuditLog(batch, user.uid, user.email, {
          action: "updated",
          entityType: "ganho",
          entityId: id,
          summary: `"${ganho.descricao}" editado`,
          before: {
            descricao: ganho.descricao,
            valor: ganho.valor,
            categoriaReceita: ganho.categoriaReceita,
            semImposto: ganho.semImposto,
          },
          after: dados,
        });
      }
      await batch.commit();
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  /**
   * Exclusão definitiva só depois de arquivado: recorrente precisa estar
   * com ativo:false, pontual precisa estar com arquivado:true. Snapshot
   * completo vai pro audit log antes de apagar.
   */
  async function remover(id: string, motivo: string) {
    if (!user) return false;
    const ganho = todos.find((g) => g.id === id);
    if (!ganho) return false;
    const arquivadoPara = ganho.tipo === "recorrente" ? ganho.ativo === false : !!ganho.arquivado;
    if (!arquivadoPara) {
      setErro("Arquive o ganho antes de excluir definitivamente.");
      return false;
    }
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "ganhos", id);
      anexarAuditLog(batch, user.uid, user.email, {
        action: "archived",
        entityType: "ganho",
        entityId: id,
        summary: `Exclusão definitiva de "${ganho.descricao}": ${motivo}`,
        before: { ...ganho },
      });
      batch.delete(ref);
      await batch.commit();
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  /**
   * Exclusão direta de um documento órfão (sem `tipo` reconhecido) — não
   * passa pela regra "arquive antes de excluir" porque esse documento não
   * é um ganho normal navegável pela UI, é sobra de dado malformado.
   */
  async function removerOrfao(id: string) {
    if (!user) return false;
    const ganho = todos.find((g) => g.id === id);
    if (!ganho) return false;
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "ganhos", id);
      anexarAuditLog(batch, user.uid, user.email, {
        action: "archived",
        entityType: "ganho",
        entityId: id,
        summary: `Exclusão de documento órfão (sem tipo reconhecido): "${ganho.descricao ?? id}"`,
        before: { ...ganho },
      });
      batch.delete(ref);
      await batch.commit();
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  async function alternarAtivo(id: string, ativo: boolean) {
    if (!user) return false;
    const ganho = todos.find((g) => g.id === id);
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "ganhos", id);
      // arquivar guarda o mês: os meses anteriores continuam com o ganho
      batch.update(ref, { ativo, ...mudancaDeAtivo(ganho ?? {}, ativo, mesPadrao()) });
      if (ganho) {
        anexarAuditLog(batch, user.uid, user.email, {
          action: ativo ? "updated" : "archived",
          entityType: "ganho",
          entityId: id,
          summary: ativo ? `"${ganho.descricao}" reativado` : `"${ganho.descricao}" arquivado`,
          before: { ativo: ganho.ativo },
          after: { ativo },
        });
      }
      await batch.commit();
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  async function marcarRecebidoPontual(
    id: string,
    recebido: boolean,
    /** Com entraNoSaldo, o líquido recebido soma ao saldo (uma vez; desmarcar tira). */
    opcoes: { entraNoSaldo?: boolean; valorLiquido?: number } = {}
  ) {
    if (!user) return false;
    const ganho = todos.find((g) => g.id === id);
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "ganhos", id);
      const entra = recebido && !!opcoes.entraNoSaldo && opcoes.valorLiquido !== undefined;
      batch.update(ref, {
        recebido,
        recebidoEm: recebido ? Date.now() : null,
        entrouNoSaldo: entra,
        valorRecebido: entra ? opcoes.valorLiquido : null,
      });
      if (ganho) {
        anexarAuditLog(batch, user.uid, user.email, {
          action: recebido ? "received" : "updated",
          entityType: "ganho",
          entityId: id,
          summary: recebido ? `"${ganho.descricao}" marcado como recebido` : `"${ganho.descricao}" marcado como não recebido`,
          before: { recebido: !!ganho.recebido },
          after: { recebido },
        });
      }
      await batch.commit();
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  async function alternarArquivadoPontual(id: string, ativo: boolean) {
    if (!user) return false;
    const arquivado = !ativo;
    const ganho = todos.find((g) => g.id === id);
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "ganhos", id);
      batch.update(ref, { arquivado });
      if (ganho) {
        anexarAuditLog(batch, user.uid, user.email, {
          action: arquivado ? "archived" : "updated",
          entityType: "ganho",
          entityId: id,
          summary: arquivado ? `"${ganho.descricao}" arquivado` : `"${ganho.descricao}" reativado`,
          before: { arquivado: !!ganho.arquivado },
          after: { arquivado },
        });
      }
      await batch.commit();
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  // Comissão lançada no mês anterior cai neste mês: é ganho como qualquer
  // outro (com imposto), só que calculada a partir dos lançamentos diários.
  const comissaoDoMes = comissaoAReceber(mes, comissoes.todas, todos);
  const brutoComissao = comissaoDoMes?.restanteBruto ?? 0;

  // recorrente no mês: vigência (início/arquivamento) e valor daquele mês
  const recorrentesNoMes = recorrentes.filter((g) => recorrenciaNoMes(recorrenciaDoGanho(g), mes));
  const totalRecorrentes = recorrentesNoMes.reduce((acc, g) => acc + valorNoMes(g, mes), 0);
  const totalPontuais = pontuais
    .filter((g) => !g.arquivado)
    .reduce((acc, g) => acc + g.valor, 0);
  const total = totalRecorrentes + totalPontuais + brutoComissao;
  // Imposto só incide sobre o que não foi marcado como "sem imposto" (ex:
  // bico/trabalho por fora recebido já líquido) — não é uma taxa sobre o
  // total, é a soma do imposto de cada ganho tributável individualmente.
  const totalTributavel =
    [...recorrentesNoMes.map((g) => ({ ...g, valor: valorNoMes(g, mes) })), ...pontuais.filter((g) => !g.arquivado)]
      .filter((g) => !g.semImposto)
      .reduce((acc, g) => acc + g.valor, 0) + brutoComissao;
  const imposto = calcularImposto(totalTributavel);
  const totalLiquido = total - imposto;

  // ganhos avulsos que entraram no saldo (todos os meses) — o saldo confirmado precisa deles
  const recebimentosNoSaldo = useMemo(() => recebimentosAvulsos(todos), [todos]);

  return {
    recebimentosNoSaldo,
    recorrentes,
    pontuais,
    orfaos,
    comissaoDoMes,
    loading: loading || comissoes.loading,
    erro,
    total,
    imposto,
    totalLiquido,
    adicionarRecorrente,
    adicionarPontual,
    editar,
    remover,
    removerOrfao,
    alternarAtivo,
    alternarArquivadoPontual,
    marcarRecebidoPontual,
  };
}
