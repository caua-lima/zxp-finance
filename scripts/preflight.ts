/**
 * Preflight de ambiente e acesso (auditoria 25/10 A01).
 *
 *   npm run ops:preflight
 *
 * Diz ONDE você está (remote, branch, SHA, projeto Firebase, Vercel), se
 * as ferramentas servem (Node, Java do emulador) e se as variáveis e o
 * acesso ao banco estão em ordem. Nunca imprime valor de variável nem
 * token. Sai com código 1 quando há bloqueio — incluindo projeto ambíguo,
 * que não é coisa pra adivinhar.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { diagnosticarAmbiente } from "../src/lib/configAmbiente";
import { obterDocumento } from "../src/lib/firestoreRest";

type Linha = { item: string; estado: "ok" | "aviso" | "bloqueio" | "info"; detalhe: string };
const linhas: Linha[] = [];
const add = (item: string, estado: Linha["estado"], detalhe: string) => linhas.push({ item, estado, detalhe });

function rodar(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

async function main() {
  // git
  const remote = rodar("git remote get-url origin");
  const branch = rodar("git branch --show-current");
  const sha = rodar("git rev-parse --short HEAD");
  const sujo = rodar("git status --porcelain");
  add("git", remote ? "ok" : "aviso", `${remote ?? "sem remote"} · ${branch ?? "?"} @ ${sha ?? "?"}${sujo ? " · com mudanças não commitadas" : ""}`);

  // ferramentas
  const node = Number(process.versions.node.split(".")[0]);
  add("node", node >= 20 ? "ok" : "bloqueio", `v${process.versions.node} (precisa 20+)`);
  const java = rodar("java -version 2>&1");
  const versaoJava = java?.match(/version "(\d+)/)?.[1];
  add(
    "java (emulador)",
    versaoJava && Number(versaoJava) >= 21 ? "ok" : "aviso",
    versaoJava ? `${versaoJava} (emulador do Firebase pede 21+)` : "não encontrado — sem testes de regras locais"
  );

  // projeto Firebase: .firebaserc x variáveis
  const rc = existsSync(".firebaserc") ? JSON.parse(readFileSync(".firebaserc", "utf8")) : null;
  const padrao: string | undefined = rc?.projects?.default;
  const doEnv = process.env.FIREBASE_PROJECT_ID?.trim();
  const publico = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const ids = new Set([padrao, doEnv, publico].filter(Boolean));
  if (ids.size === 0) add("projeto Firebase", "bloqueio", "nenhum projeto definido (.firebaserc ou variáveis)");
  else if (ids.size > 1) add("projeto Firebase", "bloqueio", `ambíguo: .firebaserc=${padrao ?? "-"}, servidor=${doEnv ?? "-"}, cliente=${publico ?? "-"}`);
  else add("projeto Firebase", "ok", [...ids][0] as string);

  // Vercel
  const vercel = existsSync(".vercel/project.json");
  add("vercel", vercel ? "ok" : "info", vercel ? "projeto vinculado nesta pasta" : "pasta não vinculada (deploy segue pelo GitHub)");

  // variáveis (presença/formato, sem valor)
  const d = diagnosticarAmbiente(process.env);
  for (const b of d.bloqueios) add("variável", "bloqueio", b);
  for (const a of d.avisos) add("variável", "aviso", a);
  add("recursos ligados", "info", d.recursosAtivos.join(", ") || "nenhum");

  // acesso ao banco com operação segura: ler um documento que não existe
  if (!d.bloqueios.some((b) => b.startsWith("FIREBASE_"))) {
    try {
      await obterDocumento("_preflight/ping");
      add("acesso ao Firestore", "ok", "leitura com a service account autorizada");
    } catch (e) {
      add("acesso ao Firestore", "bloqueio", `sem leitura: ${e instanceof Error ? e.message.replace(/Bearer\s+\S+/g, "Bearer ***") : "erro"}`);
    }
  }

  // regras e índices versionados
  add("firestore.rules", existsSync("firestore.rules") ? "ok" : "bloqueio", "versionado no repositório");
  add("firestore.indexes.json", existsSync("firestore.indexes.json") ? "ok" : "aviso", existsSync("firestore.indexes.json") ? "versionado" : "não versionado ainda");

  const larg = Math.max(...linhas.map((l) => l.item.length));
  const marca = { ok: "✓", aviso: "!", bloqueio: "✗", info: "·" };
  for (const l of linhas) console.log(`${marca[l.estado]} ${l.item.padEnd(larg)}  ${l.detalhe}`);
  const bloqueios = linhas.filter((l) => l.estado === "bloqueio").length;
  console.log(bloqueios ? `\n${bloqueios} bloqueio(s).` : "\nSem bloqueios.");
  process.exit(bloqueios ? 1 : 0);
}

main();
