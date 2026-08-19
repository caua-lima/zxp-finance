"use client";

import { useMemo, useState } from "react";
import {
  mesPadrao,
  formatarMoeda,
  parcelasRestantesEm,
  valorMinhaParte,
  TAXA_IMPOSTO,
  calcularImposto,
  Ganho,
  ContaFixa,
  Assinatura,
  Parcela,
  FaturaCartao,
} from "@/lib/types";
import { iconeCategoria, CATEGORIAS_CONTAS } from "@/lib/categorias";
import { useGanhos } from "@/lib/useGanhos";
import { useContasFixas } from "@/lib/useContasFixas";
import { useAssinaturas } from "@/lib/useAssinaturas";
import { useParcelas } from "@/lib/useParcelas";
import { useFaturasCartao } from "@/lib/useFaturasCartao";
import { useDreComparativo } from "@/lib/finance/useDreComparativo";
import { groupByCategory } from "@/lib/finance/entries";
import { formatPercent } from "@/lib/finance/calculations";
import { useMonthClose } from "@/lib/useMonthClose";
import { MonthSelector } from "@/components/MonthSelector";
import { ErroBanner } from "@/components/ErroBanner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useToast } from "@/components/Toast";
import { SkeletonLista } from "@/components/Skeleton";

function agruparPorChave<T>(itens: T[], chave: (item: T) => string) {
  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    const k = chave(item);
    const lista = grupos.get(k) ?? [];
    lista.push(item);
    grupos.set(k, lista);
  }
  return grupos;
}

