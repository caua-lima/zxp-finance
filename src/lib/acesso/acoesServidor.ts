import { obterComVersao, gravarJuntas, consultar } from "@/lib/firestoreRest";
import { AcaoConcessao, Concessao, aplicarAcao } from "./concessao";

const limpo = (o: object) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/**
 * Entregas de push ainda pendentes viram "cancelada" — quem foi suspenso ou
 * encerrado não recebe mais nada (auditoria 25/10 B14). Em lotes de 400.
 */
export async function cancelarEntregasPendentes(uid: string, agora = Date.now()): Promise<number> {
  const pendentes = await consultar({ colecao: "entregas", dentroDe: `usuarios/${uid}`, onde: [["status", "==", "pendente"]], limite: 2000 });
  for (let i = 0; i < pendentes.length; i += 400) {
    await gravarJuntas(
      pendentes.slice(i, i + 400).map((p) => ({
        caminho: p.caminho,
        dados: { status: "cancelada", atualizadaEm: agora, motivo: "acesso suspenso ou encerrado" },
        campos: ["status", "atualizadaEm", "motivo"],
      }))
    );
  }
  return pendentes.length;
}

/**
 * Aplica a ação na concessão com pré-condição de versão: se outra pessoa
 * (ou outra aba) mexeu no meio, relê e decide de novo — nunca sobrescreve
 * uma mudança que não viu.
 */
export async function aplicarAcaoNoServidor(
  uid: string,
  acao: AcaoConcessao,
  agora = Date.now()
): Promise<{ ok: true; concessao: Concessao; entregasCanceladas: number } | { ok: false; erro: string }> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const atual = await obterComVersao<Concessao>(`acessos/${uid}`);
    if (!atual) return { ok: false, erro: "Essa pessoa não tem concessão de acesso." };
    const r = aplicarAcao(atual.dados, acao, agora);
    if (!r.ok) return r;
    const gravou = await gravarJuntas([
      { caminho: `acessos/${uid}`, dados: limpo(r.concessao), condicao: { versao: atual.versao } },
    ]);
    if (gravou === "conflito") continue;
    const entregasCanceladas =
      r.concessao.estado === "ativo" ? 0 : await cancelarEntregasPendentes(uid, agora);
    return { ok: true, concessao: r.concessao, entregasCanceladas };
  }
  return { ok: false, erro: "A concessão mudou várias vezes seguidas. Recarregue e tente de novo." };
}
