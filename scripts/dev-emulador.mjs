/**
 * App rodando contra os EMULADORES do Firebase, com usuário e dados
 * sintéticos — pra testar telas e fluxos de ponta a ponta sem tocar em
 * produção nem usar conta de ninguém.
 *
 *   npm run dev:emulador        → http://localhost:3100
 *
 * Contas de teste (só existem no emulador, somem ao desligar):
 *   teste@zxp.local   / senha-de-teste-123   (cliente comum)
 *   admin@zxp.local   / senha-de-teste-123   (admin da plataforma)
 */
import { spawn } from "node:child_process";

const PROJETO = process.env.GCLOUD_PROJECT ?? "demo-zxp";
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const FS = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8089";
const SENHA = "senha-de-teste-123";

async function criarUsuario(email) {
  const r = await fetch(
    `http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: SENHA, returnSecureToken: true }),
    }
  );
  const j = await r.json();
  if (!j.localId) throw new Error(`Falha ao criar ${email}: ${JSON.stringify(j)}`);
  return j.localId;
}

function valor(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(valor) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valor(x)])) } };
}

async function gravar(caminho, dados) {
  const r = await fetch(`http://${FS}/v1/projects/${PROJETO}/databases/(default)/documents/${caminho}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, valor(v)])) }),
  });
  if (!r.ok) throw new Error(`Falha ao gravar ${caminho}: ${r.status}`);
}

function hoje() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

async function semear() {
  const uid = await criarUsuario("teste@zxp.local");
  const admin = await criarUsuario("admin@zxp.local");
  const dia = hoje();
  const mes = dia.slice(0, 7);
  const agora = Date.now();
  const u = `usuarios/${uid}`;

  await gravar(`${u}/saldo/atual`, { valor: 1200, atualizadoEm: agora - 3 * 3600_000, reservaMeta: 100, percentualCdi: 100 });
  await gravar(`${u}/contasFixas/internet`, { nome: "Internet", valor: 100, categoria: "Internet", ativa: true, diaVencimento: 10, criadoEm: agora - 90 * 86400_000 });
  await gravar(`${u}/contasFixas/celular`, { nome: "Plano de celular", valor: 54.99, categoria: "Internet", ativa: true, diaVencimento: 15, criadoEm: agora - 90 * 86400_000 });
  await gravar(`${u}/parcelas/carro`, { tipo: "financiamento", nome: "Carro", valorParcela: 997, totalParcelas: 48, parcelasRestantes: 25, mesReferencia: mes, criadoEm: agora - 90 * 86400_000 });
  await gravar(`${u}/parcelas/notebook`, { tipo: "cartao", nome: "Notebook", valorParcela: 239.62, totalParcelas: 10, parcelasRestantes: 7, naFatura: true, cartao: "Nubank CNPJ", mesReferencia: mes, criadoEm: agora - 90 * 86400_000 });
  await gravar(`${u}/cartoesConfig/Nubank CNPJ`, { nome: "Nubank CNPJ", diaVencimento: 5, diaFechamento: 29, limite: 6000 });
  await gravar(`${u}/ganhos/salario`, { tipo: "recorrente", ativo: true, descricao: "Salário", valor: 2600, criadoEm: agora - 90 * 86400_000 });
  await gravar(`${u}/gastos/g1`, { descricao: "almoço", valor: 32.5, categoria: "Alimentação", mes, data: dia, criadoEm: agora - 3600_000 });
  await gravar(`${u}/gastos/g2`, { descricao: "uber", valor: 18.9, categoria: "Transporte", mes, data: dia, criadoEm: agora - 1800_000 });
  await gravar(`${u}/comissoes/${dia}`, { data: dia, mes, reunioes: 6, vendasPerformance: 1, vendasAcelera: 0, valorTotal: 102, criadoEm: agora, atualizadoEm: agora });
  await gravar(`${u}/caixinhas/viagem`, { nome: "Viagem", saldo: 700, porGasto: 0.1, meta: 3000, ativa: true, depositos: 12, percentualCdi: 100, criadoEm: agora, atualizadoEm: agora });
  await gravar(`${u}/notificacoes/vencimento__demo`, { tipo: "vencimento", titulo: "Fatura Nubank CNPJ vence em 3 dias", corpo: "R$ 239,62.", url: "/fatura", diaLocal: dia, validoAte: agora + 86400_000, criadaEm: agora });

  console.log(`\nEmulador pronto. Usuário comum: teste@zxp.local · admin: admin@zxp.local (senha de teste no arquivo).`);
  return { admin };
}

const { admin } = await semear();

const next = spawn("npx", ["next", "dev", "-p", "3100"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    NEXT_PUBLIC_EMULADOR: "1",
    NEXT_PUBLIC_FIREBASE_API_KEY: "fake-api-key",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-zxp.firebaseapp.com",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJETO,
    NEXT_PUBLIC_FIREBASE_APP_ID: "demo",
    ADMIN_UIDS: admin,
    ANTHROPIC_API_KEY: "",
    TASKS_BRIDGE_UIDS: "",
  },
});
next.on("exit", (codigo) => process.exit(codigo ?? 0));
