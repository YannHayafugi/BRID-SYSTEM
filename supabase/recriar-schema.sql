-- =====================================================================
-- RECRIAR SCHEMA — GRUPO-BRID (gerador de propostas gp_* + módulo SADA)
-- Para colar no SQL Editor de um projeto Supabase NOVO e vazio.
--
-- Gerado a partir dos arquivos versionados do repositório:
--   supabase/schema-unificado.sql  (tabelas gp_*)
--   supabase/sada-schema.sql       (tabelas, views e MVs sada_*)
-- mais um bloco reconstruído do código (PARTE 2 — leia o aviso lá).
--
-- NÃO inclui supabase/supabase/schema.sql, que é um stub com a instrução
-- explícita de não aplicar.
--
-- ---------------------------------------------------------------------
-- ⚠️ O QUE ESTE ARQUIVO **NÃO** TEM
--
-- 1. AS POLÍTICAS DE RLS DAS TABELAS gp_*.
--    O próprio schema-unificado.sql registra, no rodapé, que as políticas
--    completas foram aplicadas na migração `gerador_schema_unificado_v1`
--    e que o texto integral está em Database -> Migrations no painel.
--    Elas não estão no repositório.
--
--    Isso é o item mais sério da migração. Sem elas, dependendo de como o
--    RLS ficar no projeto novo, você cai num de dois extremos ruins:
--    RLS ligado e sem política = ninguém lê nada pela chave publishable;
--    RLS desligado = qualquer portador da chave publishable lê e escreve
--    tudo, inclusive de outros usuários. O app não vai "quase funcionar" —
--    ou trava, ou abre. Copie as políticas do painel antigo.
--
-- 2. O DDL ORIGINAL de gp_oficios, gp_feedbacks e gp_solicitacoes_exclusao
--    (ver PARTE 2).
--
-- 3. gp_propostas (modelo antigo de senha única). Nenhum código atual usa,
--    e docs/MIGRACAO-SUPABASE.md prevê o drop dela no cutover. Omitida de
--    propósito.
--
-- 4. Os DADOS. Isto é só estrutura. Para os dados, use pg_dump --data-only
--    conforme docs/MIGRACAO-SUPABASE.md, seção 3.
--
-- 5. Os USUÁRIOS do Supabase Auth. Não saem em pg_dump comum, e as tabelas
--    gp_profiles referenciam auth.users por UUID — ao recriar os usuários,
--    mantenha os mesmos UUIDs ou as referências quebram.
-- =====================================================================

-- =====================================================================
-- PARTE 1 — NÚCLEO gp_*  (origem: supabase/schema-unificado.sql)
-- =====================================================================

-- ============================================================================
-- Schema unificado do Gerador de Propostas (ETAPA 1 do plano de migração)
-- Aplicado no Supabase em 2026-07-16 (migração: gerador_schema_unificado_v1).
-- Adaptado de YannHayafugi/Gerador_de_Proposta_Securitizacao (schema.sql v2):
--   * prefixo gp_ em todas as tabelas (projeto Supabase compartilhado — D2)
--   * gatilho próprio on_auth_user_created_gp (não toca o do outro sistema)
--   * gp_profiles.ativo default FALSE (pool de auth compartilhado; admin ativa)
--   * + gp_processos (Follow-up unificado) e vínculos em gp_oficios
--
-- Tabelas: gp_profiles, gp_orgaos, gp_orgaos_contatos, gp_cadastros_tr,
--          gp_achados_tr, gp_achados_tr_historico, gp_processos, gp_oficios(+)
--
-- Primeiro admin (rodar após criar sua conta pelo login):
--   update public.gp_profiles set perfil='admin', ativo=true,
--     pode_editar_analises=true, pode_excluir_analises=true
--   where email='seu-email@exemplo.com';
--
-- Observação: gp_propostas (modelo antigo, senha única) permanece até o
-- cutover da ETAPA 4; será dropada junto com a desativação do app atual.
-- ============================================================================

-- (Conteúdo idêntico ao aplicado — fonte da verdade da estrutura do banco.)

-- 1. GP_PROFILES
create table if not exists public.gp_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nome_completo text,
  perfil text not null default 'visualizador'
    check (perfil in ('admin', 'editor', 'visualizador')),
  pode_editar_analises boolean not null default false,
  pode_excluir_analises boolean not null default false,
  ativo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user_gp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.gp_profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created_gp on auth.users;
create trigger on_auth_user_created_gp
  after insert on auth.users for each row execute procedure public.handle_new_user_gp();

