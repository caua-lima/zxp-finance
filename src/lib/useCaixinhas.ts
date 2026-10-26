"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  writeBatch,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { Transferencia } from "./finance/saldo";
import { db } from "./firebase";
import { Caixinha, arredondarCentavos, formatarMoeda } from "./types";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";
import { anexarAuditLog } from "./auditoria";

/**
 * Caixinhas: potinhos de dinheiro guardado que se enchem sozinhos a cada
 * gasto registrado. O depósito automático em si mora em useGastos — é lá
 * que o gasto é gravado, e as duas coisas precisam acontecer no mesmo
 * batch pra nunca sobrar uma sem a outra. Aqui fica o cadastro e o
 * ajuste manual.
 */
export function useCaixinhas() {
  const { user } = useAuth();
  const [todas, setTodas] = useState<Caixinha[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);

  // guardar/resgatar: movimentos de caixa que o saldo confirmado precisa ver
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      collection(db, "usuarios", user.uid, "transferencias"),
      (snap) => setTransferencias(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Transferencia)),
      (e) => setErro(mensagemErro(e))
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      collection(db, "usuarios", user.uid, "caixinhas"),
      (snap) => {
        setTodas(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as Caixinha))
        );
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

  const caixinhas = useMemo(
    () => [...todas].sort((a, b) => a.criadoEm - b.criadoEm),
    [todas]
  );

  async function criar(dados: {
    nome: string;
    saldo: number;
    porGasto: number;
    meta?: number;
    percentualCdi?: number;
  }) {
    if (!user) return false;
    try {
      const agora = Date.now();
      await addDoc(collection(db, "usuarios", user.uid, "caixinhas"), {
        nome: dados.nome,
        saldo: arredondarCentavos(dados.saldo),
        porGasto: arredondarCentavos(dados.porGasto),
        // null e não undefined: o Firestore deste projeto rejeita undefined,
        // e null aqui significa "sem meta" de forma explícita
        meta: dados.meta ? arredondarCentavos(dados.meta) : null,
        ativa: true,
        depositos: 0,
        criadoEm: agora,
        atualizadoEm: agora,
        // só pra estimativa de rendimento na tela — nunca soma no saldo
        percentualCdi: Math.max(0, dados.percentualCdi ?? 0),
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
    dados: { nome: string; porGasto: number; meta?: number; percentualCdi?: number }
  ) {
    if (!user) return false;
    try {
      await updateDoc(doc(db, "usuarios", user.uid, "caixinhas", id), {
        nome: dados.nome,
        porGasto: arredondarCentavos(dados.porGasto),
        meta: dados.meta ? arredondarCentavos(dados.meta) : null,
        percentualCdi: Math.max(0, dados.percentualCdi ?? 0),
        atualizadoEm: Date.now(),
      });
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  /**
   * Corrige o saldo pra bater com o que realmente está guardado. Vai pro
   * audit log com o valor antigo porque é a única operação que muda o
   * saldo sem ser um depósito — sem registro não daria pra explicar
   * depois por que o número pulou.
   */
  async function ajustarSaldo(id: string, novoSaldo: number) {
    if (!user) return false;
    const ref = doc(db, "usuarios", user.uid, "caixinhas", id);
    try {
      // transação: lê o saldo ATUAL no servidor (um depósito automático pode
      // ter chegado depois da tela abrir) e registra a base e a diferença
      // reais — antes um ajuste podia apagar um depósito concorrente (F03).
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Essa caixinha não existe mais.");
        const base = snap.data().saldo as number;
        const novo = arredondarCentavos(novoSaldo);
        tx.update(ref, { saldo: novo, atualizadoEm: Date.now() });
        anexarAuditLog(tx, user.uid, user.email, {
          action: "updated",
          entityType: "caixinha",
          entityId: id,
          summary: `Caixinha "${snap.data().nome}" corrigida à mão: ${formatarMoeda(base)} → ${formatarMoeda(novo)} (${novo - base >= 0 ? "+" : ""}${formatarMoeda(novo - base)})`,
          before: { saldo: base },
          after: { saldo: novo },
        });
      });
      setErro(null);
      return true;
    } catch (e) {
      setErro(e instanceof Error && !("code" in e) ? e.message : mensagemErro(e));
      return false;
    }
  }

  /**
   * Guardar (saldo → caixinha) ou resgatar (caixinha → saldo). Uma
   * transação grava a transferência (imutável, id = chave: clicar duas
   * vezes grava uma só) e muda o saldo da caixinha, juntos. Resgatar mais
   * do que tem é recusado.
   */
  async function transferir(
    caixinhaId: string,
    direcao: "guardar" | "resgatar",
    valor: number,
    chave: string
  ): Promise<boolean> {
    if (!user) return false;
    const centavos = Math.round(valor * 100);
    if (!Number.isFinite(valor) || centavos <= 0) {
      setErro("Informe um valor maior que zero.");
      return false;
    }
    const refCaixinha = doc(db, "usuarios", user.uid, "caixinhas", caixinhaId);
    const refTransf = doc(db, "usuarios", user.uid, "transferencias", `t_${chave}`);
    try {
      await runTransaction(db, async (tx) => {
        const [caixa, ja] = await Promise.all([tx.get(refCaixinha), tx.get(refTransf)]);
        if (ja.exists()) return; // repetição: já gravado
        if (!caixa.exists()) throw new Error("Essa caixinha não existe mais.");
        const saldoAtual = caixa.data().saldo as number;
        const delta = (direcao === "guardar" ? 1 : -1) * (centavos / 100);
        if (direcao === "resgatar" && Math.round(saldoAtual * 100) < centavos) {
          throw new Error(`A caixinha tem ${formatarMoeda(saldoAtual)}: não dá pra resgatar mais do que isso.`);
        }
        tx.set(refTransf, {
          caixinhaId,
          nome: caixa.data().nome,
          direcao,
          valor: centavos / 100,
          criadoEm: Date.now(),
          registradoEm: serverTimestamp(),
        });
        tx.update(refCaixinha, { saldo: arredondarCentavos(saldoAtual + delta), atualizadoEm: Date.now() });
      });
      setErro(null);
      return true;
    } catch (e) {
      setErro(e instanceof Error && !("code" in e) ? e.message : mensagemErro(e));
      return false;
    }
  }

  /** Pausa/retoma o depósito automático sem mexer no que já foi guardado. */
  async function alternarAtiva(id: string) {
    if (!user) return false;
    const caixinha = todas.find((c) => c.id === id);
    if (!caixinha) return false;
    try {
      await updateDoc(doc(db, "usuarios", user.uid, "caixinhas", id), {
        ativa: !caixinha.ativa,
        atualizadoEm: Date.now(),
      });
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  async function remover(id: string) {
    if (!user) return false;
    const caixinha = todas.find((c) => c.id === id);
    if (!caixinha) return false;
    // com dinheiro dentro, excluir faria o dinheiro "sumir" do controle:
    // primeiro resgata (volta pro saldo), depois exclui (F03)
    if (Math.round(caixinha.saldo * 100) !== 0) {
      setErro(`"${caixinha.nome}" ainda tem ${formatarMoeda(caixinha.saldo)}. Resgate antes de excluir.`);
      return false;
    }
    try {
      const batch = writeBatch(db);
      anexarAuditLog(batch, user.uid, user.email, {
        action: "archived",
        entityType: "caixinha",
        entityId: id,
        summary: `Caixinha "${caixinha.nome}" excluída com ${formatarMoeda(
          caixinha.saldo
        )} guardado`,
        before: { ...caixinha },
      });
      batch.delete(doc(db, "usuarios", user.uid, "caixinhas", id));
      await batch.commit();
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  return {
    caixinhas,
    transferencias,
    transferir,
    loading,
    erro,
    criar,
    editar,
    ajustarSaldo,
    alternarAtiva,
    remover,
  };
}
