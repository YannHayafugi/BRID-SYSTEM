# SADA · Previsão Orçamentária da Dívida Ativa

Modelo de projeção do estoque e da recuperação de dívida ativa para 10 anos.
Este documento explica **as fórmulas, de onde saem os parâmetros e como usá-las** —
inclusive o que o modelo não é capaz de dizer.

Todos os números de calibração vêm da base do ente carregada no SADA
(4 planilhas, exercícios 2015–2025). Ao trocar de ente, **recalibre**: a seção
final descreve como.

---

## 1. Por que não é uma regressão sobre o estoque

O caminho intuitivo — ajustar uma curva na série do estoque e estender por 10 anos —
não se sustenta com estes dados, por três motivos levantados na base real.

### 1.1 O estoque com encargos tem 2 pontos, não 11

`atualizacao`, `juros`, `multa` e `total` estão preenchidos **apenas em 2015 e 2025**.
Nos nove exercícios intermediários são nulos em 100% das linhas — é o que a view
`sada_vw_qualidade` reporta como "Dívida Ativa — total nulo".

| Campo | Anos com dado |
|---|---|
| `valor` (principal) | 2015–2025 (11) |
| `atualizacao`, `juros`, `multa`, `total` | 2015 e 2025 (2) |

Dois pontos definem uma reta, não uma tendência. Qualquer intervalo de confiança
sobre eles seria decorativo.

### 1.2 `ano` é safra de inscrição, não foto anual do saldo

Na `sada_divida_ativa`, `ano` identifica o exercício em que o crédito foi inscrito
(o `ano_venc` acompanha). A tabela não contém uma série de saldos — contém **uma
foto do que está em aberto, decomposta por safra**.

Isso é melhor do que uma série de saldos: permite modelar recuperação por idade.

### 1.3 2025 é quebra estrutural

A razão títulos por contribuinte fica entre 2,0 e 2,2 por nove anos e salta para 6,08:

| | 2022 | 2023 | 2024 | **2025** |
|---|---|---|---|---|
| Títulos | 15.014 | 15.507 | 16.265 | **52.495** |
| Contribuintes | 6.959 | 7.157 | 7.747 | **8.634** |
| Títulos/contribuinte | 2,16 | 2,17 | 2,10 | **6,08** |
| Ticket médio (R$) | 521 | 576 | 569 | **450** |

Contribuintes cresceram +11%, dentro da tendência; títulos cresceram +223% e o
ticket médio **caiu**. Não é fenômeno de valor, é de quantidade de parcelas
inscritas por contribuinte. Duas causas somadas:

- **TCL entra pela primeira vez** — 17.210 títulos, R$ 1,93 mi, inexistente em
  qualquer exercício anterior;
- **IPTU dobra as parcelas por contribuinte** — de 2,54 para 4,88.

Tratar 2025 como ponto de tendência embutiria um degrau de 2,5× em todos os 10 anos
projetados. O modelo ajusta a tendência em **2016–2024** e usa 2025 apenas como
saldo de abertura.

> **Hipótese que exige decisão administrativa:** se a mudança de política de
> inscrição for permanente, o patamar de ~6 títulos/contribuinte vale para 2026+
> e a base de inscrição é outra. Se foi mutirão pontual, volta para ~2,1. Os dados
> não distinguem os dois casos — por isso o patamar é **parâmetro de tela**, não
> constante de código.

---

## 2. O modelo: equação de balanço

Em vez de extrapolar o estoque, projetam-se os **fluxos** (que estão íntegros nos
11 exercícios) e o estoque emerge da identidade contábil:

```
E_t = E_{t-1} + I_t + A_t − R_t − C_t
```

| Símbolo | Significado | Unidade |
|---|---|---|
| `E_t` | Estoque de dívida ativa ao fim do exercício `t` | R$ |
| `I_t` | Inscrições novas do exercício | R$ |
| `A_t` | Atualização monetária + juros de mora sobre o saldo | R$ |
| `R_t` | Recuperação (arrecadação de dívida ativa) | R$ |
| `C_t` | Baixas: prescrição, cancelamento, remissão, anistia | R$ |

Cada termo tem sua própria fórmula, abaixo.

---

## 3. As fórmulas

### 3.1 Inscrições novas — `I_t`

```
I_t = L_t × (1 − τ_t) × φ
```

| | |
|---|---|
| `L_t` | Lançamento do exercício (`sada_lancamentos`) |
| `τ_t` | Adimplência corrente — fração paga dentro do próprio exercício |
| `φ` | Fração do inadimplido que efetivamente é inscrita em DA |

