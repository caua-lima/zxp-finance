"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  NivelEscolaridade,
  TipoEscola,
  SituacaoTrabalho,
  idadeEm,
  diasAteAniversario,
} from "@/lib/types";
import { hojeISO } from "@/lib/finance/calculations";
import { usePerfil } from "@/lib/usePerfil";
import { MoneyInput } from "@/components/MoneyInput";
import { ErroBanner } from "@/components/ErroBanner";
import { useToast } from "@/components/Toast";

const ESCOLARIDADES: { valor: NivelEscolaridade; label: string }[] = [
  { valor: "sem_instrucao", label: "Sem instrução formal" },
  { valor: "fundamental", label: "Ensino fundamental completo" },
  { valor: "medio_incompleto", label: "Ensino médio incompleto (cursando)" },
  { valor: "medio", label: "Ensino médio completo" },
  { valor: "superior_incompleto", label: "Ensino superior incompleto (cursando)" },
  { valor: "superior", label: "Ensino superior completo" },
];

const TIPOS_ESCOLA: { valor: TipoEscola; label: string }[] = [
  { valor: "publica", label: "Escola pública" },
  { valor: "particular", label: "Escola particular" },
  { valor: "ambas", label: "Passei pelas duas" },
];

const SITUACOES: { valor: SituacaoTrabalho; label: string }[] = [
  { valor: "clt", label: "CLT (carteira assinada)" },
  { valor: "pj", label: "PJ" },
  { valor: "mei", label: "MEI" },
  { valor: "autonomo", label: "Autônomo" },
  { valor: "estagio", label: "Estágio / jovem aprendiz" },
  { valor: "informal", label: "Informal" },
  { valor: "outro", label: "Outro" },
];

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS",
  "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC",
  "SE", "SP", "TO",
];

