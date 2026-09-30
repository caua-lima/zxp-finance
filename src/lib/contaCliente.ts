import {
  listarDocumentos,
  listarSubcolecoes,
  deletarDocumento,
  DocumentoFirestore,
} from "./firestoreRest";
import { atualizarUsuario, excluirUsuario } from "./usuariosFirebase";

/**
 * Ciclo de vida da conta de um cliente, no servidor (auditoria S10/S11).
 *
 * Excluir login ≠ excluir cliente: antes, apagar o login deixava todos os
 * dados financeiros, inscrições de push e históricos órfãos no Firestore.
 * Aqui a exclusão é um workflow idempotente — pode ser rodado de novo se
 * parar no meio, e cada passo tolera já ter sido feito.
 */

export interface RelatorioExclusao {
  uid: string;
  suspenso: boolean;
  documentosApagados: Record<string, number>;
  dispositivosRemovidos: number;
  loginApagado: boolean;
}

export async function excluirCliente(uid: string): Promise<RelatorioExclusao> {
  const relatorio: RelatorioExclusao = {
    uid,
    suspenso: false,
    documentosApagados: {},
    dispositivosRemovidos: 0,
    loginApagado: false,
  };

  // 1. suspende primeiro: login bloqueado e sessão parando de valer
  //    enquanto o resto é apagado (notificação para de sair também,
  //    porque o worker ignora conta suspensa)
  try {
    await atualizarUsuario(uid, { disabled: true });
    relatorio.suspenso = true;
  } catch (e) {
    if (!/não encontrado/i.test(String(e))) throw e;
  }

  // 2. índice global de aparelhos de push que apontam pra esse cliente
  const aparelhos = await listarDocumentos<{ uid?: string }>("pushAparelhos");
  for (const a of aparelhos.filter((a) => a.dados.uid === uid)) {
    await deletarDocumento(`pushAparelhos/${a.id}`);
    relatorio.dispositivosRemovidos++;
  }

  // 3. todos os dados do workspace
  for (const colecao of await listarSubcolecoes(`usuarios/${uid}`)) {
    const docs = await listarDocumentos(`usuarios/${uid}/${colecao}`);
    for (const d of docs) await deletarDocumento(`usuarios/${uid}/${colecao}/${d.id}`);
    relatorio.documentosApagados[colecao] = docs.length;
  }
  await deletarDocumento(`usuarios/${uid}`);

  // 4. por último o login — se cair antes daqui, rodar de novo termina
  try {
    await excluirUsuario(uid);
    relatorio.loginApagado = true;
  } catch (e) {
    if (/não encontrado/i.test(String(e))) relatorio.loginApagado = true;
    else throw e;
  }

  return relatorio;
}

/** Tudo que o cliente tem guardado, pra ele baixar (portabilidade). */
export async function exportarCliente(
  uid: string
): Promise<Record<string, DocumentoFirestore[]>> {
  const exportacao: Record<string, DocumentoFirestore[]> = {};
  for (const colecao of await listarSubcolecoes(`usuarios/${uid}`)) {
    // inscrição de push tem endpoint e chaves do aparelho — não sai no export
    if (colecao === "pushInscricoes") continue;
    exportacao[colecao] = await listarDocumentos(`usuarios/${uid}/${colecao}`);
  }
  return exportacao;
}
