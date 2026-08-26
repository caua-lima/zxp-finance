"use client";

import { useMemo, useState } from "react";
import {
  mesPadrao,
  formatarMoeda,
  parcelasRestantesEm,
  valorMinhaParte,
} from "@/lib/types";
import { iconeCategoria } from "@/lib/categorias";
import { useContasFixas } from "@/lib/useContasFixas";
import { useAssinaturas } from "@/lib/useAssinaturas";
import { useParcelas } from "@/lib/useParcelas";
import { useFaturasCartao } from "@/lib/useFaturasCartao";
import { usePagamentos, OrigemItem } from "@/lib/usePagamentos";
import { useCartoesConfig } from "@/lib/useCartoesConfig";
import { hojeISO } from "@/lib/finance/calculations";
import { useMonthClose } from "@/lib/useMonthClose";
import { MonthSelector } from "@/components/MonthSelector";
import { ErroBanner } from "@/components/ErroBanner";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonLista } from "@/components/Skeleton";

interface ItemChecklist {
  id: string;
  origem: OrigemItem;
  nome: string;
  detalhe?: string;
  valor: number;
  /** Dia do mês em que vence, quando cadastrado. Ordena a lista e marca atraso. */
  diaVencimento?: number;
}

export default function ChecklistPage() {
  const [mes, setMes] = useState(mesPadrao());
  const contas = useContasFixas();
  const assinaturas = useAssinaturas();
  const parcelas = useParcelas();
  const faturas = useFaturasCartao(mes);
  const pagamentos = usePagamentos(mes);
  const cartoesConfig = useCartoesConfig();
  const monthClose = useMonthClose(mes);

  const loading =
    contas.loading ||
    assinaturas.loading ||
    parcelas.loading ||
    faturas.loading ||
    pagamentos.loading;
  const erro =
    contas.erro ||
    assinaturas.erro ||
    parcelas.erro ||
    faturas.erro ||
    pagamentos.erro ||
    monthClose.erro;

  const grupos = useMemo(() => {
    const itensContas: ItemChecklist[] = contas.contas
      .filter((c) => c.ativa)
      .map((c) => ({
        id: c.id,
        origem: "conta" as const,
        nome: c.nome,
        detalhe: `${iconeCategoria(c.categoria)} ${c.categoria}`,
        valor: c.valor,
        diaVencimento: c.diaVencimento,
      }));

    const itensAssinaturas: ItemChecklist[] = assinaturas.assinaturas
      .filter((a) => a.ativa && !a.naFatura)
      .map((a) => ({
        id: a.id,
        origem: "assinatura" as const,
        nome: a.nome,
        valor: a.valor,
        diaVencimento: a.diaRenovacao,
      }));

    const itensParcelas: ItemChecklist[] = parcelas.parcelas
      .filter((p) => parcelasRestantesEm(p, mes) > 0 && !p.naFatura)
      .map((p) => {
        const restantes = parcelasRestantesEm(p, mes);
        const numeroAtual = p.totalParcelas - restantes + 1;
        return {
          id: p.id,
          origem: "parcela" as const,
          nome: p.nome,
          detalhe: `parcela ${numeroAtual} de ${p.totalParcelas}${
            p.dividida ? " · você paga metade" : ""
          }`,
          valor: valorMinhaParte(p),
        };
      });

    const itensFaturas: ItemChecklist[] = faturas.faturas
      .filter((f) => f.valor > 0)
      .map((f) => {
        const vinculadas = parcelas.parcelas.filter(
          (p) => p.tipo === "cartao" && p.cartao === f.nome
        );
        return {
          id: f.id,
          origem: "fatura" as const,
          nome: f.nome,
          detalhe:
            vinculadas.length > 0
              ? `dá baixa em ${vinculadas.length} parcela${
                  vinculadas.length > 1 ? "s" : ""
                } desse cartão`
              : undefined,
          valor: f.valor,
          diaVencimento: cartoesConfig.configs.find((c) => c.nome === f.nome)
            ?.diaVencimento,
        };
      });

    // Dentro de cada grupo, o que vence antes vem antes — no começo do mês a
    // pergunta é "qual pago primeiro", e ordem de cadastro não responde isso.
    // Sem dia cadastrado vai pro fim (o app assume fim do mês nesses casos).
    const porVencimento = (a: ItemChecklist, b: ItemChecklist) =>
      (a.diaVencimento ?? 99) - (b.diaVencimento ?? 99);

    return [
      { titulo: "Contas fixas", itens: [...itensContas].sort(porVencimento) },
      { titulo: "Assinaturas", itens: [...itensAssinaturas].sort(porVencimento) },
      { titulo: "Parcelas e financiamentos", itens: itensParcelas },
      { titulo: "Fatura do cartão", itens: [...itensFaturas].sort(porVencimento) },
    ];
  }, [
    contas.contas,
    assinaturas.assinaturas,
    parcelas.parcelas,
    faturas.faturas,
    cartoesConfig.configs,
    mes,
  ]);

  const hoje = hojeISO();
  const diaDeHoje = Number(hoje.split("-")[2]);
  const ehMesCorrente = mes === hoje.slice(0, 7);

  function alternarPago(item: ItemChecklist, marcado: boolean) {
    if (monthClose.fechado) return;
    pagamentos.marcar(item.origem, item.id, marcado, {
      nome: item.nome,
      valor: item.valor,
    });

    if (item.origem === "fatura") {
      const vinculadas = parcelas.parcelas.filter(
        (p) => p.tipo === "cartao" && p.cartao === item.nome
      );
      for (const p of vinculadas) {
        if (marcado && p.parcelasRestantes > 0) {
          parcelas.darBaixa(p.id);
        } else if (!marcado && p.parcelasRestantes < p.totalParcelas) {
          parcelas.reverterBaixa(p.id);
        }
      }
    }
  }

  const todosItens = grupos.flatMap((g) => g.itens);
  const totalGeral = todosItens.reduce((acc, i) => acc + i.valor, 0);
  const itensPagos = todosItens.filter((i) =>
    pagamentos.estaPago(i.origem, i.id)
  );
  const totalPago = itensPagos.reduce((acc, i) => acc + i.valor, 0);
  const totalFalta = totalGeral - totalPago;
  const progresso =
    todosItens.length === 0
      ? 0
      : Math.round((itensPagos.length / todosItens.length) * 100);

  return (
    <div>
      <PageHeader
        titulo="Checklist do mês"
        descricao="Vá marcando conforme for pagando"
      />
      <MonthSelector mes={mes} onChange={setMes} />
      <ErroBanner mensagem={erro} />
      {monthClose.fechado && (
        <div className="mb-4 rounded-xl border border-line-soft bg-surface-2/50 px-4 py-3 text-xs text-text-faint">
          🔒 Mês fechado — marcar pago fica bloqueado. Reabra na aba DRE pra
          corrigir algo.
        </div>
      )}

      {loading ? (
        <SkeletonLista linhas={5} />
      ) : todosItens.length === 0 ? (
        <p className="text-sm text-text-faint">
          Nada a pagar neste mês. Cadastre contas fixas, assinaturas ou
          parcelas primeiro.
        </p>
      ) : (
        <div className="space-y-5">
          {/* PROGRESSO */}
          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-sm text-text-muted">
                {itensPagos.length} de {todosItens.length} pagas
              </span>
              <span
                className={`text-2xl font-bold ${
                  progresso === 100 ? "text-positive" : "text-text"
                }`}
              >
                {progresso}%
              </span>
            </div>

            <div className="h-2 w-full rounded-full bg-surface-2 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand transition-all duration-300"
                style={{ width: `${progresso}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-3 mt-4 text-center">
              <div>
                <p className="text-xs text-text-faint">Total do mês</p>
                <p className="text-sm font-semibold mt-0.5">
                  {formatarMoeda(totalGeral)}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-faint">Já paguei</p>
                <p className="text-sm font-semibold mt-0.5 text-positive">
                  {formatarMoeda(totalPago)}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-faint">Ainda falta</p>
                <p
                  className={`text-sm font-semibold mt-0.5 ${
                    totalFalta === 0 ? "text-positive" : "text-gold"
                  }`}
                >
                  {formatarMoeda(totalFalta)}
                </p>
              </div>
            </div>
          </div>

          {/* LISTAS */}
          {grupos.map(
            (grupo) =>
              grupo.itens.length > 0 && (
                <div key={grupo.titulo}>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <h2 className="text-sm font-medium text-text-muted">
                      {grupo.titulo}
                    </h2>
                    <span className="text-xs text-text-faint">
                      {
                        grupo.itens.filter((i) =>
                          pagamentos.estaPago(i.origem, i.id)
                        ).length
                      }
                      /{grupo.itens.length}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {grupo.itens.map((item) => {
                      const pago = pagamentos.estaPago(item.origem, item.id);
                      // Só marca atraso no mês corrente: navegando pra um mês
                      // futuro nada está atrasado, e num passado tudo estaria.
                      const atrasada =
                        !pago &&
                        ehMesCorrente &&
                        item.diaVencimento !== undefined &&
                        item.diaVencimento < diaDeHoje;
                      return (
                        <li key={`${item.origem}-${item.id}`}>
                          <label
                            className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${
                              pago
                                ? "border-brand/30 bg-brand-soft/40"
                                : atrasada
                                ? "border-negative/40 bg-negative-soft/30"
                                : "border-line bg-surface hover:border-brand/25"
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <input
                                type="checkbox"
                                checked={pago}
                                disabled={monthClose.fechado}
                                onChange={(e) =>
                                  alternarPago(item, e.target.checked)
                                }
                                className="h-5 w-5 shrink-0 accent-brand disabled:opacity-40 disabled:cursor-not-allowed"
                              />
                              <div className="min-w-0">
                                <p
                                  className={`truncate text-sm ${
                                    pago
                                      ? "text-text-muted line-through"
                                      : "text-text"
                                  }`}
                                >
                                  {item.nome}
                                </p>
                                <p className="truncate text-xs text-text-faint">
                                  {item.diaVencimento !== undefined && (
                                    <span className={atrasada ? "font-medium text-negative" : ""}>
                                      {atrasada
                                        ? `venceu dia ${item.diaVencimento}`
                                        : `vence dia ${item.diaVencimento}`}
                                    </span>
                                  )}
                                  {item.diaVencimento !== undefined && item.detalhe && " · "}
                                  {item.detalhe}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`shrink-0 text-sm font-medium ${
                                pago ? "text-text-faint" : atrasada ? "text-negative" : "text-gold"
                              }`}
                            >
                              {formatarMoeda(item.valor)}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )
          )}
        </div>
      )}
    </div>
  );
}
