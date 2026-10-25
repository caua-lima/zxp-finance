import { Concessao, novaConcessao } from "./concessao";

export interface UsuarioParaConcessao {
  uid: string;
  disabled: boolean;
}

export interface PlanoLegado {
  /** Concessões a criar (quem usa o app e ainda não tem). */
  criar: { uid: string; concessao: Concessao }[];
  /** Já têm concessão: não mexe. */
  jaTem: number;
  /** Ligar a exigência só é seguro quando ninguém ativo fica sem concessão ativa. */
  podeExigir: boolean;
}

/**
 * Quem já usa o app ganha concessão "legado" antes de a exigência ligar —
 * ninguém é trancado do dia pra noite, e ninguém vira admin por isso (a
 * concessão não tem papel). Conta desativada no Auth entra suspensa.
 * Idempotente: quem já tem concessão fica como está.
 */
export function planejarConcessoesLegado(
  usuarios: UsuarioParaConcessao[],
  existentes: Map<string, Concessao>,
  agora: number
): PlanoLegado {
  const criar: PlanoLegado["criar"] = [];
  for (const u of usuarios) {
    if (existentes.has(u.uid)) continue;
    const c = novaConcessao("legado", agora);
    criar.push({
      uid: u.uid,
      concessao: u.disabled ? { ...c, estado: "suspenso", motivo: "conta desativada no login" } : c,
    });
  }
  const ativoDepois = (uid: string) => {
    const c = existentes.get(uid) ?? criar.find((x) => x.uid === uid)?.concessao;
    return c?.estado === "ativo";
  };
  const podeExigir = usuarios.filter((u) => !u.disabled).every((u) => ativoDepois(u.uid));
  return { criar, jaTem: usuarios.length - criar.length, podeExigir };
}
