"use client";

import { ReactNode } from "react";

type Tom = "neutro" | "perigo";

/**
 * Botão de ação de item de lista (editar, excluir). Existe pra garantir
 * alvo de toque decente no celular: os ícones em si são pequenos, mas a
 * área clicável tem 40px, que é o mínimo confortável pra dedo. Antes
 * essas ações eram um caractere "✎" solto e um texto de 10px — mira
 * difícil, e fácil de errar e clicar na coisa errada.
 */
export function BotaoIcone({
  children,
  label,
  onClick,
  tom = "neutro",
  disabled,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  tom?: Tom;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-transparent text-text-faint transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        tom === "perigo"
          ? "hover:border-negative/30 hover:bg-negative-soft hover:text-negative active:bg-negative-soft"
          : "hover:border-brand/30 hover:bg-surface-2 hover:text-brand active:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

/** Agrupa BotaoIcone com espaçamento consistente, encostado à direita. */
export function AcoesItem({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 items-center gap-0.5">{children}</div>;
}
