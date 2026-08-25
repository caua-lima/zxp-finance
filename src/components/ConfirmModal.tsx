"use client";

import { useState } from "react";

interface ConfirmModalProps {
  aberto: boolean;
  titulo: string;
  descricao: string;
  textoConfirmar?: string;
  perigo?: boolean;
  pedirMotivo?: boolean;
  onConfirmar: (motivo?: string) => void;
  onCancelar: () => void;
}

/**
 * Substitui window.confirm()/alert() nativos em toda ação destrutiva ou
 * irreversível (arquivar, cancelar, estornar, excluir). Quando
 * `pedirMotivo` é true, o botão de confirmar só libera com texto — usado
 * pelo fluxo de cancelamento, que exige motivo por regra do briefing.
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

  if (!aberto) return null;

  const bloqueado = pedirMotivo && motivo.trim().length === 0;

  function confirmar() {
    onConfirmar(pedirMotivo ? motivo.trim() : undefined);
    setMotivo("");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-titulo"
    >
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface-elevated p-5">
        <h2 id="confirm-modal-titulo" className="text-base font-semibold text-text">
          {titulo}
        </h2>
        <p className="text-sm text-text-muted mt-2">{descricao}</p>

        {pedirMotivo && (
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Explique o motivo..."
            rows={3}
            className="campo mt-3 resize-none"
            autoFocus
          />
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={onCancelar}
            className="min-h-[44px] flex-1 rounded-xl border border-line px-3 text-sm font-medium text-text-muted transition-colors hover:text-text active:bg-surface-2"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={bloqueado}
            className={`min-h-[44px] flex-1 rounded-xl px-3 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              perigo
                ? "bg-negative text-white hover:bg-negative/85"
                : "bg-brand text-[#10100E] hover:bg-brand-dark"
            }`}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
