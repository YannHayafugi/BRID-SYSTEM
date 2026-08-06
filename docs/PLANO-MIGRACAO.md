# Plano de Migração — Unificação GRUPO-BRID + Gerador_de_Proposta_Securitizacao

**Direção definida:** a base final é **Next.js 14 + TypeScript + Supabase** (repo do Yann),
absorvendo as funcionalidades do GRUPO-BRID (FastAPI + Vite). Motivos: melhor latência de
cold start na Vercel, stack única (só TypeScript) e modelo de autenticação/segurança mais
maduro (Supabase Auth + RLS por usuário).

Cada ponto de decisão está marcado como **[SOT: A definir]** — preencher com a escolha
(GRUPO-BRID, Securitização ou Híbrido) antes de executar a etapa correspondente.

---

## ETAPA 0 — Fundação (decisões estruturais)

| # | Decisão | Opções | SOT |
|---|---------|--------|-----|
| D1 | Repositório final | (a) GRUPO-BRID recebe o código Next • (b) repo do Yann vira o principal • (c) repo novo | ✅ **(a) GRUPO-BRID** — tudo será implementado nele |
| D2 | Projeto Supabase | (a) o compartilhado atual (aquamarine, divide cota com outro sistema) • (b) dedicado (exige liberar um slot free ou pausar projeto antigo) | ✅ **(a) compartilhado por enquanto** — migração futura documentada em `docs/MIGRACAO-SUPABASE.md` |
| D3 | Autenticação | (a) Supabase Auth multi-usuário com papéis/RLS (Securitização) • (b) senha única (GRUPO-BRID) | ✅ **(a) multi-usuário com papéis** |
| D4 | Conta da API Anthropic | chave do amigo (atual) ou outra | ✅ **chave própria do Douglas por enquanto**; troca depois na variável `ANTHROPIC_API_KEY` (sem mudança de código) |

**Entrega da etapa:** repo final estruturado, projeto Supabase escolhido, variáveis de ambiente definidas.

---

## ETAPA 1 — DB (unificar o schema no Supabase)

**Do repo Securitização (mantém como está):**
`profiles` (usuários/papéis), `orgaos` + `orgaos_contatos` (entes públicos com CNPJ),
`cadastros_tr` (TRs analisados), `achados_tr` + `achados_tr_historico` (auditoria da análise).
Tudo com RLS por usuário autenticado.

**Do GRUPO-BRID (portar e adaptar ao modelo de Auth):**
- `gp_propostas` → `processos` (follow-up: fases auto/manual, documentos, arquivos)
  ganhando `criado_por uuid references profiles` e policies RLS.
- `gp_oficios` → `oficios` (catálogo com vínculo ao processo), idem.
- Bucket `gp-arquivos` (TRs, propostas, resumos, ofícios).

| # | Decisão | Opções | SOT |
|---|---------|--------|-----|
| D5 | Dados existentes | (a) migrar os processos/ofícios atuais • (b) começar limpo | ✅ **(b) começar limpo** |
| D6 | Cliente do processo | (a) texto livre (como hoje) • (b) referência a `orgaos` (cadastro central com CNPJ/contatos) | ✅ **(b) referência a órgãos** |

**Entrega:** ✅ **CONCLUÍDA em 2026-07-16** — migração `gerador_schema_unificado_v1` aplicada.
Adaptações por causa do projeto compartilhado (D2): prefixo `gp_` em todas as tabelas,
gatilho próprio `on_auth_user_created_gp` (o do outro sistema ficou intocado) e
`gp_profiles.ativo` default false (admin ativa quem é do gerador). Estrutura versionada
em `supabase/schema-unificado.sql`. A `gp_propostas` antiga permanece até o cutover.

---

## ETAPA 2 — BACK (API routes em TypeScript)

