/**
 * Baixa de parcela no emulador, com as regras ligadas: "A pagar" e a tela
 * de Parcelas usam a mesma operação e mostram sempre o mesmo.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { initializeTestEnvironment, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc, Firestore } from "firebase/firestore";
import { baixaDasParcelasDaFatura, marcarParcelaPaga, idPagamentoParcela } from "../src/lib/parcelasOperacoes";

let env: RulesTestEnvironment;
let db: Firestore;
const UID = "alunoA";
const carro = () => doc(db, "usuarios", UID, "parcelas", "carro");
const curso = () => doc(db, "usuarios", UID, "parcelas", "curso");
const estado = async (ref = carro()) => {
  const d = (await getDoc(ref)).data()!;
  return [d.parcelasRestantes, d.mesReferencia];
};
const pagamento = (mes: string) => getDoc(doc(db, "usuarios", UID, "pagamentos", idPagamentoParcela(mes, "carro")));

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
  await setDoc(carro(), {
    tipo: "financiamento", nome: "Carro", valorParcela: 900, totalParcelas: 48,
    parcelasRestantes: 40, mesReferencia: "2026-11", dividida: false, naFatura: false, criadoEm: 1,
  });
  await setDoc(curso(), {
    tipo: "cartao", nome: "Treinamento", valorParcela: 239.62, totalParcelas: 10,
    parcelasRestantes: 7, mesReferencia: "2026-12", dividida: false, naFatura: true, cartao: "Nubank CNPJ", criadoEm: 1,
  });
});

describe("baixa de parcela (A pagar = Parcelas)", () => {
  test("marcar paga em novembro: grava o pagamento e a próxima vira dezembro", async () => {
    await marcarParcelaPaga(db, UID, "carro", "2026-11", true, 900);
    assert.deepEqual(await estado(), [39, "2026-12"]);
    const pag = await pagamento("2026-11");
    assert.equal(pag.data()?.valor, 900);
    assert.equal(pag.data()?.afetaSaldo, true);
  });

  test("marcar duas vezes não dá baixa dupla", async () => {
    await marcarParcelaPaga(db, UID, "carro", "2026-11", true, 900);
    await marcarParcelaPaga(db, UID, "carro", "2026-11", true, 900);
    assert.deepEqual(await estado(), [39, "2026-12"]);
  });

  test("desmarcar desfaz a baixa e o pagamento", async () => {
    await marcarParcelaPaga(db, UID, "carro", "2026-11", true, 900);
    await marcarParcelaPaga(db, UID, "carro", "2026-11", false, 900);
    assert.deepEqual(await estado(), [40, "2026-11"]);
    assert.equal((await pagamento("2026-11")).exists(), false);
  });

  test("parcela dentro da fatura: pagar a fatura dá baixa; desmarcar desfaz", async () => {
    await baixaDasParcelasDaFatura(db, UID, ["curso"], "2026-12", true);
    assert.deepEqual(await estado(curso()), [6, "2027-01"]);
    await baixaDasParcelasDaFatura(db, UID, ["curso"], "2026-12", false);
    assert.deepEqual(await estado(curso()), [7, "2026-12"]);
  });

  test("parcela dentro da fatura não gera pagamento próprio (o dinheiro sai pela fatura)", async () => {
    await marcarParcelaPaga(db, UID, "curso", "2026-12", true, 239.62);
    assert.deepEqual(await estado(curso()), [6, "2027-01"]);
    const pag = await getDoc(doc(db, "usuarios", UID, "pagamentos", idPagamentoParcela("2026-12", "curso")));
    assert.equal(pag.exists(), false);
  });
});
