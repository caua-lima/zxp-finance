import { Concessao, EstadoConcessao } from "./concessao";

/**
 * Turma da mentoria (auditoria 25/10 B13): agrupa ACESSOS — quem entrou,
 * até quando, em que estado. Não dá a ninguém leitura das finanças dos
 * alunos: o painel da turma só junta concessão + dados de login.
 */
export interface Turma {
  nome: string;
  inicioEm: number;
  fimEm: number | null;
  criadoEm: number;
  criadoPor: string;
}

export interface PessoaDaTurma {
  uid: string;
  email: string | null;
  ultimoLogin: string | null;
  estado: EstadoConcessao;
  origem: Concessao["origem"];
  inicioEm: number;
  fimEm: number | null;
  /** Quantos dias faltam pro fim (negativo = vencido); null = sem prazo. */
  diasRestantes: number | null;
}

export function idDeTurma(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base || "turma";
}

export function pessoaDaTurma(
  uid: string,
  c: Concessao,
  login: { email: string | null; ultimoLogin: string | null } | undefined,
  agora: number
): PessoaDaTurma {
  return {
    uid,
    email: login?.email ?? null,
    ultimoLogin: login?.ultimoLogin ?? null,
    estado: c.estado,
    origem: c.origem,
    inicioEm: c.inicioEm,
    fimEm: c.fimEm,
    diasRestantes: c.fimEm === null ? null : Math.ceil((c.fimEm - agora) / 86_400_000),
  };
}

export function resumoDaTurma(pessoas: PessoaDaTurma[]): Record<EstadoConcessao | "vencendo", number> {
  return {
    ativo: pessoas.filter((p) => p.estado === "ativo").length,
    suspenso: pessoas.filter((p) => p.estado === "suspenso").length,
    encerrado: pessoas.filter((p) => p.estado === "encerrado").length,
    vencendo: pessoas.filter((p) => p.estado === "ativo" && p.diasRestantes !== null && p.diasRestantes <= 7).length,
  };
}