`φ` existe porque nem todo crédito vencido migra para dívida ativa no mesmo ano:
parcelamentos ativos, impugnações administrativas e o prazo legal de inscrição
seguram parte. É o parâmetro mais difícil de estimar e o mais sensível — ver §5.

### 3.2 Projeção dos fluxos — `L_t`

Ajuste **log-linear**, que impõe crescimento não-negativo e trata variação
percentual como constante:

```
ln L_t = a + b·t          →          L_t = L_base · (1 + g)^(t − base)
```

onde `g = e^b − 1`. Estimadores por mínimos quadrados sobre `n` pontos:

```
b = Σ(t − t̄)(ln L_t − ln L)  /  Σ(t − t̄)²
a = ln L − b · t̄
```

Alternativa mais simples, sem regressão (usa só os extremos):

```
g_CAGR = (L_fim / L_ini)^(1/n) − 1
```

O CAGR ignora tudo que acontece entre os extremos. Com série curta e ruidosa, o
log-linear é preferível — mas os dois devem ser reportados: divergência grande
entre eles é sinal de que a tendência não é estável.

### 3.3 Atualização monetária e juros — `A_t`

```
A_t = E_{t-1} × (i_t + j)
```

| | |
|---|---|
| `i_t` | Índice de correção monetária — IPCA-E, IPCA ou SELIC, conforme a lei municipal |
| `j` | Juros de mora — CTN art. 161 §1º admite 1% a.m. (12% a.a.) na ausência de lei específica |

> **A multa não entra aqui.** Multa de mora incide **uma vez**, no momento da
> inscrição, e já está embutida em `I_t`. Aplicá-la anualmente sobre o saldo é o
> erro mais comum nesse tipo de projeção e infla o estoque de forma composta.

Quando o município usa SELIC, `i` e `j` **não se somam** — a SELIC já é taxa única
que engloba correção e juros (Lei 9.430/96 art. 61 §3º, por analogia). Somar os dois
duplica o encargo.

### 3.4 Recuperação por safra — `R_t`

A recuperação depende fortemente da idade da dívida. Uma taxa única aplicada a todo
o estoque superestima a recuperação de dívida antiga.

```
R_t = Σ_v  E_{v,t-1} × ρ(t − v)
```

`E_{v,t-1}` é o saldo remanescente da safra `v`, e `ρ(k)` é a taxa de recuperação de
uma dívida com `k` anos de idade.

**Atenção a uma distinção que quebra modelos silenciosamente.** Existem dois objetos
diferentes e eles não são intercambiáveis:

| | Definição | Soma |
|---|---|---|
| `w(k)` | Fração do total recuperado que ocorre na idade `k` | 100% |
| `ρ(k)` | Fração do **saldo ainda aberto** na idade `k` que é paga naquele ano | não soma 100% |

O que se mede diretamente nos dados é `w(k)`. A conversão exige o saldo por idade:

```
R(k) = L_ciclo × w(k)                    (recuperado na idade k, base 100 de inscrição)
S(k) = S(k−1) − R(k−1),   S(0) = 100     (saldo ao entrar na idade k)
ρ(k) = R(k) / S(k)
```

onde `L_ciclo` é a taxa de recuperação de ciclo de vida (§4.3).

### 3.5 Prescrição — `C_t`

```
C_t = Σ_v  E_{v,t-1} · 1[t − v ≥ 5] · (1 − θ)
```

CTN art. 174: cinco anos da constituição definitiva do crédito. `θ` é a fração com
prescrição **interrompida** — despacho que ordena a citação, protesto judicial,
qualquer ato de constituição em mora, ou reconhecimento do débito pelo devedor
(parcelamento, confissão). Em municípios com cobrança ativa, `θ` costuma ser alto,
e tratá-lo como zero subestima o estoque de forma grave.

### 3.6 Provisão para perdas — MCASP

```
Ajuste_t = E_t × (1 − ρ̄)
```

`ρ̄` = média móvel da razão recuperação/estoque dos últimos 3 a 5 exercícios. É o
ajuste para perdas exigido pelo MCASP no reconhecimento do ativo.

### 3.7 Receita a orçar

A preços correntes, a receita de dívida ativa a inscrever na peça orçamentária é a
própria `R_t`. Para comparar com séries históricas reais:

```
R_t^real = R_t / (1 + π)^(t − base)
```

---

## 4. Parâmetros calibrados nesta base

### 4.1 Taxas de crescimento

