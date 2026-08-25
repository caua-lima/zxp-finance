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

  /**
   * Grava o perfil. Campo vazio vira `null`, nunca `undefined`: o Firestore
   * rejeita propriedade com valor undefined (o app não liga
   * `ignoreUndefinedProperties`), e o spread do objeto preserva a chave mesmo
   * quando o valor é undefined — então um único campo em branco derrubava a
   * gravação inteira. `null` também é o que faz o `merge` realmente limpar um
   * campo que o usuário apagou; simplesmente omitir a chave manteria o valor
   * anterior lá. Quem lê trata null igual a vazio (`?? ""`, `?? 0`).
   */
  async function salvar(dados: Omit<PerfilUsuario, "atualizadoEm">) {
    if (!user) return;
    const semUndefined = Object.fromEntries(
      Object.entries(dados).map(([chave, valor]) => [chave, valor ?? null])
    );
    try {
      await setDoc(
        doc(db, "usuarios", user.uid, "perfil", "dados"),
        { ...semUndefined, atualizadoEm: Date.now() },
        { merge: true }
      );
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return { perfil, loading, erro, salvar };
}
