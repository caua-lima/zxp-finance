import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { diagnosticarAmbiente } from "./configAmbiente";

// valores sintéticos com o formato certo — nenhum é credencial real
const valido = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "AIza" + "x".repeat(35),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-zxp.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-zxp",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:123:web:abc123",
  FIREBASE_PROJECT_ID: "demo-zxp",
  FIREBASE_CLIENT_EMAIL: "sa@demo-zxp.iam.gserviceaccount.com",
  FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
  CRON_SECRET: "s".repeat(32),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "B".repeat(87),
  VAPID_PRIVATE_KEY: "p".repeat(43),
  VAPID_SUBJECT: "mailto:ops@exemplo.com",
};

describe("contrato das variáveis de ambiente", () => {
  test("tudo certo: sem bloqueio, push e agendamento ativos", () => {
    const d = diagnosticarAmbiente(valido);
    assert.deepEqual(d.bloqueios, []);
    assert.ok(d.recursosAtivos.includes("push"));
    assert.ok(d.recursosAtivos.includes("notificações agendadas"));
    assert.ok(!d.recursosAtivos.includes("Consultor"));
  });

  test("VAPID malformada desliga o push com motivo, sem vazar o valor", () => {
    const d = diagnosticarAmbiente({ ...valido, VAPID_PRIVATE_KEY: "curta-demais" });
    assert.ok(!d.recursosAtivos.includes("push"));
    const aviso = d.avisos.find((a) => a.startsWith("VAPID_PRIVATE_KEY"));
    assert.ok(aviso && /formato inválido/.test(aviso));
    assert.ok(!JSON.stringify(d).includes("curta-demais"));
  });

  test("obrigatória ausente bloqueia", () => {
    const { FIREBASE_PRIVATE_KEY, ...sem } = valido;
    void FIREBASE_PRIVATE_KEY;
    const d = diagnosticarAmbiente(sem);
    assert.ok(d.bloqueios.some((b) => b.startsWith("FIREBASE_PRIVATE_KEY ausente")));
  });

  test("projetos diferentes entre cliente e servidor bloqueiam", () => {
    const d = diagnosticarAmbiente({ ...valido, FIREBASE_PROJECT_ID: "outro-projeto" });
    assert.ok(d.bloqueios.some((b) => /projetos diferentes/.test(b)));
  });

  test("segredo em NEXT_PUBLIC bloqueia", () => {
    const d = diagnosticarAmbiente({ ...valido, NEXT_PUBLIC_VAPID_PRIVATE_KEY: "x" });
    assert.ok(d.bloqueios.some((b) => /NEXT_PUBLIC_VAPID_PRIVATE_KEY/.test(b)));
  });
});
