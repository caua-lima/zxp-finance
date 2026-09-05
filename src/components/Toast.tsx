"use client";

import { createContext, useCallback, useContext, useState, ReactNode } from "react";

type TipoToast = "sucesso" | "erro";

interface ToastItem {
  id: number;
  tipo: TipoToast;
  mensagem: string;
}

interface ToastContextValue {
  sucesso: (mensagem: string) => void;
  erro: (mensagem: string) => void;
  /**
   * Só avisa "deu certo" depois que a gravação realmente deu certo.
   *
   * Antes o toast disparava junto com a chamada, sem esperar: quando a
   * escrita falhava, a tela mostrava "✓ salvo" e o banner vermelho de erro
   * ao mesmo tempo — o que fazia parecer que tinha salvo e ainda escondia
   * a gravidade do problema. As mutações dos hooks devolvem true/false; a
   * mensagem de falha continua vindo do ErroBanner, que tem o texto real
   * do Firebase.
   */
  sucessoSe: (operacao: Promise<boolean>, mensagem: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let proximoId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remover = useCallback((id: number) => {
    setToasts((atual) => atual.filter((t) => t.id !== id));
  }, []);

  const adicionar = useCallback(
    (tipo: TipoToast, mensagem: string) => {
      const id = proximoId++;
      setToasts((atual) => [...atual, { id, tipo, mensagem }]);
      setTimeout(() => remover(id), 4000);
    },
    [remover]
  );

  const sucesso = useCallback((mensagem: string) => adicionar("sucesso", mensagem), [adicionar]);
  const erro = useCallback((mensagem: string) => adicionar("erro", mensagem), [adicionar]);

  const sucessoSe = useCallback(
    (operacao: Promise<boolean>, mensagem: string) => {
      operacao
        .then((ok) => {
          if (ok) adicionar("sucesso", mensagem);
        })
        .catch(() => {
          // o hook já capturou e colocou no ErroBanner; aqui só não avisa sucesso
        });
    },
    [adicionar]
  );

  return (
    <ToastContext.Provider value={{ sucesso, erro, sucessoSe }}>
      {children}
      <div
        className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${
              t.tipo === "sucesso"
                ? "border-positive/30 bg-positive-soft text-positive"
                : "border-negative/40 bg-negative-soft text-negative"
            }`}
          >
            <span aria-hidden="true">{t.tipo === "sucesso" ? "✓ " : "⚠ "}</span>
            {t.mensagem}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast deve ser usado dentro de ToastProvider");
  return ctx;
}