**Mantidos do Securitização (já prontos):**
- `POST /api/generate` — proposta de securitização via formulário (docxBuilder, timbrado FIA).
- `POST /api/tr/analyze` + `/api/tr/report` — auditoria de TR com achados + relatório PDF.
- `/api/orgaos/*`, `/api/admin/users/*` — cadastros.

**Portar do GRUPO-BRID (Python → TypeScript):**
- CRUD de processos do Follow-up (abrir por ofício, fases auto/manual, excluir com limpeza de storage).
- `POST /api/processos/[id]/tr` — upload do TR no card.
- `POST /api/processos/[id]/gerar` — pipeline TR → proposta via IA (prompt JSON + render DOCX).
- Gerador de ofícios FIA + persistência no catálogo (drop do Follow-up).

| # | Decisão | Opções | SOT |
|---|---------|--------|-----|
| D7 | Geração da proposta a partir do TR | (a) prompt JSON + templates (GRUPO-BRID) • (b) docxBuilder com timbrado FIA (Securitização) • (c) **híbrido: nossa IA gera o conteúdo, docxBuilder renderiza** | ✅ **(c) híbrido** |
| D8 | Análise de TR no fluxo | (a) só geração (GRUPO-BRID) • (b) só auditoria com achados (Securitização) • (c) ambas como passos do processo: analisar → tratar achados → gerar | ✅ **(c) auditoria → achados → geração** |
| D9 | Motor do ofício | reescrever o `oficio.py` em TS com a lib `docx` (mesmo layout) | ✅ **confirmado** |

**Entrega:** todas as rotas respondendo com paridade funcional; testes de cada endpoint.

---

## ETAPA 3 — FRONT (páginas Next)

**Mantidos do Securitização:** login multi-usuário, barra de usuário, órgãos, admin,
tela de análise de TR, formulário de proposta de securitização, histórico.

**Portar do GRUPO-BRID:**
- **Follow-up** — cards de processo (badge auto/manual, fases travadas nas automáticas,
  enviar TR, gerar proposta, documentos essenciais, excluir, drop de ofícios).
- **Dashboard** — KPIs (Qualidade, Produtividade, Eficiência, Eficácia), processos por fase,
  notificações de automação; layout em colunas sem scroll de página.
- **Gerador de Ofício** — formulário incorporado ao Follow-up.

| # | Decisão | Opções | SOT |
|---|---------|--------|-----|
| D10 | Identidade visual | (a) tema azul + logo T21M (GRUPO-BRID) • (b) padrão FIA (Securitização) • (c) híbrido | ✅ **(c) híbrido** — telas no tema azul/T21M; FIA só nos documentos gerados |
| D11 | Navegação | ordem das abas e o que fica na home (hoje: Dashboard → Follow-up → Arquivos) | ✅ **Dashboard → Follow-up → Análise TR → Arquivos**; Órgãos e Admin no menu do usuário; geradores embutidos no Follow-up |
| D12 | Análise de TR no processo | — | ✅ **botão "Analisar TR" no card** após envio do TR; achados vinculam ao processo e alimentam a geração (D8); aba própria segue para análises avulsas |
| D13 | Cliente ao abrir processo | — | ✅ **drop de órgãos + atalho de cadastro** na própria tela |

**Entrega:** app único navegável com todos os fluxos.

---

## ETAPA 4 — Deploy e cutover

1. Projeto Vercel único apontando para o repo final (D1), envs (`ANTHROPIC_API_KEY`,
   Supabase URL/keys) configuradas.
2. Testes de ponta a ponta: login → órgão → ofício → processo → TR → análise → proposta → dashboard.
3. Redirecionar/desativar os apps antigos; arquivar os repos que saírem de uso.

**Entrega:** URL única em produção; repos antigos arquivados.

---

## Ordem de execução e dependências

```
ETAPA 0 (D1–D4) → ETAPA 1 (D5–D6) → ETAPA 2 (D7–D9) → ETAPA 3 (D10–D11) → ETAPA 4
```

Cada etapa fecha com commit próprio e teste — nada segue para a próxima sem a anterior validada.
