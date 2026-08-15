"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";

export interface Saldo {
  valor: number;
  atualizadoEm: number;
  reservaMeta?: number; // quanto você quer que sobre até o fim do mês
}

/**
 * Um único "ponto de partida" do saldo (ex: Mercado Pago). Toda vez
 * que você define um novo valor, ele vira a referência — só os gastos
 * lançados depois disso é que descontam dele.
 */
export function useSaldo() {
  const { user } = useAuth();
  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, "usuarios", user.uid, "saldo", "atual"),
      (snap) => {
        setSaldo(snap.exists() ? (snap.data() as Saldo) : null);
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

  async function definir(valor: number) {
    if (!user) return;
    try {
      await setDoc(
        doc(db, "usuarios", user.uid, "saldo", "atual"),
        { valor, atualizadoEm: Date.now() },
        { merge: true }
      );
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function definirReservaMeta(reservaMeta: number) {
    if (!user) return;
    try {
      await setDoc(
        doc(db, "usuarios", user.uid, "saldo", "atual"),
        { reservaMeta },
        { merge: true }
      );
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return { saldo, loading, erro, definir, definirReservaMeta };
}
