"use client";

import { useEffect, useState } from "react";
import { collection, doc, limit, onSnapshot, query, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";

/**
 * Módulos opcionais (auditoria U04/O03): Comissões é recurso de quem
 * trabalha com venda, não regra do app pra todo cliente. Fica ligado se
 * você ligou nas preferências — ou, sem escolha salva, se você já usa
 * (tem comissão lançada). Assim ninguém perde a aba que usa todo dia.
 */
export function useModulos() {
  const { user } = useAuth();
  const [escolha, setEscolha] = useState<boolean | null>(null);
  const [temDados, setTemDados] = useState(false);

  useEffect(() => {
    if (!user) return;
    const pararPref = onSnapshot(doc(db, "usuarios", user.uid, "preferencias", "app"), (snap) => {
      const v = snap.exists() ? snap.data().comissoes : undefined;
      setEscolha(typeof v === "boolean" ? v : null);
    });
    const pararDados = onSnapshot(
      query(collection(db, "usuarios", user.uid, "comissoes"), limit(1)),
      (snap) => setTemDados(!snap.empty)
    );
    return () => {
      pararPref();
      pararDados();
    };
  }, [user]);

  async function definirComissoes(ligado: boolean) {
    if (!user) return false;
    try {
      await setDoc(doc(db, "usuarios", user.uid, "preferencias", "app"), { comissoes: ligado }, { merge: true });
      return true;
    } catch {
      return false;
    }
  }

  return { comissoes: escolha ?? temDados, definirComissoes };
}

/**
 * Se a conta logada é admin da plataforma — só pra mostrar o menu de
 * Acesso. A proteção de verdade é a rota no servidor.
 */
export function useEhAdmin() {
  const { user } = useAuth();
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (!user) return;
    let ativo = true;
    user
      .getIdToken()
      .then((token) => fetch("/api/admin/status", { headers: { Authorization: `Bearer ${token}` } }))
      .then((r) => (r.ok ? r.json() : { admin: false }))
      .then((d) => ativo && setAdmin(d.admin === true))
      .catch(() => ativo && setAdmin(false));
    return () => {
      ativo = false;
    };
  }, [user]);
  return admin;
}
