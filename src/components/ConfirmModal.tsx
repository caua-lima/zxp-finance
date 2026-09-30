"use client";

import { useState } from "react";
import { Dialogo } from "./Dialogo";

interface ConfirmModalProps {
  aberto: boolean;
  titulo: string;
  descricao: string;
  textoConfirmar?: string;
  perigo?: boolean;
  pedirMotivo?: boolean;
  /**
   * Pode ser assíncrono. Devolvendo `false` (a operação falhou), o motivo
   * digitado é mantido — nada se perde.
   */
  onConfirmar: (motivo?: string) => void | boolean | Promise<void | boolean>;
  onCancelar: () => void;
}

/**
 * Confirmação de ação destrutiva ou irreversível, em cima do Dialogo
 * acessível (foco, Esc, retorno de foco). O motivo pertence a esta
 * confirmação: cancelar e reabrir começa em branco.
 */
export function ConfirmModal({
  aberto,
  titulo,
  descricao,
  textoConfirmar = "Confirmar",
  perigo,
  pedirMotivo,
  onConfirmar,
  onCancelar,
}: ConfirmModalProps) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  const bloqueado = enviando || (pedirMotivo && motivo.trim().length === 0);

  function cancelar() {
    setMotivo("");
    onCancelar();
  }

  async function confirmar() {
    setEnviando(true);
    try {
      const resultado = await onConfirmar(pedirMotivo ? motivo.trim() : undefined);
      if (resultado !== false) setMotivo("");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo
      aberto={aberto}
      titulo={titulo}
      descricao={descricao}
      onFechar={cancelar}
      bloqueado={enviando}
    >
      {pedirMotivo && (
        <>
          <label htmlFor="confirm-motivo" className="rotulo">
            Motivo
          </label>
          <textarea
            id="confirm-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Explique o motivo..."
            rows={3}
            className="campo resize-none"
          />
        </>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={cancelar}
          disabled={enviando}
          className="min-h-[44px] flex-1 rounded-xl border border-line px-3 text-sm font-medium text-text-muted transition-colors hover:text-text active:bg-surface-2 disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={bloqueado}
          className={`min-h-[44px] flex-1 rounded-xl px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            perigo
              ? "bg-negative text-white hover:bg-negative/85"
              : "bg-brand text-on-brand hover:bg-brand-dark"
          }`}
        >
          {enviando ? "Salvando..." : textoConfirmar}
        </button>
      </div>
    </Dialogo>
  );
}
