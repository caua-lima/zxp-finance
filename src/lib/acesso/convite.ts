import { createHash, randomBytes } from "crypto";

/**
 * Convite de uso único com prazo (auditoria 25/10 B11).
 *
 * O link leva um token aleatório de 32 bytes; o banco guarda só o HASH
 * (sha256) como id do documento — quem lê o banco não consegue montar um
 * link válido. O convite não contém senha nem dá acesso a outra conta.
 */

export interface Convite {
  turmaId: string | null;
  criadoPor: string;
  criadoEm: number;
  /** Até quando o LINK vale (ms). */
  expiraEm: number;
  /** Até quando o ACESSO de quem aceitar vale (ms); null = sem prazo. */
  fimAcessoEm: number | null;
  usadoEm?: number | null;
  usadoPor?: string | null;
  revogadoEm?: number | null;
}

export type ProblemaConvite = "inexistente" | "usado" | "expirado" | "revogado";

export function gerarToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashDoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Formato do token (43 caracteres base64url) — recusa lixo antes de ir ao banco. */
export function tokenBemFormado(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function avaliarConvite(convite: Convite | null, agora: number): ProblemaConvite | null {
  if (!convite) return "inexistente";
  if (convite.revogadoEm) return "revogado";
  if (convite.usadoEm) return "usado";
  if (convite.expiraEm <= agora) return "expirado";
  return null;
}

/**
 * Mensagens pra quem abriu o link. "inexistente" e "revogado" dizem a
 * mesma coisa: não revela se aquele link chegou a existir.
 */
export const MENSAGEM_CONVITE: Record<ProblemaConvite, string> = {
  inexistente: "Esse link de convite não é válido. Peça um novo a quem cuida da sua turma.",
  revogado: "Esse link de convite não é válido. Peça um novo a quem cuida da sua turma.",
  usado: "Esse convite já foi usado. Se foi você, é só entrar com seu e-mail e senha.",
  expirado: "Esse convite expirou. Peça um novo a quem cuida da sua turma.",
};
