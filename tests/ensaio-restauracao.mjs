/**
 * Ensaio de rollback de dados (auditoria O04, matriz de aceite 17):
 * backup → estrago → dry-run → restauração → dry-run zerado, conferindo
 * campo a campo e TIPO a tipo (timestamp, double, inteiro, mapa).
 *
 *   npm run test:restauracao
 *
 * Só emulador (Auth + Firestore, projeto demo-zxp), usuários sintéticos.
 */
import { execSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";

const P = "demo-zxp";
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const FS = process.env.FIRESTORE_EMULATOR_HOST;
const base = `http://${FS}/v1/projects/${P}/databases/(default)/documents`;
const H = { "Content-Type": "application/json", Authorization: "Bearer owner" };

async function usuario(email) {
  const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "senha-sintetica-1", returnSecureToken: true }),
  });
  return (await r.json()).localId;
}
const doc = (campos) => ({ fields: Object.fromEntries(Object.entries(campos).map(([k, v]) =>
  [k, typeof v === "number" ? { doubleValue: v } : typeof v === "string" ? { stringValue: v } :
    { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([a, b]) => [a, { doubleValue: b }])) } }])) });
const gravar = (c, d) => fetch(`${base}/${c}`, { method: "PATCH", headers: H, body: JSON.stringify(doc(d)) });
const ler = async (c) => (await fetch(`${base}/${c}`, { headers: H })).json();

const a = await usuario("a@sintetico.local");
const b = await usuario("b@sintetico.local");
await gravar(`usuarios/${a}/saldo/atual`, { valor: 1200.5, atualizadoEm: 1759000000000 });
await gravar(`usuarios/${a}/gastos/g1`, { descricao: "almoço", valor: 32.5, mes: "2026-09", guardado: { viagem: 0.1 } });
await gravar(`usuarios/${a}/gastos/g2`, { descricao: "uber", valor: 18.9, mes: "2026-09" });
await gravar(`usuarios/${b}/contasFixas/c1`, { nome: "Internet", valor: 100 });
// tipos que o backup antigo estragava: timestamp do servidor e double inteiro (100.0)
await fetch(`${base}/usuarios/${a}/pagamentos/p1`, { method: "PATCH", headers: H, body: JSON.stringify({ fields: {
  valor: { doubleValue: 100 }, registradoEm: { timestampValue: "2026-09-30T11:00:00Z" }, pagoEm: { integerValue: "1759230000000" } } }) });
const caminhos = [`usuarios/${a}/saldo/atual`, `usuarios/${a}/gastos/g1`, `usuarios/${a}/gastos/g2`, `usuarios/${b}/contasFixas/c1`, `usuarios/${a}/pagamentos/p1`];
const cru = async (c) => JSON.stringify((await ler(c)).fields);
const antes = await Promise.all(caminhos.map(cru));

const env = { ...process.env, FIREBASE_PROJECT_ID: P, GCLOUD_PROJECT: P };
const rodar = (cmd) => execSync(cmd, { env, encoding: "utf8" });
const pasta = "backups-ensaio";
rmSync(pasta, { recursive: true, force: true });
console.log(rodar(`node --import tsx scripts/backup.ts ${pasta}`));
const arquivo = `${pasta}/${readdirSync(pasta)[0]}`;

// estrago: apaga um gasto, altera o saldo e o valor da conta de B
await fetch(`${base}/usuarios/${a}/gastos/g2`, { method: "DELETE", headers: H });
await gravar(`usuarios/${a}/saldo/atual`, { valor: 0, atualizadoEm: 1759000000001 });
await gravar(`usuarios/${b}/contasFixas/c1`, { nome: "Internet", valor: 999 });
await gravar(`usuarios/${a}/gastos/g1`, { descricao: "almoço", valor: 32.5, mes: "2026-09", guardado: { viagem: 0.1 }, categoria: "intrusa" });
await fetch(`${base}/usuarios/${a}/pagamentos/p1`, { method: "DELETE", headers: H });

console.log("--- dry-run depois do estrago");
console.log(rodar(`node --import tsx scripts/restaurar.ts ${arquivo}`));
console.log("--- aplicar");
console.log(rodar(`node --import tsx scripts/restaurar.ts ${arquivo} --aplicar`));
console.log("--- dry-run depois de restaurar");
const final = rodar(`node --import tsx scripts/restaurar.ts ${arquivo}`);
console.log(final);

const depois = await Promise.all(caminhos.map(cru));
const ok = caminhos.every((c, k) => {
  const igual = antes[k] === depois[k];
  if (!igual) console.log(`DIVERGE ${c}
  antes  ${antes[k]}
  depois ${depois[k]}`);
  return igual;
}) && /Dry-run: 0 documento/.test(final);
rmSync(pasta, { recursive: true, force: true });
console.log(ok ? "ENSAIO OK: dados voltaram ao backup" : "ENSAIO FALHOU");
process.exit(ok ? 0 : 1);
