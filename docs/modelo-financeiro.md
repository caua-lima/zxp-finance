# Modelo financeiro do ZXP Finance

Contrato único que todas as telas, o cron de notificações e o Consultor
seguem. Qualquer cálculo novo deve caber aqui — se não couber, o contrato é
atualizado primeiro. Implementação de referência: `src/lib/finance/saldo.ts`.

## Conceitos

| Termo | Definição | Onde mora |
|---|---|---|
| **Saldo de referência** | Valor que você digitou olhando o app do banco, com o momento em que digitou (`atualizadoEm`). É a única fonte de verdade sobre quanto existe na conta. | `usuarios/{uid}/saldo/atual` |
| **Movimento efetivo** | Dinheiro que saiu ou voltou da conta **depois** da referência: gasto registrado, estorno, conta marcada como paga, depósito automático em caixinha. | gastos, pagamentos |
| **Saldo confirmado (agora)** | Referência − movimentos efetivos posteriores a ela. É o "Na conta agora". | calculado |
| **Reserva** ("quero que sobre") | Parte do saldo que você não quer gastar até o fim do mês. | `saldo.reservaMeta` |
| **Saldo livre** | Saldo confirmado − reserva. Nunca negativo na exibição. | calculado |
| **Caixinha** | Cofrinho **real**, separado do saldo disponível (ex.: Cofrinho do Mercado Pago). Não faz parte do saldo. | `caixinhas` |
| **Previsão** | Entradas previstas, faturas previstas, comissão prevista. **Nunca** vira saldo. | calculado (`estimado: true`) |
| **Rendimento estimado** | Quanto o CDI renderia sobre um saldo. É estimativa: **nunca** é somado a saldo nem a caixinha. Só um valor digitado por você (atualizar saldo/caixinha) muda o dinheiro. | calculado |

## Datas — são quatro coisas diferentes

- **Competência** (`mes`): o mês a que a despesa/receita pertence (DRE, checklist).
- **Vencimento** (`dueDate`): quando precisa ser pago — já adiado pro próximo dia útil (`diasUteis.ts`).
- **Liquidação** (`pagoEm`): quando você marcou como paga de verdade. Fluxo de caixa realizado usa esta data, nunca o vencimento.
- **Data efetiva do gasto** (`data`, "AAAA-MM-DD"): o dia em que o gasto aconteceu ("ontem" → ontem). Diferente de **registro** (`criadoEm` do aparelho, `registradoEm` do servidor).

## Regra de corte (o que entra no saldo confirmado)

Um movimento conta no saldo confirmado se aconteceu **depois** da referência:

1. Data efetiva **posterior** ao dia da referência → conta.
2. Data efetiva **anterior** ao dia da referência → não conta (o banco já tinha descontado quando você digitou).
3. **Mesmo dia** da referência → conta se foi registrado depois de digitar o saldo (`criadoEm > atualizadoEm`).

Pagamento do checklist conta se `pagoEm > atualizadoEm` **e** o documento
tem `afetaSaldo: true` (todo pagamento marcado a partir desta versão). Os
pagamentos antigos, de antes dessa regra, ficam de fora — não dá pra saber
se já estavam no saldo digitado (ver `scripts/migracao-v2.ts`).

Ganho recebido **não** entra sozinho no saldo (decisão do dono do app: o
salário já está no valor que você digita). Ao receber, atualize o saldo.

### Exemplo

Referência: R$ 1.000 digitado dia 10 às 9h.

| Movimento | Data efetiva | Registro | Conta? |
|---|---|---|---|
| Almoço R$ 30 | dia 10 | dia 10, 13h | sim (mesmo dia, depois) |
| Café R$ 8 | dia 9 ("ontem") | dia 10, 13h | não (antes do dia da referência) |
| Internet paga R$ 100 | — | pagoEm dia 11 | sim |
| Depósito automático na caixinha R$ 0,10 | dia 10 | com o almoço | sim (transferência pro cofrinho) |

Saldo confirmado = 1.000 − 30 − 100 − 0,10 = **R$ 869,90**.

## Orçamento do dia ("pode gastar hoje")

Um único contrato, usado pela tela e pela notificação:

```
saldoNoInicioDoDia = saldoConfirmado + saídas de hoje já contadas no saldo
orçamentoDeHoje    = max(0, (saldoNoInicioDoDia − reserva) / diasRestantes)
restanteHoje       = orçamentoDeHoje − saídas de hoje
```

O gasto de hoje é descontado **uma vez**. Exemplo da auditoria (último dia do
mês, referência 100, gasto 30 hoje): saldo confirmado 70, início do dia 100,
orçamento 100, **restante 70** — e não 40.

## O que nunca pode acontecer

- Previsão (fatura prevista, comissão prevista, entrada a receber) somada ao saldo.
- Rendimento estimado somado ao saldo ou à caixinha.
- Compra no cartão de crédito registrada como gasto **e** o pagamento da
  fatura descontado de novo. Gasto registrado no Saldo = saída da conta
  (Pix, débito, dinheiro). Compra no cartão entra pela fatura.
- Excluir um par gasto/estorno quando os dois lados estão em lados
  diferentes da referência (o saldo mudaria sem explicação) — o app recusa;
  o par fica no histórico.
- Ajuste silencioso: mudar a referência sempre fica registrado em `conciliacoes`.

## Recorrências (contas fixas e assinaturas)

- Existem a partir do mês de início (`inicioEm`, ou o mês em que foram
  cadastradas) — não aparecem em meses anteriores.
- Mudar o valor grava `historicoValores: [{ desde, valor }]`: meses
  anteriores continuam com o valor antigo.
- Arquivar grava `desativadaEm` (mês): meses anteriores continuam com ela.

## Mês fechado

Fechar um mês grava o resumo e **as regras do Firestore** passam a recusar
criar/editar/apagar gasto, pagamento, fatura, comissão e ganho daquele mês.
Reabrir exige motivo, que vai pra auditoria.

## Dinheiro e arredondamento

Valores em reais com duas casas; todo total passa por `arredondarCentavos`
(arredondamento na segunda casa, `Math.round(v × 100) / 100`) no ponto de
saída. Migrar para centavos inteiros no banco é a próxima etapa do modelo
(pendência registrada em `docs/operacao.md`).