| Série | Janela | CAGR |
|---|---|---|
| Lançamentos | 2015→2025 | 21,3% a.a. |
| Lançamentos | 2015→2024 (sem a quebra) | 23,2% a.a. |
| Arrecadação DA | 2015→2025 | 21,2% a.a. |
| Inscrições (principal) | 2015→2024 | 18,5% a.a. |
| Inscrições (principal) | 2016→2024 | 24,9% a.a. |
| Estoque com encargos | 2015→2025 (2 pontos) | 12,3% a.a. |

> **Estes são valores nominais.** Cobrem uma década de inflação relevante; o
> crescimento real é substancialmente menor. Projetar 10 anos a 21% nominal sem
> separar inflação de crescimento real produz um número grande e sem significado
> orçamentário. Use sempre a decomposição do §3.7.

> **Note a sensibilidade à janela**: as inscrições dão 18,5% ou 24,9% conforme o
> ponto inicial. Uma diferença de 6 p.p. compostos por 10 anos quase dobra o
> resultado. Por isso o modelo expõe a janela como parâmetro e reporta os dois.

### 4.2 Encargos implícitos

Derivado da safra 2015, cuja razão `total / principal` é **4,237** após 10 anos:

```
(4,237)^(1/10) − 1 = 15,5% a.a.
```

Consistente com 12% de juros de mora (CTN) + ~3,5% de correção. É um parâmetro
**observado nos dados do ente**, não uma suposição — e serve de teste de sanidade
para o `i + j` que se escolher.

### 4.3 Curva de recuperação por idade

Medida sem depender de join, a partir de `ano_arrec − ano_venc` em
`sada_recebimentos_da` (67.897 pagamentos):

| Idade `k` | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `w(k)` % | **58,9** | **19,9** | 8,3 | 4,3 | 3,2 | 2,0 | 1,0 | 0,9 | 0,6 | 0,5 | 0,4 | 0,2 |

**79% de tudo que se recupera entra nos dois primeiros anos.** Após cinco anos
resta 3,5% do total. Aproximação geométrica: `w(k) ≈ w₀·λ^k` com `w₀ ≈ 0,589` e
`λ ≈ 0,40` nos primeiros passos (a cauda é mais gorda que a geométrica pura —
prefira a tabela empírica quando a safra tiver mais de 4 anos).

### 4.4 Taxa de recuperação de ciclo de vida

```
Recuperado 2015–2025          R$ 17,61 mi     (exercícios completos)
Estoque em aberto (2025)      R$ 27,14 mi
L_ciclo = 17,61 / (17,61 + 27,14) ≈ 39,4%
```

**O recorte importa.** A `sada_vw_arrecadacao_ano` traz R$ 19,27 mi no total, porque
inclui R$ 1,64 mi de 2026 (exercício em curso, incompleto) e R$ 0,02 mi de resíduo
anterior a 2015. Usando tudo, `L_ciclo` sobe para **41,5%**. O modelo adota 39,4%
por consistência — misturar um exercício parcial numa taxa de ciclo de vida
sobrestima a recuperação anualizada. Ao recalibrar, **filtre exercícios completos**.

> **Caveat forte:** este número soma valores nominais de exercícios diferentes, sem
> deflacionar, e mistura safras em estágios distintos de maturação. Serve como
> âncora de ordem de grandeza, não como estimativa precisa. Refiná-lo exige
> deflacionar cada exercício e acompanhar safras fechadas.

Aplicando `L_ciclo` à curva `w(k)`, a taxa sobre saldo aberto fica:

| Idade `k` | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| `ρ(k)` % | 23,2 | 10,2 | 4,7 | 2,6 | 2,0 | 1,3 |

### 4.5 Taxa agregada (para comparação)

`R_2025 / E_2025 = 3,36 / 27,14 = 12,4%`. É a taxa única que a curva por safra
substitui — mantida apenas como referência de sanidade do agregado.

---

## 5. Exemplo de uso — projetando 2026

Cenário base: correção `i` = 4,0%, juros `j` = 12,0%, `φ` = 0,85, crescimento das
inscrições `g` = 18,5%.

**Passo 1 — saldo de abertura**

```
E_2025 = R$ 27.141.748        (estoque com encargos, foto de 2025)
```

**Passo 2 — atualização e juros**

```
A_2026 = 27.141.748 × (0,04 + 0,12) = R$ 4.342.680
```

**Passo 3 — inscrições novas**

Base 2024 (último exercício antes da quebra), projetada dois anos:

```
I_2026 = 9.254.078 × (1,185)² × 0,85 ≈ R$ 11.045.586
```

**Passo 4 — recuperação por safra**

