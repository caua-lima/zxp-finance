"use client";

import { formatarMoeda } from "@/lib/types";
import { useDesejosEmAberto } from "@/lib/useDesejosEmAberto";

/**
 * Select "vincular a um desejo do Tasks", usado tanto no formulário de
 * criar parcela quanto no Consultor (quando a simulação parte de um item
 * da lista de desejos). Busca sob demanda — só quando a pessoa clica em
 * "Buscar", nunca automático — porque é uma chamada de rede pra outro app.
 */
export function SeletorDesejo({
  desejoId,
  onSelecionar,
  desejos,
}: {
  desejoId: string;
  onSelecionar: (id: string) => void;
  desejos: ReturnType<typeof useDesejosEmAberto>;
}) {
  return (
    <div className="rounded-xl border border-line-soft bg-surface-2/50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="rotulo mb-0">Vincular a um desejo do Tasks (opcional)</p>
        {!desejos.carregou && (
          <button
            type="button"
            onClick={desejos.buscar}
            disabled={desejos.carregando}
            className="shrink-0 text-xs font-medium text-brand hover:text-brand-dark disabled:opacity-50"
          >
            {desejos.carregando ? "Buscando..." : "Buscar"}
          </button>
        )}
      </div>
      {desejos.erro && <p className="mt-1.5 text-xs text-negative">{desejos.erro}</p>}
      {desejos.carregou && !desejos.erro && (
        desejos.itens.length === 0 ? (
          <p className="mt-1.5 text-xs text-text-faint">
            Nenhum desejo em aberto no Tasks agora.
          </p>
        ) : (
          <select
            value={desejoId}
            onChange={(e) => onSelecionar(e.target.value)}
            className="campo mt-1.5"
          >
            <option value="">Nenhum</option>
            {desejos.itens.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
                {d.precoCentavos !== null
                  ? ` — ${formatarMoeda(d.precoCentavos / 100)}`
                  : ""}
                {d.projeto ? ` (${d.projeto})` : ""}
              </option>
            ))}
          </select>
        )
      )}
    </div>
  );
}
