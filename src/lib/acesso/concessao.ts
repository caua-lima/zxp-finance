/**
 * Concessão de acesso da mentoria (auditoria 25/10 S03/B09).
 *
 * Quem pode usar o app é decidido por um documento do SERVIDOR,
 * `acessos/{uid}` — a pessoa lê o próprio, ninguém além do servidor
 * escreve. Turma é vínculo de acesso, não permissão pra ninguém ler as
 * finanças de ninguém: o dono dos dados continua sendo o UID.
 *
 * Implantação sem trancar ninguém (expand-contract): enquanto
 * `plataforma/config.exigirConcessao` não for true, todo mundo logado
 * passa. Antes de ligar, quem já usa o app recebe concessão "legado"
 * (scripts/concessoes-legado.ts).
 */

export type EstadoConcessao = "ativo" | "suspenso" | "encerrado";
export type OrigemConcessao = "legado" | "convite" | "admin";

export interface Concessao {
  estado: EstadoConcessao;
  origem: OrigemConcessao;
  /** Turma (vínculo de acesso), ou null. */
  turmaId: string | null;
  /** Começa a valer (ms). */
  inicioEm: number;
  /** Deixa de valer (ms); null = sem prazo. */
  fimEm: number | null;
  /** Por que foi suspensa/encerrada (curto, sem dado pessoal). */
  motivo?: string;
  atualizadoEm: number;
  /** Sobe a cada mudança — o que o servidor grava confere a versão lida. */
  versao: number;
}

export interface ConfigPlataforma {
  /** false = fase de transição: todo mundo logado passa. */
  exigirConcessao: boolean;
}

export type MotivoBloqueio = "sem_concessao" | "suspenso" | "encerrado" | "expirado" | "ainda_nao_comecou";

export interface DecisaoAcesso {
  liberado: boolean;
  motivo: MotivoBloqueio | null;
}

/** A MESMA decisão que firestore.rules toma (acessoLiberado). */
export function avaliarAcesso(
  concessao: Concessao | null,
  config: ConfigPlataforma | null,
  agora: number
): DecisaoAcesso {
  if (!config?.exigirConcessao) return { liberado: true, motivo: null };
  if (!concessao) return { liberado: false, motivo: "sem_concessao" };
  if (concessao.estado === "suspenso") return { liberado: false, motivo: "suspenso" };
  if (concessao.estado === "encerrado") return { liberado: false, motivo: "encerrado" };
  if (concessao.inicioEm > agora) return { liberado: false, motivo: "ainda_nao_comecou" };
  if (concessao.fimEm !== null && concessao.fimEm <= agora) return { liberado: false, motivo: "expirado" };
  return { liberado: true, motivo: null };
}

/** Texto pra pessoa, sem jargão e sem revelar nada de outra conta. */
export const MENSAGEM_BLOQUEIO: Record<MotivoBloqueio, string> = {
  sem_concessao: "Sua conta ainda não tem acesso liberado. Use o link de convite que você recebeu.",
  suspenso: "Seu acesso está suspenso. Fale com quem cuida da sua turma.",
  encerrado: "Seu acesso foi encerrado. Seus dados continuam guardados: peça a exportação se precisar.",
  expirado: "Seu período de acesso terminou. Fale com quem cuida da sua turma pra renovar.",
  ainda_nao_comecou: "Seu acesso começa em breve. Volte na data combinada com a sua turma.",
};

export type AcaoConcessao =
  | { tipo: "suspender"; motivo: string }
  | { tipo: "reativar" }
  | { tipo: "renovar"; fimEm: number | null }
  | { tipo: "encerrar"; motivo: string };

/**
 * Aplica uma ação de administração. Puro: devolve a concessão nova, ou um
 * erro de regra (ex: reativar o que foi encerrado). Dados nunca são
 * apagados por aqui — encerrar só tira o acesso.
 */
export function aplicarAcao(
  atual: Concessao,
  acao: AcaoConcessao,
  agora: number
): { ok: true; concessao: Concessao } | { ok: false; erro: string } {
  const prox = (mudanca: Partial<Concessao>): Concessao => ({
    ...atual,
    ...mudanca,
    atualizadoEm: agora,
    versao: atual.versao + 1,
  });
  switch (acao.tipo) {
    case "suspender":
      if (atual.estado !== "ativo") return { ok: false, erro: "Só dá pra suspender um acesso ativo." };
      return { ok: true, concessao: prox({ estado: "suspenso", motivo: acao.motivo.slice(0, 200) }) };
    case "reativar":
      if (atual.estado !== "suspenso") return { ok: false, erro: "Só dá pra reativar um acesso suspenso." };
      return { ok: true, concessao: prox({ estado: "ativo", motivo: undefined }) };
    case "renovar":
      if (atual.estado === "encerrado") return { ok: false, erro: "Acesso encerrado: crie um convite novo." };
      if (acao.fimEm !== null && acao.fimEm <= agora) return { ok: false, erro: "A nova data de fim precisa ser no futuro." };
      return { ok: true, concessao: prox({ fimEm: acao.fimEm }) };
    case "encerrar":
      if (atual.estado === "encerrado") return { ok: false, erro: "Esse acesso já está encerrado." };
      return { ok: true, concessao: prox({ estado: "encerrado", motivo: acao.motivo.slice(0, 200) }) };
  }
}

/** Concessão nova (convite aceito, criação pelo admin ou legado). */
export function novaConcessao(
  origem: OrigemConcessao,
  agora: number,
  opcoes: { turmaId?: string | null; inicioEm?: number; fimEm?: number | null } = {}
): Concessao {
  return {
    estado: "ativo",
    origem,
    turmaId: opcoes.turmaId ?? null,
    inicioEm: opcoes.inicioEm ?? agora,
    fimEm: opcoes.fimEm ?? null,
    atualizadoEm: agora,
    versao: 1,
  };
}
