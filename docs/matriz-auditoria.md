# Matriz da auditoria de 30/09/2026

Achado → correção → onde → como foi verificado. Branch `auditoria-2026-09-30`.
Status: **Feito** (implementado e verificado por teste ou execução), **Parcial**
(o que falta está escrito), **Pendente** (não implementado), **Externo**
(depende de configuração/aparelho fora do repositório).

Testes citados: `unit` = `npm test` (200), `regras` = `npm run test:regras` (26, emulador),
`restauração` = `npm run test:restauracao` (emulador), `E2E manual` = app no emulador
(`npm run dev:emulador`) operado pelo navegador em 360/390/768/1440 px.

## Segurança e operação SaaS

| Achado | Correção | Arquivos | Verificação | Status |
|---|---|---|---|---|
| S01 admin global alcançável | Admin só por `ADMIN_UIDS` ou claim `admin` (deny-by-default); não suspende/apaga a si; tela Acesso escondida pra cliente | `src/lib/autorizacao.ts`, `verificarChamador.ts`, `api/usuarios/**`, `api/admin/status`, `useModulos.ts`, `Nav.tsx`, `scripts/definir-admin.ts` | unit "autorização (S01/S05)"; curl no emulador: anônimo 401, cliente 403 em GET/POST/PATCH/DELETE, admin 200 | Feito |
| S02 dependências com alerta | next/eslint-config-next 16.3.7 fixos, `npm audit fix`, firebase-tools fora das deps | `package.json`, `package-lock.json` | `npm audit` → 0 vulnerabilidades | Feito |
| S03 regras sem invariantes | Regras por coleção: campos permitidos, tipos, limites, `momento()` pra timestamps, subcoleção desconhecida negada | `firestore.rules` | regras: isolamento A/B, validação, legado editável, regressão de timestamp | Feito (publicar é com você) |
| S04 auditoria alterável | `audit_logs` só-acréscimo com ator = próprio uid; auditoria de admin em `auditoriaPlataforma` (só servidor) | `firestore.rules`, `verificarChamador.ts` | regras "trilha só-acréscimo" | Parcial: o cliente ainda escreve a própria trilha (não reescreve, mas pode omitir) |
| S05 verificação de token incompleta | Checa `exp/iat/auth_time`, revogação (`tokensValidAfterTime`), conta desativada | `googleAuth.ts`, `autorizacao.ts`, `verificarChamador.ts` | unit; E2E: suspender cliente derruba o token já emitido (403); token forjado 401 | Feito |
| S06 ponte Tasks sem identidade por cliente | Liberada só pra `TASKS_BRIDGE_UIDS`; resto 403 | `api/desejos-em-aberto/route.ts` | curl 403 | Parcial: vínculo por cliente com o Tasks não existe |
| S07 entrada e custo sem limite | Corpo ≤16 KB, validação de campos, cota diária do Consultor (30), timeout/max_tokens na Anthropic, 503 sem chave ou com `CONSULTOR_DESLIGADO` | `validacao.ts`, `cota.ts`, `anthropicClient.ts`, `api/consultor/route.ts` | regras "cota diária" (emulador); curl 503 | Feito |
| S08 endpoint push do cliente | Allowlist de hosts de push, chaves validadas, inscrição só via API do servidor | `notificacoes/regras.ts`, `servidor.ts`, `api/push/*` | unit "segurança do push"; curl: endpoint arbitrário recusado | Feito |
| S09 cabeçalhos HTTP | X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, CSP em Report-Only | `next.config.ts` | curl dos cabeçalhos | Parcial: CSP ainda não bloqueia (Report-Only) |
| S10 excluir login ≠ excluir cliente | Exclusão idempotente de dados + login + inscrições; exportação JSON | `contaCliente.ts`, `api/usuarios/[uid]`, `api/conta/exportar` | E2E: exportar 200 JSON | Parcial: exclusão completa não exercitada contra o emulador |
| S11 ciclo comercial | Suspensão existe; cobrança, plano e trial não | — | — | Pendente |

## Integridade financeira

