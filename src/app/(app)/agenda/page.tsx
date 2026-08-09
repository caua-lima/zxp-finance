"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FinancialEntry, FinancialEntrySource, formatarMoeda } from "@/lib/types";
import { useAgendaEntries } from "@/lib/finance/useAgendaEntries";
import { isEntryActive, deriveDisplayStatus, labelOrigem } from "@/lib/finance/calculations";
import { groupByUrgency } from "@/lib/finance/entries";
import { ErroBanner } from "@/components/ErroBanner";
import { StatusBadge, StatusBadgeValor } from "@/components/StatusBadge";
import { SkeletonLista } from "@/components/Skeleton";

type FiltroPeriodo = "7" | "15" | "30" | "mes" | "todos";
type FiltroTipo = "todos" | "income" | "expense";
type FiltroStatus = "todos" | "pendente" | "pago" | "atrasado" | "cancelado";

const HREF_POR_ORIGEM: Record<FinancialEntrySource, string> = {
  manual: "/saldo",
  income: "/ganhos",
  fixed_cost: "/contas",
  subscription: "/assinaturas",
  installment: "/parcelas",
  card_bill: "/fatura",
  adjustment: "/saldo",
  transfer: "/saldo",
};

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function statusCorresponde(
  displayStatus: ReturnType<typeof deriveDisplayStatus>,
  filtro: FiltroStatus
): boolean {
  if (filtro === "pendente") return displayStatus === "planned" || displayStatus === "pending";
  if (filtro === "pago") return displayStatus === "paid" || displayStatus === "received";
  if (filtro === "atrasado") return displayStatus === "overdue";
  return true;
}

