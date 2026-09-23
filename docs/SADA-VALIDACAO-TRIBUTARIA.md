# SADA · Validação de fórmulas e valores tributários

Confere, linha a linha da dívida ativa, se multa, juros, correção monetária e
total batem com **a regra do ente** e com os limites legais.

Tela: **SADA > Validação**. O resumo também aparece em **SADA > Qualidade**,
na categoria "Validação tributária", com o mesmo export `.xlsx`.

## Por que a regra é por ente

Multa, juros e índice de correção da dívida ativa saem do Código Tributário de
cada município. O CTN fixa o padrão supletivo — juros de 1% ao mês quando a lei
não dispuser de outro modo (art. 161 §1º) — e a jurisprudência o teto da multa
de mora (20%). O resto muda de cidade para cidade **e ao longo do tempo**, por
isso o cadastro tem vigência: dívida de 2016 é conferida com a lei de 2016.

Quando o município usa a SELIC, ela já engloba juros e correção. Cobrar SELIC
**e** correção monetária à parte é cobrar a mesma coisa duas vezes — é uma das
verificações.

## O que é conferido

| Código | O que aponta | Precisa de regra? |
|---|---|---|
| `trib_total_soma` | total ≠ principal + atualização + juros + multa (folga de R$ 1,00) | não |
| `trib_multa_divergente` | multa diferente da alíquota cadastrada | sim |
| `trib_juros_divergente` | juros diferentes da taxa cadastrada aplicada aos meses de atraso | sim |
| `trib_correcao_divergente` | atualização diferente do índice anual cadastrado | sim |
| `trib_multa_teto` | multa acima de 20% do principal | não |
| `trib_juros_teto` | juros acima de 1% ao mês de atraso (CTN art. 161 §1º) | não |
| `trib_selic_e_correcao` | ente usa SELIC e a linha traz correção à parte | sim |
| `trib_sem_regra` | linha com encargos e nenhuma regra vigente — é cobertura, não erro do dado | não |
| `trib_venc_invalido` | mês/ano de vencimento ausente ou impossível | não |
| `trib_venc_futuro` | vencimento posterior à data-base da foto | não |
| `trib_prescricao` | vencida há mais de 5 anos na data-base (CTN art. 174) | não |

Os dois últimos são **alertas**, não erros: prescrição se interrompe
(parcelamento, citação, confissão), e o sistema não tem esses eventos.

## Como o esperado é calculado

Para cada linha, com `m` = meses de atraso entre o vencimento e a data-base:

- **multa única:** `principal × multa%`
- **multa progressiva:** `principal × min(multa% × m, teto%)`
- **juros mensais:** `principal × juros% × m` (juros simples, como o CTN)
- **juros SELIC:** `principal × ((1 + selic_média)^(m/12) − 1)` — aproximação,
  só quando a média anual foi informada
- **correção:** `principal × ((1 + índice)^(m/12) − 1)`; zero quando o ente usa SELIC

Uma diferença só é apontada quando passa da tolerância, que é a maior entre um
percentual sobre o esperado (padrão 5%) e um piso em reais (padrão R$ 1,00).

**Data-base:** 31/12 do último ano do lote (`ano_fim` da importação vigente).
A planilha é uma foto e não diz o dia da extração — daí a tolerância.

## Onde cada coisa mora

| Arquivo | Papel |
|---|---|
| `supabase/sada-regras-tributarias.sql` | tabela `sada_regra_tributaria` e as três views |
| `lib/sada/tributario.ts` | catálogo das verificações, tipos e a mesma fórmula em TypeScript (simulador) |
| `app/api/sada/regras/route.ts` | cadastro das regras (escrita só de superadmin) |
| `app/api/sada/validacao/route.ts` | resumo e detalhe |
| `app/sada/validacao/page.tsx` | tela: resultado, cadastro e simulador |
| `scripts/sada-tributario-teste.ts` | compara o TypeScript com a saída do Postgres |

A conta roda no banco porque são centenas de milhares de linhas. A mesma
fórmula existe em TypeScript só para o simulador da tela. **Se mexer numa,
mexa na outra** e rode `npm run sada:teste-tributario`.

## Cadastrando uma regra

1. SADA > Validação > aba **Regras do ente**, com um cliente selecionado.
2. **Nova regra**: escolha o CNPJ, o tributo (`*` = todos) e o início da
   vigência. Lei nova não substitui a antiga: cadastre outra regra com o
   início da nova vigência e feche a anterior pelo campo de fim.
3. Preencha multa, juros e correção conforme a lei do município e escreva o
   **fundamento** ("Lei Municipal 1.234/2015, art. 8º") — é o que permite
   defender o número depois.
4. Use o **simulador** antes de salvar: ele mostra o que a regra espera de uma
   dívida vencida, com a mesma fórmula da validação.

Regra específica ganha da genérica: com uma regra para `*` e outra para `IPTU`,
as dívidas de IPTU usam a de IPTU.

## Limites conhecidos

- **SELIC é aproximada.** Não temos a série mês a mês; sem a média anual
  informada, os juros não são recalculados (só os tetos e a aritmética valem).
- **Honorários** são cadastrados, mas ainda não entram em nenhuma verificação.
- **Encargos costumam vir vazios.** Na base de São Vicente, `atualizacao`,
  `juros`, `multa` e `total` só estão preenchidos em 2 dos 11 anos. Onde o
  campo é nulo, nada é comparado — e é por isso que `trib_sem_regra` e o total
  de linhas examinadas merecem ser lidos junto com o resultado.
- **A data-base é 31/12.** Foto extraída em outro mês desloca os meses de
  atraso; ajuste a tolerância do ente se isso gerar ruído.
