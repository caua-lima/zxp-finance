# ZXP Finance — auditoria técnica e plano de execução para a mentoria

**Data:** 25 de outubro de 2026. **Repositório:** https://github.com/caua-lima/zxp-finance. **Aplicação:** https://financeiro-eight-beige.vercel.app/. **Commit examinado:** `c3831036b1c83934fc6c676a061280a724349dc3`.

**Objetivo:** preparar o aplicativo para ser entregue aos mentorados, com números compreensíveis, operação confiável, interface simples e notificações observáveis. Este documento contém a auditoria, critérios de aceitação, uma proposta de 88 entregas com commits e o prompt de execução para Claude Code.

## 1. Parecer e limites da auditoria

O projeto já tem uma base melhor do que um protótipo: separação de funções financeiras, regras de propriedade dos dados, proteção de administrador, testes, central persistente de notificações e scripts operacionais. **Eu não liberaria uma turma inteira antes de corrigir as falhas de entrega de notificações, revogação de sessão, consistência do dinheiro e fluxo de acesso.** O redesign deve acompanhar essas correções.

O pedido de “notificações 100%” deve virar uma garantia verificável do que o sistema controla: eventos persistidos, tentativas rastreáveis, retentativas executadas no prazo, avisos não perdidos silenciosamente e central acessível. A apresentação de um push pelo sistema operacional depende de permissão, dispositivo, conectividade e provedor; não é tecnicamente honesto prometer 100% de exibição.

Esta foi uma auditoria de código, dependências, configuração versionada, testes e superfície pública. A página publicada abriu em `/login`; observei sua interface e estrutura acessível. **Não havia sessão de mentorado para navegar nas páginas internas publicadas.** A análise dessas páginas é baseada no código, não em uma sessão de produção. Não executei exploração ofensiva, alterações no banco de produção, envio de notificações a usuários reais, convites, commits ou deploys nesta etapa. A execução solicitada está preparada para Claude Code.

Não foram inspecionados os valores secretos de produção, IAM, regras efetivamente publicadas, plano contratado, entregas reais em celulares, dados financeiros reais ou correspondência exata entre o deployment público e o SHA do repositório. Isso impede certificar “tudo funcionando” na produção. O plano inclui verificações para preencher essas lacunas com acessos autorizados.

### Evidência executada nesta auditoria

| Verificação | Resultado | Alcance |
|---|---|---|
| Clone e revisão do código | SHA acima identificado | Snapshot do repositório; pode diferir da produção |
| `npm ci --ignore-scripts` | Concluído | Instalação local, sem executar lifecycle scripts |
| `npm test` | **212 testes aprovados, 50 suítes** | Testes já existentes; não cobrem todos os riscos abaixo |
| `npm run lint` | Aprovado, saída 0 | Análise estática |
| Build de produção | Aprovado, saída 0 | Variáveis fictícias de CI; não valida credenciais ou serviços reais |
| `npm audit --json` | Saída 1; **8 pacotes sinalizados: 7 high e 1 critical** | Contagem de pacotes afetados, não oito exploits confirmados |
| Regras no emulador local | Bloqueado antes de executar | Java local 17; Firebase Tools instalado exige Java 21 |
| CI remoto do mesmo SHA | Dois jobs concluídos com sucesso | `verify` e `regras-e-notificacoes`, incluindo restauração no emulador |
| Navegação pública | Login renderizado | Não equivale a E2E autenticado |

CI consultado: https://github.com/caua-lima/zxp-finance/actions/runs/39182600193. Os resultados remotos são evidência daquele run, não execução local nova. Nenhum teste em dispositivo físico foi realizado por esta auditoria.

### O que preservar

- Regras de propriedade por UID e bloqueio padrão, em vez de reabrir acesso amplo.
- Verificação administrativa no servidor e ausência de cadastro público irrestrito.
- Cálculos financeiros compartilhados, já parcialmente centralizados.
- Distinção entre estimativa de rendimento e saldo real.
- Identificadores determinísticos para notificações e registro de entregas.
- Tratamento existente de 404/410, 429, 5xx e configuração VAPID inválida.
- Testes de regras, restauração e funções financeiras já existentes.
- Identidade visual ZXP e linguagem acolhedora, sem perder precisão financeira.

## 2. Achados priorizados e como comprovar a correção

Legenda: **P0** impede ampliar a distribuição; **P1** deve entrar na preparação para a turma; **P2** melhora experiência ou escala. “Confirmado no código” não significa incidente observado em produção. Riscos de concorrência abaixo foram identificados pelo fluxo de leitura e gravação; seus testes de falha devem ser adicionados na execução.

### Segurança, acesso e operação

**S01 — P0 — Dependências com alertas novos. Confirmado pela ferramenta.** `package.json`/lock usam Next `16.3.7`. O audit retornou alertas para Next, Firebase e dependências relacionadas, `source-map-js` e `zod`. O mecanismo sugeriu Next `16.4.3` no momento da consulta. Não executar `npm audit fix --force`: o relatório também propõe downgrade de Firebase para uma versão antiga, que não é uma decisão adequada sem análise.

Há dois detalhes importantes: o advisory de otimização de SVG admite mitigação com `sharp >=0.35.5`, e o instalado é `0.35.5`; o advisory de `use cache` depende de Cache Components e retornos específicos, não demonstrados neste app. Portanto, **não afirmo que o site tenha RCE explorável**. Atualizar para uma versão suportada corrigida, revisar caminhos alcançáveis e repetir build, regras, autenticação e browser tests. Guardar audit antes/depois e justificativas temporárias para dependências não alcançáveis, com prazo. Fontes primárias ao final.

**S02 — P0 — Revogação compara o instante errado do token. Confirmado no código.** `src/lib/verificarChamador.ts` chama `tokenRevogado(identidade.iat, conta.validSince)`; `src/lib/autorizacao.ts` compara emissão do ID token. A semântica de revogação de sessão deve usar `auth_time`, que representa a autenticação original. Propagar o campo validado ou usar a verificação oficial equivalente. Teste obrigatório: sessão autenticada em 100, revogada em 150, ID token emitido em 200 continua rejeitado; nova autenticação posterior é aceita. Não alterar apenas os nomes do parâmetro.

**S03 — P1 — Falta um ciclo de acesso específico da mentoria. Lacuna de produto.** Cadastro administrativo não resolve convite expirável, vínculo com turma, início/fim de acesso, suspensão, reativação e encerramento. Criar concessão de acesso no servidor, com estado e validade, e aplicar a mesma decisão nas APIs e nas Rules. O usuário não pode editar sua própria concessão. Usar UID como dono das finanças; turma é vínculo de acesso, não autorização para o mentor ler extratos. Definir política explícita de exportação/retensão após término; não apagar dados automaticamente só porque a mentoria acabou.

**S04 — P0 — Bloqueio da API não prova revogação imediata do Firestore. Risco de arquitetura.** `firestore.rules` verifica propriedade; uma sessão com token ainda válido pode continuar acessando caminhos permitidos sem passar por `verificarChamadorAtivo`. Incluir documento/estado de autorização protegido, ou mecanismo equivalente suportado, e testar token antigo, conta suspensa e acesso por SDK direto. Garantir também que um admin despromovido não mantenha capacidades indefinidamente por claim desatualizada.

**S05 — P1 — Validação desigual nas Rules. Confirmado no código.** Preferências e configurações têm contratos mais permissivos que os formulários; mapas como `guardado` e campos financeiros precisam de validação de tipo, limites e relacionamentos. Regex de data não valida calendário. Validar inteiros de parcelas, totais/restantes, datas reais, valores finitos, campos permitidos e tamanho. A API de cliente pode ser chamada sem a interface. Preservar migração de documentos legados: não bloquear a conta inteira porque um campo antigo falta.

