"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FinanceAlert, Severidade } from "@/lib/finance/alerts";
import { useAuth } from "@/lib/AuthContext";

const CONFIG_SEVERIDADE: Record<
  Severidade,
  { label: string; simbolo: string; cor: string; bg: string; borda: string }
> = {
  critical: {
    label: "Crítico",
    simbolo: "⚠",
    cor: "text-negative",
    bg: "bg-negative-soft",
    borda: "border-negative/30",
  },
  warning: {
    label: "Atenção",
    simbolo: "◆",
    cor: "text-gold",
    bg: "bg-gold-soft",
    borda: "border-gold/30",
  },
  opportunity: {
    label: "Oportunidade",
    simbolo: "↗",
    cor: "text-positive",
    bg: "bg-positive-soft",
    borda: "border-positive/30",
  },
  info: {
    label: "Info",
    simbolo: "ℹ",
    cor: "text-info",
    bg: "bg-info/10",
    borda: "border-info/30",
  },
};

/**
 * Dispensa de alerta por CONTA e com validade (auditoria U06): antes a
 * chave era global no navegador (a conta B herdava o que A dispensou) e a
 * dispensa valia pra sempre. Agora vale 7 dias — alerta que continua
 * verdadeiro volta a aparecer.
 */
const VALIDADE_DISPENSA = 7 * 24 * 60 * 60 * 1000;

// usado só dentro do clique (dispensar) — nunca durante o render
const agora = () => Date.now();

function chaveDispensados(uid: string) {
  return `financeiro:alertas-dispensados:${uid}`;
}

function carregarDispensados(uid: string): Map<string, number> {
  try {
    const bruto = window.localStorage.getItem(chaveDispensados(uid));
    const lista = bruto ? (JSON.parse(bruto) as Array<[string, number]>) : [];
    const agora = Date.now();
    return new Map(lista.filter(([, em]) => typeof em === "number" && agora - em < VALIDADE_DISPENSA));
  } catch {
    return new Map();
  }
}

export function FinanceActionCenter({ alertas }: { alertas: FinanceAlert[] }) {
  const { user } = useAuth();
  const [dispensados, setDispensados] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lê localStorage só depois de montar (evita mismatch de SSR)
    setDispensados(carregarDispensados(user.uid));
  }, [user]);

  function dispensar(key: string) {
    if (!user) return;
    const novo = new Map(dispensados);
    novo.set(key, agora());
    setDispensados(novo);
    try {
      window.localStorage.setItem(chaveDispensados(user.uid), JSON.stringify([...novo]));
    } catch {
      /* sem armazenamento: dispensa vale só nesta visita */
    }
  }

  const visiveis = alertas.filter((a) => !dispensados.has(a.key));

  if (visiveis.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5 text-center">
        <p className="text-sm text-text-muted">
          Nada pedindo sua atenção agora. 🎯
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {visiveis.map((a) => {
        const c = CONFIG_SEVERIDADE[a.severidade];
        return (
          <div
            key={a.key}
            className={`rounded-xl border ${c.borda} ${c.bg} px-4 py-3`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-semibold ${c.cor}`} aria-hidden="true">
                    {c.simbolo}
                  </span>
                  <span className={`text-xs font-semibold uppercase tracking-wide ${c.cor}`}>
                    {c.label}
                  </span>
                </div>
                <p className="text-sm font-medium text-text truncate">{a.titulo}</p>
                <p className="text-xs text-text-muted mt-0.5">{a.contexto}</p>
                {a.impacto && a.impacto !== "—" && (
                  <p className={`text-sm font-semibold mt-1 ${c.cor}`}>{a.impacto}</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {a.href && (
                  <Link
                    href={a.href}
                    className="inline-flex min-h-[44px] items-center px-2 -mx-2 text-xs font-medium text-brand hover:text-brand-dark whitespace-nowrap"
                  >
                    {a.cta}
                  </Link>
                )}
                <button
                  onClick={() => dispensar(a.key)}
                  className="inline-flex min-h-[44px] items-center px-2 -mx-2 text-xs text-text-faint hover:text-text-muted"
                  aria-label="Dispensar alerta"
                >
                  Dispensar
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
