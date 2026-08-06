# App Unificado (Next.js) — em construção

Esta pasta é o **sistema unificado** (plano em `../docs/PLANO-MIGRACAO.md`):
base Next.js 14 + TypeScript importada de
[YannHayafugi/Gerador_de_Proposta_Securitizacao](https://github.com/YannHayafugi/Gerador_de_Proposta_Securitizacao),
que vai absorver as funcionalidades do GRUPO-BRID (Follow-up, Dashboard, ofícios,
TR → proposta via IA).

Enquanto a migração não termina (Etapas 2–4), o **app atual em produção continua
sendo o da raiz do repo** (Vite + FastAPI no Vercel). No cutover, o Root Directory
do projeto Vercel passa a apontar para `unificado/`.

## Adaptações já feitas na importação (Etapa 2, parte 1)

- Tabelas renomeadas no código para o schema unificado com prefixo `gp_`
  (`profiles` → `gp_profiles`, `orgaos` → `gp_orgaos`, etc.) — o projeto Supabase
  é compartilhado com outro sistema (decisão D2).
- `getProfileAtual()` só aceita usuário com `ativo = true` (novos usuários nascem
  inativos; um admin ativa quem é do gerador).
- `supabase/schema.sql` original neutralizado — o schema real está em
  `../supabase/schema-unificado.sql`.

## Como rodar localmente

```bash
cd unificado
npm install
copy .env.example .env.local   # e preencha (ver abaixo)
npm run dev                     # http://localhost:3000
```

`.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL` — https://xyngrzennrozwcpgxmmm.supabase.co
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — Settings → API Keys (publishable)
- `SUPABASE_SECRET_KEY` — Settings → API Keys (secret/service_role)
- `ANTHROPIC_API_KEY` — console.anthropic.com (chave do Douglas — D4)

## Pendências da Etapa 2 (BACK)

- [x] CRUD de processos do Follow-up (`/api/processos` GET/POST, DELETE, etapa manual)
- [x] Upload de TR no processo (`/api/processos/[id]/tr`) e downloads
      (`/api/processos/[id]/download/[tr|proposta|resumo|oficio]`)
- [x] Catálogo de ofícios para o drop (`/api/oficios` — só os não vinculados)
- [x] Geração híbrida da proposta (D7): `POST /api/processos/[id]/gerar` —
      IA gera o conteúdo (lib/proposta) e o DOCX sai com timbrado FIA
      (Proposta + Resumo; PDF escaneado cai para leitura nativa pela IA;
      TR em DOCX extraído via mammoth)
- [x] Gancho D8: achados da análise vinculada (`cadastro_tr_id`) entram como
      contexto do prompt da proposta
- [x] Gerador de ofícios em TS (D9): `POST /api/oficio` — layout FIA fiel ao
      oficio.py (Garamond 11, listas romanas/alfabéticas), grava no catálogo
      `gp_oficios` + storage e devolve o .docx
- [ ] Tela para vincular análise de TR ao processo (parte FRONT do D8 — Etapa 3)

**BACK (Etapa 2) CONCLUÍDO** — próximo: Etapa 3 (FRONT).

## Pendências da Etapa 3 (FRONT)

- [x] Tema híbrido (D10): azul T21M via CSS vars — telas herdadas re-tematizadas junto
- [x] Navegação (D11): Dashboard → Follow-up → Análise TR → Arquivos; Órgãos/Histórico/Admin no menu do usuário; home = Dashboard
- [x] Página Follow-up completa: abrir processo (drop de ofícios + drop de órgãos com cadastro inline — D13), cards com fases auto/manual, enviar TR, botão Analisar TR (D12), gerar proposta, downloads, excluir
- [x] Página Dashboard (KPIs, notificações, fases, progresso) e página Arquivos
- [x] Página /oficio (formulário completo com textos padrão; grava no catálogo)
- [x] Vinculação análise ↔ processo: o card do Follow-up abre
      `/tr-analise?orgao=X&processo=Y`; ao emitir o relatório, o cadastro é
      vinculado ao processo (`cadastro_tr_id`) e alimenta a geração (D8)
- [ ] Teste local `npm run dev` + ajustes finos de estilo

**FRONT (Etapa 3) CONCLUÍDO** — próximo: Etapa 4 (deploy e cutover, ver plano).