**S06 — P1 — Auditoria append-only pode ser omitida pelo cliente. Confirmado no desenho.** `anexarAuditLog` é chamado pelo frontend; um cliente próprio pode gravar uma operação permitida sem produzir o log correspondente. Operações críticas devem passar por serviço transacional que gere evento e auditoria inseparáveis. O log não deve confiar em identidade, data e valores “antes” enviados pelo navegador. Não transformar cada mudança cosmética em evento financeiro.

**S07 — P1 — CSP está em Report-Only. Confirmado em `next.config.ts`.** Há proteção de iframe com X-Frame-Options, mas o CSP ainda não bloqueia conteúdo. Implantar coleta/inspeção de violações, corrigir allowlist e promover política compatível testada. Não trocar o header às cegas: Auth, Firestore, PWA e recursos Next precisam continuar funcionando. Não apresentar Report-Only como proteção já aplicada.

**S08 — P1 — Exclusão de conta não é uma tarefa durável.** `src/lib/contaCliente.ts` percorre coleções e dispositivos em sequência. Interrupção pode deixar restos; novas subcoleções podem ficar fora do inventário. Implementar job de exclusão com estado, cursor, retomada, bloqueio de novas gravações e inventário versionado. Autenticação recente, cancelamento quando aplicável e relatório sem dados pessoais. Backup tem retenção própria e não deve ser prometido como apagado instantaneamente.

**S09 — P0 — “Sem mexer no banco” ainda não existe como operação completa.** `scripts/migracao-v2.ts` é diagnóstico/dry-run, não um executor de migração de dados. `docs/operacao.md` ainda prevê ações manuais de Rules e variáveis. Criar bootstrap e release idempotentes, com preflight, backup, validação, aplicação, verificação e retomada. Credenciais existentes permitem automatizar; credenciais inexistentes não podem ser inventadas. Consolidar eventual ação de autenticação em um único bloqueio claro, continuar todo trabalho independente.

**S10 — P1 — Rollback de código pode mudar significado financeiro.** Código antigo que ignora `afetaSaldo` ou novos eventos pode exibir saldo diferente sem erro de compilação. Uma restauração “abriu a página” não basta. Testar contratos de leitura/escrita entre versões e fixtures de dinheiro. Preferir expandir esquema, migrar e só depois remover compatibilidade. Não restaurar Rules inseguras para resolver uma incompatibilidade.

**S11 — P1 — CI atual não roda em qualquer push de branch isolada.** `.github/workflows/ci.yml` recebe push em `main` e PR contra `main`. Para o plano de muitos commits: abrir PR draft desde o início ou adicionar o padrão da branch. CI do SHA exato, cancelamento de runs superados e artefatos por lote. Não contar push como evidência de funcionamento.

### Notificações e confiabilidade

**N01 — P0 — Aviso salvo pode ficar sem entrega para sempre. Confirmado no fluxo de `materializar`, em `src/lib/notificacoes/servidor.ts`.** O código cria a notificação; se ela já existe, faz `continue`; só depois cria entregas. Uma queda após salvar o aviso e antes de criar a entrega faz a reexecução pular o aviso. Implementar gravação atômica ou reconciliação que repare entregas ausentes independentemente de a inbox já existir. Respeitar limite de tamanho de transação/lote quando houver vários aparelhos. Teste: interromper exatamente nessa fronteira e verificar recuperação.

**N02 — P0 — Dois workers podem enviar a mesma entrega. Confirmado no fluxo.** `processarEntregas` lista `pendente`, envia e depois muda o status. Não há aquisição transacional, lease ou comparação de versão. Duas execuções podem selecionar a mesma entrega. Adotar claim transacional com vencimento e fencing token; somente o detentor pode finalizar. Um teste de reexecução sequencial não detecta a corrida: usar barreira para dois workers concorrentes. Se o provedor aceitar e a persistência falhar, ainda existe incerteza de entrega externa; usar tag estável para reduzir duplicatas visuais e documentar essa janela.

**N03 — P0 — Retentativa de minutos depende de executor diário. Confirmado em `vercel.json` e no worker.** O cron é `0 11 * * *`. Marcar `proximaTentativaEm` para minutos depois não executa uma tarefa. Quando o próximo cron roda, o evento diário pode ter expirado. Separar geração diária de processamento de fila; usar executor frequente/durável compatível com o plano realmente disponível. Não inserir cron de minuto em minuto sem conferir suporte e custo. A Vercel documenta ausência de retry automático e possibilidade de concorrência/duplicação.

**N04 — P0 — Cadastro e revogação de aparelho não são atômicos.** `cadastrarAparelho` lê dono, apaga vínculo anterior, verifica limite, grava inscrição e índice em passos separados. `revogarAparelho` também separa leitura e remoções. Duas sessões/abas podem deixar índice e inscrição discordantes; uma revogação atrasada pode afetar registro novo. Resolver ownership e geração com transação, pré-condição e testes A/B. Preservar limite real de aparelhos sob concorrência.

**N05 — P0 — O worker usa dono e preferências em snapshot antigo.** Inscrições são carregadas uma vez; preferências chegam como argumento. Apesar do comentário de rechecagem, não há nova leitura do dono global e da geração antes de cada envio. Campos `geracao`/`vapid` existem, mas não protegem a entrega. Associar entrega à geração e revalidar acesso, dono e permissão na aquisição/envio. Na corrida externa restante, minimizar conteúdo sensível no push; a central exige sessão. Teste: trocar A por B depois da seleção, antes da chamada ao provedor.

**N06 — P1 — Logout pode tratar revogação HTTP falha como sucesso.** `src/lib/pushNavegador.ts` não verifica `response.ok` e não define timeout. HTTP 500 permite seguir com unsubscribe e limpar o marcador; uma conexão pendurada pode atrasar logout. Usar timeout, distinguir falha de servidor, preservar estado mínimo necessário para reparo seguro e concluir logout local. O hook de reparo `usePushNotifications` aparece montado apenas em `/notificacoes`; mover reconciliação de sessão/aparelho para lifecycle global, sem solicitar permissão automaticamente.

**N07 — P1 — Cron pode exceder o tempo e não retomar corretamente.** A rota diária tem `maxDuration = 60`, pool de usuários e várias leituras por usuário, enquanto cada push pode aguardar 10 segundos. Não há cursor durável para retomar a fronteira de trabalho. Muitos usuários/aparelhos aumentam risco de ficar repetindo o começo. Paginar, limitar lotes por orçamento de tempo, persistir progresso e reprogramar continuação. Medir 100/1.000 usuários sintéticos; não declarar capacidade com base em testes unitários.

**N08 — P1 — Consultas de entregas leem histórico inteiro.** O worker lista a coleção para filtrar pendentes em memória. Criar consulta indexada por estado e horário, paginação e política de retenção de terminais. Não apagar pendentes só para baixar custo. Registrar leituras e backlog para planejar expansão.

**N09 — P1 — Vencimentos deixam tipos de obrigação de fora.** `eventosDeVencimento`, em `src/lib/notificacoes/eventos.ts`, aceita apenas `card_bill` e `fixed_cost`. Avaliar assinaturas e parcelas fora de cartão que também vencem, usando o catálogo único de compromissos. Para valores já incluídos na fatura, não mandar dois lembretes da mesma obrigação. Testar virada do mês, adiamento, mês curto, pagamento e cancelamento.

**N10 — P1 — Conteúdo pode envelhecer entre geração e envio.** O aviso persiste “vence em 5 dias” e pode ser reenviado dias depois; o worker não reconcilia o estado da obrigação, que pode ter sido paga. Persistir referência e versão do fato, recalcular texto no envio ou usar data absoluta, cancelar entregas quando quitado/cancelado. Preferência desligada deve cancelar futuras tentativas. A validade deve usar relógio atualizado, não apenas `agora` capturado no início de um lote longo.

