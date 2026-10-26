/**
 * Testes das regras do Firestore no emulador (auditoria S03/S04, F11,
 * matriz de aceite 1 e 8). Roda com:
 *
 *   npm run test:regras
 *
 * que sobe o emulador do Firestore (projeto de demonstração, sem tocar em
 * produção) e executa este arquivo. Usuários sintéticos: A e B.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
} from "firebase/firestore";

let env: RulesTestEnvironment;

const gastoValido = {
  descricao: "almoço",
  valor: 30,
  categoria: "Alimentação",
  mes: "2026-10",
  data: "2026-10-02",
  criadoEm: 1,
};

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-zxp",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const dbDe = (uid: string) => env.authenticatedContext(uid).firestore();
const anonimo = () => env.unauthenticatedContext().firestore();

describe("isolamento entre clientes (matriz 1)", () => {
  test("A lê e escreve os próprios gastos", async () => {
    const db = dbDe("userA");
    await assertSucceeds(setDoc(doc(db, "usuarios/userA/gastos/g1"), gastoValido));
    await assertSucceeds(getDoc(doc(db, "usuarios/userA/gastos/g1")));
  });

  test("A não lê nem escreve nada de B", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "usuarios/userB/gastos/g1"), gastoValido);
    });
    const db = dbDe("userA");
    await assertFails(getDoc(doc(db, "usuarios/userB/gastos/g1")));
    await assertFails(setDoc(doc(db, "usuarios/userB/gastos/g2"), gastoValido));
    await assertFails(deleteDoc(doc(db, "usuarios/userB/gastos/g1")));
    await assertFails(getDoc(doc(db, "usuarios/userB/saldo/atual")));
  });

  test("anônimo não lê nada", async () => {
    await assertFails(getDoc(doc(anonimo(), "usuarios/userA/gastos/g1")));
  });

  test("coleções do servidor são inacessíveis pro navegador", async () => {
    const db = dbDe("userA");
    await assertFails(getDoc(doc(db, "auditoriaPlataforma/x")));
    await assertFails(setDoc(doc(db, "auditoriaPlataforma/x"), { a: 1 }));
    await assertFails(setDoc(doc(db, "limitesUso/userA__consultor__2026-10-01"), { usos: 0 }));
    await assertFails(setDoc(doc(db, "pushAparelhos/x"), { uid: "userA" }));
    // inscrição de push é cadastrada só pela API do servidor
    await assertFails(
      setDoc(doc(db, "usuarios/userA/pushInscricoes/x"), { endpoint: "https://evil.local" })
    );
    // notificação é gerada pelo servidor
    await assertFails(setDoc(doc(db, "usuarios/userA/notificacoes/n1"), { titulo: "fake" }));
  });

  test("subcoleção desconhecida é negada", async () => {
    await assertFails(setDoc(doc(dbDe("userA"), "usuarios/userA/qualquerCoisa/x"), { a: 1 }));
  });
});

describe("validação de campos (S03)", () => {
  test("recusa valor não numérico, NaN, absurdo e campo extra", async () => {
    const db = dbDe("userA");
    const ref = doc(db, "usuarios/userA/gastos/g1");
    await assertFails(setDoc(ref, { ...gastoValido, valor: "30" }));
    await assertFails(setDoc(ref, { ...gastoValido, valor: Number.NaN }));
    await assertFails(setDoc(ref, { ...gastoValido, valor: 5_000_000 }));
    await assertFails(setDoc(ref, { ...gastoValido, admin: true }));
    await assertFails(setDoc(ref, { ...gastoValido, mes: "outubro" }));
  });

  test("gasto no crédito: aceita 'credito' com cartão, recusa forma inventada", async () => {
    const db = dbDe("userA");
    await assertSucceeds(
      setDoc(doc(db, "usuarios/userA/gastos/c1"), { ...gastoValido, pagoCom: "credito", cartao: "Nubank CNPJ" })
    );
    await assertFails(setDoc(doc(db, "usuarios/userA/gastos/c2"), { ...gastoValido, pagoCom: "fiado" }));
  });

  test("saldo: só o documento 'atual', com número de verdade", async () => {
    const db = dbDe("userA");
    await assertSucceeds(setDoc(doc(db, "usuarios/userA/saldo/atual"), { valor: 100, atualizadoEm: 1 }));
    await assertFails(setDoc(doc(db, "usuarios/userA/saldo/outro"), { valor: 100, atualizadoEm: 1 }));
    await assertFails(
      setDoc(doc(db, "usuarios/userA/saldo/atual"), { valor: "muito", atualizadoEm: 1 })
    );
  });

  test("documento antigo com campo legado continua editável", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "usuarios/userA/parcelas/p1"), {
        tipo: "cartao",
        nome: "Impressora",
        valorParcela: 63.4,
        totalParcelas: 10,
        parcelasRestantes: 6,
        cartaoId: "legado",
        criadoEm: 1,
      });
    });
    await assertSucceeds(
      updateDoc(doc(dbDe("userA"), "usuarios/userA/parcelas/p1"), { parcelasRestantes: 5 })
    );
  });
});

describe("trilha de auditoria só-acréscimo (S04)", () => {
  test("cria com o próprio usuário como ator, mas não edita nem apaga", async () => {
    const db = dbDe("userA");
    const ref = await assertSucceeds(
      addDoc(collection(db, "usuarios/userA/audit_logs"), {
        action: "updated",
        entityType: "gasto",
        entityId: "g1",
        summary: "x",
        actorUid: "userA",
        createdAt: 1,
      })
    );
    await assertFails(updateDoc(ref, { summary: "reescrito" }));
    await assertFails(deleteDoc(ref));
  });

  test("não dá pra registrar auditoria em nome de outro", async () => {
    await assertFails(
      addDoc(collection(dbDe("userA"), "usuarios/userA/audit_logs"), {
        action: "updated",
        actorUid: "userB",
        createdAt: 1,
      })
    );
  });
});

describe("mês fechado (F11, matriz 8)", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "usuarios/userA/monthCloses/2026-09"), { month: "2026-09", status: "closed" });
      await setDoc(doc(db, "usuarios/userA/gastos/antigo"), { ...gastoValido, mes: "2026-09" });
    });
  });

  test("não cria, não edita e não apaga gasto de mês fechado", async () => {
    const db = dbDe("userA");
    await assertFails(setDoc(doc(db, "usuarios/userA/gastos/novo"), { ...gastoValido, mes: "2026-09" }));
    await assertFails(updateDoc(doc(db, "usuarios/userA/gastos/antigo"), { valor: 1 }));
    await assertFails(deleteDoc(doc(db, "usuarios/userA/gastos/antigo")));
    // mover pra um mês aberto também não vale (sairia do mês fechado)
    await assertFails(updateDoc(doc(db, "usuarios/userA/gastos/antigo"), { mes: "2026-10" }));
  });

  test("mês aberto segue normal", async () => {
    await assertSucceeds(setDoc(doc(dbDe("userA"), "usuarios/userA/gastos/novo"), gastoValido));
  });

  test("reabrir exige motivo", async () => {
    const ref = doc(dbDe("userA"), "usuarios/userA/monthCloses/2026-09");
    await assertFails(updateDoc(ref, { status: "open" }));
    await assertFails(updateDoc(ref, { status: "open", motivoReabertura: "" }));
    await assertSucceeds(updateDoc(ref, { status: "open", motivoReabertura: "lancei a fatura errada" }));
  });
});

describe("notificações (N01/N07)", () => {
  test("você só pode marcar como lida — não reescreve o conteúdo", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "usuarios/userA/notificacoes/n1"), {
        titulo: "Fatura vence amanhã",
        criadaEm: 1,
      });
    });
    const ref = doc(dbDe("userA"), "usuarios/userA/notificacoes/n1");
    // timestamp de verdade (Date.now(), na casa do trilhão) — o teste antigo
    // usava 123 e deixou passar uma regra que recusava qualquer data real
    await assertSucceeds(updateDoc(ref, { lidaEm: Date.now() }));
    await assertFails(updateDoc(ref, { lidaEm: "ontem" }));
    await assertFails(updateDoc(ref, { titulo: "outra coisa" }));
    await assertFails(deleteDoc(ref));
    await assertFails(getDoc(doc(dbDe("userB"), "usuarios/userA/notificacoes/n1")));
  });
});

describe("pagamento com data real (regressão: timestamp em ms)", () => {
  test("marcar conta como paga agora é aceito; valor negativo e data inválida não", async () => {
    const db = dbDe("userA");
    const base = { mes: "2026-10", origem: "conta", itemId: "c1", nome: "Internet", valor: 100, afetaSaldo: true };
    await assertSucceeds(setDoc(doc(db, "usuarios/userA/pagamentos/2026-10__conta__c1"), { ...base, pagoEm: Date.now() }));
    await assertFails(setDoc(doc(db, "usuarios/userA/pagamentos/2026-10__conta__c2"), { ...base, itemId: "c2", pagoEm: 5 }));
    await assertFails(setDoc(doc(db, "usuarios/userA/pagamentos/2026-10__conta__c3"), { ...base, itemId: "c3", valor: -1, pagoEm: Date.now() }));
  });
});

describe("concessão de acesso (mentoria B09)", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "acessos/userA"), { estado: "ativo", versao: 1 });
      await setDoc(doc(ctx.firestore(), "acessos/userB"), { estado: "suspenso", versao: 1 });
    });
  });

  test("lê a própria concessão, não a dos outros", async () => {
    await assertSucceeds(getDoc(doc(dbDe("userA"), "acessos/userA")));
    await assertFails(getDoc(doc(dbDe("userA"), "acessos/userB")));
    await assertFails(getDoc(doc(anonimo(), "acessos/userA")));
  });

  test("ninguém se reativa, se promove ou cria a própria concessão", async () => {
    await assertFails(updateDoc(doc(dbDe("userB"), "acessos/userB"), { estado: "ativo" }));
    await assertFails(setDoc(doc(dbDe("userC"), "acessos/userC"), { estado: "ativo" }));
    await assertFails(setDoc(doc(dbDe("userA"), "plataforma/config"), { exigirConcessao: false }));
    await assertFails(setDoc(doc(dbDe("userA"), "convites/x"), { turmaId: "t" }));
    await assertFails(getDoc(doc(dbDe("userA"), "turmas/t1")));
  });
});

describe("concessão aplicada nos dados (mentoria B10)", () => {
  const exigir = async (sim: boolean) =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "plataforma/config"), { exigirConcessao: sim });
    });
  const conceder = async (uid: string, dados: Record<string, unknown>) =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `acessos/${uid}`), { estado: "ativo", inicioEm: 0, fimEm: null, versao: 1, ...dados });
    });

  test("transição (chave desligada): sem concessão, tudo como antes", async () => {
    await exigir(false);
    await assertSucceeds(setDoc(doc(dbDe("semConcessao"), "usuarios/semConcessao/gastos/g1"), gastoValido));
  });

  test("exigindo: ativa passa; sem concessão, suspensa e vencida não", async () => {
    await exigir(true);
    await conceder("ativa", {});
    await conceder("suspensa", { estado: "suspenso" });
    await conceder("vencida", { fimEm: Date.now() - 60_000 });
    await conceder("futura", { inicioEm: Date.now() + 86_400_000 });
    await assertSucceeds(setDoc(doc(dbDe("ativa"), "usuarios/ativa/gastos/g1"), gastoValido));
    await assertSucceeds(getDoc(doc(dbDe("ativa"), "usuarios/ativa/gastos/g1")));
    for (const uid of ["semNada", "suspensa", "vencida", "futura"]) {
      await assertFails(setDoc(doc(dbDe(uid), `usuarios/${uid}/gastos/g1`), gastoValido));
      await assertFails(getDoc(doc(dbDe(uid), `usuarios/${uid}/saldo/atual`)));
    }
  });

  test("bloqueada ainda lê a própria concessão (pra tela explicar o motivo)", async () => {
    await exigir(true);
    await conceder("suspensa", { estado: "suspenso" });
    await assertSucceeds(getDoc(doc(dbDe("suspensa"), "acessos/suspensa")));
  });
});

describe("recebido que entra no saldo (C19)", () => {
  test("ganho avulso grava entrouNoSaldo e valorRecebido; pagamento de ganho com afetaSaldo", async () => {
    const db = dbDe("userA");
    await assertSucceeds(
      setDoc(doc(db, "usuarios/userA/ganhos/g1"), {
        tipo: "pontual", mes: "2026-10", descricao: "Freela", valor: 1000, criadoEm: 1,
        recebido: true, recebidoEm: Date.now(), entrouNoSaldo: true, valorRecebido: 940,
      })
    );
    await assertSucceeds(
      setDoc(doc(db, "usuarios/userA/pagamentos/2026-10__ganho__s1"), {
        mes: "2026-10", origem: "ganho", itemId: "s1", nome: "Salário", valor: 2444, pagoEm: Date.now(), afetaSaldo: true,
      })
    );
  });
});
