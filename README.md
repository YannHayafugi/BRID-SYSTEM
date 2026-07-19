# GRUPO BRID — Gerador de Propostas e Gestão de Processos

Sistema web de gestão de processos de propostas para entes públicos: cadastro de
órgãos (clientes), abertura e acompanhamento de processos por fases (Follow-up),
análise de Termo de Referência (TR) com IA, geração automática de Proposta +
Resumo com timbrado FIA, emissão de Ofício, dashboard gerencial e histórico
auditável — multiusuário, com papéis e permissões.

**Stack:** Next.js 14 (App Router, TypeScript) · Supabase (Postgres + Auth +
Storage, RLS) · Vercel · OpenAI (análise de TR e geração de proposta) ·
docx.js / pdf-parse / mammoth.

---

## 1. Implementações

Evolução registrada por decisões numeradas (D1–D51), da migração do modelo
antigo (senha única, app Vite) para o sistema atual:

* **D1–D14 — Fundação:** migração para Supabase Auth multiusuário com papéis
  (admin/editor/visualizador) e RLS; cadastro central de Órgãos com contatos;
  processos do Follow-up com fluxo de documentos TR → Proposta → Ofício.
* **D18–D29 — Navegação e acompanhamento:** header global com modais (Órgãos,
  Histórico, Administração, Perfil); timeline vertical de fases na página do
  órgão; troca de fase manual com data de autenticação e histórico; sino de
  notificações global; "criado por" visível para admins.
* **D36–D39 — Follow-up produtivo:** filtros (órgão, período, fase), edição de
  título/órgão, modais de "Abrir processo" e "Novo órgão" reutilizando o
  formulário completo; análise de TR automática a partir do arquivo já anexado.
* **D40–D42 — Análise de TR em modal com rascunho:** a análise abre em modal
  (sem sair da página) e o resultado da IA é salvo imediatamente como rascunho
  (`status em_analise`) — fechar/reabrir não perde nada nem repete a IA; botão
  com 3 estados (Analisar / Pré-análise pronta / Concluída ✓); suporte a TR em
  PDF **e DOCX**; dashboard sem processos finalizados nas listas.
* **D43–D48 — Papéis nas fases:** admin muda o processo para **qualquer** fase;
  editor **avança para a próxima** fase; visualizador só consulta (timeline em
  dropdown); cards-resumo no topo do Follow-up; tag e seção "✅ Finalizados";
  Histórico mostra apenas o que o próprio usuário criou.
* **D49–D51 — Permissões e feedback:** permissões de análises derivadas do
  perfil; exclusão de análise por editor vira **solicitação aprovada pelo
  admin**; botão 💬 de erros/sugestões com notificação ao admin; remoção da
  senha legada do localStorage.

## 2. Funcionalidades

* **Órgãos (clientes):** cadastro completo (tipo de ente, razão social, CNPJ
  único, cidade/UF, contatos), edição e página de detalhe com os processos do
  órgão.
* **Follow-up:** abertura de processos vinculados a um órgão; 8 fases (3
  automáticas 🤖 guiadas pelos documentos + 5 manuais ✋ com data de
  autenticação); cards-resumo (Em andamento / Finalizados / Total); filtros;
  seção separada de finalizados; edição de título/órgão; exclusão.
* **Análise de TR com IA:** upload de PDF/DOCX (ou uso do TR já anexado ao
  processo); achados classificados com ciência/comentário obrigatórios;
  rascunho persistente; relatório final em PDF gravado no Histórico e
  vinculado ao processo.
* **Geração de Proposta:** a partir do TR, gera Proposta + Resumo executivo em
  `.docx` com timbrado FIA; aprovação da proposta libera o Ofício.
* **Ofício:** emissão vinculada ao processo após aprovação da proposta.
* **Dashboard:** 8 KPIs, funil por fase, evolução mensal, ranking de órgãos,
  automática × manual; listas "por fase" e "progresso" (sem finalizados);
  filtros e drill-down para o Follow-up.
* **Histórico:** análises de TR e processos criados pelo próprio usuário;
  detalhe da análise com edição versionada (justificativa obrigatória +
  histórico de versões).
* **Notificações (🔔):** pendências de automação e fases manuais; para admins,
  solicitações de exclusão e feedbacks dos usuários.
* **Erros e sugestões (💬):** qualquer usuário relata erro ou sugere melhoria;
  admin recebe, acompanha e marca como resolvido.
* **Administração de usuários:** criação com senha provisória, papel
  (admin/editor/visualizador) e ativação/desativação.
