"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  doc,
  getDocs,
  increment,
  runTransaction,
  serverTimestamp,
  writeBatch,
  DocumentReference,
} from "firebase/firestore";
import { db } from "./firebase";
import { estornarGasto, removerGasto, comEstornoDerivado } from "./gastosOperacoes";
import { Caixinha, Gasto } from "./types";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";
import { anexarAuditLog } from "./auditoria";
import { depositoDoGasto } from "./finance/caixinhas";
import { hojeISO } from "./finance/calculations";
import { gastoContaNoSaldo } from "./finance/saldo";

export interface OpcoesNovoGasto {
  /** Dia em que aconteceu ("AAAA-MM-DD"). Padrão: hoje. */
  data?: string;
  /**
   * Chave de idempotência: a mesma chave nunca cria dois gastos, mesmo com
   * clique duplo, duas abas ou reenvio depois de erro de rede (auditoria D).
   * Gere uma por prévia/confirmação, não por clique.
   */
  chave?: string;
  /** "credito" = comprado no cartão: não sai do saldo agora (sai na fatura). */
  pagoCom?: "conta" | "credito";
  cartao?: string;
}

/** Id aceito pelo Firestore a partir da chave (sem barra, tamanho limitado). */
function idDaChave(chave: string): string {
  return `g_${chave.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80)}`;
}

/** Batch ou transação — os dois têm `update` nessa forma. */
interface Escrita {
  update(ref: DocumentReference, dados: Record<string, unknown>): unknown;
}