**N11 — P1 — Central exibe apenas 60 itens e chama a operação de “todas”.** `src/lib/useNotificacoes.ts` limita a consulta; o total não lido e a marcação são calculados nesse recorte. Implementar paginação e contador correto, ou mudar o texto para “marcar as exibidas”. Para marcar todas, usar cursor/limite de leitura explícito e operação consistente. Testar mais de 60 avisos.

**N12 — P1 — Diagnóstico mistura saúde da execução com sucesso de entregas.** Um cron terminar sem exceção não significa que os avisos foram aceitos. Expor estados da inbox e delivery separadamente, último heartbeat, atraso do backlog, aceita/falha/expirada, erro de configuração e taxa por provedor sem endpoints/chaves. Não concluir que “se aceitou, o celular silenciou”: há outras causas entre provedor e exibição. Validar VAPID malformada com erro operacional registrado, não apenas variáveis ausentes.

**N13 — P2 — Preferências precisam refletir capacidade real.** O tipo `ritmo` permanece no modelo enquanto a geração foi retirada no modo abundância; não exibir controle sem efeito. Definir horário e fuso, frequência, dias silenciosos, conteúdo privado por padrão e opções com resultado claro. Não reinstalar alertas de limite contra a direção de produto atual sem explicar a mudança; permitir linguagem acolhedora configurável.

**N14 — P1 — Falta prova real por plataforma.** Testes de servidor aprovados não demonstram PWA instalada, service worker atualizado, abertura da rota correta, comportamento offline ou permissão negada. Automatizar o que o browser de CI suporta e manter ensaio real Android/iOS. Se não houver dispositivo acessível, registrar “não validado em dispositivo”; nunca substituir por resultado inventado. Se puder usar serviço de dispositivos já contratado/autorizado, automatizar ali.

### Correção financeira e dados

**F01 — P0 — Saldo confirmado tem saídas automáticas, mas não entradas equivalentes.** `src/lib/finance/saldo.ts` recebe referência, gastos e pagamentos, subtrai saídas e ignora pagamentos com `origem === "ganho"`. Marcar ganho como recebido não eleva esse saldo por esse caminho. Pode ser uma escolha de saldo manual, mas mistura modelos e exige intervenção não evidente. Definir contrato único: saldo inicial confirmado + entradas efetivadas − saídas efetivadas ± ajustes; previsões ficam fora. Migrar sem reaplicar receitas anteriores ao corte de referência. O usuário deve conseguir explicar cada centavo pelo extrato.

**F02 — P0 — Caixinhas não têm conservação de dinheiro completa.** `src/lib/useCaixinhas.ts` permite criar saldo, ajustar valor absoluto e excluir caixinha com saldo. Não registra transferência de origem/destino nessas operações. Depósitos automáticos têm integração com gastos, mas operações manuais não têm a mesma regra. Definir se são envelopes virtuais dentro de uma conta ou contas externas reais. Sugestão inicial: envelopes virtuais, com total da conta preservado, disponível = total − reservado. Não reinterpretar saldo legado silenciosamente. Ajustes e migração devem preservar referência e apontar ambiguidades; rendimentos estimados não viram patrimônio.

**F03 — P1 — Ajuste absoluto de caixinha pode sobrescrever depósito concorrente.** `ajustarSaldo` usa estado de React e batch com novo valor absoluto. Um depósito concorrente pode ser perdido como atualização. Usar transação/versionamento; correção explícita deve mostrar base e diferença. Excluir com saldo deve virar arquivamento ou transferência de saída identificada, não desaparecimento de dinheiro.

**F04 — P1 — Estorno e mês fechado têm conflito de políticas.** `useGastos.estornar` atualiza o original; Rules impedem mudar documento de mês fechado. Estornar agora um gasto fechado pode falhar. Criar evento compensatório no período atual, ligado ao original, sem editar história fechada; ou procedimento explícito de reabertura controlada. Testar estorno concorrente, duplicado e parcial se suportado. Não liberar escrita geral no mês para contornar.

**F05 — P1 — Proteções financeiras dependem parcialmente da interface.** Validação de exclusão em `useGastos` lê saldo/referência fora do batch; rebase concorrente pode mudar o resultado. Rules não verificam toda consistência de original/estorno. Transferir operações invariantes para transações/serviço e testar alteração concorrente de referência. Identificador idempotente deve impedir dois cliques ou retry de criar duas saídas.

**F06 — P1 — Fechamento não é histórico imutável completo.** `monthCloses` admite alterações mais amplas e recorrências podem mudar depois; relatórios vivos não são necessariamente reconstruídos do snapshot fechado. Formalizar fechamento versionado, com hash/versão e trilha de reabertura. Um ajuste de assinatura de novembro não deve mudar o DRE fechado de setembro. Não confundir cadastro vigente com fato ocorrido.

**F07 — P1 — Configuração global mutável pode divergir entre usuário e servidor.** `useConfigApp` altera globals de imposto, mês mínimo e início de uso; há fallback e caminho de erro sem reset equivalente. Passar configuração explicitamente para funções puras e limpar estado ao trocar UID. O cron não carrega todas as mesmas preferências de aplicação usadas no navegador. Testar A com taxa diferente de B, erro de leitura e sessão trocada. Para perfil pessoal não presumir imposto empresarial padrão sem confirmação; migrar preferências existentes sem sobrescrever.

**F08 — P1 — Valores monetários seguem em reais com ponto flutuante.** Há arredondamento, mas uma evolução do livro de movimentos pede inteiros em centavos, moeda e validação de faixa segura. Fazer conversão versionada com leitura compatível, arredondamento documentado e relatório de diferenças. Nunca multiplicar por 100 duas vezes em retry de migração.

**F09 — P1 — Rótulo “Sobra” pode ser confundido com dinheiro disponível.** No dashboard, `entradasPendentes − compromissosPendentes` é saldo do fluxo previsto, sem saldo inicial. Renomear como “Resultado previsto do período” ou calcular “Saldo previsto ao fim do mês” com fórmula completa. Mostrar recebido/pago separado de previsto; nenhum “disponível” deve incluir receita ainda não recebida.

**F10 — P1 — Histórico de recorrências exige cobertura uniforme.** Contas e assinaturas já têm tratamento mais elaborado, mas alterar ganho recorrente atual não pode reescrever períodos passados. Padronizar vigência, ocorrências e cancelamentos em todos os tipos. Cartão deve distinguir compra, parcela, fatura e pagamento para não somar a mesma saída duas vezes.

### Experiência e design

**U01 — P1 — Primeiro acesso depende do mês e de ter obrigações.** O onboarding do dashboard deriva completude de dados do período selecionado. Pode reaparecer no novo mês e não tem caminho claro para quem não tem despesa/conta a informar. Persistir onboarding por usuário/versão, oferecer “não tenho agora”, pular itens opcionais e retomar sem bloquear o uso.

**U02 — P1 — Muitas categorias internas competem com tarefas simples.** A estrutura separa saldo, ganhos, contas, parcelas, assinaturas, fatura, checklist, caixinhas, DRE, comissões e consultor. Preservar funcionalidades em navegação progressiva; começar com “Ver meu dinheiro”, “Registrar”, “Ver o que vence” e “Guardar”. Comissões e recursos de negócio são módulos opcionais, não obrigação para toda a mentoria.

**U03 — P1 — Linguagem positiva às vezes oculta a natureza do gasto.** `src/lib/abundancia.ts` usa “investido em você” e mensagens celebratórias para despesas genéricas. Manter tom encorajador é compatível com distinguir consumo, investimento, reserva e transferência. Proposta: rótulo financeiro claro como principal e frase opcional de apoio; nunca afirmar que todo consumo é investimento financeiro ou que sempre haverá dinheiro suficiente. Não remover identidade da mentoria sem razão.

**U04 — P1 — Página inicial precisa de hierarquia orientada à ação.** Muitos cartões, projeções e mensagens competem com o estado atual. Priorizar saldo atualizado, próximo vencimento e botão de registrar. Mostrar projeções com origem, data e indicação de estimativa; detalhes e gráficos sob expansão. Desktop pode aproveitar largura maior; mobile deve funcionar sem tabela espremida.

