import { obterComVersao, gravarJuntas, criarSeNaoExiste } from "@/lib/firestoreRest";
import { Concessao, novaConcessao } from "./concessao";
import { Convite, avaliarConvite, gerarToken, hashDoToken, ProblemaConvite } from "./convite";

const DIA = 86_400_000;

/** Tira undefined (o REST gravaria null). */
const limpo = (o: object) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export async function criarConvite(opcoes: {
  criadoPor: string;
  turmaId: string | null;
  validadeLinkDias: number;
  fimAcessoEm: number | null;
  paraEmail?: string | null;
  agora?: number;
}): Promise<{ token: string; expiraEm: number }> {
  const agora = opcoes.agora ?? Date.now();
  const token = gerarToken();
  const convite: Convite = {
    turmaId: opcoes.turmaId,
    criadoPor: opcoes.criadoPor,
    criadoEm: agora,
    expiraEm: agora + opcoes.validadeLinkDias * DIA,
    fimAcessoEm: opcoes.fimAcessoEm,
    usadoEm: null,
    usadoPor: null,
    revogadoEm: null,
    paraEmail: opcoes.paraEmail ? opcoes.paraEmail.trim().toLowerCase() : null,
  };
  const criado = await criarSeNaoExiste(`convites/${hashDoToken(token)}`, limpo(convite));
  if (!criado) throw new Error("Colisão de token (não deveria acontecer).");
  return { token, expiraEm: convite.expiraEm };
}

/**
 * Aceita o convite pro UID: marca o convite como usado E cria/atualiza a
 * concessão, juntos, com pré-condição na versão do convite. Duas pessoas
 * (ou dois cliques) aceitando ao mesmo tempo: só uma grava; a outra vê
 * "usado". Reaceitar pelo mesmo UID é sucesso (retry seguro).
 */
export async function aceitarConvite(
  token: string,
  uid: string,
  email: string | null,
  agora = Date.now()
): Promise<{ ok: true; concessao: Concessao } | { ok: false; problema: ProblemaConvite }> {
  const caminho = `convites/${hashDoToken(token)}`;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const lido = await obterComVersao<Convite>(caminho);
    // retry do mesmo UID depois de já ter aceitado: idempotente
    if (lido?.dados.usadoPor === uid && lido.dados.usadoEm) {
      const atual = await obterComVersao<Concessao>(`acessos/${uid}`);
      if (atual) return { ok: true, concessao: atual.dados };
    }
    const problema = avaliarConvite(lido?.dados ?? null, agora, email);
    if (problema || !lido) return { ok: false, problema: problema ?? "inexistente" };

    const anterior = await obterComVersao<Concessao>(`acessos/${uid}`);
    const base = novaConcessao("convite", agora, {
      turmaId: lido.dados.turmaId,
      fimEm: lido.dados.fimAcessoEm,
    });
    const concessao: Concessao = anterior ? { ...base, versao: anterior.dados.versao + 1 } : base;

    const resultado = await gravarJuntas([
      {
        caminho,
        dados: { usadoEm: agora, usadoPor: uid },
        campos: ["usadoEm", "usadoPor"],
        condicao: { versao: lido.versao },
      },
      {
        caminho: `acessos/${uid}`,
        dados: limpo(concessao),
        condicao: anterior ? { versao: anterior.versao } : { existe: false },
      },
    ]);
    if (resultado === "ok") return { ok: true, concessao };
    // conflito: alguém mexeu no convite ou na concessão — relê e decide de novo
  }
  return { ok: false, problema: "usado" };
}
