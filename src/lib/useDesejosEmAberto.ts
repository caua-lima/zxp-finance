"use client";

import { useCallback, useState } from "react";
import { useAuth } from "./AuthContext";

export interface DesejoEmAberto {
  id: string;
  nome: string;
  precoCentavos: number | null;
  projeto: string | null;
}

/**
 * Busca os itens em aberto da lista de desejos do ZXP Tasks, sob demanda
 * (não em `useEffect` automático) — é usado num select que só importa
 * quando a pessoa está criando/editando uma parcela, então não faz
 * sentido chamar a ponte com o Tasks em toda visita à página.
 *
 * Erro aqui é esperado quando a ponte não está configurada ainda — por
 * isso a mensagem vem pronta pra mostrar na tela, não só logada.
 */
export function useDesejosEmAberto() {
  const { user } = useAuth();
  const [itens, setItens] = useState<DesejoEmAberto[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregou, setCarregou] = useState(false);

  const buscar = useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    try {
      const token = await user.getIdToken();
      const resposta = await fetch("/api/desejos-em-aberto", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro((dados.erro as string) ?? "Erro ao buscar desejos no Tasks.");
        setItens([]);
      } else {
        setItens((dados.itens as DesejoEmAberto[]) ?? []);
        setErro(null);
      }
    } catch {
      setErro("Não consegui falar com o ZXP Tasks agora.");
    } finally {
      setCarregando(false);
      setCarregou(true);
    }
  }, [user]);

  return { itens, carregando, erro, carregou, buscar };
}