| Achado | Correção | Arquivos | Verificação | Status |
|---|---|---|---|---|
| F01 gasto descontado duas vezes | Um contrato de saldo (`saldoConfirmado`, `orcamentoDoDia`) usado pela tela, chat, Consultor e notificação | `finance/saldo.ts`, `docs/modelo-financeiro.md` | unit F01 (matriz 5: 100 − 30 no último dia não vira 40); E2E: "pode gastar hoje" 1.048,60 | Feito |
| F02 curva usa saldo atual como inicial | `projetarSaldoAteFimDoMes` parte do saldo de referência | `calculations.ts` | unit "curva de caixa (F02)" | Feito |
| F03 pago não vira movimento | Pagamento guarda data real e `afetaSaldo`; entra no saldo uma vez | `usePagamentos.ts`, `saldo.ts` | unit F03 (matriz 6); E2E: pagar Internet desconta 100 | Feito |
| F04 estorno concorrente | Estorno em transação com id determinístico `estorno__<id>` | `useGastos.ts` | Sem teste automatizado de concorrência | Parcial |
| F05 apagar par estorno/original | Aviso do efeito no saldo antes de apagar; `exclusaoDoParMudaSaldo` | `saldo.ts`, `saldo/page.tsx` | unit F05 (matriz 4) | Feito |
| F06 parser errado e sem data | Regex nova, pt-BR (`1.500,50`), `ontem`/`anteontem`, pré-visualização | `parseGastoTexto.ts`, `chat/page.tsx` | unit F06 (matriz 9); E2E "ontem café 15.50" | Feito |
| F07/F08/F09/F10 rendimento mexe no saldo | CDI vira só estimativa; nada grava rendimento; falha do BCB visível com nova tentativa | `rendimento.ts`, `useCdi.ts` (removido `useRendimentoAutomatico.ts`) | unit "rendimento pelo CDI (só estimativa)" (matriz 7); E2E: estimativa aparece, saldo não muda | Feito |
| F11 recorrência reescreve histórico | Vigência (`inicioEm`, `desativadaEm`, `historicoValores`) | `recorrencia.ts`, `adapters.ts`, `useContasFixas.ts`, `useAssinaturas.ts` | unit F11 (matriz 8) | Feito |
| F12 data de pagamento descartada | `pagoEm` real, `DataPagamento` | `usePagamentos.ts`, `adapters.ts` | unit F03 | Feito |
| F13 comissão por correspondência frouxa | Recebimento ligado por `origemComissao`; parcial mostra resíduo | `comissaoPrevista.ts`, `comissoes/page.tsx` | unit "comissão prevista" | Feito |
| F14 fatura prevista some | Prevista "a confirmar" pra mês atual e futuros, nunca vermelha como atrasada | `faturaPrevista.ts`, `adapters.ts`, `checklist/page.tsx` | unit "fatura prevista"; E2E | Feito |
| F15 Consultor com orçamento incompleto | Contexto com saldo confirmado, compromissos por mês, imposto do cliente; sem saldo não opina | `contextoFinanceiro.ts`, `simulador.ts` | unit "simulador de viabilidade" | Feito |
| F16 caixinha sem cobertura | O que vai pra caixinha sai do saldo junto do gasto (`saidaDoGasto`) | `saldo.ts`, `useGastos.ts` | unit "caixinhas", F01; E2E caixinha +0,10 | Feito |
| F17 relógio do cliente decide o saldo | Data efetiva do gasto decide; `registradoEm` do servidor gravado | `saldo.ts`, `auditoria.ts` | unit F01 | Parcial: empate no mesmo dia da referência ainda usa `criadoEm` do aparelho |
| — dinheiro em centavos inteiros | — | — | — | Pendente (arredonda por total hoje) |

## Notificações

| Achado | Correção | Arquivos | Verificação | Status |
|---|---|---|---|---|
| N01 inscrição segue identidade errada | Aparelho tem um dono só (`pushAparelhos`), logout revoga, troca de conta transfere | `servidor.ts`, `pushNavegador.ts`, `AuthContext` | regras/emulador "troca de dono"; E2E logout | Feito no emulador; Externo: aparelho real |
| N02 "ativo" ≠ funciona | Estado vem do servidor; botão "Testar este aparelho" | `api/push/status`, `api/push/teste`, `notificacoes/page.tsx` | emulador | Feito; Externo: push real |
| N03 falha some, reexecução duplica | Ids determinísticos, retry com backoff/jitter e `Retry-After`, 404/410 encerra, 401/403 incidente | `regras.ts`, `servidor.ts` | unit "idempotência", "política de falha"; emulador: rodar 2× → 3 e depois 0 | Feito |
| N04 serial, sem checkpoint | Concorrência 4, paginação de usuários, erro de um não para os outros, execução registrada | `api/cron/notificacao-diaria` | emulador; E2E cron 2× | Parcial: sem checkpoint no meio da execução (reexecução é segura por idempotência) |
| N05 fronteira de mês | Vencimentos de mês anterior/atual/seguinte, faixas 5/1/0 dias | `eventos.ts` | unit N05 (matriz 14) | Feito |
| N06 feito pra um perfil | Preferências por tipo; comissão opt-in | `regras.ts`, `useNotificacoes.ts` | unit "preferências" | Feito |
| N07 conteúdo exposto | Push genérico por padrão (`detalhesNoPush: false`), rota validada no SW | `regras.ts`, `public/sw.js` | unit "segurança do push" | Feito |
| N08 métrica não prova entrega | Contadores por execução; "aceita pelo provedor" separado de "exibida" | `execucoesNotificacao`, `docs/operacao.md` | E2E: execução "com_problemas" + HTTP 500 sem VAPID | Feito; Externo: alerta na Vercel |

