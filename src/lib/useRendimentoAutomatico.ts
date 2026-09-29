"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import { arredondarCentavos } from "./types";
import { hojeISO } from "./finance/calculations";
import {
  calcularRendimento,
  diaAnterior,
  somarPorMes,
  TaxaDiaria,
} from "./finance/rendimento";

/**
 * Soma sozinho o rendimento do CDI no saldo da conta e em cada caixinha,
 * toda vez que o app abre — sem precisar lançar nada. Cada um guarda até
 * que dia já rendeu (`rendimentoAte`), então abrir o app de novo, em
 * outra aba ou no celular, nunca rende o mesmo dia duas vezes: a conta
 * roda dentro de uma transação que confere esse dia antes de gravar.
 *
 * Falha em silêncio (sem internet, BCB fora do ar): rendimento é um extra,
 * não pode travar o app. Na próxima abertura ele rende os dias que ficaram
 * pra trás, porque a conta é sempre "de rendimentoAte até ontem".
 */

export interface InfoCdi {
  /** CDI anualizado (% a.a.) pela taxa mais recente. */
  anual: number;
  /** Dia da taxa mais recente. */
  data: string;
}

async function buscarTaxas(desde: string): Promise<{ taxas: TaxaDiaria[]; info: InfoCdi | null }> {
  const resposta = await fetch(`/api/cdi?desde=${desde}`);
  if (!resposta.ok) throw new Error("CDI indisponível");
  const dados = await resposta.json();
  return {
    taxas: dados.taxas as TaxaDiaria[],
    info: dados.ultima && dados.anual ? { anual: dados.anual, data: dados.ultima.data } : null,
  };
}

async function aplicarRendimentos(uid: string): Promise<InfoCdi | null> {
  const hoje = hojeISO();
  const inicio = diaAnterior(hoje);

  const refSaldo = doc(db, "usuarios", uid, "saldo", "atual");
  const [snapSaldo, snapCaixinhas] = await Promise.all([
    getDoc(refSaldo),
    getDocs(collection(db, "usuarios", uid, "caixinhas")),
  ]);

  // quem nunca rendeu começa a render a partir de hoje — nada retroativo
  const pendentes: string[] = [];
  if (snapSaldo.exists()) {
    const ate = snapSaldo.data().rendimentoAte as string | undefined;
    if (!ate) await updateDoc(refSaldo, { rendimentoAte: inicio });
    else if (ate < inicio) pendentes.push(ate);
  }
  for (const c of snapCaixinhas.docs) {
    const ate = c.data().rendimentoAte as string | undefined;
    if (!ate) await updateDoc(c.ref, { rendimentoAte: inicio });
    else if (ate < inicio) pendentes.push(ate);
  }

  const desde = pendentes.length > 0 ? pendentes.sort()[0] : inicio;
  const { taxas, info } = await buscarTaxas(desde);
  if (pendentes.length === 0 || taxas.length === 0) return info;

  // saldo: rende sobre o saldo de agora (valor informado menos o que foi
  // gasto depois), igual ao que a tela de Saldo mostra
  if (snapSaldo.exists()) {
    const atualizadoEm = (snapSaldo.data().atualizadoEm as number) ?? 0;
    const gastosDepois = await getDocs(
      query(collection(db, "usuarios", uid, "gastos"), where("criadoEm", ">", atualizadoEm))
    );
    const gastoDepois = gastosDepois.docs.reduce((acc, g) => acc + (g.data().valor as number), 0);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(refSaldo);
      if (!snap.exists()) return;
      const dados = snap.data();
      const ate = dados.rendimentoAte as string | undefined;
      if (!ate || ate >= inicio) return;
      const saldoAgora = (dados.valor as number) - gastoDepois;
      const r = calcularRendimento(saldoAgora, taxas, ate, hoje, (dados.percentualCdi as number) ?? 100);
      if (!r.ultimoDia) return;
      tx.update(refSaldo, {
        valor: arredondarCentavos((dados.valor as number) + r.rendimento),
        rendimentoAte: r.ultimoDia,
        rendimentoPorMes: somarPorMes(dados.rendimentoPorMes, r.porMes),
      });
    });
  }

  for (const c of snapCaixinhas.docs) {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(c.ref);
      if (!snap.exists()) return;
      const dados = snap.data();
      const ate = dados.rendimentoAte as string | undefined;
      if (!ate || ate >= inicio) return;
      const r = calcularRendimento(
        dados.saldo as number,
        taxas,
        ate,
        hoje,
        (dados.percentualCdi as number) ?? 100
      );
      if (!r.ultimoDia) return;
      tx.update(c.ref, {
        saldo: arredondarCentavos((dados.saldo as number) + r.rendimento),
        rendimentoAte: r.ultimoDia,
        rendimentoPorMes: somarPorMes(dados.rendimentoPorMes, r.porMes),
      });
    });
  }

  return info;
}

// uma aplicação por usuário por abertura do app, compartilhada entre as
// telas que chamam o hook (layout, Saldo, Caixinhas)
const execucoes = new Map<string, Promise<InfoCdi | null>>();

export function useRendimentoAutomatico(): InfoCdi | null {
  const { user } = useAuth();
  const [info, setInfo] = useState<InfoCdi | null>(null);

  useEffect(() => {
    if (!user) return;
    let execucao = execucoes.get(user.uid);
    if (!execucao) {
      execucao = aplicarRendimentos(user.uid).catch(() => null);
      execucoes.set(user.uid, execucao);
    }
    let ativo = true;
    execucao.then((resultado) => {
      if (ativo) setInfo(resultado);
    });
    return () => {
      ativo = false;
    };
  }, [user]);

  return info;
}
