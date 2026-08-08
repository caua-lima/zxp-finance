"use client";

import { useState } from "react";
import { formatarMoeda } from "@/lib/types";
import { MoneyInput } from "./MoneyInput";

type Etapa = "informar" | "resultado";

interface ConferirSaldoModalProps {
  aberto: boolean;
  saldoEsperado: number;
  onRegistrar: (params: {
    saldoInformado: number;
    saldoEsperado: number;
    criarAjuste: boolean;
    descricaoAjuste?: string;
  }) => void;
  onFechar: () => void;
}

/**
 * Fluxo de conferência de saldo (Fase 5): o usuário informa o saldo real
 * da conta, o sistema mostra o que esperava e a diferença, e só then o
 * usuário decide entre confirmar, investigar (adiar) ou criar um ajuste
 * documentado. Nunca sobrescreve o saldo de referência sem passar por
 * aqui.
 */
export function ConferirSaldoModal({
  aberto,
  saldoEsperado,
  onRegistrar,
  onFechar,
}: ConferirSaldoModalProps) {
  const [etapa, setEtapa] = useState<Etapa>("informar");
  const [saldoInformado, setSaldoInformado] = useState(saldoEsperado);
  const [descricaoAjuste, setDescricaoAjuste] = useState("");

  if (!aberto) return null;

  const diferenca = saldoInformado - saldoEsperado;
  const bate = diferenca === 0;

  function fechar() {
    setEtapa("informar");
    setSaldoInformado(saldoEsperado);
    setDescricaoAjuste("");
    onFechar();
  }

  function confirmar() {
    onRegistrar({ saldoInformado, saldoEsperado, criarAjuste: false });
    fechar();
  }

  function adiar() {
    onRegistrar({ saldoInformado, saldoEsperado, criarAjuste: false });
    fechar();
  }

  function criarAjuste() {
    if (!descricaoAjuste.trim()) return;
    onRegistrar({
      saldoInformado,
      saldoEsperado,
      criarAjuste: true,
      descricaoAjuste: descricaoAjuste.trim(),
    });
    fechar();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface-elevated p-5">
        <h2 className="text-base font-semibold text-text mb-1">Conferir saldo</h2>

        {etapa === "informar" ? (
          <>
            <p className="text-sm text-text-muted mb-3">
              O sistema calcula {formatarMoeda(saldoEsperado)}. Confere no app do
              banco e informa o valor real que está lá agora.
            </p>
            <MoneyInput
              value={saldoInformado}
              onChange={setSaldoInformado}
              className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-lg text-center outline-none focus:border-brand"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={fechar}
                className="flex-1 rounded-lg border border-line px-3 py-2 text-sm text-text-muted hover:text-text transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => setEtapa("resultado")}
                className="flex-1 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-[#0E0F0C] hover:bg-brand-dark transition-colors"
              >
                Comparar
              </button>
            </div>
          </>
        ) : bate ? (
          <>
            <p className="text-sm text-positive mt-2 mb-1">✓ Bate certinho</p>
            <p className="text-sm text-text-muted mb-4">
              {formatarMoeda(saldoInformado)} confere com o que o sistema esperava.
            </p>
            <button
              onClick={confirmar}
              className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-[#0E0F0C] hover:bg-brand-dark transition-colors"
            >
              Confirmar
            </button>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-gold/30 bg-gold-soft px-3 py-2 mb-3 text-center">
              <p className="text-xs text-text-muted">Diferença</p>
              <p className={`text-lg font-bold ${diferenca > 0 ? "text-positive" : "text-negative"}`}>
                {diferenca > 0 ? "+" : ""}
                {formatarMoeda(diferenca)}
              </p>
              <p className="text-[11px] text-text-faint mt-1">
                esperado {formatarMoeda(saldoEsperado)} · informado {formatarMoeda(saldoInformado)}
              </p>
            </div>

            <p className="text-xs text-text-muted mb-2">
              Pode investigar os lançamentos antes de decidir, ou criar um
              ajuste documentado agora:
            </p>
            <textarea
              value={descricaoAjuste}
              onChange={(e) => setDescricaoAjuste(e.target.value)}
              placeholder="Descreva o motivo do ajuste (ex: saque não registrado)"
              rows={2}
              className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand resize-none mb-3"
            />

            <div className="flex flex-col gap-2">
              <button
                onClick={criarAjuste}
                disabled={!descricaoAjuste.trim()}
                className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-[#0E0F0C] hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Criar ajuste conciliado
              </button>
              <button
                onClick={adiar}
                className="rounded-lg border border-line px-3 py-2 text-sm text-text-muted hover:text-text transition-colors"
              >
                Adiar conferência (investigar depois)
              </button>
              <button
                onClick={fechar}
                className="text-xs text-text-faint hover:text-text-muted"
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
