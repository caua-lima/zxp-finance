"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { Ganho, calcularImposto } from "./types";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";
import { anexarAuditLog } from "./auditoria";

export function useGanhos(mes: string) {
  const { user } = useAuth();
  const [todos, setTodos] = useState<Ganho[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

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
        // "!== recorrente" em vez de "=== pontual": alguns docs antigos foram
        // criados sem o campo `tipo` (ou vieram de edição manual no
        // Firestore) — sem esse fallback eles não batiam em nenhum dos dois
        // filtros e ficavam invisíveis pra sempre, mesmo contando dinheiro
        // de verdade em algum lugar. Tratar "sem tipo" como pontual os traz
        // de volta pra tela, onde dá pra editar/arquivar/excluir.
        .filter((g) => g.tipo !== "recorrente" && g.mes === mes)
        .sort((a, b) => b.criadoEm - a.criadoEm),
    [todos, mes]
  );

  async function adicionarRecorrente(
    descricao: string,
    valor: number,
    categoriaReceita?: string
  ) {
    if (!user) return;
    try {
      await addDoc(collection(db, "usuarios", user.uid, "ganhos"), {
        tipo: "recorrente",
        ativo: true,
        descricao,
        valor,
        ...(categoriaReceita ? { categoriaReceita } : {}),
        criadoEm: Date.now(),
      });
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function adicionarPontual(
    descricao: string,
    valor: number,
    categoriaReceita?: string,
    recebido: boolean = true
  ) {
    if (!user) return;
    try {
      await addDoc(collection(db, "usuarios", user.uid, "ganhos"), {
        tipo: "pontual",
        mes,
        descricao,
        valor,
        ...(categoriaReceita ? { categoriaReceita } : {}),
        // ganho pontual normalmente é lançado depois que o dinheiro já
        // caiu (igual gasto) — recebido:true por padrão evita "Entradas
        // previstas" inflado com dinheiro que já entrou. Quem lança algo
        // que ainda vai receber desmarca o "Recebido" na lista depois.
        recebido,
        recebidoEm: recebido ? Date.now() : null,
        criadoEm: Date.now(),
      });
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function editar(
    id: string,
    dados: { descricao: string; valor: number; categoriaReceita?: string }
  ) {
    if (!user) return;
    try {
      await updateDoc(doc(db, "usuarios", user.uid, "ganhos", id), {
        descricao: dados.descricao,
        valor: dados.valor,
        categoriaReceita: dados.categoriaReceita ?? null,
      });
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  /**
   * Exclusão definitiva só depois de arquivado: recorrente precisa estar
   * com ativo:false, pontual precisa estar com arquivado:true. Snapshot
   * completo vai pro audit log antes de apagar.
   */
  async function remover(id: string, motivo: string) {
    if (!user) return;
    const ganho = todos.find((g) => g.id === id);
    if (!ganho) return;
    const arquivadoPara = ganho.tipo === "recorrente" ? ganho.ativo === false : !!ganho.arquivado;
    if (!arquivadoPara) {
      setErro("Arquive o ganho antes de excluir definitivamente.");
      return;
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
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function alternarAtivo(id: string, ativo: boolean) {
    if (!user) return;
    const ganho = todos.find((g) => g.id === id);
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "ganhos", id);
      batch.update(ref, { ativo });
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
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function marcarRecebidoPontual(id: string, recebido: boolean) {
    if (!user) return;
    const ganho = todos.find((g) => g.id === id);
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "ganhos", id);
      batch.update(ref, { recebido, recebidoEm: recebido ? Date.now() : null });
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
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function alternarArquivadoPontual(id: string, ativo: boolean) {
    if (!user) return;
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
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  const totalRecorrentes = recorrentes
    .filter((g) => g.ativo !== false)
    .reduce((acc, g) => acc + g.valor, 0);
  const totalPontuais = pontuais
    .filter((g) => !g.arquivado)
    .reduce((acc, g) => acc + g.valor, 0);
  const total = totalRecorrentes + totalPontuais;
  const imposto = calcularImposto(total);
  const totalLiquido = total - imposto;

  return {
    recorrentes,
    pontuais,
    loading,
    erro,
    total,
    imposto,
    totalLiquido,
    adicionarRecorrente,
    adicionarPontual,
    editar,
    remover,
    alternarAtivo,
    alternarArquivadoPontual,
    marcarRecebidoPontual,
  };
}
