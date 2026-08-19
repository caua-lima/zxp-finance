"use client";

/**
 * Estado vazio com CTA: foca o primeiro campo do formulário de adicionar
 * (que já fica visível logo acima, na mesma tela) em vez de só mostrar
 * texto sem nenhuma ação.
 */
export function EmptyState({
  mensagem,
  alvoId,
  textoAcao = "Adicionar agora",
}: {
  mensagem: string;
  alvoId: string;
  textoAcao?: string;
}) {
  function focar() {
    document.getElementById(alvoId)?.focus();
  }

  return (
    <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center">
      <p className="text-sm text-text-faint mb-2">{mensagem}</p>
      <button
        onClick={focar}
        className="text-xs font-medium text-brand hover:text-brand-dark"
      >
        {textoAcao} ↑
      </button>
    </div>
  );
}
