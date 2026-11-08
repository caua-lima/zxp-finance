/**
 * Cliente da API da Pluggy (Open Finance), só no servidor. Lê os dados das
 * conexões que a pessoa fez no Meu Pluggy (plano pessoal gratuito: só as
 * contas do próprio titular). Formatos conferidos na referência oficial
 * (docs.pluggy.ai/pt/reference) em 08/11/2026:
 * - POST /auth {clientId, clientSecret} → {apiKey}, vale 2 horas;
 * - header X-API-KEY nas demais chamadas;
 * - GET /accounts?itemId= e GET /investments?itemId= paginam por page/totalPages;
 * - GET /v2/transactions?accountId=&dateFrom=&dateTo= pagina por cursor (`next`).
 * Itens do Meu Pluggy não aceitam atualização manual (PATCH): o próprio
 * Meu Pluggy sincroniza a cada 24 horas.
 */

const BASE = "https://api.pluggy.ai";

export interface ConfigPluggy {
  clientId: string;
  clientSecret: string;
  itemIds: string[];
  /** Usuário do app dono das conexões (plano pessoal = uma pessoa só). */
  uid: string;
}

export const ehIdDeItem = (s: unknown): s is string =>
  typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/**
 * Credenciais do ambiente (as conexões podem vir vazias: elas também ficam
 * gravadas no app quando você conecta pelo botão). null = integração desligada.
 */
export function credenciaisPluggy(env: Record<string, string | undefined> = process.env): ConfigPluggy | null {
  const clientId = env.PLUGGY_CLIENT_ID?.trim();
  const clientSecret = env.PLUGGY_CLIENT_SECRET?.trim();
  const uid = env.PLUGGY_UID?.trim();
  if (!clientId || !clientSecret || !uid) return null;
  const itemIds = (env.PLUGGY_ITEM_IDS ?? "").split(/[\s,;]+/).map((s) => s.trim()).filter(ehIdDeItem);
  return { clientId, clientSecret, itemIds, uid };
}

/** Configuração pronta pra sincronizar: credenciais + pelo menos uma conexão. */
export function configPluggy(env: Record<string, string | undefined> = process.env): ConfigPluggy | null {
  const cfg = credenciaisPluggy(env);
  return cfg && cfg.itemIds.length > 0 ? cfg : null;
}

/** Junta as conexões do ambiente com as gravadas no app. */
export function comConexoes(cfg: ConfigPluggy, gravadas: unknown): ConfigPluggy {
  const extras = Array.isArray(gravadas) ? gravadas.filter(ehIdDeItem) : [];
  return { ...cfg, itemIds: [...new Set([...cfg.itemIds, ...extras])] };
}

export interface ItemPluggy {
  id: string;
  status: string;
  executionStatus?: string | null;
  lastUpdatedAt?: string | null;
  connector?: { id?: number; name?: string } | null;
}

export interface ContaPluggy {
  id: string;
  type: "BANK" | "CREDIT";
  subtype?: string;
  name: string;
  marketingName?: string | null;
  number?: string;
  balance: number;
  currencyCode?: string;
  itemId: string;
  bankData?: { automaticallyInvestedBalance?: number | null; closingBalance?: number | null } | null;
  creditData?: { creditLimit?: number | null; availableCreditLimit?: number | null } | null;
}

export interface TransacaoPluggy {
  id: string;
  description: string;
  descriptionRaw?: string | null;
  amount: number;
  date: string;
  type: "DEBIT" | "CREDIT";
  category?: string | null;
  status?: "PENDING" | "POSTED" | null;
  accountId: string;
  operationType?: string | null;
  creditCardMetadata?: {
    installmentNumber?: number | null;
    totalInstallments?: number | null;
    purchaseDate?: string | null;
  } | null;
  merchant?: { name?: string | null; businessName?: string | null } | null;
}

export interface InvestimentoPluggy {
  id: string;
  name: string;
  type: string;
  subtype?: string | null;
  balance: number;
  amount?: number | null;
  amountProfit?: number | null;
  rate?: number | null;
  rateType?: string | null;
  status?: string | null;
}

export class ErroPluggy extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
  }
}

let chave: { apiKey: string; expira: number; clientId: string } | null = null;

