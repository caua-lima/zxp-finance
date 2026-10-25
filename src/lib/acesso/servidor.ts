import { obterDocumento } from "@/lib/firestoreRest";
import { avaliarAcesso, Concessao, ConfigPlataforma, DecisaoAcesso } from "./concessao";

/**
 * A decisão de acesso no servidor, lendo os mesmos documentos que as
 * regras do Firestore leem (acessos/{uid} e plataforma/config).
 */
export async function decisaoDeAcesso(uid: string, agora = Date.now()): Promise<DecisaoAcesso> {
  const [concessao, config] = await Promise.all([
    obterDocumento<Concessao>(`acessos/${uid}`),
    obterDocumento<ConfigPlataforma>("plataforma/config"),
  ]);
  return avaliarAcesso(concessao, config, agora);
}
