"use client";

import { useState } from "react";
import { LinhaExtrato, ReferenciaSaldo } from "@/lib/finance/saldo";
import { formatarCentavos, paraCentavos } from "@/lib/dinheiro";

const quando = (ms: number) =>
  new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const ROTULO = { registro: "Registro", pagamento: "Pago", recebimento: "Recebido", transferencia: "Caixinha" } as const;

/**
 * "Como chegamos nesse número" (auditoria 25/10 F01/C20): o saldo de
 * referência que você informou, quando, e cada entrada/saída depois dele.
 * A soma das linhas é exatamente o saldo mostrado — nada escondido.
 */
export function ComoChegamos({
  referencia,
  extrato,
  saldo,
}: {
  referencia: ReferenciaSaldo;
  extrato: LinhaExtrato[];
  saldo: number;
}) {
  // a lista só existe aberta: fechada, não polui leitor de tela nem busca de texto
  const [aberto, setAberto] = useState(false);
  return (
    <details
      className="mt-3 rounded-xl bg-surface-2/50 px-3 py-2"
      onToggle={(e) => setAberto((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer text-xs font-medium text-text-muted">Como chegamos nesse número</summary>
      {aberto && (
        <>
          <ol className="mt-2 space-y-1 text-xs" aria-label="Movimentos desde o saldo informado">
            <li className="flex justify-between gap-2">
              <span>Você informou o saldo em {quando(referencia.atualizadoEm)}</span>
              <span className="font-medium tabular-nums">{formatarCentavos(paraCentavos(referencia.valor))}</span>
            </li>
            {extrato.map((l, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="min-w-0">
                  <span className="text-text-muted">
                    {quando(l.quando)} · {ROTULO[l.tipo]}:{" "}
                  </span>
                  {l.descricao}
                  {l.detalhe && <span className="block text-text-faint">{l.detalhe}</span>}
                </span>
                <span className={`shrink-0 tabular-nums ${l.centavos > 0 ? "text-positive" : ""}`}>
                  {l.centavos > 0 ? "+" : "−"} {formatarCentavos(Math.abs(l.centavos))}
                </span>
              </li>
            ))}
            {extrato.length === 0 && <li className="text-text-faint">Nada entrou ou saiu desde então.</li>}
            <li className="flex justify-between gap-2 border-t border-line-soft pt-1 font-semibold">
              <span>Saldo agora</span>
              <span className="tabular-nums">{formatarCentavos(paraCentavos(saldo))}</span>
            </li>
          </ol>
          <p className="mt-2 text-xs text-text-faint">
            O que aconteceu antes do saldo informado já estava dentro dele e não conta de novo.
          </p>
        </>
      )}
    </details>
  );
}
