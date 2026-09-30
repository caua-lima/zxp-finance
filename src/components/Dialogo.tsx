"use client";

import { ReactNode, useEffect, useId, useRef } from "react";

const SELETOR_FOCAVEL =
  "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * Diálogo acessível único do app (auditoria U02): foco vai pra dentro ao
 * abrir, Tab não escapa (focus trap), Esc fecha, o foco volta pro botão
 * que abriu, título e descrição ficam ligados ao diálogo pra leitor de
 * tela. No celular abre como folha de baixo; no desktop, centralizado.
 * Enquanto `bloqueado` (salvando), Esc e o fundo não fecham.
 */
export function Dialogo({
  aberto,
  titulo,
  descricao,
  onFechar,
  bloqueado,
  children,
}: {
  aberto: boolean;
  titulo: string;
  descricao?: ReactNode;
  onFechar: () => void;
  bloqueado?: boolean;
  children: ReactNode;
}) {
  const painel = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  const idDescricao = useId();
  // callback numa ref pra o efeito não reiniciar (e roubar o foco) a cada
  // render do pai
  const fechar = useRef(onFechar);
  const travado = useRef(bloqueado);
  useEffect(() => {
    fechar.current = onFechar;
    travado.current = bloqueado;
  }, [onFechar, bloqueado]);

  useEffect(() => {
    if (!aberto) return;
    const antes = document.activeElement as HTMLElement | null;
    const focaveis = () =>
      Array.from(painel.current?.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL) ?? []);
    const inicial =
      painel.current?.querySelector<HTMLElement>("input, select, textarea") ?? focaveis()[0];
    inicial?.focus();

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape" && !travado.current) {
        e.preventDefault();
        fechar.current();
      }
      if (e.key !== "Tab") return;
      const lista = focaveis();
      if (lista.length === 0) return;
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }
    document.addEventListener("keydown", aoTeclar);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflow;
      antes?.focus?.();
    };
  }, [aberto]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !bloqueado && onFechar()}
      />
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={descricao ? idDescricao : undefined}
        className="relative w-full max-w-sm rounded-2xl border border-line bg-surface-elevated p-5 shadow-2xl"
      >
        <h2 id={idTitulo} className="text-base font-semibold text-text">
          {titulo}
        </h2>
        {descricao && (
          <div id={idDescricao} className="mt-1.5 text-sm text-text-muted">
            {descricao}
          </div>
        )}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
