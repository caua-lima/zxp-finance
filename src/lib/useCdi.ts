"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hojeISO } from "./finance/calculations";
import { cdiAnual } from "./finance/rendimento";

/**
 * Taxa do CDI de hoje (Banco Central), só pra ESTIMAR rendimento — nada
 * aqui escreve no banco nem mexe em saldo (ver finance/rendimento.ts).
 *
 * Corrige o que a versão anterior fazia errado (auditoria F10): uma falha
 * ficava guardada até recarregar a página, e o app aberto de um dia pro
 * outro nunca atualizava a taxa. Agora: estado visível (carregando/ok/
 * erro), botão de tentar de novo, nova busca quando o dia vira ou quando
 * a aba volta a ficar visível/online, e retentativa com espera crescente.
 */

export interface InfoCdi {
  taxaDiaria: number;
  anual: number;
  /** Dia da taxa mais recente publicada. */
  data: string;
}

type Estado =
  | { status: "carregando"; info: InfoCdi | null }
  | { status: "ok"; info: InfoCdi; buscadoEm: string }
  | { status: "erro"; info: InfoCdi | null };

// cache compartilhado entre telas na mesma aba, invalidado quando o dia muda
let cache: { dia: string; info: InfoCdi } | null = null;

async function buscar(): Promise<InfoCdi> {
  const resposta = await fetch("/api/cdi");
  if (!resposta.ok) throw new Error("CDI indisponível");
  const dados = await resposta.json();
  if (!dados.ultima) throw new Error("sem taxa");
  return {
    taxaDiaria: dados.ultima.taxa,
    anual: cdiAnual(dados.ultima.taxa),
    data: dados.ultima.data,
  };
}

export function useCdi() {
  const [estado, setEstado] = useState<Estado>(() =>
    cache && cache.dia === hojeISO()
      ? { status: "ok", info: cache.info, buscadoEm: cache.dia }
      : { status: "carregando", info: cache?.info ?? null }
  );
  const tentativas = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // a retentativa agendada chama a versão atual de `carregar` por aqui
  const carregarRef = useRef<() => void>(() => {});

  const carregar = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const dia = hojeISO();
    if (cache && cache.dia === dia) {
      setEstado({ status: "ok", info: cache.info, buscadoEm: dia });
      return;
    }
    setEstado((e) => ({ status: "carregando", info: e.info }));
    try {
      const info = await buscar();
      cache = { dia, info };
      tentativas.current = 0;
      setEstado({ status: "ok", info, buscadoEm: dia });
    } catch {
      tentativas.current++;
      setEstado((e) => ({ status: "erro", info: e.info }));
      // espera crescente: 5s, 20s, 80s... até 5 min
      const espera = Math.min(300_000, 5000 * Math.pow(4, tentativas.current - 1));
      timer.current = setTimeout(() => carregarRef.current(), espera);
    }
  }, []);

  useEffect(() => {
    carregarRef.current = carregar;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca inicial da taxa ao montar (sincroniza com sistema externo)
    carregar();
    const aoVoltar = () => {
      if (document.visibilityState === "visible") carregar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("online", carregar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("online", carregar);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [carregar]);

  return { ...estado, tentarDeNovo: carregar };
}
