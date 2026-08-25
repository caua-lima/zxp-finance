"use client";

import { ReactNode } from "react";

type Variante = "primario" | "secundario" | "fantasma";
type Tamanho = "normal" | "pequeno";

/**
 * Botão padrão. O ponto principal é a altura mínima: no celular, um botão
 * de 32px é difícil de acertar. `normal` tem 44px (mínimo confortável pra
 * dedo) e `pequeno` tem 36px, pra ações secundárias dentro de um card que
 * já está denso.
 */
export function Botao({
  children,
  onClick,
  type = "button",
  variante = "primario",
  tamanho = "normal",
  disabled,
  larguraTotal,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variante?: Variante;
  tamanho?: Tamanho;
  disabled?: boolean;
  larguraTotal?: boolean;
  className?: string;
}) {
  const porVariante: Record<Variante, string> = {
    primario:
      "bg-brand text-[#10100E] font-semibold hover:bg-brand-dark active:bg-brand-dark",
    secundario:
      "border border-line bg-surface text-text-muted font-medium hover:border-brand/40 hover:text-text active:bg-surface-2",
    fantasma: "text-brand font-medium hover:text-brand-dark active:opacity-70",
  };
  const porTamanho: Record<Tamanho, string> = {
    normal: "min-h-[44px] px-4 text-sm",
    pequeno: "min-h-[36px] px-3 text-xs",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        porVariante[variante]
      } ${porTamanho[tamanho]} ${larguraTotal ? "w-full" : ""} ${className}`}
    >
      {children}
    </button>
  );
}