**U05 — P1 — Login público já tem labels, mas falta contexto do convite.** Não repetir como defeito a ausência de labels: a versão observada tem E-mail e Senha identificados, mostrar senha e recuperação. Acrescentar fluxo de convite, erro recuperável, acesso expirado e ajuda concreta. Não mostrar e-mail existente/inexistente de forma que enumere contas. Sem alterar o comportamento de recuperação real até validar templates e links.

**U06 — P1 — Estados precisam ser padronizados e testados.** Cada fluxo deve distinguir carregando, vazio, erro, desatualizado, gravando, sincronizado e ação recusada. Mensagem “salvo” só após confirmação ou claramente “aguardando sincronização”. Duplicidade de clique, falha de permissão e conexão perdida não podem parecer sucesso. Erros junto do campo e resumo acessível; toast não pode ser o único registro de falha.

**U07 — P1 — Acessibilidade interna ainda precisa de ensaio.** Não foram medidos contraste, foco e leitura de todas as telas autenticadas. Testar teclado, modal com retorno de foco, zoom 200%, leitor de tela, alvos de toque, movimento reduzido e gráficos com alternativa textual. Não declarar WCAG conforme só porque lint passou. Usar testes automáticos como suporte à revisão manual.

**U08 — P2 — Assistente financeiro deve mostrar hipóteses, não certeza absoluta.** A rota do consultor já usa simulação estruturada, valida entrada e tem cota diária: preservar. Trocar conclusão absoluta por “com os dados informados...” e exibir saldo atualizado/hipóteses/parcelas. Oferecer formulário determinístico de simulação quando IA estiver indisponível. Não enviar histórico completo ao modelo sem necessidade, nem dar ao modelo ferramentas de mutação financeira nesta entrega.

## 3. Cobertura por área e roteiro de aceite

A tabela é um mapa de revisão e testes necessários. Não significa que todas as interações foram reproduzidas no site publicado.

| Área/rota | Direção de melhoria | Aceite principal |
|---|---|---|
| Login/recuperação | Convite, ajuda e sessão clara | Convite expirado e recuperação sem enumeração |
| `/acesso` | Administração de turma e concessões | Mentorado não promove a si mesmo; admin sem leitura automática de finanças |
| Resumo `/` | Dinheiro agora + próxima ação | Pessoa nova encontra registrar e vencimentos sem treinamento |
| `/saldo` | Referência, movimentos, conciliação | Saldo é explicável e repetição de operação não duplica |
| Registro rápido/chat | Valor, categoria e data com confirmação | R$ 1.234,56, entrada por voz opcional e falha offline tratados |
| `/ganhos` | Previsto versus recebido | Recebimento altera caixa uma vez |
| `/contas` | Próximo vencimento e recorrência | Alterar próxima competência não muda passado fechado |
| `/assinaturas` | Encerrar/pausar com vigência | Não cobrar nem notificar após cancelamento efetivo |
| `/parcelas` | Total, restante e vínculo com cartão | Sem parcela fantasma e sem dupla saída |
| `/fatura` | Prevista versus informada versus paga | Pagar fatura não duplica compra já contabilizada em outra visão |
| `/checklist` | Unificar com “A pagar” | Pagamento e desfazer têm efeito consistente |
| `/caixinhas` | Reservar/resgatar e meta | Soma disponível + reservado conserva total |
| `/comissoes` | Módulo opcional | Comissão prevista não é saldo recebido |
| `/dre` | Relatório simplificado + detalhes | Fecha com extrato e snapshot, competência diferente de caixa explícita |
| `/consultor` | Simulador primeiro, IA opcional | Conclusão vem de números estruturados; sem chave, continua útil |
| `/notificacoes` | Inbox, preferências e diagnóstico | Mais de 60 itens, entrega falha e aparelho trocado cobertos |
| `/perfil` | Conta, módulos, privacidade | Exportar e excluir com autenticação e operação retomável |
| APIs administrativas | Validação + autorização + auditoria | Anônimo/mentorado negados; admin permitido por concessão atual |
| API CDI | Cache, data e falha explícitos | Taxa vencida não aparece como atual; estimativa nunca vira saldo |
| API de desejos/IA | Limites e privacidade | Escopo por UID, corpo limitado, sem segredo no log |
| PWA/service worker | Atualização segura e rotas | Push abre rota permitida; logout não deixa conteúdo de outro usuário |

## 4. Direção concreta para o novo design

### Navegação proposta

No celular, quatro destinos persistentes: **Início, Movimentos, Planejar, Mais**. Botão de ação destacado **Registrar** abre formulário curto. “Mais” reúne Perfil, Notificações, Relatórios e módulos avançados. No desktop, sidebar com os mesmos nomes e detalhes opcionais. Manter redirects/compatibilidade das URLs antigas para não quebrar pushes e favoritos.

Na primeira tela: saudação discreta; card “Seu dinheiro” com disponível e reservado; indicação “Atualizado em...”/“Precisa conferir”; próxima obrigação; botão Registrar. Projeção do mês e evolução ficam abaixo. Não esconder saldo negativo sob frases positivas. Conteúdo motivacional é opcional e nunca toma o lugar da informação de risco.

### Vocabulário financeiro

| Termo | Significado no produto |
|---|---|
| Total confirmado | Dinheiro efetivamente registrado nas contas, sem previsões |
| Reservado | Parte do dinheiro destinada a objetivos, sem contar novamente no patrimônio |
| Disponível | Total elegível menos reservas/alocações aplicáveis |
| A receber | Valores previstos ainda não efetivados |
| A pagar | Obrigações ainda pendentes |
| Saldo previsto | Projeção com fórmula e período visíveis |
| Rendimento estimado | Simulação; nunca crédito real automático |
| Ajuste de conciliação | Diferença explícita entre registro e valor conferido |

### Fluxos curtos

1. **Primeiro acesso:** abrir convite → autenticar → nome/fuso → saldo inicial opcional → primeira tarefa. Pular cartão/comissão/imposto se não se aplica. Convite não contém senha e não dá acesso a outras contas.
2. **Registrar gasto:** valor com teclado decimal → descrição/categoria sugerida → conta/data → confirmar. Campos avançados recolhidos. Reservar automaticamente só após escolha clara do usuário, mostrando quanto será separado.
3. **Receber:** selecionar receita prevista ou nova → confirmar valor/data/conta → ver saldo atualizado e comprovante interno do movimento.
4. **Guardar:** selecionar caixinha → reservar valor de uma conta → confirmar efeito em disponível e reservado. Resgatar faz movimento inverso; não é receita nova.
5. **Vencimento:** abrir aviso → ver obrigação exata → marcar pago → refletir imediatamente em planejamento/inbox/entrega pendente.
6. **Notificações:** explicar benefício → botão do usuário para ativar → permissão do navegador → teste → diagnóstico compreensível. Permissão negada mantém inbox funcional.

### Sistema visual e metas

Preservar logo e verde ZXP. Criar tokens para cores, espaços, fontes, bordas, foco e estados. Preferir texto legível, rótulos diretos, valor tabular e espaçamento consistente. Cor não deve ser a única distinção de entrada/saída. Modais com título, descrição, cancelar/confirmar, foco e loading. Evitar redesenhar cada página com componentes diferentes.

Metas de validação, não resultados já medidos: registrar gasto simples em até 20 segundos após onboarding; chegar a vencimentos em até dois toques; interface utilizável em 360 px e zoom de 200%; nenhuma ação crítica sem feedback; LCP e interatividade medidos em dispositivo/perfil declarado; nenhuma violação automática séria de acessibilidade nas rotas essenciais, acompanhada de revisão de teclado. Não prometer melhora percentual sem baseline.

## 5. Arquitetura mínima para notificações confiáveis

