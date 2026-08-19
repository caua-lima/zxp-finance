"use client";

import { FormEvent, useMemo, useState } from "react";
import { formatarMoeda, ContaFixa } from "@/lib/types";
import { CATEGORIAS_CONTAS, iconeCategoria } from "@/lib/categorias";
import { useContasFixas } from "@/lib/useContasFixas";
import { MoneyInput } from "@/components/MoneyInput";
import { ErroBanner } from "@/components/ErroBanner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SkeletonLista } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";

function agruparPorCategoria(contas: ContaFixa[]) {
  const grupos = new Map<string, ContaFixa[]>();
  for (const c of contas) {
    const lista = grupos.get(c.categoria) ?? [];
    lista.push(c);
    grupos.set(c.categoria, lista);
  }
  const ordemConhecida = CATEGORIAS_CONTAS as readonly string[];
  return [...grupos.entries()].sort((a, b) => {
    const ia = ordemConhecida.indexOf(a[0]);
    const ib = ordemConhecida.indexOf(b[0]);
    if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export default function ContasPage() {
  const {
    contas,
    loading,
    erro,
    total,
    adicionar,
    editar,
    remover,
    alternarAtiva,
  } = useContasFixas();

  const [nome, setNome] = useState("");
  const [valor, setValor] = useState(0);
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_CONTAS[0]);
  const [categoriaCustom, setCategoriaCustom] = useState("");
  const [diaVencimento, setDiaVencimento] = useState("");
  const toast = useToast();

  const grupos = useMemo(() => agruparPorCategoria(contas), [contas]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nomeAparado = nome.trim();
    if (!nomeAparado || !valor) return;
    const cat =
      categoria === "Outros" && categoriaCustom.trim()
        ? categoriaCustom.trim()
        : categoria;
    const dia = diaVencimento ? parseInt(diaVencimento, 10) : undefined;
    setNome("");
    setValor(0);
    setCategoriaCustom("");
    setDiaVencimento("");
    adicionar(nomeAparado, valor, cat, dia).catch(console.error);
    toast.sucesso(`"${nomeAparado}" adicionada.`);
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">Contas fixas</h1>
      <ErroBanner mensagem={erro} />

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-line bg-surface p-4 mb-6 space-y-2"
      >
        <div className="grid grid-cols-2 sm:grid-cols-[9.5rem_1fr_8rem_6rem_auto] gap-2">
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
          >
            {CATEGORIAS_CONTAS.map((cat) => (
              <option key={cat} value={cat}>
                {iconeCategoria(cat)} {cat}
              </option>
            ))}
          </select>
          <input
            id="contas-form-nome"
            placeholder="Nome (ex: Internet)"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <MoneyInput
            value={valor}
            onChange={setValor}
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <input
            placeholder="Dia venc."
            inputMode="numeric"
            value={diaVencimento}
            onChange={(e) => setDiaVencimento(e.target.value)}
            title="Dia do vencimento (1-31), opcional"
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-[#0E0F0C] hover:bg-brand-dark transition-colors"
          >
            Adicionar
          </button>
        </div>
        {categoria === "Outros" && (
          <input
            placeholder="Nome da categoria (opcional)"
            value={categoriaCustom}
            onChange={(e) => setCategoriaCustom(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
          />
        )}
      </form>

      <div className="rounded-2xl border border-line bg-surface p-4 mb-6 flex justify-between items-center">
        <span className="text-sm text-text-muted">Total ativo mensal</span>
        <span className="text-lg font-semibold text-gold">
          {formatarMoeda(total)}
        </span>
      </div>

      {loading ? (
        <SkeletonLista linhas={4} />
      ) : contas.length === 0 ? (
        <EmptyState
          mensagem="Nenhuma conta fixa cadastrada."
          alvoId="contas-form-nome"
        />
      ) : (
        <div className="space-y-5">
          {grupos.map(([nomeCategoria, itens]) => (
            <GrupoCategoria
              key={nomeCategoria}
              categoria={nomeCategoria}
              itens={itens}
              onEditar={editar}
              onRemover={remover}
              onAlternarAtiva={alternarAtiva}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GrupoCategoria({
  categoria,
  itens,
  onEditar,
  onRemover,
  onAlternarAtiva,
}: {
  categoria: string;
  itens: ContaFixa[];
  onEditar: (
    id: string,
    dados: { nome: string; valor: number; categoria: string; diaVencimento?: number }
  ) => void;
  onRemover: (id: string, motivo: string) => void;
  onAlternarAtiva: (id: string, ativa: boolean) => void;
}) {
  const subtotal = itens
    .filter((c) => c.ativa)
    .reduce((acc, c) => acc + c.valor, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="text-sm font-medium text-text-muted flex items-center gap-1.5">
          <span>{iconeCategoria(categoria)}</span>
          {categoria}
        </h2>
        <span className="text-xs text-text-faint">
          {formatarMoeda(subtotal)}
        </span>
      </div>
      <ul className="space-y-2">
        {itens.map((c) => (
          <ItemConta
            key={c.id}
            conta={c}
            onEditar={onEditar}
            onRemover={onRemover}
            onAlternarAtiva={onAlternarAtiva}
          />
        ))}
      </ul>
    </div>
  );
}

function ItemConta({
  conta,
  onEditar,
  onRemover,
  onAlternarAtiva,
}: {
  conta: ContaFixa;
  onEditar: (
    id: string,
    dados: { nome: string; valor: number; categoria: string; diaVencimento?: number }
  ) => void;
  onRemover: (id: string, motivo: string) => void;
  onAlternarAtiva: (id: string, ativa: boolean) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [nome, setNome] = useState(conta.nome);
  const [valor, setValor] = useState(conta.valor);
  const [categoria, setCategoria] = useState(conta.categoria);
  const [diaVencimento, setDiaVencimento] = useState(
    conta.diaVencimento ? String(conta.diaVencimento) : ""
  );
  const toast = useToast();

  function salvar() {
    const nomeAparado = nome.trim();
    if (!nomeAparado || !valor) return;
    onEditar(conta.id, {
      nome: nomeAparado,
      valor,
      categoria: categoria.trim() || "Outros",
      diaVencimento: diaVencimento ? parseInt(diaVencimento, 10) : undefined,
    });
    setEditando(false);
    toast.sucesso("Conta atualizada.");
  }

  if (editando) {
    return (
      <li className="flex flex-col sm:flex-row gap-2 rounded-xl border border-brand/40 bg-surface px-4 py-3">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
        />
        <select
          value={
            (CATEGORIAS_CONTAS as readonly string[]).includes(categoria)
              ? categoria
              : "Outros"
          }
          onChange={(e) => setCategoria(e.target.value)}
          className="w-full sm:w-40 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
        >
          {CATEGORIAS_CONTAS.map((cat) => (
            <option key={cat} value={cat}>
              {iconeCategoria(cat)} {cat}
            </option>
          ))}
        </select>
        <MoneyInput
          value={valor}
          onChange={setValor}
          className="w-full sm:w-32 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
        />
        <input
          placeholder="Dia venc."
          inputMode="numeric"
          value={diaVencimento}
          onChange={(e) => setDiaVencimento(e.target.value)}
          className="w-full sm:w-24 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
        />
        <div className="flex gap-2 shrink-0">
          <button
            onClick={salvar}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-[#0E0F0C]"
          >
            Salvar
          </button>
          <button
            onClick={() => setEditando(false)}
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-text-muted"
          >
            Cancelar
          </button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`flex items-center justify-between gap-2 rounded-xl border bg-surface px-4 py-3 ${
        conta.ativa ? "border-line" : "border-line-soft opacity-50"
      }`}
    >
      <label className="flex items-center gap-3 min-w-0 cursor-pointer">
        <input
          type="checkbox"
          checked={conta.ativa}
          onChange={(e) => {
            onAlternarAtiva(conta.id, e.target.checked);
            toast.sucesso(e.target.checked ? "Conta reativada." : "Conta arquivada.");
          }}
          className="h-4 w-4 shrink-0 accent-brand"
        />
        <span className="text-sm truncate">
          {conta.nome}
          {conta.diaVencimento && (
            <span className="text-text-faint"> · vence dia {conta.diaVencimento}</span>
          )}
        </span>
      </label>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-sm font-medium text-gold">
          {formatarMoeda(conta.valor)}
        </span>
        <button
          onClick={() => setEditando(true)}
          className="text-text-faint hover:text-brand text-sm"
          aria-label="Editar"
        >
          ✎
        </button>
        {!conta.ativa && (
          <button
            onClick={() => setConfirmando(true)}
            className="text-[10px] text-text-faint hover:text-negative whitespace-nowrap"
          >
            Excluir def.
          </button>
        )}
      </div>

      <ConfirmModal
        aberto={confirmando}
        titulo="Excluir definitivamente"
        descricao={`"${conta.nome}" será apagada de vez — isso não pode ser desfeito. Se é só pra parar de contar no mês, desmarque a caixinha em vez de excluir.`}
        textoConfirmar="Excluir"
        perigo
        pedirMotivo
        onConfirmar={(motivo) => {
          onRemover(conta.id, motivo ?? "");
          toast.sucesso("Conta excluída.");
          setConfirmando(false);
        }}
        onCancelar={() => setConfirmando(false)}
      />
    </li>
  );
}
