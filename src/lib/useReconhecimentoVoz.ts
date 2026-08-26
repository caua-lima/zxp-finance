"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reconhecimento de voz pelo próprio navegador (Web Speech API).
 *
 * É de graça e sem chave de API: quem transcreve é o sistema (Google no
 * Chrome/Android, Apple no Safari/iOS). Não passa por servidor nosso e não
 * custa nada por uso — diferente de mandar o áudio pra uma API de
 * transcrição, que seria cobrado por minuto.
 *
 * Limitação real: o suporte varia por navegador. Chrome e Safari recentes
 * têm; Firefox não. Por isso a tela SEMPRE mantém o campo de digitar como
 * caminho principal, e o microfone é um atalho a mais.
 */

// A API não está nos tipos padrão do TS (é prefixada e não-padronizada).
interface ResultadoFala {
  isFinal: boolean;
  0: { transcript: string };
}
interface EventoFala {
  resultIndex: number;
  results: { length: number; [i: number]: ResultadoFala };
}
interface ReconhecimentoFala {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: EventoFala) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type ConstrutorReconhecimento = new () => ReconhecimentoFala;

function construtor(): ConstrutorReconhecimento | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: ConstrutorReconhecimento;
    webkitSpeechRecognition?: ConstrutorReconhecimento;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const MENSAGEM_ERRO: Record<string, string> = {
  "not-allowed":
    "Acesso ao microfone bloqueado. Libere nas configurações do navegador e tente de novo.",
  "service-not-allowed":
    "Acesso ao microfone bloqueado. Libere nas configurações do navegador e tente de novo.",
  "no-speech": "Não ouvi nada. Tenta falar mais perto do microfone.",
  network: "Sem conexão pra transcrever. Dá pra digitar enquanto isso.",
  aborted: "",
};

export function useReconhecimentoVoz(
  aoTranscrever: (texto: string) => void
) {
  const [suportado, setSuportado] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [parcial, setParcial] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const reconhecimentoRef = useRef<ReconhecimentoFala | null>(null);
  // Guarda o callback numa ref pra o efeito de limpeza não depender dele:
  // sem isso, cada render recriaria o reconhecimento no meio da gravação.
  // A escrita vai num efeito porque mexer em ref durante o render é
  // justamente o que quebra em modo concorrente.
  const callbackRef = useRef(aoTranscrever);
  useEffect(() => {
    callbackRef.current = aoTranscrever;
  }, [aoTranscrever]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- só dá pra checar a API depois de montar (evita mismatch de SSR)
    setSuportado(construtor() !== null);
  }, []);

  const parar = useCallback(() => {
    reconhecimentoRef.current?.stop();
    setOuvindo(false);
    setParcial("");
  }, []);

  const ouvir = useCallback(() => {
    const Reconhecimento = construtor();
    if (!Reconhecimento) return;

    setErro(null);
    setParcial("");

    const r = new Reconhecimento();
    r.lang = "pt-BR";
    r.continuous = false;
    r.interimResults = true;

    r.onresult = (e) => {
      let finalizado = "";
      let emAndamento = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalizado += res[0].transcript;
        else emAndamento += res[0].transcript;
      }
      if (emAndamento) setParcial(emAndamento);
      if (finalizado.trim()) {
        setParcial("");
        callbackRef.current(finalizado.trim());
      }
    };

    r.onerror = (e) => {
      const msg = MENSAGEM_ERRO[e.error] ?? "Não consegui usar o microfone.";
      if (msg) setErro(msg);
      setOuvindo(false);
      setParcial("");
    };

    r.onend = () => {
      setOuvindo(false);
      setParcial("");
    };

    reconhecimentoRef.current = r;
    try {
      r.start();
      setOuvindo(true);
    } catch {
      // start() lança se já estiver rodando — nesse caso já está ouvindo
      setOuvindo(true);
    }
  }, []);

  useEffect(() => {
    return () => {
      reconhecimentoRef.current?.abort();
    };
  }, []);

  return { suportado, ouvindo, parcial, erro, ouvir, parar };
}