Separar **fato financeiro**, **evento de aviso**, **notificação na central** e **tentativa por aparelho**. Uma preferência desativada pode impedir geração ou entrega conforme contrato explícito; central e push não são a mesma coisa.

Contrato sugerido de entrega: `uid`, `notificationId`, `deviceId`, `deviceGeneration`, `status`, `attemptCount`, `dueAt`, `expiresAt`, `leaseOwner`, `leaseUntil`, `version`, `lastStatus`, `createdAt`, `updatedAt`. Os nomes podem se adaptar ao projeto. Índices definidos em arquivo versionado. Retenção por estado; nenhum endpoint ou token nos logs.

Estados: pendente → em processamento → aceita pelo provedor; falha transitória volta a pendente com nova data; falha permanente, cancelamento e expiração são terminais. Lease vencido permite recuperação. A transição final deve conferir versão/lease. Antes do envio, validar acesso ativo, geração do aparelho, preferência e fato ainda relevante. Falha antes/depois de cada gravação deve ter teste.

O gerador diário usa timezone explícito por usuário. O executor de entregas tem frequência adequada ao prazo prometido e não depende do usuário abrir a página. O monitor detecta ausência de execução mesmo que o endpoint não tenha sido chamado. A configuração só pode anunciar “ativo” depois de teste completo do ambiente, sem expor dados no push de diagnóstico.

Metas iniciais de serviço a implementar e medir: 99,9% dos eventos válidos persistidos sem perda no serviço; 99% das entregas elegíveis tentadas dentro de cinco minutos do horário agendado, condicionadas a um executor com capacidade para isso; backlog atrasado gera incidente; zero vazamento entre usuários nos testes de isolamento. Essas são metas internas propostas, não promessa já cumprida nem SLA de exibição pelo sistema operacional.

## 6. Banco e infraestrutura sem trabalho manual recorrente

Claude deve criar um comando orquestrador, por exemplo `npm run ops:prepare` e `npm run ops:release`, com implementação real. O nome é sugestão: não documentar comandos inexistentes como se estivessem prontos.

### Preflight

- Identificar remote, branch, SHA, versão Node/Java, projeto Firebase e projeto/equipe Vercel por configuração e credenciais já autorizadas.
- Verificar permissão de leitura/gravação necessária com operação segura; não imprimir segredos nem enumerar credenciais de outros serviços.
- Inventariar variáveis por nome e estado de presença/validade, não valor; distinguir públicas de privadas.
- Conferir plano e quotas do scheduler antes de escolher frequência; não contratar serviço novo ou aumentar cobrança sem autorização.
- Identificar produção por correspondência explícita de IDs. Ambiguidade entre dois projetos é um bloqueio real, não uma decisão para adivinhar.

### Migração

Backup consistente com checksum e manifesto; ensaio de restauração em ambiente isolado; lock de migração; versão por documento; processamento paginado; dry-run; aplicação idempotente; checkpoint; comparação de contagens e totais por usuário/conta; ledger de ajustes sem inventar saldos. Migrar em lotes e manter leitura legada durante a transição. Documento ambíguo deve ser preservado e marcado para conciliação, com valor original, não “corrigido” arbitrariamente.

Projetar a ordem de deploy para compatibilidade: serviço aceita esquema antigo/novo → índices e novas regras compatíveis → migração verificada → interface nova → encerramento de compatibilidade em release posterior. Regras não devem permitir escrita desprotegida durante a janela.

### Release

Rodar todos os gates; gerar preview/staging; criar usuários sintéticos no emulador ou ambiente de teste, nunca misturar fixtures a finanças reais; testar fluxo completo; promover o mesmo SHA validado quando a autorização e as proteções permitirem. Registrar URL, SHA, regras, índices, scheduler e migrações efetivamente aplicados. Detectar env público que só entra em build: mudar variável sem rebuild não é validação suficiente.

Se a sessão Claude não tiver acesso ao Firebase/Vercel/GitHub, ela ainda deve terminar código, scripts, testes locais, plano de aplicação e relatório de bloqueio. Não pedir ao dono para abrir console e copiar regras manualmente como solução padrão. Pedir apenas autenticação/escopo estritamente necessário, em uma solicitação consolidada, quando não houver alternativa autorizada. MFA, aceitação de cobrança e controles de organização não podem ser contornados por prompt.

## 7. Mercado Pago: manter a possibilidade, sem falsa sincronização

O pedido anterior de conciliação continua relevante, mas não deve bloquear a primeira entrega aos mentorados. A documentação consultada descreve webhooks de recursos da integração e relatórios de dinheiro em conta. **Isso não comprova acesso a toda compra pessoal, caixinha, reserva e rendimento em tempo real.** Não inferir essa cobertura de uma API de pagamentos de vendedor.

Proposta: criar camada de importação/contas externas, com origem, ID externo, data efetiva, moeda, status e proveniência. Importação de extrato deve ter preview, detecção de duplicatas e conciliação por diferença; importar novamente não pode gerar nova despesa. Separar vendas recebidas, transferências, tarifas, devoluções e gastos. Saldo de relatório e saldo instantâneo são fatos diferentes.

Antes de conectar conta real: realizar prova de capacidade com permissões oficiais da conta, documentar campos/eventos disponíveis, atraso e limitações. OAuth, quando aplicável, com state, tokens protegidos, renovação, revogação e segregação por UID. Webhook autenticado conforme documentação vigente, resposta rápida após persistência, busca do recurso no servidor e processamento idempotente. Não confiar em valor recebido apenas no payload; não usar token privado no navegador.

Se caixinhas/rendimentos/compras pessoais não estiverem disponíveis por API oficial autorizada, oferecer importação compatível ou avaliar provedor Open Finance com cobertura comprovada e consentimento. Não prometer “gastei no MP, caiu no app” antes do ensaio. Sem scraping de sessão bancária, senha do usuário ou endpoints não documentados. Esta entrega deve incluir o contrato de integração e prova de viabilidade; conector de produção somente com cobertura e autorização verificadas.

## 8. Plano de 88 commits úteis e pushes por lote

**Meta solicitada: 88 commits de trabalho real, em 11 lotes de oito.** Cada item abaixo é uma capacidade/correção com implementação e testes pertinentes no mesmo commit. Não são 88 commits para alterar uma frase por vez. Criar branch `feat/mentoria-ready`; abrir PR draft cedo; push ao concluir cada lote validado, mais pushes de correções reais quando necessários. Isso resulta em aproximadamente 11 pushes planejados, sem despejar 88 deploys de produção.

Revalidar no HEAD da execução: se um item já estiver pronto, registrar evidência e substituir por outra lacuna real do escopo; não produzir commit vazio. Se não houver 88 mudanças justificáveis, relatar a contagem verdadeira em vez de fabricar atividade. Preservar autoria/data reais e identidade Git já configurada. Não usar force-push para maquiar histórico.

O gráfico de contribuições depende dos critérios do GitHub, incluindo associação do e-mail e branch elegível. Vários pushes não equivalem a várias contribuições; 88 commits no mesmo dia não preenchem 88 dias. Quando autorizado e permitido pelo repositório, merge que preserve commits evita squash em um só. Não mudar proteções do repositório para conseguir isso.

### Lote A — Base e segurança de execução

| # | Commit sugerido / entrega | Evidência mínima |
|---|---|---|
| 01 | `chore: add environment and access preflight` | Detecta projeto ambíguo/credencial ausente sem vazar segredo |
| 02 | `fix: update vulnerable runtime dependencies` | Audit triado, lock e build compatíveis; sem downgrade cego |
| 03 | `ci: validate mentorship branch and cancel superseded runs` | CI dispara para PR/branch e SHA correto |
| 04 | `test: add isolated browser test environment` | Playwright/emuladores sobem sem produção |
| 05 | `test: cover new user and two user journeys` | Fixtures A/B e reset idempotente |
| 06 | `fix: verify session revocation with auth time` | Token renovado de sessão revogada rejeitado |
| 07 | `fix: enforce runtime configuration contracts` | Env inválido gera diagnóstico seguro e acionável |
| 08 | `feat: add redacted operational health reporting` | Status sem chaves, endpoints ou dados financeiros |

