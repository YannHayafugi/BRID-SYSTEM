# SADA · importação de arquivos grandes

Planilhas acima de **80 MB** deixam de ser lidas no navegador: o arquivo é
enviado ao servidor, que lê em streaming e grava direto no banco. Abaixo desse
tamanho nada muda — continua tudo no navegador, como antes.

## Por que existe esse corte

Medições feitas nesta máquina, com as planilhas reais:

| O que | Resultado |
|---|---|
| Alocar 1 GB de memória no navegador | funciona |
| Alocar **2 GB** | `RangeError: Array buffer allocation failed` |
| Teto de memória de uma aba | ~4 GB |
| Memória usada pela leitura inteira | **35 a 50× o tamanho do arquivo** |
| Leitura em streaming (22 MB, 486 mil linhas) | 20,9 s, pico de 287 MB |

Ou seja: um arquivo de 2 GB **não abre** no navegador — falha antes de ler a
primeira linha. E mesmo que abrisse, precisaria de dezenas de GB de memória.

## Como funciona o caminho do servidor

1. O navegador sobe o arquivo (barra de progresso de envio) para
   `POST /api/sada/importar/arquivo`. O corpo é gravado direto em disco, sem
   passar inteiro pela memória.
2. O servidor lê em streaming — `.xlsx` pelo leitor do exceljs, `.csv`/`.txt`
   linha a linha — traduz pelo DE/PARA do ente e roda a mesma verificação de
   qualidade da tela.
3. As linhas entram no Postgres por **COPY** quando há conexão direta
   (`SADA_DB_URL`); sem ela, caem para a API do Supabase, que funciona e é
   muito mais lenta.
4. O lote nasce **não vigente** e só passa a valer no fim. Numa carga de horas,
   aposentar o lote anterior logo no começo deixaria o dashboard vazio o tempo
   todo.
5. A tela acompanha pelo número da importação — e pode ser fechada: o trabalho
   continua no servidor e o andamento fica gravado em `sada_importacao_arquivo`.

Se a planilha tiver problema impeditivo, o lote é apagado inteiro e o retrato
anterior continua valendo — o mesmo critério do caminho do navegador.

## Sem servidor com disco: importar pela sua máquina

Enquanto não houver VPS, o caminho pelo navegador e o pelo servidor estão os
dois fora de alcance para arquivos grandes. Mas o arquivo já está na máquina de
quem trabalha — e ela fala com o banco. É para isso que existe
`scripts/sada-importar.ts`.

Ele usa **o mesmo código do servidor**: mesma tradução pelo DE/PARA, mesma
verificação de qualidade, mesma regra de só trocar o lote vigente no fim. Muda
apenas quem lê o arquivo.

**Antes da primeira vez**, no `.env.local` do projeto (o mesmo que o site usa),
acrescente a conexão do banco — é ela que habilita o COPY, que é o caminho
rápido:

```
SADA_DB_URL=postgresql://postgres:SUA_SENHA@db.SEU_PROJETO.supabase.co:5432/postgres
```

A string está em Supabase > Project Settings > Database > Connection string
(modo *Session*). Sem ela o script funciona igual, mas grava pela API do
Supabase e demora bem mais.

**Conferir antes de gravar** (lê o arquivo inteiro e relata, sem tocar no banco):

```powershell
npm run sada:importar -- --arquivo "C:\dados\DIVIDA 2026.xlsx" --cnpj 46578393000163 --tipo divida_ativa --conferir
```

**Importar de verdade:**

```powershell
npm run sada:importar -- --arquivo "C:\dados\DIVIDA 2026.xlsx" --cnpj 46578393000163 --tipo divida_ativa
```

Tipos aceitos: `divida_ativa`, `lancamentos`, `recebimentos`, `recebimentos_da`.
Opções: `--mapa <nome>` escolhe qual DE/PARA usar, `--padrao` ignora o cadastro
e usa o layout posicional histórico.

O script mostra o andamento em linhas por segundo e, no fim, o relatório de
qualidade. Se houver problema impeditivo, nada é publicado — o lote é apagado e
o retrato anterior continua valendo, igual à tela.

Depois da carga o dashboard já reflete o lote novo: as views materializadas são
atualizadas no fim, como na importação pelo site.

## O que precisa estar configurado no servidor

**Não funciona em plataforma serverless** (Vercel e afins): o processo morre ao
responder, e não há disco. A rota recusa explicitamente lá. É um recurso do VPS.

| Variável | Para quê |
|---|---|
| `SADA_DB_URL` | Conexão direta ao Postgres, no formato `postgresql://usuario:senha@host:5432/postgres`. É o que habilita o COPY. Sem ela a carga usa a API e demora muito mais. Pegue em Supabase > Project Settings > Database > Connection string. |
| `SADA_UPLOAD_DIR` | Pasta onde os arquivos ficam durante a leitura. Padrão: pasta temporária do sistema. Precisa de espaço para o maior arquivo. |

**Nginx** (`deploy/nginx/brid.conf`): `client_max_body_size` precisa ser maior
que o maior arquivo. O padrão do projeto é 50 MB; para arquivos de 2 GB use
`client_max_body_size 3g;`. O timeout de 300 s já cobre o envio, porque o
servidor responde assim que recebe o arquivo — a leitura continua depois.

## Quanto ocupa no banco

Medido na base real: `sada_lancamentos` tem 4.003.692 linhas ocupando 867 MB
com índices — **227 bytes por linha**.

| Linhas | Espaço estimado |
|---|---|
| 5 milhões | ~1,1 GB |
| 20 milhões | ~4,5 GB |
| 45 milhões | ~10 GB |

Um `.xlsx` de 2 GB, pela taxa de compressão das planilhas atuais (~45 bytes por
linha), equivale a algo perto de 45 milhões de linhas — e o formato só admite
1.048.576 linhas por aba, então seriam 40+ abas. Antes de subir um arquivo
assim, vale conferir o espaço contratado no banco.

## Recomendação: peça CSV ao ente

Num `.xlsx`, os textos ficam numa tabela compartilhada que precisa ser mantida
em memória durante toda a leitura. Ela cresce com a quantidade de valores
distintos (CNPJs, inscrições) e, num arquivo de vários GB, pode passar de 1 GB
sozinha. O CSV não tem esse custo: a leitura é linha a linha, com memória
praticamente constante, e é bem mais rápida.

O sistema aceita os dois. Quando houver escolha, CSV é melhor para todos os
lados.

## Onde cada coisa mora

| Arquivo | Papel |
|---|---|
| `supabase/sada-importacao-servidor.sql` | tabela de acompanhamento |
| `lib/sada/ingestao.ts` | leitura em streaming (xlsx e csv) e gravação por COPY |
| `app/api/sada/importar/arquivo/route.ts` | upload, processamento em segundo plano, status e cancelamento |
| `app/sada/atualizacao/page.tsx` | escolhe o caminho pelo tamanho do arquivo |
| `scripts/sada-ingestao-teste.ts` | `npm run sada:teste-ingestao` — leitura real e formato do COPY |
