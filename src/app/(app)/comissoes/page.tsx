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
import { PageHeader } from "@/components/PageHeader";
import { Botao } from "@/components/Botao";
import { BotaoIcone, AcoesItem } from "@/components/BotaoIcone";
import { IconEditar, IconExcluir } from "@/components/icons";

/**
 * Contagem com botões +/− em vez de só campo de texto. No celular, digitar
 * "3" num campo minúsculo dá mais trabalho do que tocar duas vezes no +, e
 * esses números são quase sempre de 0 a 5. O campo continua editável pra
 * quando o número for grande.
 */
function ContadorCampo({
  id,
  titulo,
  unitario,
  valor,
  onChange,
}: {
  id?: string;
  titulo: string;
  unitario: number;
  valor: string;
  onChange: (v: string) => void;
}) {
  const n = parseInt(valor, 10) || 0;
  const definir = (novo: number) => onChange(novo <= 0 ? "" : String(novo));

  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/40 py-2 pl-3 pr-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-tight">{titulo}</p>
        <p className="text-[11px] text-text-faint">{formatarMoeda(unitario)} cada</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => definir(n - 1)}
          disabled={n <= 0}
          aria-label={`Diminuir ${titulo}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-lg leading-none text-text-muted disabled:opacity-30 active:bg-surface"
        >
          −
        </button>
        <input
          id={id}
          inputMode="numeric"
          placeholder="0"
          value={valor}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
          aria-label={titulo}
          className="h-9 w-11 rounded-lg border border-line bg-surface text-center text-base font-semibold outline-none focus:border-brand"
        />
        <button
          type="button"
          onClick={() => definir(n + 1)}
          aria-label={`Aumentar ${titulo}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand/40 bg-brand-soft text-lg leading-none text-brand active:bg-surface"
        >
          +
        </button>
      </div>
    </div>
  );
}

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
    toast.sucessoSe(comissoes.registrar(data, contagemAtual, config.valores), `Comissão de ${formatarDataLonga(data)} salva: ${formatarMoeda(previaValor)}.`);
    setReunioes("");
    setVendasPerformance("");
    setVendasAcelera("");
    setData(hojeISO());
  }

  function salvarValores() {
    toast.sucessoSe(
      config.salvar({
        valorReuniao: parseFloat(valorReuniao.replace(",", ".")) || 0,
        valorVendaPerformance: parseFloat(valorVendaPerformance.replace(",", ".")) || 0,
        valorVendaAcelera: parseFloat(valorVendaAcelera.replace(",", ".")) || 0,
      }),
      "Valores de comissão atualizados."
    );
    setEditandoValores(false);
  }

  // O ganho de comissão do mês é identificado pela descrição. Se já existe,
  // atualiza o valor em vez de criar outro — clicar duas vezes antes criava
  // dois ganhos, inflando a receita do mês e distorcendo DRE, comparação com
  // a média do IBGE e o alerta de fatura pesada (que divide fatura por renda).
  const descricaoGanho = `Comissão (${formatarMes(mes)})`;
  const ganhoExistente = ganhos.pontuais.find(
    (g) => g.descricao === descricaoGanho && !g.arquivado
  );

  function lancarComoGanho() {
    if (comissoes.totalMes <= 0) return;
    if (ganhoExistente) {
      if (ganhoExistente.valor === comissoes.totalMes) {
        toast.sucesso("O ganho do mês já está com esse valor.");
        return;
      }
      toast.sucessoSe(ganhos.editar(ganhoExistente.id, {
        descricao: descricaoGanho,
        valor: comissoes.totalMes,
        categoriaReceita: ganhoExistente.categoriaReceita,
        semImposto: ganhoExistente.semImposto,
      }), `Ganho do mês atualizado pra ${formatarMoeda(comissoes.totalMes)}.`);
    } else {
      toast.sucessoSe(
        ganhos.adicionarPontual(descricaoGanho, comissoes.totalMes),
        "Lançado em Ganhos."
      );
    }
  }

  return (
    <div>
      <PageHeader
        titulo="Comissões"
        descricao="Anote o dia a dia e a comissão é calculada e somada sozinha"
      />
      <MonthSelector mes={mes} onChange={setMes} />
      <ErroBanner mensagem={comissoes.erro || config.erro || ganhos.erro} />

      {/* lançar o dia — a ação principal da tela vem primeiro */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-line bg-surface p-4 mb-3 space-y-3"
      >
        <div>
          <label className="rotulo">Dia</label>
          <input
            type="date"
            value={data}
            onChange={(e) => carregarDia(e.target.value)}
            className="campo"
          />
        </div>

        <div className="space-y-2">
          <ContadorCampo
            id="comissoes-form-reunioes"
            titulo="Reuniões realizadas"
            unitario={config.valores.valorReuniao}
            valor={reunioes}
            onChange={setReunioes}
          />
          <ContadorCampo
            titulo="Vendas performance"
            unitario={config.valores.valorVendaPerformance}
            valor={vendasPerformance}
            onChange={setVendasPerformance}
          />
          <ContadorCampo
            titulo="Vendas acelera"
            unitario={config.valores.valorVendaAcelera}
            valor={vendasAcelera}
            onChange={setVendasAcelera}
          />
        </div>

        <div className="flex items-center justify-between rounded-xl bg-surface-2/60 px-3 py-2.5">
          <span className="text-sm text-text-muted">Comissão do dia</span>
          <span className="text-lg font-bold text-positive">
            {formatarMoeda(previaValor)}
          </span>
        </div>

        {jaLancadoNoDia && (
          <p className="text-[11px] text-gold">
            Esse dia já tem {formatarMoeda(jaLancadoNoDia.valorTotal)} lançado —
            salvar substitui.
          </p>
        )}

        <Botao type="submit" larguraTotal>
          Salvar dia
        </Botao>
      </form>

      {/* valores por tipo — configuração, fica depois do uso diário */}
      <div className="rounded-2xl border border-line bg-surface p-4 mb-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-muted">Valor por tipo</h2>
          <button
            onClick={() => setEditandoValores((v) => !v)}
            className="rounded-lg px-2 py-1 text-xs font-medium text-brand active:bg-surface-2"
          >
            {editandoValores ? "fechar" : "editar"}
          </button>
        </div>
        {!editandoValores ? (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-faint">
            <span>Reunião {formatarMoeda(config.valores.valorReuniao)}</span>
            <span>·</span>
            <span>Performance {formatarMoeda(config.valores.valorVendaPerformance)}</span>
            <span>·</span>
            <span>Acelera {formatarMoeda(config.valores.valorVendaAcelera)}</span>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="rotulo">Reunião</label>
                <input
                  inputMode="decimal"
                  value={valorReuniao}
                  onChange={(e) => setValorReuniao(e.target.value)}
                  className="campo"
                />
              </div>
              <div>
                <label className="rotulo">Performance</label>
                <input
                  inputMode="decimal"
                  value={valorVendaPerformance}
                  onChange={(e) => setValorVendaPerformance(e.target.value)}
                  className="campo"
                />
              </div>
              <div>
                <label className="rotulo">Acelera</label>
                <input
                  inputMode="decimal"
                  value={valorVendaAcelera}
                  onChange={(e) => setValorVendaAcelera(e.target.value)}
                  className="campo"
                />
              </div>
            </div>
            <Botao onClick={salvarValores} larguraTotal tamanho="pequeno">
              Salvar valores
            </Botao>
          </div>
        )}
      </div>

      {/* resumo do mês */}
      <div className="rounded-2xl border border-brand/25 bg-surface-elevated p-4 mb-5 space-y-2">
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
            className="rounded-lg py-1 text-left text-xs font-medium text-brand active:opacity-70"
          >
            {ganhoExistente
              ? `Atualizar ganho do mês (hoje ${formatarMoeda(ganhoExistente.valor)}) →`
              : "Lançar total como ganho do mês →"}
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
              className="flex items-center gap-2 rounded-xl border border-line bg-surface py-2 pl-4 pr-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm">{formatarDataLonga(c.data)}</p>
                <p className="truncate text-xs text-text-faint">
                  {c.reunioes} reunião(ões) · {c.vendasPerformance} performance ·{" "}
                  {c.vendasAcelera} acelera
                </p>
              </div>
              <span className="shrink-0 text-sm font-medium text-positive">
                {formatarMoeda(c.valorTotal)}
              </span>
              <AcoesItem>
                <BotaoIcone label="Editar lançamento" onClick={() => carregarDia(c.data)}>
                  <IconEditar width={17} height={17} />
                </BotaoIcone>
                <BotaoIcone
                  label="Excluir lançamento"
                  tom="perigo"
                  onClick={() => setConfirmandoExclusao(c.data)}
                >
                  <IconExcluir width={17} height={17} />
                </BotaoIcone>
              </AcoesItem>
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
            toast.sucessoSe(comissoes.remover(confirmandoExclusao), "Lançamento excluído.");
          }
          setConfirmandoExclusao(null);
        }}
        onCancelar={() => setConfirmandoExclusao(null)}
      />
    </div>
  );
}
