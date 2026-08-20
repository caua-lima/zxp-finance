"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";
import { PerfilUsuario } from "./types";

/**
 * Contexto pessoal (usuarios/{uid}/perfil/dados) — idade, se mora
 * sozinho, quais contas são suas, renda aproximada. Nada disso entra em
 * nenhum cálculo de saldo/gastável — só existe pra calibrar comparações
 * (ver benchmark do IBGE na DRE), então fica isolado como um doc à parte.
 */
export function usePerfil() {
  const { user } = useAuth();
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, "usuarios", user.uid, "perfil", "dados"),
      (snap) => {
        setPerfil(snap.exists() ? (snap.data() as PerfilUsuario) : null);
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

  async function salvar(dados: Omit<PerfilUsuario, "atualizadoEm">) {
    if (!user) return;
    try {
      await setDoc(
        doc(db, "usuarios", user.uid, "perfil", "dados"),
        { ...dados, atualizadoEm: Date.now() },
        { merge: true }
      );
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return { perfil, loading, erro, salvar };
}
