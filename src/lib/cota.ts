import { incrementarContador } from "./firestoreRest";
import { hojeISO } from "./finance/calculations";

/**
 * Cota diária por usuário e recurso (auditoria S07) — o que impede um
 * cliente de gerar custo ilimitado na API da Anthropic, por exemplo.
 * Contador fica em `limitesUso/` (coleção só do servidor) e zera por dia.
 * Devolve true se ainda cabe.
 */
export async function consumirCota(
  uid: string,
  recurso: string,
  limiteDiario: number
): Promise<boolean> {
  const usados = await incrementarContador(`limitesUso/${uid}__${recurso}__${hojeISO()}`, "usos");
  return usados <= limiteDiario;
}