Gate A: baseline preservado; CI utilizável na branch; nenhum alerta crítico alcançável sem tratamento; acesso isolado demonstrado.

### Lote B — Acesso da mentoria

| # | Commit sugerido / entrega | Evidência mínima |
|---|---|---|
| 09 | `feat: model mentorship access grants` | Estado/validade por UID protegidos de autoedição |
| 10 | `fix: enforce active grants in API and database rules` | Sessão suspensa perde acesso direto e API |
| 11 | `feat: create single use expiring invitations` | Token hash, uso único, expiração e retry seguro |
| 12 | `feat: add invitation acceptance journey` | Convite válido, expirado e já aceito cobertos |
| 13 | `feat: manage cohorts without exposing finances` | Admin vê acesso; não recebe extratos automaticamente |
| 14 | `feat: support access renewal and suspension` | Reativação preserva dados; suspensão cancela entregas |
| 15 | `feat: add invitation batch preview and validation` | Importação valida duplicados sem enviar mensagens reais |
| 16 | `fix: harden login recovery and account switching` | Erros genéricos, limpeza de estado e links válidos |

Gate B: aceite da mentoria funciona com contas sintéticas; nenhuma concessão herdada por troca de UID. Migração de atuais usuários preserva acessos legítimos, sem tornar todos admin.

### Lote C — Contrato do dinheiro

| # | Commit sugerido / entrega | Evidência mínima |
|---|---|---|
| 17 | `feat: add versioned money and account contracts` | Centavos/moeda/limites e compatibilidade legada |
| 18 | `feat: record confirmed financial movements` | Movimento imutável e idempotente, saldo explicável |
| 19 | `fix: apply received income to cash once` | Receber/repetir/desfazer sem dupla entrada |
| 20 | `fix: reconcile opening balances without replaying history` | Corte legado não reaplica movimento anterior |
| 21 | `fix: distinguish virtual reserves from external balances` | Migração conserva total e marca ambiguidades |
| 22 | `feat: transfer money into and out of reserves` | Reserva/resgate não geram receita/despesa falsa |
| 23 | `fix: serialize reserve adjustments and archival` | Depósito concorrente preservado; saldo não some |
| 24 | `fix: separate confirmed cash from projected results` | Início, relatório e simulador usam fórmulas documentadas |

Gate C: conjunto de referência fecha centavo a centavo; cenários de recebimento, gasto, reserva, resgate e ajuste têm trilha e invariantes. Sem migrar dinheiro real até backup/ensaio do lote I.

### Lote D — História e consistência

| # | Commit sugerido / entrega | Evidência mínima |
|---|---|---|
| 25 | `fix: reverse closed period expenses with current events` | Estorno atual preserva snapshot fechado |
| 26 | `fix: make financial mutations concurrency safe` | Dois cliques/retries/rebase concorrente não duplicam |
| 27 | `feat: preserve effective dates for recurring income` | Alteração futura não muda meses passados |
| 28 | `fix: align recurring bills and subscriptions history` | Pausa, vigência e cancelamento coerentes |
| 29 | `fix: reconcile card installments and bill payments` | Compra/fatura/pagamento sem dupla contagem |
| 30 | `feat: enforce versioned month close snapshots` | Fechamento imutável; reabertura auditada |
| 31 | `refactor: pass user financial configuration explicitly` | A/B e UI/worker têm mesmos números |
| 32 | `fix: validate financial schemas at trust boundaries` | Rules/serviço rejeitam calendário e valores inválidos |

Gate D: matriz de competência/caixa, fatura, recorrência e fechamento aprovada. Operações críticas não dependem de validação só no formulário.

### Lote E — Núcleo de notificações

| # | Commit sugerido / entrega | Evidência mínima |
|---|---|---|
| 33 | `fix: persist and repair notification outbox atomically` | Falha após inbox não perde entrega |
| 34 | `fix: claim deliveries with transactional leases` | Dois workers concorrentes têm único claim válido |
| 35 | `fix: transfer device ownership transactionally` | Cadastro/revogação A/B não deixa índice inconsistente |
| 36 | `fix: bind deliveries to current device generation` | Entrega antiga não segue para nova sessão |
| 37 | `feat: run due delivery retries independently` | 429/5xx retentam no prazo com scheduler suportado |
| 38 | `feat: resume notification batches with checkpoints` | Timeout retoma sem abandonar usuários finais |
| 39 | `perf: query due deliveries with indexed pagination` | Histórico grande não é lido inteiro |
| 40 | `fix: cancel or refresh obsolete financial alerts` | Obrigação paga não gera lembrete atrasado |

Gate E: falhas injetadas em cada fronteira, concorrência real no emulador, expiração e geração testadas. Nenhuma garantia de exactly-once externa inventada.

### Lote F — Experiência e operação das notificações

| # | Commit sugerido / entrega | Evidência mínima |
|---|---|---|
| 41 | `fix: revoke browser push with timeout and recovery` | HTTP 500/offline não são tratados como sucesso |
| 42 | `feat: reconcile push ownership across auth lifecycle` | Reparo funciona fora da tela Notificações |
| 43 | `fix: notify all supported pending obligations` | Parcela/assinatura externa cobertas sem duplicar fatura |
| 44 | `feat: paginate inbox and reconcile unread counts` | Mais de 60 itens e marcar todas coerentes |
| 45 | `feat: add timezone and meaningful notification preferences` | Toggle tem efeito e horário é definido |
| 46 | `feat: provide actionable push diagnostics` | Configuração, permissão, inscrição e aceitação separados |
| 47 | `feat: monitor notification backlog and scheduler health` | Ausência de heartbeat e falhas geram incidente visível |
| 48 | `test: cover browser push and service worker lifecycle` | Atualização, clique, permissão negada e limites documentados |

Gate F: inbox sempre útil; nenhum dado sensível por padrão no lockscreen; teste real de aparelho executado se disponível e explicitamente pendente se indisponível.

### Lote G — Fundamentos do redesign

| # | Commit sugerido / entrega | Evidência mínima |
|---|---|---|
| 49 | `feat: introduce accessible ZXP design tokens` | Cores, tipografia, foco e spacing consistentes |
| 50 | `feat: unify mobile and desktop navigation` | Quatro destinos e URLs antigas preservados |
| 51 | `feat: simplify dashboard around immediate actions` | Saldo/próximo vencimento/registrar destacados |
| 52 | `feat: add persistent optional onboarding` | Não reaparece no novo mês; pode pular |
| 53 | `feat: streamline quick financial entry` | Valor/conta/data, validação BRL e confirmação |
| 54 | `feat: standardize form and dialog interactions` | Teclado, foco, loading e prevenção de clique repetido |
| 55 | `feat: unify loading empty error and offline states` | Sem sucesso falso em falha de gravação |
| 56 | `fix: clarify money labels and optional motivational copy` | Gasto/investimento/previsão não se confundem |

Gate G: screenshots em mobile/desktop, tarefa simples até 20 segundos como alvo medido, sem perda de funções existentes.

### Lote H — Páginas essenciais

| # | Commit sugerido / entrega | Evidência mínima |
|---|---|---|
| 57 | `feat: build searchable financial movements view` | Filtros e paginação com totais consistentes |
| 58 | `feat: unify upcoming bills and payment checklist` | Vencimentos e pagamentos num fluxo claro |
| 59 | `feat: simplify card and installment management` | Previsto/real/pago compreensíveis |
| 60 | `feat: redesign reserves around goals and transfers` | Reservar/resgatar explicam efeito no dinheiro |
| 61 | `feat: add understandable balance reconciliation` | Diferença vira ajuste visível e reversível |
| 62 | `feat: simplify reports with drill down evidence` | Número abre movimentos que o compõem |
| 63 | `feat: make advanced modules optional per user` | Comissões/negócio não atrapalham iniciante |
| 64 | `feat: offer deterministic affordability simulation` | Sem IA ainda funciona; hipóteses visíveis |

