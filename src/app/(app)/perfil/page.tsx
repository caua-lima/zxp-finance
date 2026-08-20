"use client";

import { FormEvent, useEffect, useState } from "react";
import { usePerfil } from "@/lib/usePerfil";
import { MoneyInput } from "@/components/MoneyInput";
import { ErroBanner } from "@/components/ErroBanner";
import { useToast } from "@/components/Toast";

export default function PerfilPage() {
  const { perfil, loading, erro, salvar } = usePerfil();
  const toast = useToast();

  const [idade, setIdade] = useState("");
  const [pessoasNaCasa, setPessoasNaCasa] = useState("");
  const [moraSozinho, setMoraSozinho] = useState(false);
  const [contasProprias, setContasProprias] = useState("");
  const [rendaAproximada, setRendaAproximada] = useState(0);

  useEffect(() => {
    if (!perfil) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preenche o form quando o doc carrega do Firestore
    setIdade(perfil.idade ? String(perfil.idade) : "");
    setPessoasNaCasa(perfil.pessoasNaCasa ? String(perfil.pessoasNaCasa) : "");
    setMoraSozinho(!!perfil.moraSozinho);
    setContasProprias(perfil.contasProprias ?? "");
    setRendaAproximada(perfil.rendaAproximada ?? 0);
  }, [perfil]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    salvar({
      idade: idade ? parseInt(idade, 10) : undefined,
      pessoasNaCasa: pessoasNaCasa ? parseInt(pessoasNaCasa, 10) : undefined,
      moraSozinho,
      contasProprias: contasProprias.trim() || undefined,
      rendaAproximada: rendaAproximada || undefined,
    });
    toast.sucesso("Perfil salvo.");
  }

  if (loading) {
    return <p className="text-sm text-text-faint">Carregando...</p>;
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-1">Perfil</h1>
      <p className="text-xs text-text-faint mb-4">
        Sua situação real — pra calibrar comparações e sugestões (ver DRE).
        Nada aqui entra em nenhum cálculo de saldo ou gastável por dia.
      </p>
      <ErroBanner mensagem={erro} />

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-line bg-surface p-4 space-y-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">Idade</label>
            <input
              inputMode="numeric"
              placeholder="ex: 19"
              value={idade}
              onChange={(e) => setIdade(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">
              Pessoas na casa (contando você)
            </label>
            <input
              inputMode="numeric"
              placeholder="ex: 4"
              value={pessoasNaCasa}
              onChange={(e) => setPessoasNaCasa(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={moraSozinho}
            onChange={(e) => setMoraSozinho(e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          Moro sozinho
        </label>

        <div>
          <label className="block text-xs text-text-muted mb-1">
            Renda aproximada (mensal, líquida)
          </label>
          <MoneyInput
            value={rendaAproximada}
            onChange={setRendaAproximada}
            className="w-full sm:w-48 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1">
            Quais contas são só suas
          </label>
          <textarea
            placeholder="ex: só pago a conta de água, que é R$100. O resto da casa é dividido com meus pais."
            value={contasProprias}
            onChange={(e) => setContasProprias(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand resize-none"
          />
        </div>

        <button
          type="submit"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-[#0E0F0C] hover:bg-brand-dark transition-colors"
        >
          Salvar perfil
        </button>
      </form>
    </div>
  );
}
