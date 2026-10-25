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
| A01 | Preflight de ambiente e acesso | pendente | | |
| A02 | Dependências vulneráveis | pendente | | |
| A03 | CI na branch + cancelamento | pendente | | |
| A04 | Ambiente isolado de browser test | pendente | | |
| A05 | Jornadas novo usuário e A/B | pendente | | |
| A06 | Revogação por `auth_time` | pendente | | |
| A07 | Contrato de configuração em runtime | pendente | | |
| A08 | Saúde operacional redigida | pendente | | |