Gate H: fluxos autenticados sintéticos completos, regressões visuais revisadas, teclado e leitor de tela nos caminhos principais.

### Lote I — Migração e release automatizados

| # | Commit sugerido / entrega | Evidência mínima |
|---|---|---|
| 65 | `feat: add idempotent versioned migration runner` | Dry-run, lock, apply, checkpoint e reexecução |
| 66 | `feat: verify backups before financial migration` | Manifesto, checksum e restauração isolada |
| 67 | `feat: migrate legacy balances with reconciliation reports` | Totais antes/depois por UID, ambiguidades preservadas |
| 68 | `feat: automate compatible rules and index deployment` | Índices prontos e Rules verificadas no projeto certo |
| 69 | `feat: automate environment and scheduler provisioning` | Variáveis seguras e executor efetivamente configurado |
| 70 | `feat: orchestrate staged release and smoke verification` | Mesmo SHA validado/promovido e checks pós-deploy |
| 71 | `test: rehearse rollback across schema versions` | Reversão preserva significado e invariantes do dinheiro |
| 72 | `feat: report release state and actionable blockers` | Concluído/bloqueado distingue código de produção |

Gate I: ensaio integral em ambiente isolado, nenhuma edição de console necessária no caminho autorizado; bloqueios externos detalhados, sem fingir aplicação.

### Lote J — Privacidade, exportação e sustentabilidade

| # | Commit sugerido / entrega | Evidência mínima |
|---|---|---|
| 73 | `feat: record server side audit for critical actions` | Operação e trilha inseparáveis, ator confiável |
| 74 | `feat: export financial data with stable schemas` | JSON/CSV úteis sem tokens e sem dados de outro UID |
| 75 | `feat: make account deletion resumable and complete` | Interromper/retomar apaga inventário sem órfãos |
| 76 | `fix: enforce tested content security policy` | Auth/Firestore/PWA funcionam e violações tratadas |
| 77 | `perf: bound financial subscriptions and history reads` | Paginação/projeções não quebram totais nem leem tudo |
| 78 | `feat: observe service costs and rate limits` | Cotas e custos por operação sem informação sensível |
| 79 | `feat: add transparent privacy and help flows` | Finalidade, retenção, exportação e contato definidos |
| 80 | `feat: add idempotent statement import foundation` | Preview, reconciliação, origem e duplicatas cobertas |

Gate J: A/B em regras e APIs, exclusão/restore, logs redigidos e importação sintética sem duplicação. Texto jurídico deve usar dados reais do controlador; não inventar CNPJ/endereço ou declarar conformidade legal certificada.

### Lote K — Integração comprovada e validação final

| # | Commit sugerido / entrega | Evidência mínima |
|---|---|---|
| 81 | `feat: define provider capability and Mercado Pago adapters` | Matriz de cobertura real; conector desativado sem credencial/capacidade |
| 82 | `test: cover real world finance lifecycle end to end` | Receber/gastar/pagar/reservar/fechar/estornar coerentes |
| 83 | `test: exercise failure and concurrency scenarios` | Crash, retry, duas abas, dois workers e troca A/B |
| 84 | `fix: resolve accessibility findings across core journeys` | Achados concretos corrigidos com evidência, não só checklist |
| 85 | `perf: validate first load and notification scale` | Perfil declarado, medições antes/depois e limites |
| 86 | `fix: harden PWA updates and session cleanup` | Versão nova e logout não mantêm estado financeiro antigo |
| 87 | `test: automate production readiness acceptance gates` | Reprova se migração/scheduler/regras/segurança não validados |
| 88 | `docs: publish verified release evidence and operator guide` | SHAs, URLs, comandos reais, medições e pendências verdadeiras |

Gate K: aplicar correções realmente encontradas nos testes finais, independentemente de superar 88 commits. Commit 81 não autoriza simular integração bancária pronta. Não fabricar fix para atingir contador se os testes não revelarem um problema.

## 9. Matriz de aceitação obrigatória

| Cenário | Resultado esperado |
|---|---|
| Usuário A tenta ler/escrever UID B | Negado em Rules e API |
| Mentorado tenta administrar turma | Negado sem exceção de frontend |
| Convite usado duas vezes | Segundo uso não cria outra concessão |
| Sessão revogada com token reemitido | Rejeitada pelo instante de autenticação |
| Concessão vencida com token ainda válido | Dados protegidos conforme política de acesso |
| Receber R$ 100 após referência | +10.000 centavos uma única vez |
| Registrar gasto de R$ 20 com retry | −2.000 centavos uma única vez |
| Reservar R$ 10 e resgatar R$ 5 | Total conservado; reservado líquido +500 centavos |
| Atualizar recorrência futura | Período fechado não muda |
| Pagar fatura com parcelas | Caixa debitado uma vez; projeção reconciliada |
| Estornar gasto de mês fechado hoje | Compensação atual ligada ao original |
| Corrigir referência concorrente com exclusão | Operação serializada ou conflito explícito |
| Queda entre inbox e outbox | Entrega reparada na retomada |
| Dois workers pegam entrega | Claim único e finalização protegida |
| Push 429/503 | Retry real no executor e dentro da validade |
| Push 410 | Inscrição encerrada sem afetar geração nova |
| Troca A→B durante envio | Geração/dono revalidados; conteúdo privado minimizado |
| Conta paga após materialização | Aviso pendente cancelado ou atualizado |
| 61+ avisos | Contador e ação de leitura coerentes |
| Logout com 500/rede pendurada | Logout termina e reparo seguro fica pendente |
| VAPID ausente/malformada | Estado indisponível e incidente, sem falso sucesso |
| Cron deixa de executar | Monitor de ausência detecta |
| Migração interrompida no meio | Retoma sem duplicação ou multiplicar centavos novamente |
| Restore em ambiente vazio | Contagens e invariantes financeiras conferem |
| Importar mesmo extrato duas vezes | Nenhuma segunda despesa |
| Sem chave de IA | Simulação determinística e mensagem clara |
| Browser sem push/permissão negada | Inbox e funções financeiras continuam úteis |

## 10. Prompt mestre para Claude Code

**Como usar:** coloque este arquivo na raiz do repositório, ou anexe-o à sessão do Claude Code. Cole o prompt abaixo. O documento inteiro é a especificação; o prompt não depende de você abrir console de banco ou editar código. Claude deve ler os achados e o backlog, não apenas esta seção.

