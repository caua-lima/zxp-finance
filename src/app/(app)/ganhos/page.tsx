"use client";

import { FormEvent, useState } from "react";
import { mesPadrao, formatarMoeda, TAXA_IMPOSTO, Ganho } from "@/lib/types";
import { CATEGORIAS_RECEITA, iconeCategoriaReceita } from "@/lib/categoriasFinanceiras";
import { useGanhos } from "@/lib/useGanhos";
import { usePagamentos } from "@/lib/usePagamentos";
import { MonthSelector } from "@/components/MonthSelector";
import { MoneyInput } from "@/components/MoneyInput";
import { ErroBanner } from "@/components/ErroBanner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SkeletonLista } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";

type Tipo = "recorrente" | "pontual";

export default function GanhosPage() {
  const [mes, setMes] = useState(mesPadrao());
  const {
    recorrentes,
    pontuais,
    orfaos,
    loading,
    erro,
    total,
    imposto,
    totalLiquido,
    adicionarRecorrente,
    adicionarPontual,
    editar,
    remover,
    removerOrfao,
    alternarAtivo,
    alternarArquivadoPontual,
    marcarRecebidoPontual,
  } = useGanhos(mes);
  const pagamentos = usePagamentos(mes);

  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState(0);
  const [tipo, setTipo] = useState<Tipo>("pontual");
  const [categoriaReceita, setCategoriaReceita] = useState("");
  const toast = useToast();

  function estaRecebido(g: Ganho): boolean {
    return g.tipo === "recorrente" ? pagamentos.estaPago("ganho", g.id) : !!g.recebido;
  }

  function alternarRecebido(g: Ganho, recebido: boolean) {
    if (g.tipo === "recorrente") {
      pagamentos.marcar("ganho", g.id, recebido, { nome: g.descricao, valor: g.valor });
    } else {
      marcarRecebidoPontual(g.id, recebido);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const desc = descricao.trim();
    if (!desc || !valor) return;
    setDescricao("");
    setValor(0);
    if (tipo === "recorrente") {
      adicionarRecorrente(desc, valor, categoriaReceita || undefined).catch(console.error);
    } else {
      adicionarPontual(desc, valor, categoriaReceita || undefined).catch(console.error);
    }
    toast.sucesso(`"${desc}" adicionado.`);
  }

  return (
    <div>
      <MonthSelector mes={mes} onChange={setMes} />
      <ErroBanner mensagem={erro} />

      <form onSubmit={handleSubmit} className="space-y-2 mb-6">
        <div className="flex gap-2 flex-col sm:flex-row">
          <input
            id="ganhos-form-descricao"
            placeholder="Descrição (ex: Salário, Comissão)"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <MoneyInput
            value={valor}
            onChange={setValor}
            className="w-full sm:w-36 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <select
            value={categoriaReceita}
            onChange={(e) => setCategoriaReceita(e.target.value)}
            className="w-full sm:w-40 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          >
            <option value="">Categoria</option>
            {CATEGORIAS_RECEITA.map((c) => (
              <option key={c} value={c}>
                {iconeCategoriaReceita(c)} {c}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-[#0E0F0C] hover:bg-brand-dark transition-colors"
          >
            Adicionar
          </button>
        </div>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setTipo("pontual")}
            className={`rounded-full px-3 py-1 border transition-colors ${
              tipo === "pontual"
                ? "border-brand bg-brand-soft text-brand"
                : "border-line text-text-faint"
            }`}
          >
            Só este mês
          </button>
          <button
            type="button"
            onClick={() => setTipo("recorrente")}
            className={`rounded-full px-3 py-1 border transition-colors ${
              tipo === "recorrente"
                ? "border-brand bg-brand-soft text-brand"
                : "border-line text-text-faint"
            }`}
          >
            Recorrente (todo mês)
          </button>
        </div>
      </form>

      <div className="rounded-2xl border border-line bg-surface p-4 mb-6 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-text-muted">Total bruto</span>
          <span className="text-base font-medium text-text">
            {formatarMoeda(total)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-text-muted">
            Imposto ({(TAXA_IMPOSTO * 100).toFixed(0)}%)
          </span>
          <span className="text-base font-medium text-negative">
            − {formatarMoeda(imposto)}
          </span>
        </div>
        <div className="flex justify-between items-center border-t border-line pt-2">
          <span className="text-sm text-text-muted">Total líquido</span>
          <span className="text-lg font-semibold text-positive">
            {formatarMoeda(totalLiquido)}
          </span>
        </div>
      </div>

      {loading ? (
        <SkeletonLista linhas={4} />
      ) : (
        <div className="space-y-6">
          <Secao
            titulo="Recorrentes (todo mês)"
            vazio="Nenhum ganho recorrente cadastrado."
            itens={recorrentes}
            comAtivo
            onEditar={editar}
            onRemover={remover}
            onAlternarAtivo={alternarAtivo}
            estaRecebido={estaRecebido}
            onAlternarRecebido={alternarRecebido}
          />
          <Secao
            titulo="Só este mês"
            vazio="Nenhum ganho avulso neste mês."
            itens={pontuais}
            comAtivo
            onEditar={editar}
            onRemover={remover}
            onAlternarAtivo={alternarArquivadoPontual}
            estaRecebido={estaRecebido}
            onAlternarRecebido={alternarRecebido}
          />
          {orfaos.length > 0 && (
            <SecaoOrfaos itens={orfaos} onRemover={removerOrfao} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Documentos de ganho sem `tipo` reconhecido (não é nem "recorrente" nem
 * "pontual") — normalmente sobra de edição manual direto no Firestore.
 * Ficam invisíveis em Recorrentes/Só este mês pra sempre, então precisam
 * de um jeito de ver/limpar que não seja abrir o console do Firebase.
 */
function SecaoOrfaos({
  itens,
  onRemover,
}: {
  itens: Ganho[];
  onRemover: (id: string) => void;
}) {
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const toast = useToast();
  const alvo = itens.find((g) => g.id === confirmandoId) ?? null;

  return (
    <div>
      <h2 className="text-sm font-medium text-negative mb-2">
        ⚠ Documentos com dado incompleto ({itens.length})
      </h2>
      <p className="text-xs text-text-faint mb-2">
        Sem um &quot;tipo&quot; reconhecido — por isso não aparecem em
        nenhuma lista acima. Provavelmente sobra de edição manual antiga.
        Revise e exclua se não forem reais.
      </p>
      <ul className="space-y-2">
        {itens.map((g) => (
          <li
            key={g.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-negative/30 bg-negative-soft/30 px-4 py-3"
          >
            <div className="min-w-0 text-xs">
              <p className="text-sm text-text truncate">
                {g.descricao || "(sem descrição)"}
              </p>
              <p className="text-text-faint">
                valor: {formatarMoeda(g.valor ?? 0)} · id: {g.id}
              </p>
            </div>
            <button
              onClick={() => setConfirmandoId(g.id)}
              className="shrink-0 text-[10px] text-text-faint hover:text-negative whitespace-nowrap"
            >
              Excluir
            </button>
          </li>
        ))}
      </ul>

      <ConfirmModal
        aberto={!!alvo}
        titulo="Excluir documento incompleto"
        descricao={`"${alvo?.descricao || alvo?.id}" será apagado de vez — isso não pode ser desfeito.`}
        textoConfirmar="Excluir"
        perigo
        onConfirmar={() => {
          if (alvo) {
            onRemover(alvo.id);
            toast.sucesso("Documento excluído.");
          }
          setConfirmandoId(null);
        }}
        onCancelar={() => setConfirmandoId(null)}
      />
    </div>
  );
}

function Secao({
  titulo,
  vazio,
  itens,
  comAtivo,
  onEditar,
  onRemover,
  onAlternarAtivo,
  estaRecebido,
  onAlternarRecebido,
}: {
  titulo: string;
  vazio: string;
  itens: Ganho[];
  comAtivo?: boolean;
  onEditar: (
    id: string,
    dados: { descricao: string; valor: number; categoriaReceita?: string }
  ) => void;
  onRemover: (id: string, motivo: string) => void;
  onAlternarAtivo?: (id: string, ativo: boolean) => void;
  estaRecebido: (g: Ganho) => boolean;
  onAlternarRecebido: (g: Ganho, recebido: boolean) => void;
}) {
  return (
    <div>
      <h2 className="text-sm font-medium text-text-muted mb-2">{titulo}</h2>
      {itens.length === 0 ? (
        <EmptyState mensagem={vazio} alvoId="ganhos-form-descricao" />
      ) : (
        <ul className="space-y-2">
          {itens.map((g) => (
            <ItemGanho
              key={g.id}
              ganho={g}
              comAtivo={comAtivo}
              onEditar={onEditar}
              onRemover={onRemover}
              onAlternarAtivo={onAlternarAtivo}
              recebido={estaRecebido(g)}
              onAlternarRecebido={(recebido) => onAlternarRecebido(g, recebido)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemGanho({
  ganho,
  comAtivo,
  onEditar,
  onRemover,
  onAlternarAtivo,
  recebido,
  onAlternarRecebido,
}: {
  ganho: Ganho;
  comAtivo?: boolean;
  onEditar: (
    id: string,
    dados: { descricao: string; valor: number; categoriaReceita?: string }
  ) => void;
  onRemover: (id: string, motivo: string) => void;
  onAlternarAtivo?: (id: string, ativo: boolean) => void;
  recebido: boolean;
  onAlternarRecebido: (recebido: boolean) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [descricao, setDescricao] = useState(ganho.descricao);
  const [valor, setValor] = useState(ganho.valor);
  const [categoriaReceita, setCategoriaReceita] = useState(ganho.categoriaReceita ?? "");
  const toast = useToast();

  const estaAtivo =
    ganho.tipo === "recorrente" ? ganho.ativo !== false : !ganho.arquivado;
  const podeExcluir = comAtivo ? !estaAtivo : true;

  function salvar() {
    const desc = descricao.trim();
    if (!desc || !valor) return;
    onEditar(ganho.id, { descricao: desc, valor, categoriaReceita: categoriaReceita || undefined });
    setEditando(false);
    toast.sucesso("Ganho atualizado.");
  }

  if (editando) {
    return (
      <li className="flex flex-col sm:flex-row gap-2 rounded-xl border border-brand/40 bg-surface px-4 py-3">
        <input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          className="flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
        />
        <MoneyInput
          value={valor}
          onChange={setValor}
          className="w-full sm:w-32 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
        />
        <select
          value={categoriaReceita}
          onChange={(e) => setCategoriaReceita(e.target.value)}
          className="w-full sm:w-36 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
        >
          <option value="">Categoria</option>
          {CATEGORIAS_RECEITA.map((c) => (
            <option key={c} value={c}>
              {iconeCategoriaReceita(c)} {c}
            </option>
          ))}
        </select>
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
      className={`flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 ${
        comAtivo && !estaAtivo ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        {comAtivo && onAlternarAtivo && (
          <input
            type="checkbox"
            checked={estaAtivo}
            onChange={(e) => {
              onAlternarAtivo(ganho.id, e.target.checked);
              toast.sucesso(e.target.checked ? "Ganho reativado." : "Ganho arquivado.");
            }}
            className="h-4 w-4 accent-brand"
          />
        )}
        <span className="text-sm">
          {ganho.categoriaReceita && `${iconeCategoriaReceita(ganho.categoriaReceita)} `}
          {ganho.descricao}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onAlternarRecebido(!recebido)}
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium border transition-colors whitespace-nowrap ${
            recebido
              ? "border-positive/30 bg-positive-soft text-positive"
              : "border-info/30 bg-info/10 text-info"
          }`}
        >
          {recebido ? "✓ Recebido" : "◌ Previsto"}
        </button>
        <span className="text-sm font-medium text-positive">
          {formatarMoeda(ganho.valor)}
        </span>
        <button
          onClick={() => setEditando(true)}
          className="text-text-faint hover:text-brand text-sm"
          aria-label="Editar"
        >
          ✎
        </button>
        {podeExcluir && (
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
        descricao={`"${ganho.descricao}" será apagado de vez — isso não pode ser desfeito. Se é só pra parar de contar, desmarque a caixinha em vez de excluir.`}
        textoConfirmar="Excluir"
        perigo
        pedirMotivo
        onConfirmar={(motivo) => {
          onRemover(ganho.id, motivo ?? "");
          toast.sucesso("Ganho excluído.");
          setConfirmando(false);
        }}
        onCancelar={() => setConfirmando(false)}
      />
    </li>
  );
}
