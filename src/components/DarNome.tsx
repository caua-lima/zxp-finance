"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Gasto } from "@/lib/types";
import { CATEGORIAS_GASTO } from "@/lib/categoriasGasto";
import { sugerirCategoria } from "@/lib/categorizacao";
import { ehIntermediario } from "@/lib/pluggy/apelidos";
import { areaDaVida } from "@/lib/abundancia";
import { Dialogo } from "@/components/Dialogo";
import { Botao } from "@/components/Botao";
import { useToast } from "@/components/Toast";

/**
 * "Dar nome" a um lançamento que veio do banco: você escreve como chama
 * (ex.: BEER IGOR), escolhe a categoria e se vale só pra este ou pra este e
 * os próximos do mesmo destinatário. Pagamento por maquininha (Cardpay,
 * PagSeguro...) começa em "só este": vários lugares caem no mesmo CNPJ.
 */
export function DarNome({
  gasto,
  mesmoDestinatario,
  historico,
  aberto,
  onFechar,
}: {
  gasto: Gasto;
  /** Quantos lançamentos (contando este) já foram pro mesmo destinatário. */
  mesmoDestinatario: number;
  historico: Gasto[];
  aberto: boolean;
  onFechar: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const nomeBanco = gasto.nomeBanco ?? gasto.descricao;
  const maquininha = ehIntermediario(nomeBanco);
  const [nome, setNome] = useState(gasto.descricao === nomeBanco ? "" : gasto.descricao);
  const [categoria, setCategoria] = useState(gasto.categoria);
  const [categoriaManual, setCategoriaManual] = useState(false);
  const [escopo, setEscopo] = useState<"todos" | "este">(maquininha ? "este" : "todos");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const descricao = nome.trim();
    if (!user || !descricao) return;
    setSalvando(true);
    try {
      const token = await user.getIdToken();
      const r = await fetch("/api/banco/apelido", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: gasto.id, descricao, categoria, escopo }),
      });
      const corpo = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        erro?: string;
        atualizados?: number;
        ignoradosMesFechado?: number;
      };
      if (!r.ok || !corpo.ok) {
        toast.erro(corpo.erro ?? "Não consegui salvar agora.");
        return;
      }
      const n = corpo.atualizados ?? 1;
      toast.sucesso(
        escopo === "todos"
          ? `Pronto: "${descricao}" em ${n} lançamento${n === 1 ? "" : "s"}, e os próximos já chegam assim.`
          : `Pronto: este lançamento agora é "${descricao}".`
      );
      onFechar();
    } finally {
      setSalvando(false);
    }
  }

  const outros = Math.max(0, mesmoDestinatario - 1);

  return (
    <Dialogo
      aberto={aberto}
      titulo="Dar nome"
      descricao={`No banco: ${nomeBanco}`}
      onFechar={onFechar}
      bloqueado={salvando}
    >
      <div className="space-y-3">
        <div>
          <label htmlFor={`dar-nome-${gasto.id}`} className="rotulo">
            Como você chama isso?
          </label>
          <input
            id={`dar-nome-${gasto.id}`}
            autoFocus
            value={nome}
            maxLength={80}
            placeholder="Ex.: BEER IGOR, Barbearia do Luis, Almoço da firma"
            onChange={(e) => {
              setNome(e.target.value);
              if (!categoriaManual && e.target.value.trim().length >= 3) {
                const s = sugerirCategoria(e.target.value, historico);
                if (s.categoria !== "Outros") setCategoria(s.categoria);
              }
            }}
            className="campo"
          />
        </div>

        <div>
          <label htmlFor={`dar-nome-cat-${gasto.id}`} className="rotulo">
            Categoria
            {!categoriaManual && <span className="ml-1 font-normal text-brand">· sugerida pelo nome</span>}
          </label>
          <select
            id={`dar-nome-cat-${gasto.id}`}
            value={categoria}
            onChange={(e) => {
              setCategoria(e.target.value);
              setCategoriaManual(true);
            }}
            className="campo"
          >
            {CATEGORIAS_GASTO.map((c) => (
              <option key={c} value={c}>
                {areaDaVida(c).icone} {areaDaVida(c).nome}
              </option>
            ))}
          </select>
        </div>

        {gasto.contraparte && (
          <fieldset className="space-y-1.5">
            <legend className="rotulo">Vale pra quê?</legend>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line px-3 py-2.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft/40">
              <input
                type="radio"
                name={`escopo-${gasto.id}`}
                checked={escopo === "todos"}
                onChange={() => setEscopo("todos")}
                className="mt-0.5 h-4 w-4 accent-brand"
              />
              <span>
                Este e os próximos pra esse destinatário
                <span className="block text-xs text-text-muted">
                  {outros === 1 ? "Renomeia também o anterior. " : outros > 1 ? `Renomeia também os ${outros} anteriores. ` : ""}
                  Todo Pix novo pra esse mesmo CPF/CNPJ já chega com esse nome.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line px-3 py-2.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft/40">
              <input
                type="radio"
                name={`escopo-${gasto.id}`}
                checked={escopo === "este"}
                onChange={() => setEscopo("este")}
                className="mt-0.5 h-4 w-4 accent-brand"
              />
              <span>
                Só este lançamento
                {maquininha && (
                  <span className="block text-xs text-text-muted">
                    Recomendado: é pagamento por maquininha, e lugares diferentes caem no mesmo CNPJ.
                  </span>
                )}
              </span>
            </label>
          </fieldset>
        )}

        <div className="flex gap-2 pt-1">
          <Botao variante="secundario" larguraTotal onClick={onFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao larguraTotal onClick={salvar} disabled={salvando || !nome.trim()}>
            {salvando ? "Salvando..." : "Salvar nome"}
          </Botao>
        </div>
      </div>
    </Dialogo>
  );
}
