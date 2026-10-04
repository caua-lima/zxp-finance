# Operação do ZXP Finance

Como configurar, publicar, migrar, desfazer e diagnosticar. Complementa
`docs/modelo-financeiro.md` (regras de dinheiro) e
`docs/auditoria-2026-09-30.md` (o que motivou cada mudança).

## Variáveis de ambiente

Nenhum segredo vai em `NEXT_PUBLIC_*`, log, fixture ou documentação.

| Variável | Onde | Pra quê |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | cliente | Config pública do Firebase (não é segredo) |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | servidor | Service account: rotas de API, cron, scripts |
| `ADMIN_UIDS` | servidor | **UIDs de admin da plataforma**, separados por vírgula. Sem isso, ninguém é admin e `/api/usuarios` responde 403 pra todos (deny-by-default). |
| `CRON_SECRET` | servidor | A Vercel manda no `Authorization` do cron |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | cliente/servidor | Web Push. Trocar a chave VAPID invalida todas as inscrições — cada aparelho precisa reativar. |
| `ANTHROPIC_API_KEY` | servidor | Consultor. Sem ela, o Consultor responde 503 (desligado). |
| `CONSULTOR_DESLIGADO=1` | servidor | Desliga o Consultor sem remover a chave |
| `TASKS_API_URL`, `TASKS_FINANCE_BRIDGE_SECRET` | servidor | Ponte com o ZXP Tasks |
| `TASKS_BRIDGE_UIDS` | servidor | UIDs liberados pra ponte (ela não tem vínculo por cliente — ver auditoria S06) |

### Admin da plataforma (bootstrap)

Duas formas, as duas fora do alcance do cliente:

1. **`ADMIN_UIDS`** na Vercel (recomendado pra 1–2 admins).
2. **Custom claim**: `node --env-file=.env.local --import tsx scripts/definir-admin.ts <uid>`
   (grava `admin: true` via service account; `--remover` tira). O usuário
   precisa sair e entrar de novo pra o token novo valer.

Nunca por documento do Firestore — o cliente escreve no próprio workspace.

## Deploy

1. `npm ci && npm run lint && npx tsc --noEmit && npm test && npm run test:regras && npm run build`
2. **Backup**: `node --env-file=.env.local --import tsx scripts/backup.ts`
   (formato 2: guarda o tipo de cada campo; `restaurar.ts` recusa backup antigo sem tipos)
3. **Dry-run da migração**: `node --env-file=.env.local --import tsx scripts/migracao-v2.ts`
   — o saldo pela regra antiga e pela nova tem que bater (ou a diferença estar explicada).
4. Publicar **as regras** junto com o código: `npx firebase-tools deploy --only firestore:rules`
   (as regras novas exigem o formato novo de gravação; código antigo com regra nova quebra
   o cadastro de push — publique os dois juntos).
5. Configurar `ADMIN_UIDS` antes: sem ela, a tela Acesso some e a API responde 403.
6. Conferir `/api/cdi` e o cron (seção abaixo).

### Rollback

- Código: voltar o deploy da Vercel pro anterior.
- Regras: `git checkout <commit-anterior> -- firestore.rules && npx firebase-tools deploy --only firestore:rules`.
- Dados: a migração v2 **não reescreve documento** (o código lê o formato antigo). Se algo
  for gravado errado depois, `scripts/restaurar.ts <backup>` (dry-run) e `--aplicar`: cada
  documento divergente volta inteiro ao estado do backup; documento criado depois do backup
  não é apagado (decida à mão). O ciclo backup → estrago → restauração é ensaiado no
  emulador por `npm run test:restauracao` (tipos conferidos um a um).
- Gravações feitas entre o deploy e o rollback ficam no formato novo, que o código antigo
  ignora campo a campo (ex.: `data`, `afetaSaldo`) — não quebram, só deixam de ser usadas.

## Cron de notificações

- `vercel.json`: `0 11 * * *` (8h em Brasília), rota `/api/cron/notificacao-diaria`.
- A Vercel pode **pular ou duplicar** execução e não tenta de novo sozinha. O app aguenta:
  - duplicada: ids determinísticos, nada repete;
  - pulada: vencimentos usam faixa de dias, o aviso sai no dia seguinte; entregas pendentes
    são retentadas na próxima execução; avisos vencidos expiram sem envio.
- Resposta HTTP **500** quando houve falha (usuário com erro, VAPID inválida ou push não
  configurado) — configure alerta na Vercel pra rota.
- Cada execução grava `execucoesNotificacao/<dia>__<início>` com contadores: eventos,
  notificações criadas, entregas criadas, tentativas, **aceitas pelo provedor**, reagendadas,
  falhas, expiradas, inscrições encerradas, incidentes de configuração, duração.
- "Aceita" = o serviço de push do navegador recebeu. **Não** significa que apareceu na tela.
- Precisão: o plano Hobby da Vercel roda cron uma vez por dia com janela de até 1h. Pra
  prometer horário ou SLO, contratar plano/infra com agendamento mais preciso e medir por
  30 dias antes (auditoria, SLO proposto).

Executar manualmente (staging):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/notificacao-diaria
```

## Diagnóstico de push

1. `/notificacoes` → "Este aparelho": o estado vem do servidor, pra conta logada.
2. "Testar este aparelho": cria um aviso de teste e tenta o push agora. Resultados:
   - *aceito pelo provedor* → se não aparecer, é o sistema do aparelho silenciando o app;
   - *inscrição expirou* → reativar;
   - *provedor não respondeu* → retentativa automática.
3. iPhone/iPad: só recebe com o app **instalado na Tela de Início** (iOS 16.4+), aberto por lá.
4. Coleções (só leitura pelo cliente): `pushInscricoes`, `entregas` (status, tentativas,
   último status HTTP — nunca endpoint ou chave em log).
5. Tudo que não chegou por push fica na central (`notificacoes`).

## Testes

| Comando | O que cobre |
|---|---|
| `npm test` | Regras financeiras e de notificação (puras): contrato de saldo, parser, previsões, vigência, autorização, retry, SSRF |
| `npm run test:regras` | Emulador: regras do Firestore (A/B, campos, mês fechado, auditoria só-acréscimo) e servidor de notificações (idempotência, retry, 410, VAPID, expiração, troca de dono, cota) |
| `npm run test:restauracao` | Emulador (Auth + Firestore): backup, dry-run, restauração e dry-run zerado, com tipos preservados |
| `npm run dev:emulador` | App inteiro com Auth + Firestore locais e usuários sintéticos (`scripts/dev-emulador.mjs`) |

**O que os testes NÃO provam** (checklist manual pendente, com aparelho real):
entrega de push em iPhone instalado e Android; comportamento com o app fechado; logout
offline seguido de outro login no mesmo aparelho; zoom 200% e leitor de tela nos fluxos
principais.

## Pendências conhecidas do modelo

- Dinheiro em reais com arredondamento em cada total (`arredondarCentavos`); migrar pra
  centavos inteiros no banco é a próxima etapa.
- Leituras de histórico completo (gastos, pagamentos) no cliente e no cron — medir custo com
  12–24 meses de dados sintéticos antes de abrir pra muitos clientes (auditoria O02).
- Cobrança do SaaS e integração bancária (Mercado Pago) não implementadas — ver seção 8 da
  auditoria. O CDI do BCB é só estimativa, não sincroniza saldo nem cofrinho.
