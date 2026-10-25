/**
 * Regras de autorização do servidor, sem dependência de rede nem de
 * Firebase — por isso testáveis direto (auditoria S01/S05).
 *
 * Admin global = quem administra a PLATAFORMA (logins de outros clientes).
 * Não tem nada a ver com ser dono dos próprios dados financeiros: todo
 * cliente é dono do próprio workspace e nenhum cliente é admin por padrão.
 *
 * O papel vem de duas fontes que o cliente NÃO consegue editar:
 *  - `ADMIN_UIDS` (variável de ambiente do servidor, lista separada por vírgula)
 *  - custom claim `admin: true` no token, que só a service account grava
 *    (ver scripts/definir-admin.ts)
 * Nunca de um documento do Firestore que o próprio usuário possa escrever.
 */

export function listaDeUids(valor: string | undefined): Set<string> {
  return new Set(
    (valor ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function ehAdminGlobal(
  uid: string,
  claims: Record<string, unknown>,
  adminUidsEnv: string | undefined
): boolean {
  if (claims.admin === true) return true;
  return listaDeUids(adminUidsEnv).has(uid);
}

/** Folga pra diferença de relógio entre servidores (segundos). */
const FOLGA_RELOGIO = 300;

export interface CorpoToken {
  exp?: number;
  iat?: number;
  auth_time?: number;
}

/**
 * Checagens temporais que faltavam na verificação manual do token:
 * emitido no futuro ou login "no futuro" é token forjado ou relógio
 * quebrado — em qualquer caso, não confiável. Retorna o motivo, ou null.
 */
export function problemaTemporalDoToken(corpo: CorpoToken, agoraSeg: number): string | null {
  if (!corpo.exp || corpo.exp <= agoraSeg) return "expirado";
  if (!corpo.iat || corpo.iat > agoraSeg + FOLGA_RELOGIO) return "iat inválido";
  if (!corpo.auth_time || corpo.auth_time > agoraSeg + FOLGA_RELOGIO) return "auth_time inválido";
  if (corpo.auth_time > corpo.iat + FOLGA_RELOGIO) return "auth_time depois do iat";
  return null;
}

/**
 * Sessão revogada: o Firebase marca `validSince` quando a sessão do usuário
 * é revogada (troca de senha, "sair de todos os dispositivos", suspensão).
 * A comparação é com `auth_time` — quando a pessoa ENTROU — e não com
 * `iat`: o SDK renova o ID token sozinho a cada hora, e um token renovado
 * depois da revogação tem `iat` novo mas continua sendo a mesma sessão
 * revogada (auditoria 25/10 S02; ver Firebase "manage sessions").
 */
export function sessaoRevogada(authTimeSeg: number, validSinceSeg: number | null): boolean {
  if (validSinceSeg === null) return false;
  return authTimeSeg < validSinceSeg;
}

/** Recursos em teste liberados só pra UIDs listados (ex: ponte com o ZXP Tasks). */
export function recursoLiberado(uid: string, uidsEnv: string | undefined): boolean {
  return listaDeUids(uidsEnv).has(uid);
}
