"use client";

import { FormEvent, useMemo, useState } from "react";
import { formatarMoeda, formatarMes, mesPadrao } from "@/lib/types";
import { hojeISO } from "@/lib/finance/calculations";
import { calcularComissaoDoDia } from "@/lib/finance/comissoes";
import { useComissoes } from "@/lib/useComissoes";
import { useComissaoConfig } from "@/lib/useComissaoConfig";
import { useGanhos } from "@/lib/useGanhos";
import { MonthSelector } from "@/components/MonthSelector";
import { ErroBanner } from "@/components/ErroBanner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SkeletonLista } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";

function formatarDataLonga(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  const nomes = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ];
  return `${dia} de ${nomes[parseInt(mes, 10) - 1]}, ${ano}`;
}

export default function ComissoesPage() {
  const [mes, setMes] = useState(mesPadrao());
  const comissoes = useComissoes(mes);
  const config = useComissaoConfig();
  const ganhos = useGanhos(mes);
  const toast = useToast();

  const [data, setData] = useState(hojeISO());
  const [reunioes, setReunioes] = useState("");
  const [vendasPerformance, setVendasPerformance] = useState("");
  const [vendasAcelera, setVendasAcelera] = useState("");
  const [editandoValores, setEditandoValores] = useState(false);
  const [valorReuniao, setValorReuniao] = useState(String(config.valores.valorReuniao));
  const [valorVendaPerformance, setValorVendaPerformance] = useState(
    String(config.valores.valorVendaPerformance)
  );
  const [valorVendaAcelera, setValorVendaAcelera] = useState(
    String(config.valores.valorVendaAcelera)
  );
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<string | null>(null);

  const contagemAtual = {
    reunioes: parseInt(reunioes, 10) || 0,
    vendasPerformance: parseInt(vendasPerformance, 10) || 0,
    vendasAcelera: parseInt(vendasAcelera, 10) || 0,
  };
  const previaValor = useMemo(
    () => calcularComissaoDoDia(contagemAtual, config.valores),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- contagemAtual é recriado a cada render; os 3 campos primitivos já cobrem a dependência real
    [contagemAtual.reunioes, contagemAtual.vendasPerformance, contagemAtual.vendasAcelera, config.valores]
  );

  const jaLancadoNoDia = comissoes.doMes.find((c) => c.data === data);

  function carregarDia(iso: string) {
    const existente = comissoes.doMes.find((c) => c.data === iso);
    setData(iso);
    setReunioes(existente ? String(existente.reunioes) : "");
    setVendasPerformance(existente ? String(existente.vendasPerformance) : "");
    setVendasAcelera(existente ? String(existente.vendasAcelera) : "");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!data) return;
    comissoes.registrar(data, contagemAtual, config.valores);
    toast.sucesso(`Comissão de ${formatarDataLonga(data)} salva: ${formatarMoeda(previaValor)}.`);
    setReunioes("");
    setVendasPerformance("");
    setVendasAcelera("");
    setData(hojeISO());
  }

  function salvarValores() {
    config.salvar({
      valorReuniao: parseFloat(valorReuniao.replace(",", ".")) || 0,
      valorVendaPerformance: parseFloat(valorVendaPerformance.replace(",", ".")) || 0,
      valorVendaAcelera: parseFloat(valorVendaAcelera.replace(",", ".")) || 0,
    });
    setEditandoValores(false);
    toast.sucesso("Valores de comissão atualizados.");
  }

  function lancarComoGanho() {
    if (comissoes.totalMes <= 0) return;
    ganhos.adicionarPontual(`Comissão (${formatarMes(mes)})`, comissoes.totalMes).catch(console.error);
    toast.sucesso("Lançado em Ganhos — confira lá se já não tinha um lançamento este mês.");
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-1">Comissões</h1>
      <p className="text-xs text-text-faint mb-4">
        Anote o dia a dia e a comissão é calculada e somada sozinha
      </p>
      <MonthSelector mes={mes} onChange={setMes} />
      <ErroBanner mensagem={comissoes.erro || config.erro || ganhos.erro} />

      {/* valores por tipo */}
      <div className="rounded-2xl border border-line bg-surface p-4 mb-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-medium text-text-muted">Valor por tipo</h2>
          <button
            onClick={() => setEditandoValores((v) => !v)}
            className="text-xs text-brand hover:text-brand-dark"
          >
            {editandoValores ? "fechar" : "editar"}
          </button>
        </div>
        {!editandoValores ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-faint">
            <span>Reunião: {formatarMoeda(config.valores.valorReuniao)}</span>
            <span>Venda performance: {formatarMoeda(config.valores.valorVendaPerformance)}</span>
            <span>Venda acelera: {formatarMoeda(config.valores.valorVendaAcelera)}</span>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div>
              <label className="block text-[11px] text-text-faint mb-1">Reunião</label>
              <input
                inputMode="decimal"
                value={valorReuniao}
                onChange={(e) => setValorReuniao(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="block text-[11px] text-text-faint mb-1">Venda performance</label>
              <input
                inputMode="decimal"
                value={valorVendaPerformance}
                onChange={(e) => setValorVendaPerformance(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="block text-[11px] text-text-faint mb-1">Venda acelera</label>
              <input
                inputMode="decimal"
                value={valorVendaAcelera}
                onChange={(e) => setValorVendaAcelera(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
              />
            </div>
            <button
              onClick={salvarValores}
              className="col-span-3 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-[#0E0F0C]"
            >
              Salvar valores
            </button>
          </div>
        )}
      </div>

      {/* lançar o dia */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-line bg-surface p-4 mb-4 space-y-2"
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
          <div>
            <label className="block text-[11px] text-text-faint mb-1">Dia</label>
            <input
              type="date"
              value={data}
              onChange={(e) => carregarDia(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface-2 px-2 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-[11px] text-text-faint mb-1">Reuniões</label>
            <input
              id="comissoes-form-reunioes"
              inputMode="numeric"
              placeholder="0"
              value={reunioes}
              onChange={(e) => setReunioes(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface-2 px-2 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-[11px] text-text-faint mb-1">Vendas performance</label>
            <input
              inputMode="numeric"
              placeholder="0"
              value={vendasPerformance}
              onChange={(e) => setVendasPerformance(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface-2 px-2 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-[11px] text-text-faint mb-1">Vendas acelera</label>
            <input
              inputMode="numeric"
              placeholder="0"
              value={vendasAcelera}
              onChange={(e) => setVendasAcelera(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface-2 px-2 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
        </div>
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-text-faint">
            {jaLancadoNoDia
              ? `Já tem lançamento nesse dia (${formatarMoeda(jaLancadoNoDia.valorTotal)}) — salvar substitui.`
              : "Comissão do dia:"}{" "}
            <span className="text-sm font-semibold text-positive">
              {formatarMoeda(previaValor)}
            </span>
          </p>
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-[#0E0F0C] hover:bg-brand-dark transition-colors"
          >
            Salvar dia
          </button>
        </div>
      </form>

      {/* resumo do mês */}
      <div className="rounded-2xl border border-brand/25 bg-surface-elevated p-4 mb-6 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-text-muted">Total de {formatarMes(mes)}</span>
          <span className="text-xl font-bold text-positive">
            {formatarMoeda(comissoes.totalMes)}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-faint">
          <span>{comissoes.totalReunioes} reunião(ões)</span>
          <span>{comissoes.totalVendasPerformance} venda(s) performance</span>
          <span>{comissoes.totalVendasAcelera} venda(s) acelera</span>
        </div>
        {comissoes.totalMes > 0 && (
          <button
            onClick={lancarComoGanho}
            className="text-xs text-brand hover:text-brand-dark"
          >
            Lançar total como ganho do mês →
          </button>
        )}
      </div>

      {comissoes.loading ? (
        <SkeletonLista linhas={4} />
      ) : comissoes.doMes.length === 0 ? (
        <EmptyState mensagem="Nenhum dia lançado neste mês ainda." alvoId="comissoes-form-reunioes" />
      ) : (
        <ul className="space-y-2">
          {comissoes.doMes.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm">{formatarDataLonga(c.data)}</p>
                <p className="text-xs text-text-faint">
                  {c.reunioes} reunião(ões) · {c.vendasPerformance} venda(s) performance ·{" "}
                  {c.vendasAcelera} venda(s) acelera
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-medium text-positive">
                  {formatarMoeda(c.valorTotal)}
                </span>
                <button
                  onClick={() => carregarDia(c.data)}
                  className="text-text-faint hover:text-brand text-sm"
                  aria-label="Editar"
                >
                  ✎
                </button>
                <button
                  onClick={() => setConfirmandoExclusao(c.data)}
                  className="text-[10px] text-text-faint hover:text-negative whitespace-nowrap"
                >
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        aberto={!!confirmandoExclusao}
        titulo="Excluir lançamento"
        descricao={
          confirmandoExclusao
            ? `Comissão de ${formatarDataLonga(confirmandoExclusao)} será apagada.`
            : ""
        }
        textoConfirmar="Excluir"
        perigo
        onConfirmar={() => {
          if (confirmandoExclusao) {
            comissoes.remover(confirmandoExclusao);
            toast.sucesso("Lançamento excluído.");
          }
          setConfirmandoExclusao(null);
        }}
        onCancelar={() => setConfirmandoExclusao(null)}
      />
    </div>
  );
}