async function apiKey(cfg: ConfigPluggy): Promise<string> {
  if (chave && chave.clientId === cfg.clientId && chave.expira > Date.now()) return chave.apiKey;
  const r = await fetch(`${BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: cfg.clientId, clientSecret: cfg.clientSecret }),
  });
  if (!r.ok) throw new ErroPluggy("A Pluggy recusou o Client ID/Secret.", r.status);
  const { apiKey: k } = (await r.json()) as { apiKey?: string };
  if (!k) throw new ErroPluggy("A Pluggy não devolveu a chave de acesso.");
  // vale 2 h; renova com folga
  chave = { apiKey: k, expira: Date.now() + 100 * 60_000, clientId: cfg.clientId };
  return k;
}

async function get<T>(cfg: ConfigPluggy, caminho: string): Promise<T> {
  const r = await fetch(`${BASE}${caminho}`, { headers: { "X-API-KEY": await apiKey(cfg) } });
  if (!r.ok) throw new ErroPluggy(`A Pluggy respondeu ${r.status} em ${caminho.split("?")[0]}.`, r.status);
  return (await r.json()) as T;
}

type Pagina<T> = { results: T[]; page?: number; totalPages?: number };

async function todasAsPaginas<T>(cfg: ConfigPluggy, caminho: string): Promise<T[]> {
  const itens: T[] = [];
  for (let page = 1; page <= 50; page++) {
    const sep = caminho.includes("?") ? "&" : "?";
    const p = await get<Pagina<T>>(cfg, `${caminho}${sep}page=${page}`);
    itens.push(...(p.results ?? []));
    if (!p.totalPages || page >= p.totalPages) break;
  }
  return itens;
}

/**
 * Token de 30 minutos pro widget Pluggy Connect abrir no navegador. Ele só
 * cria/atualiza conexão — não lê dados (a chave de API nunca vai pro navegador).
 */
export async function criarConnectToken(cfg: ConfigPluggy, clientUserId: string): Promise<string> {
  const r = await fetch(`${BASE}/connect_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": await apiKey(cfg) },
    body: JSON.stringify({ clientUserId }),
  });
  if (!r.ok) throw new ErroPluggy(`A Pluggy respondeu ${r.status} ao criar o token de conexão.`, r.status);
  const { accessToken } = (await r.json()) as { accessToken?: string };
  if (!accessToken) throw new ErroPluggy("A Pluggy não devolveu o token de conexão.");
  return accessToken;
}

export function obterItem(cfg: ConfigPluggy, itemId: string): Promise<ItemPluggy> {
  return get<ItemPluggy>(cfg, `/items/${encodeURIComponent(itemId)}`);
}

export function listarContas(cfg: ConfigPluggy, itemId: string): Promise<ContaPluggy[]> {
  return todasAsPaginas<ContaPluggy>(cfg, `/accounts?itemId=${encodeURIComponent(itemId)}`);
}

/** Investimentos (cofrinhos/reservas entram aqui quando a instituição envia). Sem acesso: lista vazia. */
export async function listarInvestimentos(cfg: ConfigPluggy, itemId: string): Promise<InvestimentoPluggy[]> {
  try {
    return await todasAsPaginas<InvestimentoPluggy>(cfg, `/investments?itemId=${encodeURIComponent(itemId)}`);
  } catch (e) {
    if (e instanceof ErroPluggy && (e.status === 403 || e.status === 404)) return [];
    throw e;
  }
}

/** Transações de uma conta entre dois dias ("AAAA-MM-DD"), seguindo o cursor `next`. */
export async function listarTransacoes(
  cfg: ConfigPluggy,
  accountId: string,
  de: string,
  ate: string
): Promise<TransacaoPluggy[]> {
  const itens: TransacaoPluggy[] = [];
  let consulta: string | null =
    `?accountId=${encodeURIComponent(accountId)}&dateFrom=${de}&dateTo=${ate}`;
  for (let i = 0; consulta && i < 50; i++) {
    const p: { results: TransacaoPluggy[]; next?: string | null } = await get(cfg, `/v2/transactions${consulta}`);
    itens.push(...(p.results ?? []));
    consulta = p.next ? (p.next.startsWith("?") ? p.next : `?${p.next}`) : null;
  }
  return itens;
}
