/**
 * Bootstrap de admin da plataforma via custom claim (auditoria S01).
 *
 *   node --env-file=.env.local --import tsx scripts/definir-admin.ts <uid>
 *   node --env-file=.env.local --import tsx scripts/definir-admin.ts <uid> --remover
 *
 * Grava `admin: true` no token do usuário com a service account — o
 * cliente não tem como fazer isso sozinho. A pessoa precisa sair e entrar
 * de novo pra o token novo valer. Alternativa sem script: ADMIN_UIDS.
 */
import { definirClaimAdmin, consultarConta } from "../src/lib/usuariosFirebase";

async function main() {
  const uid = process.argv[2];
  const remover = process.argv.includes("--remover");
  if (!uid || !/^[A-Za-z0-9]{10,128}$/.test(uid)) throw new Error("Informe o UID do usuário.");
  const conta = await consultarConta(uid);
  if (!conta.existe) throw new Error("Esse UID não existe.");
  await definirClaimAdmin(uid, !remover);
  console.log(remover ? `Admin removido de ${uid}.` : `${uid} agora é admin da plataforma.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
