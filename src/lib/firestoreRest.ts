import { accessTokenFirestore, credenciais } from "./googleAuth";

/**
 * Acesso direto ao Firestore via REST, sem passar pelas regras de
 * segurança (usa o access token da service account, escopo datastore).
 * Só pro cron de notificação, que precisa ler dados de todos os
 * usuários — não existe sessão de usuário nesse contexto. Deliberadamente
 * NÃO usa firebase-admin: esse pacote já quebrou a build de produção uma
 * vez (dependência transitiva ESM-only em jwks-rsa/jose), então tudo aqui
 * segue o mesmo padrão REST + crypto nativo já usado em googleAuth.ts.
 */

interface ValorFirestore {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  nullValue?: null;
  timestampValue?: string;
  mapValue?: { fields?: Record<string, ValorFirestore> };
  arrayValue?: { values?: ValorFirestore[] };
}

function decodificarValor(valor: ValorFirestore): unknown {
  if (valor.stringValue !== undefined) return valor.stringValue;
  if (valor.integerValue !== undefined) return Number(valor.integerValue);
  if (valor.doubleValue !== undefined) return valor.doubleValue;
  if (valor.booleanValue !== undefined) return valor.booleanValue;
  if (valor.timestampValue !== undefined) return valor.timestampValue;
  if (valor.mapValue !== undefined) return decodificarCampos(valor.mapValue.fields ?? {});
  if (valor.arrayValue !== undefined) {
    return (valor.arrayValue.values ?? []).map(decodificarValor);
  }
  return null;
}

function decodificarCampos(
  fields: Record<string, ValorFirestore>
): Record<string, unknown> {
  const resultado: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(fields)) {
    resultado[chave] = decodificarValor(valor);
  }
  return resultado;
}

// Com FIRESTORE_EMULATOR_HOST (testes), fala com o emulador local em vez
// da produção — é o que permite testar este código de servidor sem tocar
// em dado real. "Bearer owner" é o token de admin do emulador.
const EMULADOR = process.env.FIRESTORE_EMULATOR_HOST;