export default function PerfilPage() {
  const { perfil, loading, erro, salvar } = usePerfil();
  const toast = useToast();
  const hoje = hojeISO();

  const [dataNascimento, setDataNascimento] = useState("");
  const [escolaridade, setEscolaridade] = useState<NivelEscolaridade | "">("");
  const [tipoEscola, setTipoEscola] = useState<TipoEscola | "">("");
  const [situacaoTrabalho, setSituacaoTrabalho] = useState<SituacaoTrabalho | "">("");
  const [uf, setUf] = useState("");
  const [pessoasNaCasa, setPessoasNaCasa] = useState("");
  const [moraSozinho, setMoraSozinho] = useState(false);
  const [contasProprias, setContasProprias] = useState("");
  const [biografia, setBiografia] = useState("");
  const [rendaAproximada, setRendaAproximada] = useState(0);

  useEffect(() => {
    if (!perfil) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preenche o form quando o doc carrega do Firestore
    setDataNascimento(perfil.dataNascimento ?? "");
    setEscolaridade(perfil.escolaridade ?? "");
    setTipoEscola(perfil.tipoEscola ?? "");
    setSituacaoTrabalho(perfil.situacaoTrabalho ?? "");
    setUf(perfil.uf ?? "");
    setPessoasNaCasa(perfil.pessoasNaCasa ? String(perfil.pessoasNaCasa) : "");
    setMoraSozinho(!!perfil.moraSozinho);
    setContasProprias(perfil.contasProprias ?? "");
    setBiografia(perfil.biografia ?? "");
    setRendaAproximada(perfil.rendaAproximada ?? 0);
  }, [perfil]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    salvar({
      dataNascimento: dataNascimento || undefined,
      escolaridade: escolaridade || undefined,
      tipoEscola: tipoEscola || undefined,
      situacaoTrabalho: situacaoTrabalho || undefined,
      uf: uf || undefined,
      pessoasNaCasa: pessoasNaCasa ? parseInt(pessoasNaCasa, 10) : undefined,
      moraSozinho,
      contasProprias: contasProprias.trim() || undefined,
      biografia: biografia.trim() || undefined,
      rendaAproximada: rendaAproximada || undefined,
    });
    toast.sucesso("Perfil salvo.");
  }

  if (loading) {
    return <p className="text-sm text-text-faint">Carregando...</p>;
  }

  const idade = dataNascimento ? idadeEm(dataNascimento, hoje) : null;
  const diasAniversario = dataNascimento ? diasAteAniversario(dataNascimento, hoje) : null;

  return (
    <div>
      <h1 className="text-lg font-semibold mb-1">Perfil</h1>
      <p className="text-xs text-text-faint mb-4">
        Sua situação real — usada pra comparar seus números com a média de
        quem está no mesmo cenário (ver DRE). Nada aqui entra em nenhum
        cálculo de saldo ou gastável por dia.
      </p>
      <ErroBanner mensagem={erro} />

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* quem você é */}
        <fieldset className="rounded-2xl border border-line bg-surface p-4 space-y-3">
          <legend className="px-2 text-xs font-medium text-text-muted">Quem você é</legend>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">
                Data de nascimento
              </label>
              <input
                type="date"
                value={dataNascimento}
                onChange={(e) => setDataNascimento(e.target.value)}
                max={hoje}
                className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
              />
              {idade !== null && (
                <p className="mt-1 text-[11px] text-text-faint">
                  {idade} anos
                  {diasAniversario === 0
                    ? " · é hoje! 🎂"
                    : diasAniversario !== null && diasAniversario <= 30
                    ? ` · aniversário em ${diasAniversario} dia(s)`
                    : ""}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Estado</label>
              <select
                value={uf}
                onChange={(e) => setUf(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
              >
                <option value="">Não informado</option>
                {UFS.map((sigla) => (
                  <option key={sigla} value={sigla}>
                    {sigla}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        {/* estudo */}
        <fieldset className="rounded-2xl border border-line bg-surface p-4 space-y-3">
          <legend className="px-2 text-xs font-medium text-text-muted">Estudo</legend>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">Escolaridade</label>
              <select
                value={escolaridade}
                onChange={(e) => setEscolaridade(e.target.value as NivelEscolaridade | "")}
                className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
              >
                <option value="">Não informado</option>
                {ESCOLARIDADES.map((n) => (
                  <option key={n.valor} value={n.valor}>
                    {n.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-text-faint">
                É o que define com qual média sua renda é comparada no DRE
              </p>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Estudou em</label>
              <select
                value={tipoEscola}
                onChange={(e) => setTipoEscola(e.target.value as TipoEscola | "")}
                className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
              >
                <option value="">Não informado</option>
                {TIPOS_ESCOLA.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        {/* trabalho e casa */}
        <fieldset className="rounded-2xl border border-line bg-surface p-4 space-y-3">
          <legend className="px-2 text-xs font-medium text-text-muted">Trabalho e casa</legend>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">
                Situação de trabalho
              </label>
              <select
                value={situacaoTrabalho}
                onChange={(e) => setSituacaoTrabalho(e.target.value as SituacaoTrabalho | "")}
                className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
              >
                <option value="">Não informado</option>
                {SITUACOES.map((s) => (
                  <option key={s.valor} value={s.valor}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">
                Renda aproximada (mensal)
              </label>
              <MoneyInput
                value={rendaAproximada}
                onChange={setRendaAproximada}
                className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <p className="mt-1 text-[11px] text-text-faint">
                Opcional — o DRE usa seus ganhos reais lançados, não este campo
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <label className="flex items-end gap-2 text-sm text-text-muted cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={moraSozinho}
                onChange={(e) => setMoraSozinho(e.target.checked)}
                className="h-4 w-4 accent-brand"
              />
              Moro sozinho
            </label>
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1">
              Quais contas são só suas
            </label>
            <textarea
              placeholder="ex: só pago a conta de água, que é R$100. O resto da casa é dividido com meus pais."
              value={contasProprias}
              onChange={(e) => setContasProprias(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand resize-none"
            />
          </div>
        </fieldset>

        {/* biografia */}
        <fieldset className="rounded-2xl border border-line bg-surface p-4 space-y-2">
          <legend className="px-2 text-xs font-medium text-text-muted">Seu cenário</legend>
          <p className="text-[11px] text-text-faint">
            O contexto que os números sozinhos não contam — de onde você veio,
            o que está construindo, o que muda nos próximos meses.
          </p>
          <textarea
            placeholder="ex: tenho 19 anos, moro com meus pais e estudei em escola pública. Trabalho com vendas há 1 ano e minha renda é salário + comissão, então varia bastante mês a mês. Quero juntar pra sair de casa em 2 anos."
            value={biografia}
            onChange={(e) => setBiografia(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand resize-none"
          />
        </fieldset>

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