```text
Você está trabalhando no repositório caua-lima/zxp-finance. Leia integralmente o arquivo ZXP_FINANCE_AUDITORIA_E_PROMPT_2026-10-25.md anexado ou na raiz. Ele contém evidências do SHA c3831036b1c83934fc6c676a061280a724349dc3, achados S/N/F/U, arquitetura, matriz de aceite e 88 entregas. Trate como especificação de trabalho, revalidando o HEAD atual antes de corrigir. Leia AGENTS.md, CLAUDE.md e a documentação relevante exigida pelo projeto antes de escrever código.

Meu objetivo é entregar o ZXP Finance aos mentorados com design melhor, uso simples, finanças corretas e notificações confiáveis. Quero execução de ponta a ponta, não apenas análise ou uma lista para eu implementar. Faça código, testes, migrações, automação de configuração, documentação, commits e pushes de mudanças reais. Quero uma meta de 88 commits úteis e aproximadamente 11 pushes por lotes validados, podendo superar esse número quando houver trabalho real. Não crie commits vazios, alterações artificiais, datas falsas, autoria falsa ou commits quebrados para cumprir quantidade. Não interprete 88 como permissão para inventar escopo inútil.

Comece verificando git status, remote, branch, acessos disponíveis, versão Node/Java, Firebase e Vercel. Preserve mudanças locais. Crie branch feat/mentoria-ready ou equivalente livre e PR draft cedo, se a ferramenta autorizada permitir. Garanta CI na branch ou no PR. Não faça force-push, não desative proteção e não use main como laboratório. Preserve a identidade Git configurada. Cada commit deve ter capacidade/correção compreensível e seus testes relevantes; cada lote termina com validação e push. No final, mantenha os commits individuais no método de merge se permitido, sem violar a política do repositório. Nenhuma aprovação existente deve ser pedida de novo, mas não contorne gates reais.

Não pare no planejamento. Crie uma lista persistente em docs/execucao-mentoria.md com item, evidência inicial, implementação, teste, SHA e estado. Trabalhe pelos lotes A–K. Se o HEAD já resolveu um achado, registre a prova e remapeie para outra lacuna real do mesmo escopo. Preserve as melhorias já existentes: isolamento por UID, admin server-side, cálculo compartilhado, estimativas fora do saldo e testes atuais. Não reescreva o app inteiro ou troque Firebase/Next sem necessidade demonstrada.

Prioridade imediata: dependências alcançáveis com alertas, revogação por auth_time, isolamento e concessões de acesso, outbox que não perde entrega após crash, claim transacional de worker, posse/geração do aparelho e executor real de retries. O cron diário atual não executa uma retentativa marcada para daqui a minutos. Leia a documentação atual do plano/serviço antes de provisionar scheduler. Não compre plano ou serviço sem autorização. Não chame aceitação do provedor de entrega exibida no celular.

Faça o modelo financeiro explicar cada centavo: saldo inicial confirmado, entradas/saídas efetivadas, transferências, reservas e ajustes. Valores previstos e rendimento estimado não são dinheiro real. Recebimentos precisam afetar caixa uma vez; faturas e parcelas não podem duplicar despesa. Defina envelopes virtuais versus contas externas e preserve total nas transferências. Migre dados legados com corte de referência e proveniência; nunca invente saldo ou aplique a mesma migração duas vezes. Estorno em mês fechado é compensação controlada, não edição destrutiva da história. Remova dependência de globals mutáveis de configuração por usuário.

Implemente a experiência descrita: Início, Movimentos, Planejar, Mais e ação Registrar; navegação desktop equivalente; URLs antigas funcionando; onboarding persistente e opcional; linguagem clara de dinheiro; módulos avançados opcionais; design ZXP consistente; estados vazios/erro/offline; teclado, foco e zoom utilizáveis. Mantenha tom acolhedor sem tratar todo consumo como investimento. Use imagens/screenshots reais do app para comparar antes/depois. Valide com usuários sintéticos e navegador automatizado. Não diga que telas internas foram testadas quando só houve build.

Para mentoria, implemente convite de uso único, validade de acesso, suspensão, renovação e administração de turma. Não dê ao mentor acesso automático às finanças do mentorado. Não envie convites ou mensagens a pessoas reais durante testes. Convites e notificações de teste devem usar ambiente/destinatários de teste autorizados. Sem credencial de e-mail, construa a integração e teste com adaptador local; não finja envio real.

Quero evitar trabalho manual em banco. Crie e execute, onde houver autorização e credenciais, preflight/bootstrap/release idempotentes para variáveis, Rules, índices, migrações e scheduler. Identifique corretamente os projetos; backup com checksum e restore ensaiado antes de migração financeira; lock, dry-run, apply, checkpoint e validação antes/depois. Faça expand-contract e rollout compatível. Não me entregue como solução principal 'cole estas regras no Firebase'. Automatize essa etapa. Se faltar login, MFA, escopo, aprovação de cobrança ou decisão impossível de inferir, conclua tudo o que independe disso e entregue um único pedido concreto, mínimo e consolidado. Não tente burlar controle ou obter segredo de outro serviço.

Use credenciais somente no servidor/secret store; nunca em NEXT_PUBLIC, git, screenshots ou logs. Não abra regras ou relaxe autorização para fazer teste passar. Não use produção para fixtures, carga ou testes destrutivos. Não execute scripts de restore sobre dados reais como smoke test. Não desabilite testes, não atualize snapshots só para esconder regressão e não rode audit fix --force cegamente. Avalie alcance de cada advisory e preserve compatibilidade.

No Mercado Pago, execute a entrega 81 como contrato de capacidades e prova oficial de viabilidade. Webhook de checkout não prova sincronização de toda vida financeira pessoal. Valide escopos/dados realmente disponíveis e prepare importação idempotente de extrato. Só habilite integração real quando houver autorização, credencial e cobertura demonstradas; mostre limitações e última sincronização. Sem scraping bancário, token no cliente ou dado inventado. Essa integração não deve bloquear as correções essenciais da mentoria.

Gates obrigatórios: lint, typecheck, testes existentes e novos de regressão, Rules em Java compatível, restauração no emulador, build, E2E dos fluxos essenciais, concorrência/falhas da fila, isolamento A/B, migração reexecutável, acessibilidade e verificação do SHA implantado. Testes pertinentes por commit; suíte completa nos lotes e release. Em caso de indisponibilidade externa, registre bloqueado, não aprovado. Push real em celular exige dispositivo real ou serviço autorizado; se indisponível, mantenha a pendência visível sem prometer 100%.

Continue até concluir o escopo executável e os 88 itens reais ou documentar impedimentos concretos. Mantenha checkpoints para retomada se a sessão/contexto acabar. Não deixe TODO em funcionalidade anunciada como pronta. Ao final entregue: resumo de mudanças; lista de commits e pushes; URL da branch/PR; resultados de teste com evidências; migrações/Rules/índices/scheduler realmente aplicados; deployment e SHA; roteiro de rollback; limitações e bloqueios. Separe claramente implementado, validado localmente, validado em staging e ativo em produção. O critério de sucesso é o app pronto para os mentorados com evidência, não o contador de commits.
```

## 11. Referências e rastreabilidade

Código referido neste documento é relativo à raiz do repositório no SHA auditado. Base navegável: https://github.com/caua-lima/zxp-finance/tree/c3831036b1c83934fc6c676a061280a724349dc3. Pontos de entrada principais: `src/lib/notificacoes/servidor.ts`, `src/lib/notificacoes/eventos.ts`, `src/lib/pushNavegador.ts`, `src/lib/useNotificacoes.ts`, `src/lib/usePushNotifications.ts`, `src/lib/finance/saldo.ts`, `src/lib/useCaixinhas.ts`, `src/lib/useGastos.ts`, `src/lib/useConfigApp.ts`, `src/lib/autorizacao.ts`, `src/lib/verificarChamador.ts`, `src/lib/contaCliente.ts`, `src/app/api/cron/notificacao-diaria/route.ts`, `firestore.rules`, `vercel.json`, `next.config.ts`, `.github/workflows/ci.yml` e `scripts/migracao-v2.ts`.

Fontes primárias consultadas em 25/10/2026:

- Firebase — semântica de revogação e auth_time: https://firebase.google.com/docs/auth/admin/manage-sessions
- Vercel — concorrência, execução e retry de cron: https://vercel.com/docs/cron-jobs/manage-cron-jobs
- GitHub — critérios de contribuições: https://docs.github.com/en/account-and-profile/reference/profile-contributions-reference
- Next.js — advisory de Image Optimization/SVG e mitigação sharp: https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw
- Next.js — advisory de use cache e typed arrays: https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr
- Mercado Pago — relatórios de dinheiro em conta por API: https://www.mercadopago.com.br/developers/pt/docs/reports/account-money/api
- Mercado Pago — recursos e tópicos de webhooks: https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks

Este relatório não certifica conformidade legal, pentest completo ou disponibilidade de produção. Ele fornece achados verificáveis, plano de correção e instruções para implementar e comprovar a preparação da entrega aos mentorados.
