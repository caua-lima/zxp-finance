import { ReactNode } from "react";

/**
 * Cabeçalho padrão de página. Existe pra que todas as telas tenham o mesmo
 * tamanho de título, o mesmo respiro e o mesmo lugar pra ação do topo —
 * antes cada página repetia o próprio h1/p com margens levemente
 * diferentes, o que dava uma sensação de tela "torta" ao navegar entre elas.
 */
export function PageHeader({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight md:text-lg">{titulo}</h1>
        {descricao && (
          <p className="mt-0.5 text-xs text-text-faint">{descricao}</p>
        )}
      </div>
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  );
}
