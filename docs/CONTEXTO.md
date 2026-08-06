# CONTEXTO.md — Contexto do projeto para desenvolvimento (humano ou IA)

> Anexe este arquivo (ou peça para o agente lê-lo) antes de criar qualquer
> módulo ou funcionalidade nova. Ele define a arquitetura, as convenções e os
> padrões obrigatórios do sistema.

## O que é o sistema

Gestão de processos de propostas do GRUPO BRID para entes públicos: Órgãos
(clientes) → Processos no Follow-up (8 fases) → documentos TR → Proposta →
Ofício, com análise de TR por IA, dashboard, histórico auditável e
administração de usuários.

## Stack e hospedagem

* **Next.js 14 App Router + TypeScript**, componentes client (`"use client"`)
  para telas interativas; rotas de API em `app/api/**/route.ts` com
  `export const runtime = "nodejs"`.
* **Supabase** (projeto `xyngrzennrozwcpgxmmm`): Postgres com RLS, Auth
  (e-mail/senha) e Storage. Todas as tabelas do app usam o prefixo **`gp_`**
  (o banco é compartilhado com outro sistema — nunca mexer em tabelas sem esse
  prefixo).
* **Vercel**: deploy automático a cada push. Atenção: dependências com
  `require`/`import` dinâmico (ex.: pdfjs-dist) podem precisar de
  `experimental.outputFileTracingIncludes` no `next.config.js`.
* **IA**: OpenAI para análise de TR (`lib/tr/*`) e geração de proposta.

## Papéis e permissões (regra de ouro)

| Papel | Pode |
|---|---|
| **admin** | Tudo: qualquer fase de processo, editar/excluir análises, aprovar solicitações de exclusão, administrar usuários. |
| **editor** | Criar/editar análises e propostas; avançar processo **só para a próxima fase**; excluir análise **apenas** via solicitação aprovada por admin. |
| **visualizador** | Somente leitura. |

* O papel vem de `gp_profiles.perfil`; `gp_profiles.ativo = false` corta o
  acesso (checado nas policies).
* **Toda permissão vale no banco (RLS) e é revalidada na rota de API** — a
  interface apenas reflete; nunca confie só em esconder botão.
* As colunas `pode_editar_analises` / `pode_excluir_analises` são **legadas**
  (D50) — não usar.

## Tabelas principais (`gp_`)

* `gp_profiles` — usuários (perfil, ativo, nome).
* `gp_orgaos` + `gp_orgaos_contatos` — clientes (CNPJ único).
* `gp_processos` — processos do Follow-up: `etapa` (0–7), `arquivos` (jsonb),
  `documentos` (jsonb), `historico_etapas` (jsonb com data_autenticacao e
  autor), `cadastro_tr_id`, `proposta_aprovada`, `criado_por`.
* `gp_cadastros_tr` — análises de TR: `status` (`em_analise` = rascunho,
  `concluida`), `resultado_bruto_ia` (jsonb), dados do responsável.
* `gp_achados_tr` + `gp_achados_tr_historico` — achados e versões de edição
  (justificativa obrigatória).
* `gp_solicitacoes_exclusao` — editor pede, admin aprova/recusa (guarda
  snapshot `descricao_cadastro` e decisão).
* `gp_feedbacks` — erros/sugestões (💬), status aberto/resolvido.

## Fluxo do processo (lib/processos/etapas.ts — ETAPAS_FLUXO)

8 fases: as 3 primeiras são **automáticas 🤖** (avançam pelos documentos:
TR recebido → Proposta → Proposta aprovada/Ofício) e as demais **manuais ✋**
(mudança exige data de autenticação, registrada em `historico_etapas`).
Última fase = **finalizado** (some das listas do dashboard, das notificações e
vai para a seção "Finalizados" do Follow-up, com tag verde).

## Convenções obrigatórias

1. **Decisões numeradas:** cada mudança relevante ganha `D<n>` (próximo número
   livre) em comentário no código e na mensagem de commit.
2. **Modais, não navegação:** funcionalidades novas abrem em `<Modal>`
   (`app/components/Modal.tsx`) sempre que possível; para empilhar use
   `zIndex={200}`. Componentes de conteúdo são extraídos (ex.:
   `AnaliseTRConteudo`, `FormularioOrgao`) para servirem página **e** modal —
   recebem props, não leem `useSearchParams` diretamente.
3. **Idioma:** UI, comentários, mensagens e nomes de variáveis em
   **português**.
4. **Tema:** usar as variáveis CSS (`var(--primaria)`, `var(--escuro)`,
   `var(--bg-suave)`, `var(--texto)`, `var(--borda)`, `var(--cinza)`) — nunca
   cor fixa que quebre o dark mode; ícones SVG com `stroke="currentColor"`.
5. **APIs:** validar sessão (`getProfileAtual()`), papel e regra de negócio;
   responder `{ erro: "mensagem em português" }` com status adequado
   (400/401/403/404/500). Cliente browser: `getSupabaseBrowserClient()`;
   rotas: `getSupabaseRouteClient()`; admin (service key): `getSupabaseAdmin()`
   **somente** em rotas `/api/admin/*` ou operações de sistema.
6. **RLS para tabela nova:** habilitar RLS sempre, com policies por papel
   seguindo o padrão: `EXISTS (SELECT 1 FROM gp_profiles p WHERE p.id =
   auth.uid() AND p.ativo AND p.perfil IN (...))`.
7. **Notificações:** pendências que exigem ação de admin entram no sino
   (`NotificacoesBotao.tsx`), somando no contador.
8. **Fluxo de trabalho:** confirmar o plano com o usuário antes de implementar
   mudanças amplas; nunca rodar git pela automação — entregar os comandos
   `git add/commit/push` prontos para o usuário executar.

## Armadilhas conhecidas

* `pdf-parse`/`pdfjs-dist` no Vercel: manter `serverComponentsExternalPackages`
  e `outputFileTracingIncludes` do `next.config.js`; o polyfill de `DOMMatrix`
  é feito em `lib/pdfExtract.ts` via `@napi-rs/canvas` — não remover.
* Componentes client com `useSearchParams` precisam de `<Suspense>`.
* Não usar `localStorage` para dados sensíveis (a chave legada `senha` é
  removida no `layout.tsx`).
* `.single()` do Supabase lança erro quando não há linha — usar
  `.maybeSingle()` quando "não existir" é um caso válido.

## Prompt-modelo para novos módulos

```text
Leia o arquivo docs/CONTEXTO.md antes de começar.

Quero criar o módulo/funcionalidade: <nome>

O que ele deve fazer:
- <comportamento 1>
- <comportamento 2>

Quem pode usar: <admin / editor / visualizador — o que cada um pode fazer>

Onde aparece: <página nova ou existente, modal, header, notificações...>

Dados: <novas tabelas/colunas necessárias, ou tabelas existentes envolvidas>

Regras de segurança: aplicar RLS no banco seguindo o padrão deste arquivo
(admin/editor/visualizador + usuário ativo) e revalidar no servidor.

Confirme comigo o que será implementado antes de escrever código.
```