* **Perfil e tema:** edição de nome/e-mail/senha; tema claro/escuro persistente
  (inclusive no login).

## 3. Camadas de segurança

1. **Autenticação** — Supabase Auth (e-mail/senha); sem sessão, as rotas de API
   respondem 401 e as páginas redirecionam ao login. Nenhuma senha é gravada
   no navegador (a chave legada `senha` do modelo antigo é removida
   automaticamente do localStorage).
2. **Autorização por papel (RLS + API)** — todas as tabelas `gp_*` têm Row
   Level Security; as regras valem no banco, não só na interface:
   * *Admin*: acesso total — muda processos para qualquer fase, edita/exclui
     análises, aprova exclusões, administra usuários.
   * *Editor*: cria/edita análises e propostas; só avança processos para a
     próxima fase; exclusão de análise apenas via solicitação aprovada.
   * *Visualizador*: somente leitura.
   * Usuário **inativo** perde o acesso aos dados imediatamente (checagem
     `p.ativo` nas policies).
3. **Dupla validação** — as rotas de API revalidam papel e regra de negócio no
   servidor (ex.: editor tentando pular fase recebe 403), independentemente do
   que a interface mostra.
4. **Auditoria** — histórico de fases com data de autenticação e autor; edição
   de achados versionada com justificativa obrigatória; solicitações de
   exclusão registram quem pediu, quem decidiu e quando; feedbacks registram
   autor e página.
5. **Administração restrita** — rotas `/api/admin/*` exigem perfil admin e usam
   a service key **apenas no servidor**; chaves sensíveis ficam em variáveis de
   ambiente da Vercel (nunca no cliente).

---

## 4. Criando novos módulos e funcionalidades (com IA)

O projeto mantém um **arquivo de contexto** para desenvolvimento assistido por
IA: [`docs/CONTEXTO.md`](docs/CONTEXTO.md). Ele resume arquitetura, convenções,
tabelas, papéis e os padrões obrigatórios (modais, RLS, decisões numeradas).

### Fluxo recomendado

1. **Anexe o contexto:** envie `docs/CONTEXTO.md` junto do pedido (ou peça para
   o agente lê-lo primeiro).
2. **Descreva o módulo** com o prompt-modelo abaixo.
3. **Confirme o plano antes do código:** peça sempre "confirme o que será
   implementado antes de implementar".
4. **Valide e publique:** revise o diff, rode `npm run build` local se
   possível, e faça commit/push (a Vercel publica sozinha).
5. **Registre a decisão:** toda mudança relevante ganha um número `D<n>`
   comentado no código e citado no commit.

### Prompt-modelo

```text
Leia o arquivo docs/CONTEXTO.md antes de começar.

Quero criar o módulo/funcionalidade: <nome>

O que ele deve fazer:
- <comportamento 1>
- <comportamento 2>

Quem pode usar: <admin / editor / visualizador — o que cada um pode fazer>

Onde aparece: <página nova ou existente, modal, header, notificações...>

Dados: <novas tabelas/colunas necessárias, ou tabelas existentes envolvidas>

Regras de segurança: aplicar RLS no banco seguindo o padrão do CONTEXTO.md
(admin/editor/visualizador + usuário ativo) e revalidar no servidor.

Confirme comigo o que será implementado antes de escrever código.
```

---

## Estrutura do projeto

```
app/
  dashboard/         -> KPIs, gráficos e listas gerenciais
  followup/          -> processos por fase (núcleo operacional)
  orgaos/[id]/       -> detalhe do órgão + processos (Ações)
  historico/         -> análises de TR e processos do usuário
  tr-analise/        -> análise de TR (também aberta em modal)
  oficio/            -> emissão de ofício
  login/, perfil/, arquivos/
  api/               -> rotas (processos, tr, orgaos, admin, generate...)
  components/        -> Modal, BarraUsuario, NotificacoesBotao, FeedbackBotao,
                        AnaliseTRConteudo, ProcessoTimeline, FormularioOrgao...
lib/                 -> docxBuilder, pdfExtract, etapas do fluxo, tipos, IA
docs/                -> CONTEXTO.md (contexto p/ IA), PLANO-MIGRACAO.md
supabase/            -> schema unificado (referência)
```

## Rodar localmente

```bash
npm install
npm run dev   # http://localhost:3000
```

Variáveis necessárias (`.env.local`): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`.

## Publicação

`git commit` + `git push` na branch principal — a Vercel faz build e publica
automaticamente.
