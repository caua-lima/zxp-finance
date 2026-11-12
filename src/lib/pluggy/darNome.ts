import { Escrita, gravarJuntas, listarDocumentos, obterDocumento } from "@/lib/firestoreRest";

export interface PedidoDeNome {
  colecao: "gastos" | "ganhos";
  id: string;
  descricao: string;
  categoria: string | null;
  escopo: "este" | "todos";
}

export type ResultadoDeNome =
  | { ok: true; atualizados: number; ignoradosMesFechado: number; apelidoSalvo: boolean }
  | { ok: false; status: number; erro: string };

/**
 * "Dar nome" a um lançamento que veio do banco. Escopo:
 * - "este": muda só esse lançamento;
 * - "todos": muda todos os lançamentos pro mesmo destinatário (mesmo
 *   CPF/CNPJ) e grava o apelido — os próximos já chegam com esse nome.
 * Mês fechado não é mexido. Fica registrado na trilha de auditoria.
 */
export async function darNome(uid: string, pedido: PedidoDeNome): Promise<ResultadoDeNome> {
  const base = `usuarios/${uid}`;
  const { colecao, id, descricao, categoria, escopo } = pedido;
  const alvo = await obterDocumento<Record<string, unknown>>(`${base}/${colecao}/${id}`);
  if (!alvo || alvo.origem !== "banco") {
    return { ok: false, status: 404, erro: "Esse lançamento não veio do banco." };
  }

  const fechados = new Map<string, boolean>();
  const mesFechado = async (mes: unknown) => {
    if (typeof mes !== "string") return false;
    if (!fechados.has(mes)) {
      const doc = await obterDocumento<{ status?: string }>(`${base}/monthCloses/${mes}`).catch(() => null);
      fechados.set(mes, doc?.status === "closed");
    }
    return fechados.get(mes) as boolean;
  };
  if (await mesFechado(alvo.mes)) {
    return { ok: false, status: 409, erro: "Esse mês está fechado. Reabra no Relatório pra mudar." };
  }

  const campoCategoria = colecao === "gastos" ? "categoria" : "categoriaReceita";
  const mudanca = { descricao, ...(categoria ? { [campoCategoria]: categoria } : {}) };
  const escritas: Escrita[] = [];
  let ignorados = 0;

  if (escopo === "todos" && typeof alvo.contraparte === "string") {
    const contraparte = alvo.contraparte;
    const irmaos = (await listarDocumentos<Record<string, unknown>>(`${base}/${colecao}`)).filter(
      (d) => d.dados.origem === "banco" && d.dados.contraparte === contraparte
    );
    for (const d of irmaos) {
      if (await mesFechado(d.dados.mes)) {
        ignorados++;
        continue;
      }
      escritas.push({ caminho: `${base}/${colecao}/${d.id}`, dados: mudanca, campos: Object.keys(mudanca) });
    }
    escritas.push({
      caminho: `${base}/apelidos/${contraparte}`,
      dados: {
        descricao,
        ...(categoria ? { [campoCategoria]: categoria } : {}),
        nomeBanco: typeof alvo.nomeBanco === "string" ? alvo.nomeBanco : null,
        atualizadoEm: Date.now(),
      },
    });
  } else {
    escritas.push({ caminho: `${base}/${colecao}/${id}`, dados: mudanca, campos: Object.keys(mudanca) });
  }

  escritas.push({
    caminho: `${base}/audit_logs/apelido-${Date.now()}`,
    dados: {
      action: "updated",
      entityType: colecao === "gastos" ? "gasto" : "ganho",
      entityId: id,
      actorUid: uid,
      summary:
        escopo === "todos"
          ? `"${alvo.nomeBanco ?? alvo.descricao}" agora se chama "${descricao}" (este e os próximos)`
          : `"${alvo.descricao}" renomeado para "${descricao}"`,
      createdAt: Date.now(),
    },
  });

  const resultado = await gravarJuntas(escritas);
  if (resultado !== "ok") return { ok: false, status: 409, erro: "Não consegui salvar agora. Tente de novo." };
  return {
    ok: true,
    atualizados: escritas.filter((e) => e.caminho.includes(`/${colecao}/`)).length,
    ignoradosMesFechado: ignorados,
    apelidoSalvo: escopo === "todos" && typeof alvo.contraparte === "string",
  };
}
