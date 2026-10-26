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

| B09 | Concessões de acesso | feito | c1837e0 | `acessos/{uid}` só do servidor; regras: ninguém lê a de outro nem se reativa (emulador) |
| B10 | Concessão aplicada na API e nas regras | feito | 488d7b5, 7853c78 | chave `plataforma/config.exigirConcessao`; emulador: sem concessão/suspensa/vencida/futura negadas no SDK direto; script de legado (simulação em produção: 1 login, nada gravado) |
| B11 | Convite de uso único com prazo | feito | d777667, 8c7b66a | token só no `#`, banco guarda sha256; emulador: 2º uso recusado, 2 aceites simultâneos → 1 |
| B12 | Jornada de aceite | feito | ce1a898 | navegador: link → conta → registro com exigência ligada; reuso "já foi usado"; expirado/cortado |
| B13 | Turmas sem expor finanças | feito | b528fbc | navegador: turma mostra "Ativo" e nenhum R$; API não lê coleção financeira |
| B14 | Renovar e suspender | feito | e4664be, 18a4dad | emulador: suspender cancela entregas pendentes, ações concorrentes sem perda; navegador: aluno vê "Acesso indisponível" e volta ao reativar |
| B15 | Lote com prévia | feito | a1e5e2b, aae907c | convite amarrado ao e-mail; navegador: prévia 2 novos/1 repetido/1 inválido → 2 links |
| B16 | Recuperação e troca de conta | feito | a41e6ee | sair recarrega em /login; "voltar" não reabre dados de A |

**Gate B:** aceite da mentoria com contas sintéticas (navegador); nenhuma concessão herdada por troca
de UID; migração dos usuários atuais por concessão "legado" sem virar admin. *Validado localmente
(emulador + navegador) e no CI do PR #1. Nada aplicado em produção: a chave `exigirConcessao` não
existe lá ainda — só ligar depois do lote I (release) com `scripts/concessoes-legado.ts --exigir`.*

| C17 | Contrato do dinheiro em centavos | feito | f5c813b | somas em centavos inteiros; 1,005 → 101; mil × 0,10 = 100,00; legado inválido vira 0 (nunca NaN). *Armazenamento em centavos fica pro lote I.* |
| C18 | Movimentos confirmados | feito (derivado) | 3c8739a | saldo = soma do `extratoDoSaldo` (registro/pagamento/recebimento/transferência). *Sem coleção-livro separada: o extrato é derivado dos documentos que já existem — trocar por livro gravado é migração do lote I* |
| C19 | Recebido entra no caixa uma vez | feito | 4affaa1 | navegador: salário 2.600 → +2.444 uma vez, desmarcar volta; conta antiga mantém escolha (desligado), conta por convite nasce ligada |
| C20 | Saldo de abertura sem reaplicar história | feito | ddcbfa2 | "Como chegamos nesse número": referência + cada movimento = saldo (navegador) |
| C21 | Reservas: definição | feito | 6d88596 | caixinha = dinheiro fora da conta; guardar/resgatar são transferência; total conservado (teste) |
| C22 | Guardar e resgatar | feito | 897936d | navegador: guardar 50 + resgatar 20 → caixinha +30, saldo −30; regras: transferência imutável |
| C23 | Ajuste e exclusão serializados | feito | b19dda7 | emulador: depósito concorrente preservado no ajuste; mesma chave 1×; excluir com saldo recusado |
| C24 | Confirmado × previsto | feito | f0c7e0e | Início sem "Sobra"; "Fim do mês (previsto)" com fórmula; navegador confere a conta |

**Gate C:** cenários de recebimento, gasto, reserva, resgate e ajuste com trilha e invariantes
(unitário + emulador + navegador). *Nenhum dinheiro real migrado.* Mudança de comportamento que o dono
precisa saber: com "Recebido entra no saldo" ligado, marcar ganho recebido soma o líquido ao saldo —
na conta dele fica desligado (como era) até ele ligar em Perfil.

Extra fora da lista: `.firebaserc` com o projeto padrão (c8e7551) — o deploy de regras falhava com
"No currently active project".
