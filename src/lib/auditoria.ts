import { WriteBatch, doc, collection } from "firebase/firestore";
import { db } from "./firebase";
import { semUndefined } from "./semUndefined";

/**
 * Trilha de auditoria (usuarios/{uid}/audit_logs). Toda mudança em
 * lançamento financeiro que não é uma simples edição de rascunho
 * (arquivar, cancelar, estornar, marcar como pago) anexa um registro
 * aqui — nunca senha/token/segredo, só o suficiente pra reconstruir o
 * "quem fez o quê" depois.
 *
 * `anexarAuditLog` recebe um WriteBatch em vez de escrever direto:
 * cada hook faz a mudança no documento original e o log de auditoria
 * no mesmo batch, então os dois só existem juntos ou nenhum dos dois.
 */

export type AcaoAuditoria =
  | "created"
  | "updated"
  | "archived"
  | "cancelled"
  | "reversed"
  | "paid"
  | "received"
  | "reconciled"
  | "closed_month";

export interface AuditLogInput {
  action: AcaoAuditoria;
  entityType: string;
  entityId: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export function anexarAuditLog(
  batch: WriteBatch,
  uid: string,
  actorEmail: string | null | undefined,
  entrada: AuditLogInput
) {
  const ref = doc(collection(db, "usuarios", uid, "audit_logs"));
  batch.set(
    ref,
    semUndefined({
      ...entrada,
      actorUid: uid,
      ...(actorEmail ? { actorEmail } : {}),
      createdAt: Date.now(),
    })
  );
}
