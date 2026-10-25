# Execução da auditoria de 25/10/2026 — preparação para a mentoria

Especificação: [`docs/auditoria-2026-10-25.md`](auditoria-2026-10-25.md). Branch: `feat/mentoria-ready`
(criada a partir de `auditoria-2026-09-30` @ `1f6a54f`, que tem 33 commits ainda fora da `main`).

Estados: **feito** (código + teste no mesmo commit), **parcial** (o que falta está escrito),
**já resolvido** (evidência no HEAD, item remapeado), **bloqueado** (depende de algo externo — dito o quê),
**pendente**.

Separação exigida pela auditoria: *implementado* ≠ *validado localmente* ≠ *validado em staging* ≠
*ativo em produção*. Nada aqui está ativo em produção até a seção "Release" dizer o SHA publicado.

## Revalidação do HEAD antes de começar

| Achado | Situação no HEAD `1f6a54f` |
|---|---|
| S01 dependências | `npm audit`: next 16.0.0–16.4.0 (critical), @grpc/grpc-js ≤1.13.5 (high, via firebase), source-map-js, zod (high) |
| S02 revogação por `iat` | Confirmado em `verificarChamador.ts`/`autorizacao.ts` |
| S11 CI só na main | Confirmado em `.github/workflows/ci.yml` |
| N01–N05 | Confirmados em `src/lib/notificacoes/servidor.ts` |
| F01 ganho não entra no saldo | Confirmado — era regra de produto ("saldo isolado de ganhos"); a auditoria pede contrato único |
| U03 "investido em você" | Confirmado em `src/lib/abundancia.ts` (pedido explícito do dono em 18/10) |
| Java do emulador | 21.0.12 local — o bloqueio da auditoria (Java 17) não se aplica aqui |

## Itens

| # | Item | Estado | Commit | Evidência / teste |
|---|---|---|---|---|
| A01 | Preflight de ambiente e acesso | feito | 488f1f3 | `npm run ops:preflight` rodado com a config real: projeto único, leitura no Firestore ok, nenhum valor impresso |
| A02 | Dependências vulneráveis | feito | 421cb27 | audit 4 → 0 (next 16.4.3; grpc-js por override, sem rebaixar firebase); build, 287 testes e 27 de regras |
| A03 | CI na branch + cancelamento | feito | 11ba123 | push em feat/** dispara CI; `concurrency` cancela o run superado |
| A04 | Ambiente isolado de browser test | feito | b78f617 | Playwright + emuladores, job `e2e` no CI com trace em falha |
| A05 | Jornadas novo usuário e A/B | feito | 12ee9af | 5 testes de navegador passando localmente; acharam bug real do parser (eec065a) |
| A06 | Revogação por `auth_time` | feito | b737827 | teste: autenticou 100, revogada 150, token renovado 200 → rejeitada; nova sessão 160 → aceita |
| A07 | Contrato de configuração em runtime | feito | 485c345 | VAPID malformada vira "push indisponível", não exceção; segredo em NEXT_PUBLIC bloqueia |
| A08 | Saúde operacional redigida | feito | 05af12e | `/api/admin/saude` (só admin); agendador × entregas × configuração separados; consulta indexada b6fb903 |

**Gate A:** baseline preservado (todos os testes anteriores passando); CI na branch; audit 0; acesso
isolado demonstrado no navegador (contas A/B). *Validado localmente; CI remoto: ver PR #1.*

Extra fora da lista: `.firebaserc` com o projeto padrão (c8e7551) — o deploy de regras falhava com
"No currently active project".
