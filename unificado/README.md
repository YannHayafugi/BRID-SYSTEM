# Gerador de Propostas – Securitização (FIA)

Sistema web para gerar, a partir de um formulário, a proposta técnica e comercial de
securitização em `.docx`, já com capa, timbrado (cabeçalho/rodapé) e corpo padronizado
da FIA – Fundação Instituto de Administração.

## O que o sistema faz

* Formulário com todos os campos variáveis da proposta (ente contratante, data de
emissão, destinatário, prazo, honorários, parcelas e o cronograma de etapas).
* Ao clicar em "Gerar proposta (.docx)", o servidor monta o documento Word completo
(capa + timbrado + corpo do texto formatado em Times New Roman 12, espaçamento 1,5)
e o navegador baixa o arquivo pronto.
* O cronograma (item 5 da proposta) é montado como uma tabela de 3 colunas (Etapa,
Atividades, Período), inserida automaticamente antes do parágrafo padrão do item,
com as etapas numeradas em algarismos romanos na ordem em que forem cadastradas.
É possível adicionar, remover e reordenar etapas.

## Estrutura do projeto

```
app/
  page.tsx              -> formulário (interface)
  api/generate/route.ts -> endpoint que gera o .docx
  layout.tsx, globals.css
lib/
  docxBuilder.ts   -> monta o documento Word (docx.js)
  types.ts         -> tipos dos dados do formulário
  extenso.ts       -> números por extenso (datas, valores, prazos)
  parseAtividades.ts -> interpreta o texto de "Atividades" de cada etapa
  roman.ts         -> numeração romana das etapas
  etapasPadrao.ts  -> conteúdo pré-preenchido das 5 etapas padrão
public/assets/     -> imagens da capa, cabeçalho e rodapé (timbrado FIA)
```

## Como publicar (passo a passo)

Você já tem conta no GitHub e na Vercel, então faltam três passos:

### 1\. Subir o projeto para o GitHub

1. Baixe/copie esta pasta (`proposta-securitizacao`) para o seu computador.
2. No GitHub, crie um repositório novo (por exemplo `proposta-securitizacao-fia`),
vazio, sem README.
3. No terminal, dentro da pasta do projeto:

```bash
   git init
   git add .
   git commit -m "Primeira versão do gerador de propostas"
   git branch -M main
   git remote add origin https://github.com/YannHayafugi/Gerador\_de\_Proposta\_Securitizacao
   git push -u origin main
   ```

   (Se preferir não usar linha de comando, você também pode arrastar os arquivos
pela interface web do GitHub em "Add file" > "Upload files" — exceto a pasta
`node\_modules`, que não deve ser enviada.)

### 2\. Importar na Vercel

1. Acesse [vercel.com/new](https://vercel.com/new) e escolha "Import Git Repository".
2. Selecione o repositório que você acabou de criar.
3. A Vercel detecta automaticamente que é um projeto Next.js — não é preciso
configurar nada, apenas clique em "Deploy".
4. Em poucos minutos você recebe uma URL pública (ex.:
`https://proposta-securitizacao-fia.vercel.app`) que pode ser acessada de
qualquer navegador.

### 3\. Atualizações futuras

Sempre que quiser alterar algo (texto padrão, campos do formulário, etc.), edite os
arquivos, faça `git commit` + `git push`, e a Vercel publica a nova versão
automaticamente.

## Testar localmente (opcional)

Se tiver Node.js instalado:

```bash
npm install
npm run dev
```

Depois acesse `http://localhost:3000`.

## Observações sobre o conteúdo da proposta

* O texto fixo do corpo (itens 1, 3, 4, 7 a 11) segue exatamente o conteúdo padrão
fornecido, com os trechos variáveis (`Município`/`Estado`, nome do ente, UF, data,
destinatário, prazo, honorários e parcelas) substituídos automaticamente.
* Valores por extenso (datas, honorários totais, valor da parcela e prazos em meses)
são calculados automaticamente a partir dos números informados no formulário.
* No campo "Atividades" de cada etapa, use `\*\*texto\*\*` para um título de grupo em
negrito e recue com espaços as linhas de sub-atividades (elas viram marcadores
“•” na tabela final). Esse é o mesmo padrão já usado no conteúdo pré-preenchido.