Aplica `ρ(k)` a cada safra conforme a idade que ela terá em 2026 — safra 2025 entra
com `k=1`, safra 2024 com `k=2`, e assim por diante:

```
R_2026 = Σ_v  E_{v,2025} × ρ(2026 − v)
```

**Passo 5 — prescrição**

Safras de 2021 e anteriores completam 5 anos. Com `θ` = 0,7 (70% com prescrição
interrompida por cobrança ativa), baixa-se 30% do saldo dessas safras.

**Passo 6 — fechamento**

```
E_2026 = E_2025 + I_2026 + A_2026 − R_2026 − C_2026
```

O resultado de `E_2026` vira o `E_{t-1}` de 2027, e assim por diante até 2035.

---

## 6. Cenários

Três trajetórias, variando os dois parâmetros de maior alavancagem:

| Cenário | `g` (inscrições) | `ρ` (recuperação) |
|---|---|---|
| Conservador | `ḡ − 1σ` | `ρ̄ − 1σ` |
| Base | `ḡ` | `ρ̄` |
| Otimista | `ḡ + 1σ` | `ρ̄ + 1σ` |

`σ` é o desvio-padrão da série histórica de cada parâmetro. Um intervalo de
confiança estatístico formal foi descartado: com 9 a 11 pontos anuais, a banda de
95% fica larga demais para orientar decisão orçamentária, e a aparência de rigor
seria enganosa.

---

## 7. Limitações

Ler antes de usar o resultado em peça orçamentária.

1. **Série curta.** Nove a onze observações anuais. Nenhum método — inclusive os
   deste documento — extrai tendência confiável de 10 anos a partir disso. A
   projeção é um **cenário condicionado a hipóteses explícitas**, não uma previsão.

2. **`φ` não é observável nesta base.** A fração do inadimplido que vira inscrição
   depende de parcelamentos e impugnações, que não estão nas 4 planilhas. É
   arbitrada e deve ser conferida com a Procuradoria.

3. **Estoque com encargos tem 2 pontos.** O saldo de abertura de 2025 é sólido; a
   trajetória histórica do estoque com encargos, não.

4. **`sequencia` não junta as tabelas.** Verificado: 67.897 recebimentos de DA, zero
   casaram com os 175.612 títulos em aberto. Os conjuntos são disjuntos por
   construção — título pago sai do estoque. Isso é coerente, mas impede análise
   título a título, e a curva por idade depende de `ano_arrec − ano_venc` como
   aproximação.

5. **Quebra estrutural de 2025 não resolvida.** Ver §1.3. Enquanto a natureza da
   mudança não for confirmada administrativamente, os dois patamares devem ser
   rodados como cenários distintos.

6. **Sem efeito de política.** O modelo é inercial: não captura programas de
   recuperação fiscal, REFIS, anistias, mudança de alíquota, atualização de planta
   genérica de valores ou protesto de CDA. Qualquer um deles desloca a curva de
   forma que a série histórica não antecipa.

---

## 8. Referências normativas

| Tema | Norma |
|---|---|
| Prescrição do crédito tributário (5 anos) | CTN art. 174 |
| Juros de mora — 1% a.m. na ausência de lei | CTN art. 161 §1º |
| Inscrição em dívida ativa e requisitos da CDA | Lei 6.830/80 art. 2º; CTN art. 202 |
| Previsão e arrecadação de receita, renúncia | LRF (LC 101/2000) arts. 11–14 |
| Anexo de Metas Fiscais | LRF art. 4º §2º |
| Ajuste para perdas de dívida ativa | MCASP, parte II |

---

## 9. Como recalibrar para outro ente

Todos os parâmetros do §4 são específicos desta base. Ao carregar outro município:

1. **Refazer §4.1** — CAGR das séries, testando pelo menos duas janelas.
2. **Refazer §4.2** — `total / principal` da safra mais antiga com encargos
   preenchidos, elevado a `1/idade`.
3. **Refazer §4.3** — distribuição de `ano_arrec − ano_venc` sobre
   `sada_recebimentos_da` do ente.
4. **Refazer §4.4** — recuperado acumulado sobre recuperado + estoque em aberto.
5. **Repetir o teste de quebra estrutural** — razão títulos/contribuinte por
   exercício. Um salto acima de ~1,5× merece investigação antes de virar tendência.
6. **Conferir se `total` está preenchido** em todos os exercícios. Se não estiver,
   trabalhe com `valor` (principal) e reconstrua os encargos pelo §4.2.

O passo 5 é o mais importante e o mais esquecido: foi ele que impediu, nesta base,
um erro de 2,5× propagado por 10 anos.