function urlBase(): string {
  if (EMULADOR) {
    const projeto = process.env.GCLOUD_PROJECT ?? "demo-zxp";
    return `http://${EMULADOR}/v1/projects/${projeto}/databases/(default)/documents`;
  }
  const { projectId } = credenciais();
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

async function cabecalhos(): Promise<Record<string, string>> {
  if (EMULADOR) return { Authorization: "Bearer owner" };
  const token = await accessTokenFirestore();
  return { Authorization: `Bearer ${token}` };
}

export interface DocumentoFirestore<T = Record<string, unknown>> {
  id: string;
  dados: T;
}

/** Campos do jeito que o Firestore guarda, com o tipo junto (backup/restauração). */
export type CamposBrutos = Record<string, ValorFirestore>;

async function listarCrus(caminho: string): Promise<{ id: string; campos: CamposBrutos }[]> {
  const resultado: { id: string; campos: CamposBrutos }[] = [];
  let pageToken: string | undefined;
  const headers = await cabecalhos();

  do {
    const url = new URL(`${urlBase()}/${caminho}`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const resposta = await fetch(url, { headers });
    if (resposta.status === 404) return resultado;
    if (!resposta.ok) {
      throw new Error(`Erro ao listar ${caminho}: ${resposta.status}`);
    }
    const json = await resposta.json();
    for (const doc of json.documents ?? []) {
      resultado.push({ id: doc.name.split("/").pop(), campos: doc.fields ?? {} });
    }
    pageToken = json.nextPageToken;
  } while (pageToken);

  return resultado;
}

/** Lista todos os documentos de uma coleção/subcoleção, paginando sozinho. */
export async function listarDocumentos<T = Record<string, unknown>>(
  caminho: string
): Promise<DocumentoFirestore<T>[]> {
  return (await listarCrus(caminho)).map((d) => ({
    id: d.id,
    dados: decodificarCampos(d.campos) as T,
  }));
}

/**
 * Mesma listagem, sem decodificar: timestamp continua timestamp, 1.0
 * continua double. É o que o backup precisa pra restaurar sem mudar tipo.
 */
export async function listarDocumentosBrutos(
  caminho: string
): Promise<{ id: string; campos: CamposBrutos }[]> {
  return listarCrus(caminho);
}

/** Substitui o documento inteiro pelos campos crus (restauração de backup). */
export async function regravarDocumentoBruto(caminho: string, campos: CamposBrutos): Promise<void> {
  const headers = await cabecalhos();
  const resposta = await fetch(`${urlBase()}/${caminho}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: campos }),
  });
  if (!resposta.ok) throw new Error(`Erro ao regravar ${caminho}: ${resposta.status}`);
}

/** JSON com chaves ordenadas — compara documentos sem depender da ordem dos campos. */
export function jsonCanonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(",")}]`;
  if (valor && typeof valor === "object") {
    const obj = valor as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${jsonCanonico(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(valor);
}

/** Busca um único documento por caminho completo. Retorna null se não existe. */
export async function obterDocumento<T = Record<string, unknown>>(
  caminho: string
): Promise<T | null> {
  const headers = await cabecalhos();
  const resposta = await fetch(`${urlBase()}/${caminho}`, { headers });
  if (resposta.status === 404) return null;
  if (!resposta.ok) {
    throw new Error(`Erro ao buscar ${caminho}: ${resposta.status}`);
  }
  const doc = await resposta.json();
  return decodificarCampos(doc.fields ?? {}) as T;
}

/** Apaga um documento por caminho completo — usado pra limpar inscrição de push expirada. */
export async function deletarDocumento(caminho: string): Promise<void> {
  const headers = await cabecalhos();
  const resposta = await fetch(`${urlBase()}/${caminho}`, {
    method: "DELETE",
    headers,
  });
  if (!resposta.ok && resposta.status !== 404) {
    throw new Error(`Erro ao apagar ${caminho}: ${resposta.status}`);
  }
}

// ---------------------------------------------------------------------------
// Escrita server-side. Usada por trilha de auditoria, notificações e
// exclusão de conta — coisas que o cliente não pode escrever sozinho (as
// regras do Firestore bloqueiam essas coleções pro navegador).
// ---------------------------------------------------------------------------

function codificarValor(valor: unknown): ValorFirestore {
  if (valor === null || valor === undefined) return { nullValue: null };
  if (typeof valor === "boolean") return { booleanValue: valor };
  if (typeof valor === "number") {
    return Number.isInteger(valor) ? { integerValue: String(valor) } : { doubleValue: valor };
  }
  if (typeof valor === "string") return { stringValue: valor };
  if (valor instanceof Date) return { timestampValue: valor.toISOString() };
  if (Array.isArray(valor)) return { arrayValue: { values: valor.map(codificarValor) } };
  if (typeof valor === "object") {
    return { mapValue: { fields: codificarCampos(valor as Record<string, unknown>) } };
  }
  return { stringValue: String(valor) };
}

function codificarCampos(dados: Record<string, unknown>): Record<string, ValorFirestore> {
  const campos: Record<string, ValorFirestore> = {};
  for (const [chave, valor] of Object.entries(dados)) {
    if (valor === undefined) continue; // undefined some, igual semUndefined
    campos[chave] = codificarValor(valor);
  }
  return campos;
}

/**
 * Cria um documento SÓ se ele ainda não existe (precondição do Firestore).
 * É o que dá idempotência às notificações: gerar o mesmo evento duas vezes
 * (cron duplicado, reexecução) cai no mesmo id e a segunda vez não grava.
 * Devolve false quando já existia.
 */
export async function criarSeNaoExiste(
  caminho: string,
  dados: Record<string, unknown>
): Promise<boolean> {
  const headers = await cabecalhos();
  const url = new URL(`${urlBase()}/${caminho}`);
  url.searchParams.set("currentDocument.exists", "false");
  const resposta = await fetch(url, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: codificarCampos(dados) }),
  });
  if (resposta.status === 400 || resposta.status === 409 || resposta.status === 412) {
    const corpo = await resposta.text();
    if (/exist|precondition|FAILED_PRECONDITION|ALREADY_EXISTS/i.test(corpo)) return false;
    throw new Error(`Erro ao criar ${caminho}: ${resposta.status}`);
  }
  if (!resposta.ok) throw new Error(`Erro ao criar ${caminho}: ${resposta.status}`);
  return true;
}

/** Cria documento com id automático numa coleção (ex: trilha de auditoria). */
export async function adicionarDocumento(
  caminhoColecao: string,
  dados: Record<string, unknown>
): Promise<string> {
  const headers = await cabecalhos();
  const resposta = await fetch(`${urlBase()}/${caminhoColecao}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: codificarCampos(dados) }),
  });
  if (!resposta.ok) throw new Error(`Erro ao gravar em ${caminhoColecao}: ${resposta.status}`);
  const doc = await resposta.json();
  return String(doc.name).split("/").pop()!;
}

/** Atualiza só os campos informados (merge), criando o doc se não existir. */
export async function atualizarCampos(
  caminho: string,
  dados: Record<string, unknown>
): Promise<void> {
  const headers = await cabecalhos();
  const url = new URL(`${urlBase()}/${caminho}`);
  for (const campo of Object.keys(dados)) {
    if (dados[campo] !== undefined) url.searchParams.append("updateMask.fieldPaths", campo);
  }
  const resposta = await fetch(url, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: codificarCampos(dados) }),
  });
  if (!resposta.ok) throw new Error(`Erro ao atualizar ${caminho}: ${resposta.status}`);
}

/** Nomes das subcoleções de um documento (ex: tudo que existe sob usuarios/{uid}). */
export async function listarSubcolecoes(caminhoDocumento: string): Promise<string[]> {
  const headers = await cabecalhos();
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const resposta = await fetch(`${urlBase()}/${caminhoDocumento}:listCollectionIds`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ pageSize: 100, ...(pageToken ? { pageToken } : {}) }),
    });
    if (resposta.status === 404) return ids;
    if (!resposta.ok) throw new Error(`Erro ao listar subcoleções de ${caminhoDocumento}: ${resposta.status}`);
    const json = await resposta.json();
    ids.push(...(json.collectionIds ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return ids;
}

/**
 * Soma `delta` num campo numérico de forma atômica (transform do próprio
 * Firestore) e devolve o valor novo. Base da cota de uso por usuário:
 * duas requisições simultâneas nunca leem o mesmo contador antigo.
 */
export async function incrementarContador(
  caminho: string,
  campo: string,
  delta = 1
): Promise<number> {
  const headers = await cabecalhos();
  const base = urlBase();
  const nomeDoc = `${base.replace(/^https?:\/\/[^/]+\/v1\//, "")}/${caminho}`;
  const resposta = await fetch(`${base.replace(/\/documents$/, "")}/documents:commit`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      writes: [
        {
          transform: {
            document: nomeDoc,
            fieldTransforms: [{ fieldPath: campo, increment: { integerValue: String(delta) } }],
          },
        },
      ],
    }),
  });
  if (!resposta.ok) throw new Error(`Erro ao incrementar ${caminho}: ${resposta.status}`);
  const json = await resposta.json();
  const resultado = json.writeResults?.[0]?.transformResults?.[0];
  return Number(resultado?.integerValue ?? resultado?.doubleValue ?? 0);
}