function dataCurta(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

export default function AgendaPage() {
  const { entries, loading, erro, mesAtual } = useAgendaEntries();

  const [periodo, setPeriodo] = useState<FiltroPeriodo>("30");
  const [tipo, setTipo] = useState<FiltroTipo>("todos");
  const [status, setStatus] = useState<FiltroStatus>("todos");
  const [categoria, setCategoria] = useState("todas");
  const [origem, setOrigem] = useState<FinancialEntrySource | "todas">("todas");

  const categorias = useMemo(
    () => [...new Set(entries.map((e) => e.categoryId))].sort(),
    [entries]
  );
  const origens = useMemo(
    () => [...new Set(entries.map((e) => e.source))] as FinancialEntrySource[],
    [entries]
  );

  const hoje = hojeISO();

  const filtrados = useMemo(() => {
    return entries.filter((e) => {
      const displayStatus = deriveDisplayStatus(e, hoje);

      if (status === "cancelado" && e.status !== "cancelled") return false;
      if (status !== "cancelado" && e.status === "cancelled") return false;
      if (status !== "todos" && status !== "cancelado" && !statusCorresponde(displayStatus, status))
        return false;
      if (status === "todos" && !isEntryActive(e)) return false;

      if (tipo !== "todos" && e.type !== tipo) return false;
      if (categoria !== "todas" && e.categoryId !== categoria) return false;
      if (origem !== "todas" && e.source !== origem) return false;

      if (periodo === "todos") return true;
      if (periodo === "mes") return e.competenceMonth === mesAtual;
      const dias = Number(periodo);
      const diff = Math.round(
        (new Date(e.dueDate).getTime() - new Date(hoje).getTime()) / 86400000
      );
      return diff <= dias;
    });
  }, [entries, hoje, periodo, tipo, status, categoria, origem, mesAtual]);

  const grupos = useMemo(() => groupByUrgency(filtrados, hoje), [filtrados, hoje]);

  return (
    <div>
      <h1 className="text-lg font-semibold mb-1">Agenda financeira</h1>
      <p className="text-xs text-text-faint mb-4">
        Contas, assinaturas, parcelas, fatura, gastos e receitas — tudo num só lugar
      </p>
      <ErroBanner mensagem={erro} />

      {/* filtros */}
      <div className="rounded-2xl border border-line bg-surface p-3 mb-4 flex flex-wrap gap-2">
        <SeletorChips
          valor={periodo}
          onChange={(v) => setPeriodo(v as FiltroPeriodo)}
          opcoes={[
            { valor: "7", label: "7 dias" },
            { valor: "15", label: "15 dias" },
            { valor: "30", label: "30 dias" },
            { valor: "mes", label: "Mês" },
            { valor: "todos", label: "Tudo" },
          ]}
        />
        <SeletorChips
          valor={tipo}
          onChange={(v) => setTipo(v as FiltroTipo)}
          opcoes={[
            { valor: "todos", label: "Entrada + saída" },
            { valor: "income", label: "Entradas" },
            { valor: "expense", label: "Saídas" },
          ]}
        />
        <SeletorChips
          valor={status}
          onChange={(v) => setStatus(v as FiltroStatus)}
          opcoes={[
            { valor: "todos", label: "Todos os status" },
            { valor: "pendente", label: "Pendente" },
            { valor: "atrasado", label: "Atrasado" },
            { valor: "pago", label: "Pago" },
            { valor: "cancelado", label: "Cancelado" },
          ]}
        />
        {categorias.length > 0 && (
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs outline-none focus:border-brand capitalize"
          >
            <option value="todas">Todas categorias</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        {origens.length > 0 && (
          <select
            value={origem}
            onChange={(e) => setOrigem(e.target.value as FinancialEntrySource | "todas")}
            className="rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs outline-none focus:border-brand"
          >
            <option value="todas">Todas origens</option>
            {origens.map((o) => (
              <option key={o} value={o}>
                {labelOrigem(o)}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <SkeletonLista linhas={6} />
      ) : grupos.length === 0 ? (
        <p className="text-sm text-text-faint">Nada encontrado com esses filtros.</p>
      ) : (
        <div className="space-y-5">
          {grupos.map((grupo) => (
            <div key={grupo.faixa}>
              <div className="flex items-center justify-between mb-2 px-1">
                <h2
                  className={`text-sm font-medium ${
                    grupo.faixa === "atrasados" ? "text-negative" : "text-text-muted"
                  }`}
                >
                  {grupo.label}
                </h2>
                <span className="text-xs text-text-faint">{grupo.itens.length}</span>
              </div>
              <ul className="space-y-2">
                {grupo.itens.map((e) => (
                  <LinhaAgenda key={e.id} entry={e} hoje={hoje} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SeletorChips<T extends string>({
  valor,
  onChange,
  opcoes,
}: {
  valor: T;
  onChange: (v: T) => void;
  opcoes: { valor: T; label: string }[];
}) {
  return (
    <div className="flex gap-1">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          onClick={() => onChange(o.valor)}
          className={`rounded-full px-2.5 py-1 text-xs border transition-colors whitespace-nowrap ${
            valor === o.valor
              ? "border-brand bg-brand-soft text-brand"
              : "border-line text-text-faint hover:text-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LinhaAgenda({ entry, hoje }: { entry: FinancialEntry; hoje: string }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs text-text-faint">{dataCurta(entry.dueDate)}</span>
          <span className="text-xs text-text-faint">·</span>
          <span className="text-xs text-text-faint capitalize">{entry.categoryId}</span>
          <span className="text-xs text-text-faint">·</span>
          <span className="text-xs text-text-faint">{labelOrigem(entry.source)}</span>
        </div>
        <p className="text-sm text-text truncate">{entry.description}</p>
        <div className="mt-1">
          <StatusBadge status={deriveDisplayStatus(entry, hoje) as StatusBadgeValor} />
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span
          className={`text-sm font-semibold ${
            entry.type === "income" ? "text-positive" : "text-gold"
          }`}
        >
          {entry.type === "income" ? "+" : "-"} {formatarMoeda(entry.amount)}
        </span>
        <Link
          href={HREF_POR_ORIGEM[entry.source]}
          className="text-xs font-medium text-brand hover:text-brand-dark"
        >
          Ver
        </Link>
      </div>
    </li>
  );
}
