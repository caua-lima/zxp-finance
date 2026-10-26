/**
 * Gastos: estorno com mês fechado e concorrência, no emulador com as
 * regras do Firestore ligadas (auditoria 25/10 D25/D26).
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { initializeTestEnvironment, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc, Firestore } from "firebase/firestore";
import { estornarGasto, removerGasto, idDoEstorno } from "../src/lib/gastosOperacoes";

let env: RulesTestEnvironment;
let db: Firestore;
const UID = "alunoA";

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-zxp",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
after(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  db = env.authenticatedContext(UID).firestore() as unknown as Firestore;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const adm = ctx.firestore();
    await setDoc(doc(adm, `usuarios/${UID}/monthCloses/2026-09`), { month: "2026-09", status: "closed" });
    await setDoc(doc(adm, `usuarios/${UID}/gastos/g1`), {
      descricao: "jantar", valor: 300, categoria: "Alimentação", mes: "2026-09", data: "2026-09-20", criadoEm: 1,
      guardado: { c1: 0.1 },
    });
    await setDoc(doc(adm, `usuarios/${UID}/caixinhas/c1`), { nome: "Viagem", saldo: 10, porGasto: 0.1, ativa: true, depositos: 1, criadoEm: 1, atualizadoEm: 1 });
  });
});

describe("estorno de gasto de mês fechado (D25)", () => {
  test("cria a compensação no mês atual, sem editar o original fechado", async () => {
    const r = await estornarGasto(db, UID, "g1", "2026-10-25", new Set(["c1"]));
    assert.equal(r, "ok");
    const original = (await getDoc(doc(db, `usuarios/${UID}/gastos/g1`))).data();
    assert.equal(original?.estornado, undefined);
    const estorno = (await getDoc(doc(db, `usuarios/${UID}/gastos/${idDoEstorno("g1")}`))).data();
    assert.equal(estorno?.valor, -300);
    assert.equal(estorno?.mes, "2026-10");
    assert.equal(estorno?.estornoDeId, "g1");
    assert.equal((await getDoc(doc(db, `usuarios/${UID}/caixinhas/c1`))).data()?.saldo, 9.9);
  });

  test("estornar de novo, ou em duas abas ao mesmo tempo, gera um estorno só", async () => {
    const [a, b] = await Promise.all([
      estornarGasto(db, UID, "g1", "2026-10-25", new Set(["c1"])),
      estornarGasto(db, UID, "g1", "2026-10-25", new Set(["c1"])),
    ]);
    assert.deepEqual([a, b].sort(), ["ja", "ok"]);
    assert.equal(await estornarGasto(db, UID, "g1", "2026-10-25", new Set(["c1"])), "ja");
    assert.equal((await getDoc(doc(db, `usuarios/${UID}/caixinhas/c1`))).data()?.saldo, 9.9);
  });
});

describe("exclusão com a referência lida dentro da transação (D26)", () => {
  const ref = (atualizadoEm: number) =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `usuarios/${UID}/saldo/atual`), { valor: 1000, atualizadoEm });
    });

  test("par gasto/estorno do mesmo lado sai junto; caixinha só volta sem estorno", async () => {
    await ref(0); // referência antiga: original e estorno depois dela
    assert.equal(await estornarGasto(db, UID, "g1", "2026-10-25", new Set(["c1"])), "ok");
    // mês de setembro precisa estar aberto pra apagar o original
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `usuarios/${UID}/monthCloses/2026-09`), { month: "2026-09", status: "open" });
    });
    assert.equal(await removerGasto(db, UID, "g1", null, new Set(["c1"])), "ok");
    assert.equal((await getDoc(doc(db, `usuarios/${UID}/gastos/g1`))).exists(), false);
    assert.equal((await getDoc(doc(db, `usuarios/${UID}/gastos/${idDoEstorno("g1")}`))).exists(), false);
  });

  test("saldo atualizado ENTRE o gasto e o estorno: a exclusão do par é recusada", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `usuarios/${UID}/monthCloses/2026-09`), { month: "2026-09", status: "open" });
    });
    await ref(0);
    assert.equal(await estornarGasto(db, UID, "g1", "2026-10-25", new Set(["c1"])), "ok");
    // saldo informado em 01/10: o gasto (20/09) fica antes, o estorno (25/10) depois
    await ref(Date.parse("2026-10-01T12:00:00-03:00"));
    assert.equal(await removerGasto(db, UID, "g1", null, new Set(["c1"])), "lados_diferentes");
    assert.equal((await getDoc(doc(db, `usuarios/${UID}/gastos/g1`))).exists(), true);
  });
});
