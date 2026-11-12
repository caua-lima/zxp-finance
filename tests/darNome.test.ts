/**
 * "Dar nome" a um lançamento do banco, no emulador: escopo "todos" renomeia
 * os do mesmo destinatário e grava o apelido; "só este" mexe só nele; mês
 * fechado nunca é mexido.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { gravarJuntas, obterDocumento } from "../src/lib/firestoreRest";
import { darNome } from "../src/lib/pluggy/darNome";

const PROJETO = process.env.GCLOUD_PROJECT ?? "demo-zxp";
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const UID = "dono";
const base = `usuarios/${UID}`;

const gasto = (id: string, mes: string, contraparte: string, extra: object = {}) => ({
  caminho: `${base}/gastos/${id}`,
  dados: {
    descricao: "Igor Juan Da Silva Lopes", nomeBanco: "Igor Juan Da Silva Lopes", valor: 3, categoria: "Outros",
    mes, data: `${mes}-08`, criadoEm: 1, origem: "banco", contraparte, ...extra,
  },
});
const ler = async (id: string) => (await obterDocumento<{ descricao: string; categoria: string }>(`${base}/gastos/${id}`))!;

beforeEach(async () => {
  await fetch(`http://${HOST}/emulator/v1/projects/${PROJETO}/databases/(default)/documents`, { method: "DELETE" });
  await gravarJuntas([
    gasto("a", "2026-11", "igor"),
    gasto("b", "2026-11", "igor"),
    gasto("c", "2026-10", "igor"),
    gasto("d", "2026-11", "outro"),
    { caminho: `${base}/monthCloses/2026-10`, dados: { status: "closed" } },
  ]);
});

describe("dar nome a um destinatário do banco", () => {
  test("este e os próximos: renomeia os do mesmo destinatário (mês aberto) e grava o apelido", async () => {
    const r = await darNome(UID, { colecao: "gastos", id: "a", descricao: "BEER IGOR", categoria: "Lazer", escopo: "todos" });
    assert.deepEqual(r, { ok: true, atualizados: 2, ignoradosMesFechado: 1, apelidoSalvo: true });
    assert.deepEqual([(await ler("a")).descricao, (await ler("b")).descricao], ["BEER IGOR", "BEER IGOR"]);
    assert.equal((await ler("b")).categoria, "Lazer");
    assert.equal((await ler("c")).descricao, "Igor Juan Da Silva Lopes"); // outubro fechado
    assert.equal((await ler("d")).descricao, "Igor Juan Da Silva Lopes"); // outro destinatário
    const apelido = await obterDocumento<{ descricao: string; categoria: string; nomeBanco: string }>(`${base}/apelidos/igor`);
    assert.deepEqual([apelido?.descricao, apelido?.categoria, apelido?.nomeBanco], ["BEER IGOR", "Lazer", "Igor Juan Da Silva Lopes"]);
  });

  test("só este: muda um, não grava apelido", async () => {
    const r = await darNome(UID, { colecao: "gastos", id: "a", descricao: "Cerveja sexta", categoria: null, escopo: "este" });
    assert.deepEqual(r, { ok: true, atualizados: 1, ignoradosMesFechado: 0, apelidoSalvo: false });
    assert.equal((await ler("b")).descricao, "Igor Juan Da Silva Lopes");
    assert.equal(await obterDocumento(`${base}/apelidos/igor`), null);
  });

  test("lançamento de mês fechado ou que não veio do banco é recusado", async () => {
    const fechado = await darNome(UID, { colecao: "gastos", id: "c", descricao: "X", categoria: null, escopo: "todos" });
    assert.equal(fechado.ok, false);
    await gravarJuntas([{ caminho: `${base}/gastos/manual`, dados: { descricao: "almoço", valor: 10, mes: "2026-11", criadoEm: 1 } }]);
    const manual = await darNome(UID, { colecao: "gastos", id: "manual", descricao: "X", categoria: null, escopo: "todos" });
    assert.equal(manual.ok, false);
  });
});
