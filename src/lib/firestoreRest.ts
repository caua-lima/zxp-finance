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

function urlBase(): string {
  const { projectId } = credenciais();
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

async function cabecalhos(): Promise<Record<string, string>> {
  const token = await accessTokenFirestore();
  return { Authorization: `Bearer ${token}` };
}

export interface DocumentoFirestore<T = Record<string, unknown>> {
  id: string;
  dados: T;
}

/** Lista todos os documentos de uma coleção/subcoleção, paginando sozinho. */
export async function listarDocumentos<T = Record<string, unknown>>(
  caminho: string
): Promise<DocumentoFirestore<T>[]> {
  const resultado: DocumentoFirestore<T>[] = [];
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
      resultado.push({
        id: doc.name.split("/").pop(),
        dados: decodificarCampos(doc.fields ?? {}) as T,
      });
    }
    pageToken = json.nextPageToken;
  } while (pageToken);

  return resultado;
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
