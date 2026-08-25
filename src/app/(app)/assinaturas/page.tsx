"use client";

import { FormEvent, useMemo, useState } from "react";
import { formatarMoeda, Assinatura, UsoPercebidoAssinatura } from "@/lib/types";
import { CARTOES_PREDEFINIDOS } from "@/lib/cartoes";
import { useAssinaturas } from "@/lib/useAssinaturas";
import { MoneyInput } from "@/components/MoneyInput";
import { ErroBanner } from "@/components/ErroBanner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SkeletonLista } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Botao } from "@/components/Botao";
import { BotaoIcone, AcoesItem } from "@/components/BotaoIcone";
import { IconEditar, IconExcluir } from "@/components/icons";

function agruparPorCartao(assinaturas: Assinatura[]) {
  const grupos = new Map<string, Assinatura[]>();
  for (const a of assinaturas) {
    const chave = a.cartao ?? "Sem cartão";
    const lista = grupos.get(chave) ?? [];
    lista.push(a);
    grupos.set(chave, lista);
  }
  const ordem = [...CARTOES_PREDEFINIDOS, "Sem cartão"];
  return [...grupos.entries()].sort(
    (a, b) => ordem.indexOf(a[0]) - ordem.indexOf(b[0])
  );
}

export default function AssinaturasPage() {
  const {
    assinaturas,
    loading,
    erro,
    total,
    totalNaFatura,
    totalGeral,
    adicionar,
    editar,
    remover,
    alternarAtiva,
  } = useAssinaturas();

  const [nome, setNome] = useState("");
  const [valor, setValor] = useState(0);
  const [cartao, setCartao] = useState("");
  const [naFatura, setNaFatura] = useState(false);
  const [diaRenovacao, setDiaRenovacao] = useState("");
  const toast = useToast();

  const grupos = useMemo(() => agruparPorCartao(assinaturas), [assinaturas]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nomeAparado = nome.trim();
    if (!nomeAparado || !valor) return;
    const dia = diaRenovacao ? parseInt(diaRenovacao, 10) : undefined;
    setNome("");
    setValor(0);
    setNaFatura(false);
    setDiaRenovacao("");
    adicionar(nomeAparado, valor, cartao || undefined, naFatura, dia).catch(
      console.error
    );
    toast.sucesso(`"${nomeAparado}" adicionada.`);
  }

  return (
    <div>
      <PageHeader titulo="Assinaturas" descricao="Serviços que renovam sozinhos" />
      <ErroBanner mensagem={erro} />

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-line bg-surface p-4 mb-4 space-y-3"
      >
        <div>
          <label htmlFor="assinaturas-form-nome" className="rotulo">
            Nome
          </label>
          <input
            id="assinaturas-form-nome"
            placeholder="ex: Netflix"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="campo"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="rotulo">Valor</label>
            <MoneyInput value={valor} onChange={setValor} className="campo" />
          </div>
          <div>
            <label className="rotulo">Dia da renovação</label>
            <input
              placeholder="opcional"
              inputMode="numeric"
              value={diaRenovacao}
              onChange={(e) => setDiaRenovacao(e.target.value)}
              className="campo"
            />
          </div>
        </div>
        <div>
          <label className="rotulo">Cartão</label>
          <select
            value={cartao}
            onChange={(e) => setCartao(e.target.value)}
            className="campo"
          >
            <option value="">Sem cartão</option>
            {CARTOES_PREDEFINIDOS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-surface-2/60 px-3 py-2.5 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={naFatura}
            onChange={(e) => setNaFatura(e.target.checked)}
            className="h-5 w-5 shrink-0 accent-brand"
          />
          Já está na fatura do cartão (não contar de novo)
        </label>
        <Botao type="submit" larguraTotal>
          Adicionar assinatura
        </Botao>
      </form>

      <div className="rounded-2xl border border-line bg-surface p-4 mb-5 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-text-muted">
            Total ativo mensal (fora da fatura)
          </span>
          <span className="text-lg font-semibold text-gold">
            {formatarMoeda(total)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-text-muted">
            Já incluso em fatura do cartão
          </span>
          <span className="text-sm font-medium text-text-faint">
            {formatarMoeda(totalNaFatura)}
          </span>
        </div>
        <div className="flex justify-between items-center border-t border-line pt-2">
          <span className="text-sm text-text-muted">
            Total real em assinaturas
          </span>
          <span className="text-sm font-semibold text-text">
            {formatarMoeda(totalGeral)}
          </span>
        </div>
      </div>

      {loading ? (
        <SkeletonLista linhas={4} />
      ) : assinaturas.length === 0 ? (
        <EmptyState
          mensagem="Nenhuma assinatura cadastrada."
          alvoId="assinaturas-form-nome"
        />
      ) : (
        <div className="space-y-5">
          {grupos.map(([grupoCartao, itens]) => (
            <div key={grupoCartao}>
              <div className="flex items-center justify-between mb-2 px-1">
                <h2 className="text-sm font-medium text-text-muted">
                  💳 {grupoCartao}
                </h2>
                <span className="text-xs text-text-faint">
                  {formatarMoeda(
                    itens
                      .filter((a) => a.ativa)
                      .reduce((acc, a) => acc + a.valor, 0)
                  )}
                </span>
              </div>
              <ul className="space-y-2">
                {itens.map((a) => (
                  <ItemAssinatura
                    key={a.id}
                    assinatura={a}
                    onEditar={editar}
                    onRemover={remover}
                    onAlternarAtiva={alternarAtiva}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemAssinatura({
  assinatura,
  onEditar,
  onRemover,
  onAlternarAtiva,
}: {
  assinatura: Assinatura;
  onEditar: (
    id: string,
    dados: {
      nome: string;
      valor: number;
      cartao?: string;
      naFatura?: boolean;
      diaRenovacao?: number;
      usoPercebido?: UsoPercebidoAssinatura;
    }
  ) => void;
  onRemover: (id: string, motivo: string) => void;
  onAlternarAtiva: (id: string, ativa: boolean) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [nome, setNome] = useState(assinatura.nome);
  const [valor, setValor] = useState(assinatura.valor);
  const [cartao, setCartao] = useState(assinatura.cartao ?? "");
  const [naFatura, setNaFatura] = useState(!!assinatura.naFatura);
  const [diaRenovacao, setDiaRenovacao] = useState(
    assinatura.diaRenovacao ? String(assinatura.diaRenovacao) : ""
  );
  const [usoPercebido, setUsoPercebido] = useState<UsoPercebidoAssinatura | "">(
    assinatura.usoPercebido ?? ""
  );
  const toast = useToast();

  function salvar() {
    const nomeAparado = nome.trim();
    if (!nomeAparado || !valor) return;
    onEditar(assinatura.id, {
      nome: nomeAparado,
      valor,
      cartao: cartao || undefined,
      naFatura,
      diaRenovacao: diaRenovacao ? parseInt(diaRenovacao, 10) : undefined,
      usoPercebido: usoPercebido || undefined,
    });
    setEditando(false);
    toast.sucesso("Assinatura atualizada.");
  }

  if (editando) {
    return (
      <li className="rounded-xl border border-brand/40 bg-surface p-4 space-y-3">
        <div>
          <label className="rotulo">Nome</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="campo"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="rotulo">Valor</label>
            <MoneyInput value={valor} onChange={setValor} className="campo" />
          </div>
          <div>
            <label className="rotulo">Dia da renovação</label>
            <input
              placeholder="opcional"
              inputMode="numeric"
              value={diaRenovacao}
              onChange={(e) => setDiaRenovacao(e.target.value)}
              className="campo"
            />
          </div>
        </div>
        <div>
          <label className="rotulo">Cartão</label>
          <select
            value={cartao}
            onChange={(e) => setCartao(e.target.value)}
            className="campo"
          >
            <option value="">Sem cartão</option>
            {CARTOES_PREDEFINIDOS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="rotulo">Quanto você usa</label>
          <select
            value={usoPercebido}
            onChange={(e) => setUsoPercebido(e.target.value as UsoPercebidoAssinatura | "")}
            className="campo"
          >
            <option value="">Não avaliado</option>
            <option value="essencial">Essencial</option>
            <option value="util">Útil</option>
            <option value="revisar">Vale revisar</option>
          </select>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-surface-2/60 px-3 py-2.5 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={naFatura}
            onChange={(e) => setNaFatura(e.target.checked)}
            className="h-5 w-5 shrink-0 accent-brand"
          />
          Já está na fatura do cartão (não contar de novo)
        </label>
        <div className="flex gap-2">
          <Botao onClick={salvar} larguraTotal>
            Salvar
          </Botao>
          <Botao onClick={() => setEditando(false)} variante="secundario" larguraTotal>
            Cancelar
          </Botao>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`flex items-center gap-2 rounded-xl border bg-surface py-2 pl-4 pr-2 ${
        assinatura.ativa ? "border-line" : "border-line-soft opacity-50"
      }`}
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-1.5">
        <input
          type="checkbox"
          checked={assinatura.ativa}
          onChange={(e) => {
            onAlternarAtiva(assinatura.id, e.target.checked);
            toast.sucesso(e.target.checked ? "Assinatura reativada." : "Assinatura arquivada.");
          }}
          className="h-5 w-5 shrink-0 accent-brand"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{assinatura.nome}</span>
          <span className="block truncate text-xs text-text-faint">
            {assinatura.diaRenovacao && `renova dia ${assinatura.diaRenovacao}`}
            {assinatura.diaRenovacao && assinatura.naFatura && " · "}
            {assinatura.naFatura && "já na fatura"}
            {assinatura.usoPercebido === "revisar" && (
              <span className="text-gold"> · vale revisar</span>
            )}
          </span>
        </span>
        <span
          className={`shrink-0 text-sm font-medium ${
            assinatura.naFatura ? "text-text-faint" : "text-gold"
          }`}
        >
          {formatarMoeda(assinatura.valor)}
        </span>
      </label>
      <AcoesItem>
        <BotaoIcone label="Editar assinatura" onClick={() => setEditando(true)}>
          <IconEditar width={17} height={17} />
        </BotaoIcone>
        {!assinatura.ativa && (
          <BotaoIcone
            label="Excluir definitivamente"
            tom="perigo"
            onClick={() => setConfirmando(true)}
          >
            <IconExcluir width={17} height={17} />
          </BotaoIcone>
        )}
      </AcoesItem>

      <ConfirmModal
        aberto={confirmando}
        titulo="Excluir definitivamente"
        descricao={`"${assinatura.nome}" será apagada de vez — isso não pode ser desfeito. Se é só pra parar de contar no mês, desmarque a caixinha em vez de excluir.`}
        textoConfirmar="Excluir"
        perigo
        pedirMotivo
        onConfirmar={(motivo) => {
          onRemover(assinatura.id, motivo ?? "");
          toast.sucesso("Assinatura excluída.");
          setConfirmando(false);
        }}
        onCancelar={() => setConfirmando(false)}
      />
    </li>
  );
}
