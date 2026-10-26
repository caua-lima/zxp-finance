/**
 * Caixinhas com concorrência de verdade no emulador, com as regras do
 * Firestore ligadas (auditoria 25/10 C22/C23).
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { initializeTestEnvironment, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc, updateDoc, increment, collection, getDocs, Firestore } from "firebase/firestore";
import { ajustarCaixinha, transferirCaixinha, ErroCaixinha } from "../src/lib/caixinhasOperacoes";

let env: RulesTestEnvironment;
let db: Firestore;
const UID = "alunoA";
const caixa = () => doc(db, "usuarios", UID, "caixinhas", "c1");
const saldoCaixa = async () => (await getDoc(caixa())).data()?.saldo as number;

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
  await setDoc(caixa(), { nome: "Viagem", saldo: 100, porGasto: 0.1, meta: null, ativa: true, depositos: 0, criadoEm: 1, atualizadoEm: 1 });
});

describe("caixinhas sob concorrência (C23)", () => {
  test("correção é diferença sobre o que a pessoa viu: depósito no meio é preservado", async () => {
    // a pessoa viu 100; antes de salvar, um registro guarda +0,10 automaticamente
    await updateDoc(caixa(), { saldo: increment(0.1), depositos: increment(1) });
    const r = await ajustarCaixinha(db, UID, "c1", 100, 120);
    assert.deepEqual(r, { base: 100, diferenca: 20 });
    assert.equal(Math.round((await saldoCaixa()) * 100), 12010);
  });

  test("guardar repetido com a mesma chave grava uma vez", async () => {
    assert.equal(await transferirCaixinha(db, UID, "c1", "guardar", 50, "k1"), true);
    assert.equal(await transferirCaixinha(db, UID, "c1", "guardar", 50, "k1"), false);
    assert.equal(await saldoCaixa(), 150);
    assert.equal((await getDocs(collection(db, "usuarios", UID, "transferencias"))).size, 1);
  });

  test("resgatar mais do que tem é recusado e nada muda", async () => {
    await assert.rejects(() => transferirCaixinha(db, UID, "c1", "resgatar", 100.01, "k2"), ErroCaixinha);
    assert.equal(await saldoCaixa(), 100);
  });

  test("duas transferências ao mesmo tempo: as duas valem", async () => {
    await Promise.all([
      transferirCaixinha(db, UID, "c1", "guardar", 30, "a"),
      transferirCaixinha(db, UID, "c1", "resgatar", 10, "b"),
    ]);
    assert.equal(await saldoCaixa(), 120);
    assert.equal((await getDocs(collection(db, "usuarios", UID, "transferencias"))).size, 2);
  });
});