-- 1.1 GP_ORGAOS
create table if not exists public.gp_orgaos (
  id uuid primary key default gen_random_uuid(),
  criado_por uuid references public.gp_profiles (id),
  tipo_ente text not null check (tipo_ente in ('Município', 'Estado')),
  razao_social text not null,
  cnpj text,
  cidade text not null,
  uf text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gp_orgaos_razao_social on public.gp_orgaos (razao_social);
create unique index if not exists idx_gp_orgaos_cnpj_unico on public.gp_orgaos (cnpj) where cnpj is not null;

-- 1.2 GP_ORGAOS_CONTATOS
create table if not exists public.gp_orgaos_contatos (
  id uuid primary key default gen_random_uuid(),
  orgao_id uuid not null references public.gp_orgaos (id) on delete cascade,
  nome_completo text not null,
  cargo text not null,
  telefone text,
  email text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_gp_orgaos_contatos_orgao_id on public.gp_orgaos_contatos (orgao_id);

-- 2. GP_CADASTROS_TR
create table if not exists public.gp_cadastros_tr (
  id uuid primary key default gen_random_uuid(),
  criado_por uuid references public.gp_profiles (id),
  orgao_id uuid references public.gp_orgaos (id),
  classificacao text not null check (classificacao in ('Município', 'Estado')),
  nome_ente text not null,
  uf text not null,
  nome_responsavel text not null,
  cargo text not null,
  telefone text,
  email text not null,
  objeto_tr text not null default 'Securitizacao',
  nome_arquivo_tr text not null,
  resultado_bruto_ia jsonb not null,
  status text not null default 'em_analise' check (status in ('em_analise', 'concluida')),
  relatorio_gerado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gp_cadastros_tr_criado_por on public.gp_cadastros_tr (criado_por);
create index if not exists idx_gp_cadastros_tr_orgao_id on public.gp_cadastros_tr (orgao_id);

-- 3. GP_ACHADOS_TR
create table if not exists public.gp_achados_tr (
  id uuid primary key default gen_random_uuid(),
  cadastro_id uuid not null references public.gp_cadastros_tr (id) on delete cascade,
  achado_id text not null,
  item_numero text not null,
  titulo text not null,
  texto text not null,
  comentario_obrigatorio boolean not null default false,
  ciente boolean not null default false,
  comentario text,
  ciente_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cadastro_id, achado_id)
);
create index if not exists idx_gp_achados_tr_cadastro_id on public.gp_achados_tr (cadastro_id);

-- 3.1 GP_ACHADOS_TR_HISTORICO (append-only)
create table if not exists public.gp_achados_tr_historico (
  id uuid primary key default gen_random_uuid(),
  achado_id uuid not null references public.gp_achados_tr (id) on delete cascade,
  versao int not null,
  ciente_anterior boolean not null,
  comentario_anterior text,
  ciente_novo boolean not null,
  comentario_novo text,
  justificativa_edicao text not null,
  editado_por uuid references public.gp_profiles (id),
  editado_em timestamptz not null default now()
);
create index if not exists idx_gp_achados_tr_hist_achado_id on public.gp_achados_tr_historico (achado_id);

-- 4. GP_PROCESSOS (Follow-up unificado; início limpo — D5)
create table if not exists public.gp_processos (
  id uuid primary key default gen_random_uuid(),
  criado_por uuid references public.gp_profiles (id),
  orgao_id uuid references public.gp_orgaos (id),
  titulo text not null,
  etapa int not null default 0,
  documentos jsonb not null default '{}'::jsonb,
  arquivos jsonb not null default '{}'::jsonb,
  tr_nome text,
  cadastro_tr_id uuid references public.gp_cadastros_tr (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_gp_processos_criado_por on public.gp_processos (criado_por);
create index if not exists idx_gp_processos_orgao_id on public.gp_processos (orgao_id);

-- =====================================================================
-- PARTE 2 — TABELAS RECONSTRUÍDAS  ⚠️ CONFERIR ANTES DE CONFIAR
--
-- Estas três tabelas NÃO têm DDL em lugar nenhum do repositório nem do
-- histórico do git. O DDL original está só no histórico de migrações do
-- projeto antigo (painel: Database -> Migrations).
--
-- O que está abaixo foi RECONSTRUÍDO a partir de como o código lê e grava
-- essas tabelas (colunas, tipos e relacionamentos inferidos dos inserts,
-- selects e updates). É funcional, mas pode divergir do original em
-- detalhes que o código não revela: defaults, constraints CHECK, colunas
-- que existem mas nunca são usadas, e nomes exatos de índices.
--
-- Se você conseguir abrir Database -> Migrations no projeto antigo,
-- prefira o DDL de lá e descarte esta parte.
-- =====================================================================

-- 2.1 GP_OFICIOS
-- id é TEXT (não uuid): o código gera hex de 12 chars em app/api/oficio/route.ts.
-- As duas colunas de vínculo (criado_por, orgao_id) já vêm aqui; os
-- "alter table add column if not exists" da PARTE 1 viram no-op.
create table if not exists public.gp_oficios (
  id            text primary key,
  assunto       text,
  destinatario  text,
  contrato      text,
  data          timestamptz not null default now(),
  arquivo       text,                                              -- caminho no bucket gp-arquivos
  job_id        uuid references public.gp_processos (id) on delete set null,
  criado_por    uuid references public.gp_profiles (id),
  orgao_id      uuid references public.gp_orgaos (id)
);
create index if not exists idx_gp_oficios_data on public.gp_oficios (data desc);
create index if not exists idx_gp_oficios_job_id on public.gp_oficios (job_id);
create index if not exists idx_gp_oficios_criado_por on public.gp_oficios (criado_por);

-- 2.2 GP_FEEDBACKS
-- A FK criado_por -> gp_profiles é OBRIGATÓRIA, não é enfeite: o
-- NotificacoesBotao faz o embed `autor:criado_por(nome_completo, email)`,
-- e o PostgREST só resolve esse embed se a foreign key existir.
create table if not exists public.gp_feedbacks (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null,
  mensagem      text not null,
  pagina        text,
  status        text not null default 'aberto' check (status in ('aberto', 'resolvido')),
  criado_por    uuid references public.gp_profiles (id),
  created_at    timestamptz not null default now(),
  resolvido_por uuid references public.gp_profiles (id),
  resolvido_em  timestamptz
);
create index if not exists idx_gp_feedbacks_status on public.gp_feedbacks (status, created_at desc);
create index if not exists idx_gp_feedbacks_criado_por on public.gp_feedbacks (criado_por);

-- 2.3 GP_SOLICITACOES_EXCLUSAO
-- Mesma observação da FK: o embed `solicitante:solicitado_por(...)` depende dela.
-- descricao_cadastro guarda um resumo textual do cadastro para o pedido
-- continuar legível depois que o cadastro for excluído.
create table if not exists public.gp_solicitacoes_exclusao (
  id                 uuid primary key default gen_random_uuid(),
  cadastro_id        uuid references public.gp_cadastros_tr (id) on delete cascade,
  descricao_cadastro text,
  motivo             text,
  status             text not null default 'pendente'
                       check (status in ('pendente', 'aprovada', 'recusada')),
  solicitado_por     uuid references public.gp_profiles (id),
  created_at         timestamptz not null default now(),
  decidido_por       uuid references public.gp_profiles (id),
  decidido_em        timestamptz
);
create index if not exists idx_gp_solic_excl_status on public.gp_solicitacoes_exclusao (status, created_at desc);
create index if not exists idx_gp_solic_excl_cadastro on public.gp_solicitacoes_exclusao (cadastro_id);

-- --- continuação da PARTE 1 (vínculos + nota de RLS do arquivo original) ---
-- 4.1 GP_OFICIOS — vínculos novos
alter table public.gp_oficios add column if not exists criado_por uuid references public.gp_profiles (id);
alter table public.gp_oficios add column if not exists orgao_id uuid references public.gp_orgaos (id);

-- 5. RLS — políticas completas aplicadas na migração gerador_schema_unificado_v1
-- (dono-ou-admin em cadastros/achados/processos; compartilhado entre usuários
-- ativos em órgãos/contatos/perfis; histórico append-only.)
-- Ver Database → Migrations no painel do Supabase para o texto integral.

-- =====================================================================
-- PARTE 3 — MÓDULO SADA  (origem: supabase/sada-schema.sql, íntegro)
-- =====================================================================

-- =====================================================================
-- SADA — Sistema de Análise de Dívida Ativa
-- Módulo apartado. Neste primeiro momento NÃO há vínculo com gp_orgaos:
-- o ente é identificado apenas pelo CNPJ (cnpj_orgao), informado na
-- importação. O mapeamento CNPJ -> gp_orgaos será feito depois.
-- Convenção alinhada ao módulo de Propostas: prefixo `sada_`, schema
-- public, SEM RLS (permissão validada na camada de API por perfil/role).
--
-- Origem: 4 planilhas, uma aba por ano (2015–2025), cabeçalho idêntico
-- entre anos. Os dados podem ser de entes diferentes (por isso cnpj_orgao).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Controle de importações
--    "Retrato + histórico": cada carga registra um lote. O lote novo entra
--    como vigente = true; o anterior (mesmo cnpj_orgao + tipo + ano) é
--    marcado vigente = false pelo importador, mas NÃO é apagado (histórico).
--    Dashboards leem o vigente; o histórico permanece consultável.
-- ---------------------------------------------------------------------
create table if not exists public.sada_importacoes (
  id            bigint generated always as identity primary key,
  cnpj_orgao    text not null,                 -- CNPJ do ente (sem FK por enquanto)
  tipo          text not null check (tipo in
                  ('divida_ativa', 'lancamentos', 'recebimentos', 'recebimentos_da')),
  arquivo_nome  text,
  ano_inicio    int,
  ano_fim       int,
  vigente       boolean not null default true,
  linhas_importadas int not null default 0,
  importado_por uuid references public.gp_profiles (id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_sada_import_ente on public.sada_importacoes (cnpj_orgao, tipo, vigente);

-- ---------------------------------------------------------------------
-- 1. DÍVIDA ATIVA (estoque) — 13 colunas de origem
-- ---------------------------------------------------------------------
create table if not exists public.sada_divida_ativa (
  id            bigint generated always as identity primary key,
  cnpj_orgao    text not null,
  importacao_id bigint references public.sada_importacoes (id) on delete cascade,
  ano           int not null,                  -- aba de origem (competência do arquivo)
  sequencia     bigint,                         -- CHAVE de junção entre tabelas
  sigla         text,                           -- tributo: IPTU, ISS, TAXA...
  inscricao     text,                           -- inscrição imobiliária/cadastral
  cnpj_cpf      text,                           -- contribuinte
  descricao     text,
  fase          text,
  mes_venc      smallint,
  ano_venc      int,
  valor         numeric(15,2),
  atualizacao   numeric(15,2),
  juros         numeric(15,2),
  multa         numeric(15,2),
  total         numeric(15,2),
  created_at    timestamptz not null default now()
);
create index if not exists idx_sada_da_ente_ano   on public.sada_divida_ativa (cnpj_orgao, ano);
create index if not exists idx_sada_da_sequencia   on public.sada_divida_ativa (sequencia);
create index if not exists idx_sada_da_sigla        on public.sada_divida_ativa (cnpj_orgao, sigla);
create index if not exists idx_sada_da_inscricao    on public.sada_divida_ativa (cnpj_orgao, inscricao);
create index if not exists idx_sada_da_cnpj_cpf     on public.sada_divida_ativa (cnpj_orgao, cnpj_cpf);
create index if not exists idx_sada_da_importacao   on public.sada_divida_ativa (importacao_id);

-- ---------------------------------------------------------------------
-- 2. LANÇAMENTOS — 9 colunas de origem
-- ---------------------------------------------------------------------
create table if not exists public.sada_lancamentos (
  id            bigint generated always as identity primary key,
  cnpj_orgao    text not null,
  importacao_id bigint references public.sada_importacoes (id) on delete cascade,
  ano           int not null,
  sequencia     bigint,                         -- CHAVE de junção
  sigla         text,
  inscricao     text,
  cnpj_cpf      text,
  descricao     text,
  fase          text,
  mes_lancto    smallint,                       -- mês do lançamento
  exercicio     int,
  valor         numeric(15,2),
  created_at    timestamptz not null default now()
);
create index if not exists idx_sada_lanc_ente_ano  on public.sada_lancamentos (cnpj_orgao, ano);
create index if not exists idx_sada_lanc_sequencia  on public.sada_lancamentos (sequencia);
create index if not exists idx_sada_lanc_sigla       on public.sada_lancamentos (cnpj_orgao, sigla);
create index if not exists idx_sada_lanc_inscricao   on public.sada_lancamentos (cnpj_orgao, inscricao);
create index if not exists idx_sada_lanc_cnpj_cpf    on public.sada_lancamentos (cnpj_orgao, cnpj_cpf);
create index if not exists idx_sada_lanc_importacao  on public.sada_lancamentos (importacao_id);

-- ---------------------------------------------------------------------
-- 3. RECEBIMENTOS (arrecadação normal) — 18 colunas de origem
-- ---------------------------------------------------------------------
create table if not exists public.sada_recebimentos (
  id            bigint generated always as identity primary key,
  cnpj_orgao    text not null,
  importacao_id bigint references public.sada_importacoes (id) on delete cascade,
  ano           int not null,
  sequencia     bigint,                         -- CHAVE de junção
  sigla         text,
  inscricao     text,
  cnpj_cpf      text,
  descricao     text,
  fase          text,
  data_contrato date,                           -- origem 'NULL' → null
  mes_venc      smallint,
  ano_venc      int,
  valor         numeric(15,2),
  vlam          numeric(15,2),                  -- atualização monetária
  vljm          numeric(15,2),                  -- juros de mora
  vlmm          numeric(15,2),                  -- multa de mora
  vldesc        numeric(15,2),                  -- desconto
  vlel          numeric(15,2),                  -- origem 'NULL' → null
  totaldam      numeric(15,2),                  -- total do DAM
  mes_arrec     smallint,
  ano_arrec     int,
  created_at    timestamptz not null default now()
);
create index if not exists idx_sada_rec_ente_ano   on public.sada_recebimentos (cnpj_orgao, ano);
create index if not exists idx_sada_rec_sequencia   on public.sada_recebimentos (sequencia);
create index if not exists idx_sada_rec_arrec        on public.sada_recebimentos (cnpj_orgao, ano_arrec, mes_arrec);
create index if not exists idx_sada_rec_sigla        on public.sada_recebimentos (cnpj_orgao, sigla);
create index if not exists idx_sada_rec_inscricao    on public.sada_recebimentos (cnpj_orgao, inscricao);
create index if not exists idx_sada_rec_importacao   on public.sada_recebimentos (importacao_id);

-- ---------------------------------------------------------------------
-- 4. RECEBIMENTOS DA (arrecadação de dívida ativa) — mesmas 18 colunas
-- ---------------------------------------------------------------------
create table if not exists public.sada_recebimentos_da (
  id            bigint generated always as identity primary key,
  cnpj_orgao    text not null,
  importacao_id bigint references public.sada_importacoes (id) on delete cascade,
  ano           int not null,
  sequencia     bigint,                         -- CHAVE de junção
  sigla         text,
  inscricao     text,
  cnpj_cpf      text,
  descricao     text,
  fase          text,
  data_contrato date,
  mes_venc      smallint,
  ano_venc      int,
  valor         numeric(15,2),
  vlam          numeric(15,2),
  vljm          numeric(15,2),
  vlmm          numeric(15,2),
  vldesc        numeric(15,2),
  vlel          numeric(15,2),
  totaldam      numeric(15,2),
  mes_arrec     smallint,
  ano_arrec     int,
  created_at    timestamptz not null default now()
);
create index if not exists idx_sada_recda_ente_ano on public.sada_recebimentos_da (cnpj_orgao, ano);
create index if not exists idx_sada_recda_sequencia on public.sada_recebimentos_da (sequencia);
create index if not exists idx_sada_recda_arrec      on public.sada_recebimentos_da (cnpj_orgao, ano_arrec, mes_arrec);
create index if not exists idx_sada_recda_sigla      on public.sada_recebimentos_da (cnpj_orgao, sigla);
create index if not exists idx_sada_recda_inscricao  on public.sada_recebimentos_da (cnpj_orgao, inscricao);
create index if not exists idx_sada_recda_importacao on public.sada_recebimentos_da (importacao_id);

-- ---------------------------------------------------------------------
-- 5. Materialized views (somente lotes vigentes = retrato atual).
--    Atualizar após cada importação:  refresh materialized view <nome>;
-- ---------------------------------------------------------------------

-- Estoque de dívida ativa vigente por ente / ano / tributo
create materialized view if not exists public.sada_mv_estoque_da as
  select d.cnpj_orgao, d.ano, d.sigla,
         count(*)     as qtd_titulos,
         sum(d.valor) as valor_principal,
         sum(d.total) as valor_total
  from public.sada_divida_ativa d
  join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
  group by d.cnpj_orgao, d.ano, d.sigla;
create unique index if not exists idx_sada_mv_estoque
  on public.sada_mv_estoque_da (cnpj_orgao, ano, sigla);

-- Arrecadação de dívida ativa vigente por ente / ano de arrecadação / tributo
create materialized view if not exists public.sada_mv_arrec_da as
  select r.cnpj_orgao, r.ano_arrec, r.sigla,
         count(*)        as qtd_pagamentos,
         sum(r.totaldam) as valor_arrecadado
  from public.sada_recebimentos_da r
  join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
  group by r.cnpj_orgao, r.ano_arrec, r.sigla;
create unique index if not exists idx_sada_mv_arrec
  on public.sada_mv_arrec_da (cnpj_orgao, ano_arrec, sigla);

-- ---------------------------------------------------------------------
-- 6. Qualidade dos dados — uma linha por verificação, sobre o lote vigente.
--    Alimenta /sada/qualidade e o aviso no dashboard.
--    `qtd` = linhas com o problema; `base` = linhas examinadas na tabela.
--    Categorias: total_nulo | contribuinte | valor | campo_chave.
-- ---------------------------------------------------------------------
create or replace view public.sada_vw_qualidade as
with da as (
  select d.* from public.sada_divida_ativa d
  join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
), lc as (
  select l.* from public.sada_lancamentos l
  join public.sada_importacoes i on i.id = l.importacao_id and i.vigente
), rc as (
  select r.* from public.sada_recebimentos r
  join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
), rd as (
  select r.* from public.sada_recebimentos_da r
  join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
)
-- Um agregado por tabela: TODAS as checagens saem de um único scan, via
-- count(*) filter. A versão anterior repetia `(select count(*) from da)` em
-- cada branch do union, o que fazia o Postgres reescanear as CTEs dezenas de
-- vezes — 7,6 s contra os 8 s de statement_timeout. Assim fica ~0,6 s.
-- Os `values` abaixo desempilham o agregado de volta em uma linha por check.
, agg_da as (
  select count(*) as base,
         count(*) filter (where total is null) as c1,
         count(*) filter (where cnpj_cpf is null or btrim(cnpj_cpf) = ''
                             or regexp_replace(cnpj_cpf, '\D', '', 'g') ~ '^0+$') as c2,
         count(*) filter (where valor is null or valor <= 0) as c3,
         count(*) filter (where sigla is null or btrim(sigla) = '') as c4,
         count(*) filter (where inscricao is null or btrim(inscricao) = '') as c5,
         count(*) filter (where sequencia is null) as c6
    from da
), agg_lc as (
  select count(*) as base,
         count(*) filter (where valor is null or valor <= 0) as c1,
         count(*) filter (where cnpj_cpf is null or btrim(cnpj_cpf) = ''
                             or regexp_replace(cnpj_cpf, '\D', '', 'g') ~ '^0+$') as c2,
         count(*) filter (where sigla is null or btrim(sigla) = '') as c3,
         count(*) filter (where sequencia is null) as c4
    from lc
), agg_rc as (
  select count(*) as base,
         count(*) filter (where totaldam is null or totaldam <= 0) as c1,
         count(*) filter (where sequencia is null) as c2
    from rc
), agg_rd as (
  select count(*) as base,
         count(*) filter (where totaldam is null or totaldam <= 0) as c1,
         count(*) filter (where sequencia is null) as c2
    from rd
)
select categoria, tabela, problema, qtd, base from (
  -- DÍVIDA ATIVA
  select v.categoria, v.tabela, v.problema, v.qtd, a.base
    from agg_da a
    cross join lateral (values
      ('total_nulo'::text, 'divida_ativa'::text, 'Dívida Ativa — total nulo (só principal)'::text, a.c1),
      ('contribuinte',     'divida_ativa', 'Dívida Ativa — CNPJ/CPF zerado ou vazio', a.c2),
      ('valor',            'divida_ativa', 'Dívida Ativa — valor nulo ou ≤ 0',        a.c3),
      ('campo_chave',      'divida_ativa', 'Dívida Ativa — sigla vazia',              a.c4),
      ('campo_chave',      'divida_ativa', 'Dívida Ativa — inscrição vazia',          a.c5),
      ('campo_chave',      'divida_ativa', 'Dívida Ativa — sequência nula',           a.c6)
    ) v(categoria, tabela, problema, qtd)
  -- LANÇAMENTOS
  union all
  select v.categoria, v.tabela, v.problema, v.qtd, a.base
    from agg_lc a
    cross join lateral (values
      ('valor'::text,  'lancamentos'::text, 'Lançamentos — valor nulo ou ≤ 0'::text,  a.c1),
      ('contribuinte', 'lancamentos', 'Lançamentos — CNPJ/CPF zerado ou vazio', a.c2),
      ('campo_chave',  'lancamentos', 'Lançamentos — sigla vazia',              a.c3),
      ('campo_chave',  'lancamentos', 'Lançamentos — sequência nula',           a.c4)
    ) v(categoria, tabela, problema, qtd)
  -- RECEBIMENTOS
  union all
  select v.categoria, v.tabela, v.problema, v.qtd, a.base
    from agg_rc a
    cross join lateral (values
      ('valor'::text, 'recebimentos'::text, 'Recebimentos — totaldam nulo ou ≤ 0'::text, a.c1),
      ('campo_chave', 'recebimentos', 'Recebimentos — sequência nula',             a.c2)
    ) v(categoria, tabela, problema, qtd)
  -- RECEBIMENTOS DA
  union all
  select v.categoria, v.tabela, v.problema, v.qtd, a.base
    from agg_rd a
    cross join lateral (values
      ('valor'::text, 'recebimentos_da'::text, 'Recebimentos DA — totaldam nulo ou ≤ 0'::text, a.c1),
      ('campo_chave', 'recebimentos_da', 'Recebimentos DA — sequência nula',              a.c2)
    ) v(categoria, tabela, problema, qtd)
) t
order by qtd desc;

-- ---------------------------------------------------------------------
-- 7. Views analíticas — leem sempre o lote vigente (join em sada_importacoes
--    com i.vigente). Consumidas por /api/sada/dashboard e pelos scripts.
--    Ao contrário das materialized views da seção 5, não precisam de refresh.
-- ---------------------------------------------------------------------

-- Estoque de dívida ativa por ente / ano / tributo (principal e total)
create or replace view public.sada_vw_estoque_ano as
  select d.cnpj_orgao, d.ano, d.sigla,
         count(*)     as qtd_titulos,
         sum(d.valor) as principal,
         sum(d.total) as total
  from public.sada_divida_ativa d
  join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
  group by d.cnpj_orgao, d.ano, d.sigla;

-- Arrecadação anual, separando origem normal x dívida ativa
create or replace view public.sada_vw_arrecadacao_ano as
  select r.cnpj_orgao, 'normal'::text as origem, r.ano_arrec,
         sum(r.totaldam) as valor
  from public.sada_recebimentos r
  join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
  group by r.cnpj_orgao, r.ano_arrec
  union all
  select r.cnpj_orgao, 'divida_ativa'::text, r.ano_arrec,
         sum(r.totaldam)
  from public.sada_recebimentos_da r
  join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
  group by r.cnpj_orgao, r.ano_arrec;

-- Mesma abertura da anterior, com mês e tributo (série mensal)
create or replace view public.sada_vw_arrecadacao_mensal as
  select r.cnpj_orgao, 'normal'::text as origem, r.ano_arrec, r.mes_arrec, r.sigla,
         count(*)        as qtd,
         sum(r.totaldam) as valor
  from public.sada_recebimentos r
  join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
  group by r.cnpj_orgao, r.ano_arrec, r.mes_arrec, r.sigla
  union all
  select r.cnpj_orgao, 'divida_ativa'::text, r.ano_arrec, r.mes_arrec, r.sigla,
         count(*),
         sum(r.totaldam)
  from public.sada_recebimentos_da r
  join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
  group by r.cnpj_orgao, r.ano_arrec, r.mes_arrec, r.sigla;

-- ATENÇÃO À BASE: as três views abaixo somam `valor` (PRINCIPAL), não `total`.
-- `total` = principal + encargos só vem preenchido em parte das safras (nesta
-- base, 2 de 11). Somar `total` descartava silenciosamente as demais: o estoque
-- aparecia como R$ 35,7 mi contra R$ 76,2 mi reais, e 1.583 devedores (14,9%)
-- ficavam zerados no ranking. Principal está em 100% das linhas.

-- Ranking de tributos: estoque somado + arrecadado de DA do mesmo tributo
create or replace view public.sada_vw_ranking_tributos as
  select e.cnpj_orgao, e.sigla,
         sum(e.valor) as estoque_total,
         (select sum(r.valor)
            from public.sada_recebimentos_da r
            join public.sada_importacoes i2 on i2.id = r.importacao_id and i2.vigente
           where r.cnpj_orgao = e.cnpj_orgao and r.sigla = e.sigla) as arrecadado_da
  from public.sada_divida_ativa e
  join public.sada_importacoes i on i.id = e.importacao_id and i.vigente
  group by e.cnpj_orgao, e.sigla;

-- Maiores devedores por contribuinte (ordenação fica a cargo do consumidor)
create or replace view public.sada_vw_top_devedores as
  select d.cnpj_orgao, d.cnpj_cpf,
         count(*)     as qtd_titulos,
         sum(d.valor) as divida_total
  from public.sada_divida_ativa d
  join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
  where d.cnpj_cpf is not null
  group by d.cnpj_orgao, d.cnpj_cpf;

-- Taxa de recuperação por tributo: estoque remanescente x arrecadado de DA.
-- FULL JOIN para não perder tributo que só existe de um dos lados.
-- A taxa compara PRINCIPAL com PRINCIPAL — comparar arrecadação com encargos
-- (totaldam) contra estoque sem eles inflaria o percentual. O caixa efetivo
-- fica em `arrecadado_caixa`, última coluna porque `create or replace view`
-- só admite acrescentar coluna no fim.
create or replace view public.sada_vw_recuperacao_da as
with estoque as (
  select d.cnpj_orgao, d.sigla, sum(d.valor) as estoque_principal
  from public.sada_divida_ativa d
  join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
  group by d.cnpj_orgao, d.sigla
), arrec as (
  select r.cnpj_orgao, r.sigla,
         sum(r.valor)    as arrecadado_principal,
         sum(r.totaldam) as arrecadado_caixa
  from public.sada_recebimentos_da r
  join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
  group by r.cnpj_orgao, r.sigla
)
select coalesce(e.cnpj_orgao, a.cnpj_orgao)   as cnpj_orgao,
       coalesce(e.sigla, a.sigla)             as sigla,
       coalesce(e.estoque_principal, 0)       as estoque_atual,
       coalesce(a.arrecadado_principal, 0)    as arrecadado_da,
       round(100 * coalesce(a.arrecadado_principal, 0)
             / nullif(coalesce(a.arrecadado_principal, 0)
                    + coalesce(e.estoque_principal, 0), 0), 2) as pct_recuperacao,
       coalesce(a.arrecadado_caixa, 0)        as arrecadado_caixa
from estoque e
full join arrec a on e.cnpj_orgao = a.cnpj_orgao and e.sigla = a.sigla;

-- Entes que já importaram para o SADA mas ainda não existem em gp_orgaos
-- (compara só os dígitos do CNPJ). Alimenta o KPI e scripts/sada-pendentes.ts.
create or replace view public.sada_entes_pendentes as
  select i.cnpj_orgao,
         min(i.created_at) as primeira_importacao,
         count(*)          as qtd_lotes
  from public.sada_importacoes i
  left join public.gp_orgaos o
    on regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') = regexp_replace(i.cnpj_orgao, '\D', '', 'g')
  where o.id is null
  group by i.cnpj_orgao;

-- ---------------------------------------------------------------------
-- 8. Refresh das materialized views da seção 5. Chamada via rpc pelo
--    importador (scripts/sada-import.ts e /api/sada/importar/finalizar).
--    security definer porque a API chega com role sem permissão de refresh.
-- ---------------------------------------------------------------------
create or replace function public.sada_refresh_mvs()
returns void
language sql
security definer
set search_path to 'public'
as $$
  refresh materialized view public.sada_mv_estoque_da;
  refresh materialized view public.sada_mv_arrec_da;
$$;

-- ---------------------------------------------------------------------
-- 9. DE/PARA — cada ente manda a planilha no layout do seu próprio sistema
--    de origem. Estas tabelas guardam a tradução; o importador deixa de ler
--    por posição fixa e passa a interpretar o mapa.
--
--    Sem linha aqui, o importador cai no MAPA_PADRAO de lib/sada/depara.ts
--    (o layout posicional histórico) — por isso não há seed: ente antigo
--    continua importando sem nenhum cadastro.
-- ---------------------------------------------------------------------

-- Mapa de COLUNAS: um por ente + tipo de planilha.
create table if not exists public.sada_depara (
  id            bigint generated always as identity primary key,
  -- SOMENTE DÍGITOS. A API normaliza na gravação e na busca: com pontuação
  -- livre, o mesmo ente digitado "12.345.678/0001-90" numa tela e
  -- "12345678000190" na outra virava dois cadastros, o importador não achava
  -- o mapa e caía no MAPA_PADRAO traduzindo a planilha por posição.
  cnpj_orgao    text not null,
  tipo          text not null check (tipo in
                  ('divida_ativa', 'lancamentos', 'recebimentos', 'recebimentos_da')),
  -- Um ente pode ter mais de um mapa por tipo (trocou de sistema no meio do
  -- ano, layout novo em teste). A tela de importação escolhe qual usar; sem
  -- escolha explícita vale o de updated_at mais recente.
  nome          text not null default 'Padrão',
  -- Como as abas viram o campo `ano`:
  --   ano_no_nome      = nome da aba é o ano (formato histórico)
  --   abas_escolhidas  = usuário marca quais abas entram e o ano de cada uma
  abas_modo     text not null default 'ano_no_nome'
                  check (abas_modo in ('ano_no_nome', 'abas_escolhidas')),
  abas          jsonb,                          -- [{"nome":"Plan1","ano":2024}]
  -- campo destino -> {"origem": <nome da coluna|índice>, "transform": "..."}
  --                | {"constante": <valor>}
  -- `transform` só aparece quando difere do tipo natural do campo destino
  -- (ex.: data_mes/data_ano, que extraem de uma única coluna de data).
  mapa          jsonb not null default '{}'::jsonb,
  observacao    text,
  criado_por    uuid references public.gp_profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (cnpj_orgao, tipo, nome)
);

-- DE/PARA de VALORES: normaliza o vocabulário do ente para o canônico.
-- Escopo é o ente inteiro (sem `tipo`) de propósito: a sigla precisa casar
-- entre dívida ativa, lançamentos e recebimentos, senão o ranking fragmenta.
-- `valor_origem` é gravado já normalizado (upper + trim) — ver lib/sada/depara.ts.
create table if not exists public.sada_depara_valor (
  id             bigint generated always as identity primary key,
  cnpj_orgao     text not null,          -- somente dígitos (ver sada_depara)
  campo          text not null default 'sigla' check (campo in ('sigla', 'fase')),
  valor_origem   text not null,
  valor_canonico text not null,
  created_at     timestamptz not null default now(),
  unique (cnpj_orgao, campo, valor_origem)
);
create index if not exists idx_sada_depara_valor_ente
  on public.sada_depara_valor (cnpj_orgao, campo);

-- ---------------------------------------------------------------------
-- 10. Insumos da previsão orçamentária (/api/sada/previsao).
--     Entregam dados calibráveis, não a projeção — o cálculo roda no
--     navegador para a tela responder a cada ajuste de parâmetro.
--     Fórmulas e limites: docs/SADA-PREVISAO-ORCAMENTARIA.md
-- ---------------------------------------------------------------------

-- Estoque em aberto por safra de inscrição.
-- `total` só existe nas safras em que a planilha trouxe encargos — nesta base,
-- 2 de 11. É dessas duas que sai a taxa de encargos, pela razão entre as razões
-- total/principal, que cancela a data (desconhecida) da foto.
-- titulos/contribuintes alimentam o detector de quebra estrutural.
create or replace view public.sada_vw_prev_safras as
  select d.ano,
         count(*)                   as titulos,
         count(distinct d.cnpj_cpf) as contribuintes,
         sum(d.valor)               as principal,
         sum(d.total)               as total
  from public.sada_divida_ativa d
  join public.sada_importacoes i on i.id = d.importacao_id and i.vigente
  group by d.ano;

-- Distribuição do recuperado por idade da dívida.
-- Sem join por sequencia: título pago sai do estoque, então os conjuntos são
-- disjuntos por construção (verificado — 67.897 recebimentos, zero casaram).
-- A idade vem de ano_arrec - ano_venc; a janela 0..20 corta ano invertido.
create or replace view public.sada_vw_prev_curva as
  select (r.ano_arrec - r.ano_venc) as idade,
         count(*)                   as pagamentos,
         sum(r.totaldam)            as valor
  from public.sada_recebimentos_da r
  join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
  where r.ano_arrec is not null and r.ano_venc is not null
    and (r.ano_arrec - r.ano_venc) between 0 and 20
  group by 1;

-- Séries anuais de fluxo. O filtro de ano descarta resíduo obviamente errado
-- (a base tem linhas em 1899 e 2041) sem depender de constante por ente.
create or replace view public.sada_vw_prev_series as
  with lanc as (
    select l.ano, sum(l.valor) as lancado
    from public.sada_lancamentos l
    join public.sada_importacoes i on i.id = l.importacao_id and i.vigente
    where l.ano between 2000 and extract(year from now())::int + 1
    group by l.ano
  ), rec as (
    select r.ano_arrec as ano, sum(r.totaldam) as arrecadado_normal
    from public.sada_recebimentos r
    join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
    where r.ano_arrec between 2000 and extract(year from now())::int + 1
    group by r.ano_arrec
  ), recda as (
    select r.ano_arrec as ano, sum(r.totaldam) as arrecadado_da
    from public.sada_recebimentos_da r
    join public.sada_importacoes i on i.id = r.importacao_id and i.vigente
    where r.ano_arrec between 2000 and extract(year from now())::int + 1
    group by r.ano_arrec
  )
  select coalesce(l.ano, rc.ano, rd.ano) as ano,
         l.lancado, rc.arrecadado_normal, rd.arrecadado_da
  from lanc l
  full join rec   rc on rc.ano = l.ano
  full join recda rd on rd.ano = coalesce(l.ano, rc.ano);

-- ---------------------------------------------------------------------
-- 11. RLS: habilitado (mesma postura das tabelas gp_). Sem políticas =
--    acesso somente via service role na camada de API. Roles de view
--    entram como políticas/checagens depois.
-- ---------------------------------------------------------------------
alter table public.sada_importacoes    enable row level security;
alter table public.sada_divida_ativa   enable row level security;
alter table public.sada_lancamentos    enable row level security;
alter table public.sada_recebimentos   enable row level security;
alter table public.sada_recebimentos_da enable row level security;
alter table public.sada_depara         enable row level security;
alter table public.sada_depara_valor   enable row level security;

-- =====================================================================
-- Notas:
-- * Vínculo com Órgão (gp_orgaos) será adicionado depois via cnpj_orgao.
-- * SEQUENCIA junta as tabelas (lançamento <-> recebimento <-> dívida)
--   dentro do mesmo cnpj_orgao — base para taxa de recuperação por título.
-- * Retrato + histórico: importador marca o lote novo vigente=true e o
--   anterior (mesmo cnpj_orgao+tipo+ano) vigente=false, sem apagar.
-- * Valores vêm como texto ('260.01','0.00','NULL') — importador converte
--   para numeric/null e preenche cnpj_orgao + ano por lote.
-- * Após importar, rodar refresh das materialized views (rpc sada_refresh_mvs).
-- * Dependência externa: sada_entes_pendentes lê public.gp_orgaos e
--   sada_importacoes referencia public.gp_profiles — ambas vêm de
--   schema-unificado.sql, que precisa rodar ANTES deste arquivo.
-- =====================================================================

-- =====================================================================
-- PARTE 4 — STORAGE
-- Bucket privado usado por lib/processos/arquivos.ts (constante BUCKET).
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('gp-arquivos', 'gp-arquivos', false)
on conflict (id) do nothing;

-- O acesso ao bucket é feito pelo servidor com a service key (getSupabaseAdmin),
-- que ignora RLS. Se em algum momento o navegador for ler o bucket direto,
-- vai ser preciso criar políticas em storage.objects — não há nenhuma aqui.

-- =====================================================================
-- PARTE 5 — DEPOIS DE RODAR ESTE ARQUIVO
--
-- 1. RLS das tabelas gp_*: copiar do painel do projeto antigo
--    (Database -> Migrations -> gerador_schema_unificado_v1). Ver o aviso
--    no topo. Não pule este passo.
--
-- 2. Primeiro admin — criar sua conta pelo login do app e então rodar:
--
--    update public.gp_profiles
--       set perfil = 'admin', ativo = true,
--           pode_editar_analises = true, pode_excluir_analises = true
--     where email = 'seu-email@exemplo.com';
--
--    (gp_profiles.ativo tem default FALSE de propósito: o admin libera.)
--
-- 3. Materialized views do SADA começam vazias. Depois de importar dados:
--
--    select public.sada_refresh_mvs();
--
-- 4. Variáveis de ambiente do projeto novo (Vercel e .env.local):
--    NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
--    SUPABASE_SECRET_KEY.
-- =====================================================================