export default function DrePage() {
  const [mes, setMes] = useState(mesPadrao());
  const ganhos = useGanhos(mes);
  const contas = useContasFixas();
  const assinaturas = useAssinaturas();
  const parcelas = useParcelas();
  const faturas = useFaturasCartao(mes);
  const dre = useDreComparativo(mes);
  const monthClose = useMonthClose(mes);
  const toast = useToast();
  const [confirmandoFechar, setConfirmandoFechar] = useState(false);
  const [confirmandoReabrir, setConfirmandoReabrir] = useState(false);

  const loading =
    ganhos.loading ||
    contas.loading ||
    assinaturas.loading ||
    parcelas.loading ||
    faturas.loading ||
    dre.loading;
  const erro =
    ganhos.erro ||
    contas.erro ||
    assinaturas.erro ||
    parcelas.erro ||
    faturas.erro ||
    dre.erro;

  // Ajuste de conciliação fica fora da quebra por categoria — costuma
  // cobrir semanas de gasto não lançado de uma vez, e dominaria o gráfico
  // sozinho sem representar um padrão real de consumo do mês.
  const despesasPorCategoria = useMemo(
    () =>
      groupByCategory(
        dre.entriesAtual.filter((e) => e.type === "expense" && e.source !== "adjustment")
      ),
    [dre.entriesAtual]
  );
  const totalDespesasEntries =
    dre.atual.despesasVariaveis + dre.atual.despesasRecorrentes + dre.atual.parcelasCartao;

  // A quebra de FinancialEntry não conhece a regra de imposto (é específica
  // de Ganho) — aplica aqui em cima da receita operacional já sem reembolso.
  function resultadoLiquido(breakdown: typeof dre.atual): number {
    const receitaLiquida = breakdown.receitaOperacional - calcularImposto(breakdown.receitaOperacional);
    return (
      receitaLiquida -
      breakdown.despesasVariaveis -
      breakdown.despesasRecorrentes -
      breakdown.parcelasCartao
    );
  }
  const resultadoOperacionalLiquido = resultadoLiquido(dre.atual);
  const resultadoOperacionalLiquidoAnterior = resultadoLiquido(dre.anterior);

  function variacao(atualValor: number, anteriorValor: number): string | null {
    if (anteriorValor === 0) return null;
    const pct = ((atualValor - anteriorValor) / Math.abs(anteriorValor)) * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}% vs mês anterior`;
  }

  const contasPorCategoria = useMemo(() => {
    const grupos = agruparPorChave(contas.contas, (c) => c.categoria);
    const ordem = CATEGORIAS_CONTAS as readonly string[];
    return [...grupos.entries()].sort((a, b) => {
      const ia = ordem.indexOf(a[0]);
      const ib = ordem.indexOf(b[0]);
      if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [contas.contas]);

  const parcelasDoMes = useMemo(
    () => parcelas.parcelas.filter((p) => parcelasRestantesEm(p, mes) > 0),
    [parcelas.parcelas, mes]
  );

  const parcelasPorGrupo = useMemo(
    () =>
      agruparPorChave(parcelasDoMes, (p) =>
        p.tipo === "financiamento" ? "Financiamento" : "Cartão de crédito"
      ),
    [parcelasDoMes]
  );

  const totalContas = contas.total;
  const totalAssinaturas = assinaturas.total;
  const totalParcelas = parcelasDoMes.reduce(
    (acc, p) => (p.naFatura ? acc : acc + valorMinhaParte(p)),
    0
  );
  const totalFaturas = faturas.total;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div>
          <h1 className="text-lg font-semibold">DRE do mês</h1>
          <p className="text-xs text-text-faint">
            Demonstrativo detalhado de receitas e despesas
          </p>
        </div>
        {!monthClose.loading &&
          (monthClose.fechado ? (
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-line-soft bg-surface-2 px-2.5 py-1 text-[11px] text-text-faint">
                🔒 Mês fechado
              </span>
              <button
                onClick={() => setConfirmandoReabrir(true)}
                className="text-xs text-brand hover:text-brand-dark"
              >
                Reabrir
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmandoFechar(true)}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-text-muted hover:border-brand/40 hover:text-text transition-colors"
            >
              Fechar mês
            </button>
          ))}
      </div>
      <MonthSelector mes={mes} onChange={setMes} />
      <ErroBanner mensagem={erro || monthClose.erro} />

      {monthClose.fechado && (
        <div className="mb-4 rounded-xl border border-line-soft bg-surface-2/50 px-4 py-3 text-xs text-text-faint">
          Este mês está fechado. Marcar pago/recebido no checklist e lançar
          fatura ficam bloqueados até reabrir.
        </div>
      )}

      <ConfirmModal
        aberto={confirmandoFechar}
        titulo="Fechar mês"
        descricao={`Trava marcar pago/recebido e lançar fatura pra ${mes}. Dá pra reabrir depois, com motivo.`}
        textoConfirmar="Fechar"
        onConfirmar={() => {
          monthClose.fechar({
            income: dre.atual.receitaOperacional,
            expenses: totalDespesasEntries,
            result: resultadoOperacionalLiquido,
          });
          toast.sucesso(`Mês de ${mes} fechado.`);
          setConfirmandoFechar(false);
        }}
        onCancelar={() => setConfirmandoFechar(false)}
      />
      <ConfirmModal
        aberto={confirmandoReabrir}
        titulo="Reabrir mês"
        descricao="Volta a permitir marcar pago/recebido e lançar fatura pra este mês. Explique o motivo."
        textoConfirmar="Reabrir"
        perigo
        pedirMotivo
        onConfirmar={(motivo) => {
          monthClose.reabrir(motivo ?? "");
          toast.sucesso(`Mês de ${mes} reaberto.`);
          setConfirmandoReabrir(false);
        }}
        onCancelar={() => setConfirmandoReabrir(false)}
      />

      {loading ? (
        <SkeletonLista linhas={5} />
      ) : (
        <div className="space-y-5">
          <div
            className={`rounded-2xl border p-6 text-center ${
              resultadoOperacionalLiquido >= 0
                ? "border-brand/25 bg-positive-soft"
                : "border-negative/40 bg-negative-soft"
            }`}
            title={`Receita operacional sem reembolso (− imposto de ${(TAXA_IMPOSTO * 100).toFixed(0)}%) − despesas variáveis − despesas recorrentes − parcelas e cartão`}
          >
            <p className="text-sm text-text-muted">Resultado operacional pessoal</p>
            <p
              className={`text-3xl font-bold mt-1 ${
                resultadoOperacionalLiquido >= 0 ? "text-positive" : "text-negative"
              }`}
            >
              {formatarMoeda(resultadoOperacionalLiquido)}
            </p>
            {variacao(resultadoOperacionalLiquido, resultadoOperacionalLiquidoAnterior) && (
              <p className="text-xs text-text-faint mt-1">
                {variacao(resultadoOperacionalLiquido, resultadoOperacionalLiquidoAnterior)}
              </p>
            )}
            {dre.atual.reembolsos > 0 && (
              <p className="text-xs text-info mt-2">
                + {formatarMoeda(dre.atual.reembolsos)} em reembolsos (fora do operacional)
              </p>
            )}
          </div>

          {/* 3 CATEGORIAS DE DESPESA, COMPARADAS COM O MÊS ANTERIOR */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <CardComparativo
              titulo="Despesas variáveis"
              tooltip="Gastos do dia a dia + ajustes de conciliação"
              valor={dre.atual.despesasVariaveis}
              valorAnterior={dre.anterior.despesasVariaveis}
              percentual={totalDespesasEntries ? dre.atual.despesasVariaveis / totalDespesasEntries : 0}
            />
            <CardComparativo
              titulo="Despesas recorrentes"
              tooltip="Contas fixas ativas + assinaturas ativas"
              valor={dre.atual.despesasRecorrentes}
              valorAnterior={dre.anterior.despesasRecorrentes}
              percentual={
                totalDespesasEntries ? dre.atual.despesasRecorrentes / totalDespesasEntries : 0
              }
            />
            <CardComparativo
              titulo="Parcelas e cartão"
              tooltip="Parcelas ativas + fatura do cartão, sem contar duas vezes o que já está na fatura"
              valor={dre.atual.parcelasCartao}
              valorAnterior={dre.anterior.parcelasCartao}
              percentual={totalDespesasEntries ? dre.atual.parcelasCartao / totalDespesasEntries : 0}
            />
          </div>

          {despesasPorCategoria.length > 0 && (
            <div className="rounded-2xl border border-line bg-surface p-4">
              <h2 className="text-sm font-medium text-text-muted mb-3">
                Despesas por categoria
              </h2>
              <div className="space-y-2">
                {despesasPorCategoria.map((g) => (
                  <div key={g.categoryId} className="flex items-center gap-3">
                    <span className="text-xs text-text-muted w-28 truncate capitalize">
                      {g.categoryId}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                      <div
                        className="h-full bg-gold"
                        style={{
                          width: `${
                            totalDespesasEntries ? (g.total / totalDespesasEntries) * 100 : 0
                          }%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-text-faint w-28 text-right shrink-0">
                      {formatarMoeda(g.total)} ·{" "}
                      {formatPercent(
                        totalDespesasEntries ? (g.total / totalDespesasEntries) * 100 : 0
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* RECEITAS */}
          <Secao titulo="Receitas" total={ganhos.total} corTotal="text-positive">
            <SubGrupo titulo="Recorrentes">
              {ganhos.recorrentes.length === 0 ? (
                <Vazio />
              ) : (
                ganhos.recorrentes.map((g: Ganho) => (
                  <ItemLinha
                    key={g.id}
                    nome={g.descricao}
                    valor={g.valor}
                    cor="text-positive"
                    inativo={g.ativo === false}
                    nota={g.ativo === false ? "desativado" : undefined}
                  />
                ))
              )}
            </SubGrupo>
            <SubGrupo titulo="Só este mês">
              {ganhos.pontuais.length === 0 ? (
                <Vazio />
              ) : (
                ganhos.pontuais.map((g: Ganho) => (
                  <ItemLinha
                    key={g.id}
                    nome={g.descricao}
                    valor={g.valor}
                    cor="text-positive"
                  />
                ))
              )}
            </SubGrupo>
            <TotalLinha label="Receita bruta" valor={ganhos.total} />
            <TotalLinha
              label={`(−) Imposto (${(TAXA_IMPOSTO * 100).toFixed(0)}%)`}
              valor={ganhos.imposto}
              cor="text-negative"
            />
            <TotalLinha
              label="= Receita líquida"
              valor={ganhos.totalLiquido}
              cor="text-positive"
              destaque
            />
          </Secao>

          {/* CONTAS FIXAS */}
          <Secao titulo="Contas fixas" total={totalContas} corTotal="text-gold">
            {contasPorCategoria.map(([categoria, itens]) => (
              <SubGrupo
                key={categoria}
                titulo={`${iconeCategoria(categoria)} ${categoria}`}
                subtotal={itens
                  .filter((c) => c.ativa)
                  .reduce((acc, c) => acc + c.valor, 0)}
              >
                {itens.map((c: ContaFixa) => (
                  <ItemLinha
                    key={c.id}
                    nome={c.nome}
                    valor={c.valor}
                    cor="text-gold"
                    inativo={!c.ativa}
                    nota={!c.ativa ? "desativada" : undefined}
                  />
                ))}
              </SubGrupo>
            ))}
          </Secao>

          {/* ASSINATURAS */}
          <Secao titulo="Assinaturas" total={totalAssinaturas} corTotal="text-gold">
            {assinaturas.assinaturas.length === 0 ? (
              <Vazio />
            ) : (
              assinaturas.assinaturas.map((a: Assinatura) => (
                <ItemLinha
                  key={a.id}
                  nome={a.nome}
                  valor={a.valor}
                  cor="text-gold"
                  inativo={!a.ativa || a.naFatura}
                  nota={
                    !a.ativa
                      ? "desativada"
                      : a.naFatura
                      ? "já contada na fatura do cartão"
                      : undefined
                  }
                />
              ))
            )}
          </Secao>

          {/* PARCELAS E FINANCIAMENTOS */}
          <Secao
            titulo="Parcelas e financiamentos"
            total={totalParcelas}
            corTotal="text-gold"
          >
            {[...parcelasPorGrupo.entries()].map(([grupo, itens]) => (
              <SubGrupo
                key={grupo}
                titulo={grupo}
                subtotal={itens.reduce(
                  (acc, p) => (p.naFatura ? acc : acc + valorMinhaParte(p)),
                  0
                )}
              >
                {itens.map((p: Parcela) => (
                  <ItemLinha
                    key={p.id}
                    nome={p.nome}
                    valor={valorMinhaParte(p)}
                    cor="text-gold"
                    inativo={p.naFatura}
                    nota={
                      p.naFatura
                        ? `já contada na fatura do cartão · faltam ${p.parcelasRestantes}`
                        : p.dividida
                        ? `dividida · total ${formatarMoeda(p.valorParcela)} · faltam ${p.parcelasRestantes}`
                        : `faltam ${p.parcelasRestantes} de ${p.totalParcelas}`
                    }
                  />
                ))}
              </SubGrupo>
            ))}
          </Secao>

          {/* FATURA DO CARTÃO */}
          <Secao
            titulo="Fatura do cartão"
            total={totalFaturas}
            corTotal="text-gold"
          >
            {faturas.faturas.filter((f) => f.valor > 0).length === 0 ? (
              <Vazio />
            ) : (
              faturas.faturas
                .filter((f: FaturaCartao) => f.valor > 0)
                .map((f: FaturaCartao) => (
                  <ItemLinha
                    key={f.id}
                    nome={f.nome}
                    valor={f.valor}
                    cor="text-gold"
                  />
                ))
            )}
          </Secao>

          {/* RESUMO FINAL */}
          <div className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="text-sm font-medium text-text-muted mb-3">
              Resumo do DRE
            </h2>
            <div className="space-y-2 text-sm">
              <LinhaResumo label="Receita líquida" valor={ganhos.totalLiquido} sinal="+" />
              <LinhaResumo label="Contas fixas" valor={totalContas} sinal="-" />
              <LinhaResumo label="Assinaturas" valor={totalAssinaturas} sinal="-" />
              <LinhaResumo label="Parcelas e financiamentos" valor={totalParcelas} sinal="-" />
              <LinhaResumo label="Fatura do cartão" valor={totalFaturas} sinal="-" />
              <div className="border-t border-line pt-2 flex justify-between font-semibold">
                <span>Resultado do mês</span>
                <span className={resultadoOperacionalLiquido >= 0 ? "text-positive" : "text-negative"}>
                  {formatarMoeda(resultadoOperacionalLiquido)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CardComparativo({
  titulo,
  tooltip,
  valor,
  valorAnterior,
  percentual,
}: {
  titulo: string;
  tooltip: string;
  valor: number;
  valorAnterior: number;
  percentual: number;
}) {
  const delta = valorAnterior !== 0 ? ((valor - valorAnterior) / valorAnterior) * 100 : null;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4" title={tooltip}>
      <p className="text-xs text-text-faint">{titulo}</p>
      <p className="text-lg font-semibold text-gold mt-1">{formatarMoeda(valor)}</p>
      <p className="text-[11px] text-text-faint mt-1">
        {(percentual * 100).toFixed(0)}% das despesas
        {delta !== null && (
          <span className={delta > 0 ? "text-negative" : "text-positive"}>
            {" "}
            · {delta > 0 ? "+" : ""}
            {delta.toFixed(0)}% vs mês ant.
          </span>
        )}
      </p>
    </div>
  );
}

function Secao({
  titulo,
  total,
  corTotal,
  children,
}: {
  titulo: string;
  total: number;
  corTotal: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        <span className={`text-sm font-semibold ${corTotal}`}>
          {formatarMoeda(total)}
        </span>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function SubGrupo({
  titulo,
  subtotal,
  children,
}: {
  titulo: string;
  subtotal?: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide">
          {titulo}
        </h3>
        {subtotal !== undefined && (
          <span className="text-xs text-text-faint">
            {formatarMoeda(subtotal)}
          </span>
        )}
      </div>
      <div className="space-y-1 pl-2 border-l border-line-soft">
        {children}
      </div>
    </div>
  );
}

function ItemLinha({
  nome,
  valor,
  cor,
  inativo,
  nota,
}: {
  nome: string;
  valor: number;
  cor: string;
  inativo?: boolean;
  nota?: string;
}) {
  return (
    <div
      className={`flex justify-between items-center pl-2 text-sm ${
        inativo ? "opacity-50" : ""
      }`}
    >
      <div className="min-w-0">
        <p className="truncate">{nome}</p>
        {nota && <p className="text-xs text-text-faint">{nota}</p>}
      </div>
      <span className={`shrink-0 ml-3 ${cor}`}>{formatarMoeda(valor)}</span>
    </div>
  );
}

function Vazio() {
  return <p className="pl-2 text-xs text-text-faint">Nenhum item.</p>;
}

function TotalLinha({
  label,
  valor,
  cor,
  destaque,
}: {
  label: string;
  valor: number;
  cor?: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={`flex justify-between items-center text-sm ${
        destaque ? "border-t border-line pt-2 font-semibold" : "text-text-muted"
      }`}
    >
      <span>{label}</span>
      <span className={cor ?? "text-text"}>{formatarMoeda(valor)}</span>
    </div>
  );
}

function LinhaResumo({
  label,
  valor,
  sinal,
}: {
  label: string;
  valor: number;
  sinal: "+" | "-";
}) {
  return (
    <div className="flex justify-between text-text-muted">
      <span>{label}</span>
      <span className={sinal === "+" ? "text-positive" : "text-gold"}>
        {sinal} {formatarMoeda(valor)}
      </span>
    </div>
  );
}
