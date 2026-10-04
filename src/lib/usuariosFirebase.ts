import { accessToken, credenciais } from "./googleAuth";

// com o emulador de Auth (testes/desenvolvimento), fala com ele — nunca produção
const EMULADOR_AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const BASE = EMULADOR_AUTH
  ? `http://${EMULADOR_AUTH}/identitytoolkit.googleapis.com/v1`
  : "https://identitytoolkit.googleapis.com/v1";

export interface UsuarioFirebase {
  uid: string;
  email: string | null;
  disabled: boolean;
  criadoEm: string;
  ultimoLogin: string;
}

interface RespostaConta {
  localId: string;
  email?: string;
  disabled?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
}

async function chamar(
  caminho: string,
  corpo: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const projectId = EMULADOR_AUTH ? (process.env.GCLOUD_PROJECT ?? "demo-zxp") : credenciais().projectId;
  const token = EMULADOR_AUTH ? "owner" : await accessToken();

  const resposta = await fetch(`${BASE}/projects/${projectId}${caminho}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corpo),
  });

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const mensagem =
      (dados as { error?: { message?: string } })?.error?.message ??
      `Erro ${resposta.status} na API do Firebase.`;
    throw new Error(traduzir(mensagem));
  }
  return dados as Record<string, unknown>;
}

function traduzir(mensagem: string): string {
  const mapa: Record<string, string> = {
    EMAIL_EXISTS: "Já existe um login com esse e-mail.",
    INVALID_EMAIL: "E-mail inválido.",
    WEAK_PASSWORD: "A senha precisa ter pelo menos 6 caracteres.",
    MISSING_PASSWORD: "Informe uma senha.",
    USER_NOT_FOUND: "Login não encontrado.",
  };
  for (const [chave, texto] of Object.entries(mapa)) {
    if (mensagem.includes(chave)) return texto;
  }
  return mensagem;
}

function paraUsuario(conta: RespostaConta): UsuarioFirebase {
  return {
    uid: conta.localId,
    email: conta.email ?? null,
    disabled: conta.disabled ?? false,
    criadoEm: conta.createdAt
      ? new Date(Number(conta.createdAt)).toISOString()
      : "",
    ultimoLogin: conta.lastLoginAt
      ? new Date(Number(conta.lastLoginAt)).toISOString()
      : "",
  };
}

/**
 * Todos os logins, paginando — antes vinha só a primeira página da API, e
 * com mais clientes que isso o cron de notificação pulava gente calado.
 */
export async function listarUsuarios(): Promise<UsuarioFirebase[]> {
  if (EMULADOR_AUTH) {
    // o emulador de Auth não implementa `limit`/`offset`: devolve tudo de uma vez
    const dados = await chamar("/accounts:query", { returnUserInfo: true });
    return ((dados.userInfo ?? []) as RespostaConta[]).map(paraUsuario);
  }
  const todos: UsuarioFirebase[] = [];
  const porPagina = 500;
  for (let offset = 0; ; offset += porPagina) {
    const dados = await chamar("/accounts:query", {
      returnUserInfo: true,
      limit: String(porPagina),
      offset: String(offset),
    });
    const contas = (dados.userInfo ?? []) as RespostaConta[];
    todos.push(...contas.map(paraUsuario));
    if (contas.length < porPagina) break;
  }
  return todos;
}

export interface EstadoConta {
  existe: boolean;
  disabled: boolean;
  /** Tokens emitidos antes disso (segundos) foram revogados. */
  validSince: number | null;
}

/** Estado atual da conta no Auth — suspensão e revogação de sessão. */
export async function consultarConta(uid: string): Promise<EstadoConta> {
  const dados = await chamar("/accounts:lookup", { localId: [uid] });
  const conta = ((dados.users ?? []) as Array<{ disabled?: boolean; validSince?: string }>)[0];
  if (!conta) return { existe: false, disabled: true, validSince: null };
  return {
    existe: true,
    disabled: conta.disabled ?? false,
    validSince: conta.validSince ? Number(conta.validSince) : null,
  };
}

/** Marca (ou desmarca) o login como admin global via custom claim. Só a service account consegue. */
export async function definirClaimAdmin(uid: string, admin: boolean): Promise<void> {
  await chamar("/accounts:update", {
    localId: uid,
    customAttributes: JSON.stringify(admin ? { admin: true } : {}),
  });
}

export async function criarUsuario(
  email: string,
  senha: string
): Promise<string> {
  const dados = await chamar("/accounts", { email, password: senha });
  return dados.localId as string;
}

export async function atualizarUsuario(
  uid: string,
  dados: { email?: string; senha?: string; disabled?: boolean }
): Promise<void> {
  await chamar("/accounts:update", {
    localId: uid,
    ...(dados.email ? { email: dados.email } : {}),
    ...(dados.senha ? { password: dados.senha } : {}),
    ...(typeof dados.disabled === "boolean"
      ? { disableUser: dados.disabled }
      : {}),
  });
}

export async function excluirUsuario(uid: string): Promise<void> {
  await chamar("/accounts:delete", { localId: uid });
}
