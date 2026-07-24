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
-- 6. RLS: habilitado (mesma postura das tabelas gp_). Sem políticas =
--    acesso somente via service role na camada de API. Roles de view
--    entram como políticas/checagens depois.
-- ---------------------------------------------------------------------
alter table public.sada_importacoes    enable row level security;
alter table public.sada_divida_ativa   enable row level security;
alter table public.sada_lancamentos    enable row level security;
alter table public.sada_recebimentos   enable row level security;
alter table public.sada_recebimentos_da enable row level security;

-- =====================================================================
-- Notas:
-- * Vínculo com Órgão (gp_orgaos) será adicionado depois via cnpj_orgao.
-- * SEQUENCIA junta as tabelas (lançamento <-> recebimento <-> dívida)
--   dentro do mesmo cnpj_orgao — base para taxa de recuperação por título.
-- * Retrato + histórico: importador marca o lote novo vigente=true e o
--   anterior (mesmo cnpj_orgao+tipo+ano) vigente=false, sem apagar.
-- * Valores vêm como texto ('260.01','0.00','NULL') — importador converte
--   para numeric/null e preenche cnpj_orgao + ano por lote.
-- * Após importar, rodar refresh das materialized views.
-- =====================================================================
