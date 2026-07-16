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
- [ ] Geração híbrida da proposta (D7): IA gera conteúdo JSON → docxBuilder renderiza
- [ ] Gerador de ofícios em TS (D9) gravando no catálogo `gp_oficios`
- [ ] Vincular análise de TR ao processo (D8: analisar → achados → gerar)

## Pendências da Etapa 3 (FRONT)

- [ ] Páginas Follow-up e Dashboard (portar do app Vite)
- [ ] Drop de ofícios no "Abrir processo" + órgão como Cliente (D6)
- [ ] Decidir identidade visual (D10) e navegação (D11)
