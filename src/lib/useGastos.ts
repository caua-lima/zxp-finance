"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  increment,
  runTransaction,
  serverTimestamp,
  writeBatch,
  DocumentReference,
} from "firebase/firestore";
import { db } from "./firebase";
import { Caixinha, Gasto } from "./types";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";
import { anexarAuditLog } from "./auditoria";
import { depositoDoGasto } from "./finance/caixinhas";
import { hojeISO } from "./finance/calculations";
import { exclusaoDoParMudaSaldo, gastoContaNoSaldo } from "./finance/saldo";

export interface OpcoesNovoGasto {
  /** Dia em que aconteceu ("AAAA-MM-DD"). Padrão: hoje. */
  data?: string;
  /**
   * Chave de idempotência: a mesma chave nunca cria dois gastos, mesmo com
   * clique duplo, duas abas ou reenvio depois de erro de rede (auditoria D).
   * Gere uma por prévia/confirmação, não por clique.
   */
  chave?: string;
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

  const gastos = useMemo(
    () => [...todos].sort((a, b) => b.criadoEm - a.criadoEm),
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

  function inverter(deposito: Record<string, number>): Record<string, number> {
    return Object.fromEntries(Object.entries(deposito).map(([k, v]) => [k, -v]));
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
    dados: { descricao: string; valor: number; categoria: string; data?: string }
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
   * Estorno: o original fica (marcado `estornado`) e uma contrapartida
   * negativa devolve o valor. Roda numa transação que relê o original e
   * usa um id FIXO pro estorno (`estorno__<id>`): duas abas estornando ao
   * mesmo tempo produzem um estorno só (auditoria F04). O depósito nas
   * caixinhas volta junto, e o estorno carrega esse movimento negativo —
   * assim original + estorno somam zero também no saldo.
   */
  async function estornar(id: string, motivo: string) {
    if (!user) return false;
    try {
      const caixinhas = new Set((await caixinhasAgora(user.uid)).map((c) => c.id));
      const refOriginal = doc(db, "usuarios", user.uid, "gastos", id);
      const refEstorno = doc(db, "usuarios", user.uid, "gastos", `estorno__${id}`);

      const feito = await runTransaction(db, async (tx) => {
        const snap = await tx.get(refOriginal);
        const jaExiste = (await tx.get(refEstorno)).exists();
        if (!snap.exists()) return "sumiu";
        const original = { id, ...snap.data() } as Gasto;
        if (original.estornado || original.estornoDeId || jaExiste) return "ja";

        const hoje = hojeISO();
        tx.update(refOriginal, { estornado: true, estornadoEm: Date.now() });
        tx.set(refEstorno, {
          descricao: `Estorno: ${original.descricao}`,
          valor: -original.valor,
          categoria: original.categoria,
          data: hoje,
          mes: hoje.slice(0, 7),
          criadoEm: Date.now(),
          registradoEm: serverTimestamp(),
          estornoDeId: id,
          ...(original.guardado ? { guardado: inverter(original.guardado) } : {}),
        });
        if (original.guardado) {
          aplicarNasCaixinhas(tx, user.uid, inverter(original.guardado), caixinhas);
        }
        anexarAuditLog(tx, user.uid, user.email, {
          action: "reversed",
          entityType: "gasto",
          entityId: id,
          summary: `Estorno de "${original.descricao}": ${motivo}`,
          before: { valor: original.valor, categoria: original.categoria },
          after: { motivo },
        });
        return "ok";
      });

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
    const original = todos.find((g) => g.id === idOriginal);
    const estorno = todos.find((g) => g.estornoDeId === idOriginal);
    if (!original) return false;

    try {
      const snapSaldo = await getDoc(doc(db, "usuarios", user.uid, "saldo", "atual"));
      const ref = snapSaldo.exists()
        ? (snapSaldo.data() as { valor: number; atualizadoEm: number })
        : null;
      if (estorno && exclusaoDoParMudaSaldo(original, estorno, ref)) {
        setErro(
          "Esse gasto e o estorno dele ficam em lados diferentes da última atualização de saldo — apagar mudaria o saldo. Eles ficam no histórico."
        );
        return false;
      }

      const caixinhas = new Set((await caixinhasAgora(user.uid)).map((c) => c.id));
      const batch = writeBatch(db);
      anexarAuditLog(batch, user.uid, user.email, {
        action: "archived",
        entityType: "gasto",
        entityId: original.id,
        summary: estorno
          ? `Exclusão definitiva do par estorno/original de "${original.descricao}": ${motivo}`
          : `Exclusão definitiva de "${original.descricao}": ${motivo}`,
        before: estorno ? { original, estorno } : { ...original },
      });
      // sem estorno, o gasto some agora e o que ele guardou volta junto
      if (!estorno && original.guardado) {
        aplicarNasCaixinhas(batch, user.uid, inverter(original.guardado), caixinhas);
      }
      batch.delete(doc(db, "usuarios", user.uid, "gastos", original.id));
      if (estorno) batch.delete(doc(db, "usuarios", user.uid, "gastos", estorno.id));
      await batch.commit();
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
