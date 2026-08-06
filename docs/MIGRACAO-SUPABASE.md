# Migração futura — Supabase compartilhado → projeto dedicado

**Situação atual (decisão D2 do plano de migração):** o sistema roda no projeto Supabase
**compartilhado** `supabase-aquamarine-sail` (`xyngrzennrozwcpgxmmm`, org "douglas-tanaka's
projects"), que também hospeda outro sistema (rankings/eventos). O isolamento é lógico:
tabelas prefixadas (`gp_*` e, após a unificação, as do schema de securitização) e bucket
próprio (`gp-arquivos`).

**Por que migrar no futuro:** cota gratuita dividida (500 MB banco + 1 GB storage),
mesma service key para os dois sistemas, e impossibilidade de pausar/restaurar um sem o outro.

**Pré-requisito:** liberar um slot no plano gratuito (limite de 2 projetos ativos por conta) —
pausar ou excluir um projeto antigo, ou assinar o plano Pro.

---

## Passo a passo da migração

### 1. Criar o projeto dedicado
No painel https://supabase.com/dashboard → New project (sugestão: `gerador-propostas`,
região `sa-east-1` para menor latência no Brasil). Anotar:
- `SUPABASE_URL` novo (https://NOVO_REF.supabase.co)
- `service_role key` nova (Settings → API Keys)

### 2. Recriar o schema
Executar no SQL Editor do projeto novo, nesta ordem:
1. `supabase/schema.sql` (schema da parte de securitização: profiles, orgaos, cadastros_tr, achados etc.)
2. As migrações do gerador (tabelas `gp_propostas`/`processos`, `gp_oficios`/`oficios` e o bucket):
   estão versionadas no histórico de migrações do projeto antigo
   (Database → Migrations) — copiar cada uma na ordem cronológica.

### 3. Copiar os dados
Com o CLI do Supabase (ou pg_dump/pg_restore):

```bash
# exportar só as tabelas do gerador do projeto antigo
pg_dump "postgresql://postgres:[SENHA]@db.xyngrzennrozwcpgxmmm.supabase.co:5432/postgres" \
  --data-only -t 'public.gp_*' -t public.profiles -t public.orgaos -t public.orgaos_contatos \
  -t public.cadastros_tr -t 'public.achados_tr*' > dados.sql

# importar no projeto novo
psql "postgresql://postgres:[SENHA_NOVA]@db.NOVO_REF.supabase.co:5432/postgres" < dados.sql
```

### 4. Copiar o storage
Baixar e re-subir os objetos do bucket `gp-arquivos` (script simples com a lib `supabase`
listando `storage.objects` do bucket e fazendo download → upload). Volumes pequenos podem
ser feitos pelo próprio painel (Storage → download/upload).

### 5. Migrar a autenticação (se D3 = Supabase Auth)
Usuários do Supabase Auth não vão no pg_dump comum. Usar o painel
(Authentication → Users → export) ou a Admin API para recriá-los; os `profiles`
referenciam `auth.users` por UUID — manter os mesmos UUIDs ao recriar.

### 6. Trocar as variáveis e validar
No Vercel (projeto do GRUPO-BRID) → Settings → Environment Variables:
- `SUPABASE_URL` → URL nova
- `SUPABASE_SERVICE_ROLE_KEY` → key nova
- (se houver) `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` → novas

Redeploy e teste de ponta a ponta: login → processo → TR → proposta → downloads → dashboard.

### 7. Descomissionar no projeto antigo
Após 1–2 semanas de operação estável: dropar as tabelas do gerador e o bucket no projeto
compartilhado (liberando a cota do outro sistema).

---

## Checklist rápido

- [ ] Slot livre no plano gratuito (ou Pro)
- [ ] Projeto novo criado em sa-east-1
- [ ] Schema recriado (securitização + gerador)
- [ ] Dados copiados e conferidos (contagem de linhas)
- [ ] Storage copiado (contagem de objetos)
- [ ] Usuários do Auth migrados com mesmos UUIDs
- [ ] Variáveis trocadas no Vercel + redeploy
- [ ] Teste de ponta a ponta aprovado
- [ ] Limpeza no projeto compartilhado