export function useGastos() {
  const { user } = useAuth();
  const [todos, setTodos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      collection(db, "usuarios", user.uid, "gastos"),
      (snap) => {
        setTodos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Gasto)));
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

  // "estornado" derivado do lançamento de estorno (o original não é editado)
  const gastos = useMemo(
    () => comEstornoDerivado(todos).sort((a, b) => b.criadoEm - a.criadoEm),
    [todos]
  );

  /**
   * Caixinhas lidas na hora, direto do banco — antes vinham do estado de
   * outro hook, e um gasto registrado enquanto ele ainda carregava perdia
   * o depósito calado (auditoria M).
   */
  async function caixinhasAgora(uid: string): Promise<Caixinha[]> {
    const snap = await getDocs(collection(db, "usuarios", uid, "caixinhas"));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Caixinha));
  }

  /**
   * Movimento nas caixinhas. `increment` é atômico no servidor: dois gastos
   * ao mesmo tempo nunca sobrescrevem o depósito um do outro. Só mexe em
   * caixinha que existe — update em doc apagado derrubaria o gasto junto.
   */
  function aplicarNasCaixinhas(
    escrita: Escrita,
    uid: string,
    deposito: Record<string, number>,
    existentes: Set<string>
  ) {
    for (const [caixinhaId, valor] of Object.entries(deposito)) {
      if (!existentes.has(caixinhaId)) continue;
      escrita.update(doc(db, "usuarios", uid, "caixinhas", caixinhaId), {
        saldo: increment(valor),
        depositos: increment(valor >= 0 ? 1 : -1),
        atualizadoEm: Date.now(),
      });
    }
  }

  /**
   * Registra o gasto e, na mesma transação, guarda o valor configurado em
   * cada caixinha ativa (transferência pro cofrinho — sai do saldo junto,
   * ver docs/modelo-financeiro.md). Com `chave`, é idempotente: se o gasto
   * com essa chave já existe, não grava de novo e responde sucesso.
   */
  async function adicionar(
    descricao: string,
    valor: number,
    categoria: string,
    opcoes: OpcoesNovoGasto = {}
  ) {
    if (!user) return false;
    if (!Number.isFinite(valor) || valor <= 0 || valor > 1_000_000) {
      setErro("Valor inválido.");
      return false;
    }
    const data = opcoes.data ?? hojeISO();
    try {
      const caixinhas = await caixinhasAgora(user.uid);
      const deposito = depositoDoGasto(caixinhas);
      const guardouAlgo = Object.keys(deposito).length > 0;
      const ref = opcoes.chave
        ? doc(db, "usuarios", user.uid, "gastos", idDaChave(opcoes.chave))
        : doc(collection(db, "usuarios", user.uid, "gastos"));

      await runTransaction(db, async (tx) => {
        if (opcoes.chave && (await tx.get(ref)).exists()) return; // já gravado
        tx.set(ref, {
          descricao,
          valor,
          categoria,
          data,
          mes: data.slice(0, 7),
          criadoEm: Date.now(),
          registradoEm: serverTimestamp(),
          ...(guardouAlgo ? { guardado: deposito } : {}),
          ...(opcoes.pagoCom === "credito"
            ? { pagoCom: "credito", ...(opcoes.cartao ? { cartao: opcoes.cartao } : {}) }
            : {}),
        });
        aplicarNasCaixinhas(tx, user.uid, deposito, new Set(caixinhas.map((c) => c.id)));
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
    dados: {
      descricao: string;
      valor: number;
      categoria: string;
      data?: string;
      pagoCom?: "conta" | "credito";
      cartao?: string;
    }
  ) {
    if (!user) return false;
    if (!Number.isFinite(dados.valor) || dados.valor <= 0) {
      setErro("Valor inválido.");
      return false;
    }
    const gasto = todos.find((g) => g.id === id);
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "gastos", id);
      batch.update(ref, {
        descricao: dados.descricao,
        valor: dados.valor,
        categoria: dados.categoria,
        ...(dados.data ? { data: dados.data, mes: dados.data.slice(0, 7) } : {}),
        // corrigir um registro antigo que foi no crédito muda o saldo — é a correção
        ...(dados.pagoCom
          ? { pagoCom: dados.pagoCom, cartao: dados.pagoCom === "credito" ? dados.cartao ?? "" : "" }
          : {}),
      });
      if (gasto) {
        anexarAuditLog(batch, user.uid, user.email, {
          action: "updated",
          entityType: "gasto",
          entityId: id,
          summary: `"${gasto.descricao}" editado`,
          before: {
            descricao: gasto.descricao,
            valor: gasto.valor,
            categoria: gasto.categoria,
            data: gasto.data,
            pagoCom: gasto.pagoCom ?? "conta",
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
   * Estorno: contrapartida negativa no mês atual, ligada ao original, sem
   * editar o original (funciona com mês fechado). Ver gastosOperacoes.ts.
   */
  async function estornar(id: string, motivo: string) {
    if (!user) return false;
    try {
      const caixinhas = new Set((await caixinhasAgora(user.uid)).map((c) => c.id));
      const feito = await estornarGasto(db, user.uid, id, hojeISO(), caixinhas, (tx, original) =>
        anexarAuditLog(tx, user.uid, user.email, {
          action: "reversed",
          entityType: "gasto",
          entityId: id,
          summary: `Estorno de "${original.descricao}": ${motivo}`,
          before: { valor: original.valor, categoria: original.categoria },
          after: { motivo },
        })
      );

      if (feito === "ja") {
        setErro("Esse gasto já foi estornado.");
        return false;
      }
      if (feito === "sumiu") {
        setErro("Esse gasto não existe mais.");
        return false;
      }
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  /**
   * Exclusão definitiva, pra lançamento feito por engano. Par
   * gasto/estorno sai junto — mas só quando os dois estão do mesmo lado do
   * saldo informado. Com lados diferentes (gasto antes de você atualizar o
   * saldo, estorno depois), apagar mudaria o saldo sem explicação
   * (auditoria F05): o app recusa e o par fica no histórico.
   */
  async function remover(id: string, motivo: string) {
    if (!user) return false;
    const gasto = todos.find((g) => g.id === id);
    if (!gasto) return false;
    const idOriginal = gasto.estornoDeId ?? gasto.id;
    const estornoConhecido = todos.find((g) => g.estornoDeId === idOriginal)?.id ?? null;
    try {
      const caixinhas = new Set((await caixinhasAgora(user.uid)).map((c) => c.id));
      const r = await removerGasto(db, user.uid, id, estornoConhecido, caixinhas, (tx, original, estorno) =>
        anexarAuditLog(tx, user.uid, user.email, {
          action: "archived",
          entityType: "gasto",
          entityId: original.id,
          summary: estorno
            ? `Exclusão definitiva do par estorno/original de "${original.descricao}": ${motivo}`
            : `Exclusão definitiva de "${original.descricao}": ${motivo}`,
          before: estorno ? { original, estorno } : { ...original },
        })
      );
      if (r === "lados_diferentes") {
        setErro(
          "Esse gasto e o estorno dele ficam em lados diferentes da última atualização de saldo — apagar mudaria o saldo. Eles ficam no histórico."
        );
        return false;
      }
      if (r === "sumiu") {
        setErro("Esse lançamento não existe mais.");
        return false;
      }
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  /** Esse gasto já está descontado do saldo atual? (pra explicar o efeito de apagar). */
  function mudaSaldoAoApagar(g: Gasto, ref: { valor: number; atualizadoEm: number } | null) {
    return !!ref && gastoContaNoSaldo(g, ref);
  }

  return { gastos, loading, erro, adicionar, editar, estornar, remover, mudaSaldoAoApagar };
}