## Usabilidade

| Achado | Correção | Arquivos | Verificação | Status |
|---|---|---|---|---|
| U01 login | Rótulos, autocomplete, mostrar senha, recuperar senha sem revelar conta, erro de rede | `login/page.tsx` | E2E árvore de acessibilidade | Feito |
| U02 diálogos | `Dialogo` com foco preso, Esc, foco devolvido; não fecha se salvar falhar | `Dialogo.tsx`, `ConfirmModal.tsx`, `saldo/page.tsx` | E2E teclado (Mais, Esc, foco) | Feito |
| U03 contraste e texto pequeno | Texto fraco 5,4–5,9:1; mínimo `text-xs`; zoom liberado; menos movimento | `globals.css`, telas, `layout.tsx` | contraste medido no navegador | Parcial: zoom 200% e leitor de tela não testados |
| U04 navegação do fundador | Abas Início/Gastos/A pagar/[Comissões ou Metas]/Mais; comissões e admin por módulo | `Nav.tsx`, `useModulos.ts` | E2E cliente sem Acesso | Feito |
| U05 registro rápido perde texto | Pré-visualização, chave de idempotência, trava; falha mantém o cartão pra tentar de novo | `chat/page.tsx` | E2E | Parcial: rascunho não sobrevive a sair da tela |
| U06 estado não isolado | Dispensas por uid (7 dias), `key` por uid, push por dono | `FinanceActionCenter.tsx`, `(app)/layout.tsx` | E2E | Feito |
| — alvos de toque | ≥44 px nos botões pequenos | vários componentes | medição no navegador | Feito |
| — sem conexão | Faixa "sem conexão" | `SemConexao.tsx` | E2E | Feito |

## Escala, manutenção e SaaS

| Achado | Correção | Arquivos | Verificação | Status |
|---|---|---|---|---|
| O01 testes nas fronteiras | 200 unitários, 26 no emulador, ensaio de restauração, CI com Java | `finance.test.ts`, `tests/*`, `.github/workflows/ci.yml` | comandos acima | Parcial: E2E automatizado (Playwright) não existe |
| O02 leitura do histórico inteiro | — | — | — | Pendente: medir com 12–24 meses sintéticos |
| O03 premissas fixas | Imposto, início do histórico, comissões e cartões por cliente; onboarding | `useConfigApp.ts`, `ConfiguracoesConta.tsx`, `useCartoesConfig.ts`, `(app)/page.tsx` | unit "configuração por cliente" | Parcial: cartões pré-cadastrados ainda aparecem por padrão |
| O04 migração conciliável | `migracao-v2.ts` dry-run (rodado nos dados reais só leitura: saldo antigo = novo), backup tipado, restauração | `scripts/*`, `firestoreRest.ts` | restauração: backup → estrago → dry-run 5 → aplicar → dry-run 0, tipos idênticos | Feito |
| — cobrança, Mercado Pago, SLO | — | — | — | Pendente |

## Matriz de aceite (seção 9)

| # | Resultado |
|---|---|
| 1 | Feito (regras + curl) |
| 2 | Feito (suspensão → 403 e cron pula conta desativada) |
| 3 | Parcial: idempotência por chave/id; sem teste concorrente real |
| 4, 5, 6, 8, 9 | Feito (unit) |
| 7 | Feito (unit + E2E) |
| 10 | Parcial: online testado no emulador; logout offline e push enfileirado em aparelho real, não |
| 11 | Parcial: estados de permissão no código; iOS instalado/não instalado não testado |
| 12, 13, 14, 15 | Feito (unit + emulador) |
| 16 | Parcial: 360/390/768/1440, teclado, foco, rótulos, contraste; zoom 200% e leitor de tela não |
| 17 | Feito (dry-run real só leitura + ensaio de restauração no emulador) |
